#!/usr/bin/env python3
"""
Clean-data export from legacy DB → clean canvas.

Reads from LEGACY_DATABASE_URL (the rmhwbbjjctzfaqjyhomu project), applies a
strict quality bar, and writes the survivors to CLEAN_DATABASE_URL.fees_raw.

The default policy is opinionated and conservative: it drops low-confidence
extractions, dropouts from un-categorizable canonical keys, "long-tail"
spurious categories that appear only a handful of times across the corpus,
institutions with implausibly few fees (likely incomplete crawls), and
rows whose fee_name looks like junk (hours / phone numbers / addresses).

DEFAULTS (override via CLI flags):
    --min-confidence       0.85       drop fees below this Anthropic confidence
    --min-fees-per-inst    5          drop fees from institutions with fewer total kept fees
    --min-category-count   3          drop fees whose canonical_fee_key appears <N times after other filters
    --include-status       approved   one of: approved | approved,staged | approved,staged,verified

USAGE
    LEGACY_DATABASE_URL=postgres://...rmhwbbjjctzfaqjyhomu... \\
    CLEAN_DATABASE_URL=postgres://...uuofrpmnxmriezawqcbr...   \\
    python3 scripts/migrate-legacy-fees.py --dry-run

    # Same again with --apply once the dry-run report looks right.

Output: a report of what passed/failed each filter and (with --apply) the
INSERT counts. Reads are streamed in 1000-row batches; idempotent on
re-run via a fingerprint stored in fees_raw.outlier_flags.

Pre-reqs on the CLEAN DB:
  - Schema migrations applied (fees_raw, agent_registry, agent_budgets,
    plus 20260525_extractor_agent_registry.sql to seed the 'extractor'
    agent — or any other source agent_name in agent_registry).
  - crawl_targets seeded (this script joins on cert_number/source to
    map legacy institution_ids to clean ones).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from collections import Counter

import psycopg2
import psycopg2.extras

MIGRATION_SENTINEL_UUID = "00000000-0000-0000-0000-000000000000"
BATCH_SIZE = 1000

# Reject any fee_name that looks like junk extracted from a non-fee paragraph.
_JUNK_NAME_RE = re.compile(
    r"\b(hours?|phone|address|website|customer\s+service|monday|tuesday|wednesday|"
    r"thursday|friday|saturday|sunday|business\s+day|holiday|branch|atm\s+location|"
    r"deposit\s+slip|signature|disclosure|terms|agreement|fdic|ncua|copyright|"
    r"privacy\s+policy)\b",
    re.IGNORECASE,
)

# "Free" / "waived" patterns — these are legitimate fee schedule rows with
# amount=NULL, so they must NOT be dropped by the NULL-amount filter.
_FREE_NAME_RE = re.compile(
    r"\b(free|waived|none|no\s+charge|n/?a|complimentary|included)\b",
    re.IGNORECASE,
)


def _connect(env_var: str, readonly: bool = False) -> psycopg2.extensions.connection:
    url = os.environ.get(env_var)
    if not url:
        sys.exit(f"{env_var} not set")
    conn = psycopg2.connect(url)
    if readonly:
        conn.set_session(readonly=True)
    return conn


def _fingerprint(legacy_id: int, fee_name: str, amount) -> str:
    raw = f"{legacy_id}|{fee_name}|{amount}".encode("utf-8")
    return "legacy:" + hashlib.sha256(raw).hexdigest()[:16]


def _is_junk_name(name: str) -> bool:
    if not name or not name.strip():
        return True
    return bool(_JUNK_NAME_RE.search(name))


def _allows_null_amount(name: str) -> bool:
    return bool(_FREE_NAME_RE.search(name or ""))


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--dry-run", action="store_true",
                    help="Read + filter + report. NO writes to clean DB.")
    ap.add_argument("--apply", action="store_true",
                    help="Required to actually INSERT. Mutually exclusive with --dry-run.")
    ap.add_argument("--min-confidence", type=float, default=0.85)
    ap.add_argument("--min-fees-per-inst", type=int, default=5)
    ap.add_argument("--min-category-count", type=int, default=3)
    ap.add_argument("--include-status", default="approved",
                    help="Comma-separated review_status values to consider for export.")
    ap.add_argument("--limit", type=int, default=None,
                    help="Cap on legacy rows scanned (for testing).")
    args = ap.parse_args()

    if args.dry_run == args.apply:
        sys.exit("Pass exactly one of --dry-run or --apply.")

    allowed_statuses = [s.strip() for s in args.include_status.split(",") if s.strip()]

    legacy = _connect("LEGACY_DATABASE_URL", readonly=True)
    clean = _connect("CLEAN_DATABASE_URL", readonly=False)

    # Sanity: clean DB has crawl_targets to map institutions to.
    with clean.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM crawl_targets")
        n_clean = cur.fetchone()[0]
    if n_clean == 0:
        sys.exit(
            "Clean DB has 0 crawl_targets. Seed institutions first: "
            "`python -m fee_crawler seed`."
        )
    print(f"Clean DB has {n_clean:,} crawl_targets to map onto.")

    # ──────────────────────────────────────────────────────────────────────
    # Pass 1: stream legacy rows, apply per-row filters, build in-memory
    # collection of survivors (capped by --limit for safety).
    # ──────────────────────────────────────────────────────────────────────
    legacy_cur = legacy.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    status_in = ",".join(f"'{s}'" for s in allowed_statuses)
    limit_clause = f"LIMIT {int(args.limit)}" if args.limit else ""
    legacy_cur.execute(
        f"""
        SELECT
            ef.id                       AS legacy_id,
            ef.fee_name,
            ef.amount,
            ef.frequency,
            ef.conditions,
            ef.extraction_confidence,
            ef.canonical_fee_key,
            ef.review_status,
            ct.source,
            ct.cert_number,
            ct.fee_schedule_url,
            ct.id                       AS legacy_target_id
        FROM extracted_fees ef
        JOIN crawl_targets ct ON ct.id = ef.crawl_target_id
        WHERE ef.review_status IN ({status_in})
          AND ct.fee_schedule_url IS NOT NULL
          AND ct.fee_schedule_url <> ''
        ORDER BY ef.id
        {limit_clause}
        """
    )

    survivors: list[dict] = []
    per_inst_count: Counter[tuple[str, str]] = Counter()
    per_key_count: Counter[str] = Counter()
    reasons: Counter[str] = Counter()
    total = 0

    while True:
        batch = legacy_cur.fetchmany(BATCH_SIZE)
        if not batch:
            break
        for row in batch:
            total += 1

            name = (row["fee_name"] or "").strip()
            amount = row["amount"]
            conf = row["extraction_confidence"]
            key = row["canonical_fee_key"]

            if not row["source"] or not row["cert_number"]:
                reasons["no_inst_lookup_key"] += 1
                continue
            if not key:
                reasons["no_canonical_key"] += 1
                continue
            if conf is None or float(conf) < args.min_confidence:
                reasons["low_confidence"] += 1
                continue
            if _is_junk_name(name):
                reasons["junk_name"] += 1
                continue
            if amount is None and not _allows_null_amount(name):
                reasons["null_amount_non_free"] += 1
                continue

            survivors.append(row)
            per_inst_count[(row["source"], row["cert_number"])] += 1
            per_key_count[key] += 1

    legacy_cur.close()
    legacy.close()

    print(f"\n── Pass 1 complete: scanned {total:,} legacy rows ──")
    for k, v in sorted(reasons.items(), key=lambda kv: -kv[1]):
        print(f"  filtered ({v:>7,})  {k}")
    print(f"  survivors_pass1 ({len(survivors):>7,})")

    # ──────────────────────────────────────────────────────────────────────
    # Pass 2: apply corpus-level filters (long-tail + thin institutions).
    # These can only run after Pass 1 because they need totals.
    # ──────────────────────────────────────────────────────────────────────
    keep_keys = {
        k for k, c in per_key_count.items() if c >= args.min_category_count
    }
    keep_insts = {
        (src, cert) for (src, cert), c in per_inst_count.items()
        if c >= args.min_fees_per_inst
    }
    dropped_keys = len(per_key_count) - len(keep_keys)
    dropped_insts = len(per_inst_count) - len(keep_insts)

    final: list[dict] = []
    p2_reasons: Counter[str] = Counter()
    for row in survivors:
        if row["canonical_fee_key"] not in keep_keys:
            p2_reasons["long_tail_category"] += 1
            continue
        if (row["source"], row["cert_number"]) not in keep_insts:
            p2_reasons["thin_institution"] += 1
            continue
        final.append(row)

    print(f"\n── Pass 2 complete (corpus-level) ──")
    print(f"  dropped {dropped_keys:,} long-tail canonical keys (< {args.min_category_count} occurrences)")
    print(f"  dropped {dropped_insts:,} thin institutions (< {args.min_fees_per_inst} kept fees)")
    for k, v in sorted(p2_reasons.items(), key=lambda kv: -kv[1]):
        print(f"  filtered ({v:>7,})  {k}")
    print(f"  CLEAN export count: {len(final):>7,}  (from {total:,} legacy rows)")

    if args.dry_run:
        print("\n--dry-run: no writes performed. Re-run with --apply to insert.")
        return 0

    # ──────────────────────────────────────────────────────────────────────
    # Pass 3: insert into clean DB. Resolve institution_id by (source, cert_number),
    # skip if fingerprint already present.
    # ──────────────────────────────────────────────────────────────────────
    inserted = 0
    skipped_dup = 0
    skipped_no_match = 0
    t0 = time.time()

    with clean.cursor() as map_cur, clean.cursor() as ins_cur:
        for row in final:
            map_cur.execute(
                "SELECT id FROM crawl_targets WHERE source=%s AND cert_number=%s LIMIT 1",
                (row["source"], row["cert_number"]),
            )
            r = map_cur.fetchone()
            if r is None:
                skipped_no_match += 1
                continue
            inst_id = r[0]

            fp = _fingerprint(row["legacy_id"], row["fee_name"], row["amount"])
            map_cur.execute(
                "SELECT 1 FROM fees_raw WHERE outlier_flags @> %s::jsonb LIMIT 1",
                (json.dumps([fp]),),
            )
            if map_cur.fetchone() is not None:
                skipped_dup += 1
                continue

            ins_cur.execute(
                """
                INSERT INTO fees_raw (
                    institution_id, crawl_event_id, source_url,
                    extraction_confidence, agent_event_id,
                    fee_name, amount, frequency, conditions,
                    outlier_flags, source
                ) VALUES (
                    %s, NULL, %s,
                    %s, %s::uuid,
                    %s, %s, %s, %s,
                    %s::jsonb, 'migration_v10'
                )
                """,
                (
                    inst_id,
                    row["fee_schedule_url"],
                    row["extraction_confidence"],
                    MIGRATION_SENTINEL_UUID,
                    row["fee_name"],
                    row["amount"],
                    row["frequency"],
                    row["conditions"],
                    json.dumps([fp]),
                ),
            )
            inserted += 1

            if inserted % 5000 == 0:
                clean.commit()
                print(f"  inserted={inserted:>7,}  ({time.time() - t0:.0f}s)")

    clean.commit()
    elapsed = time.time() - t0
    print()
    print(f"── Apply complete in {elapsed:.0f}s ──")
    print(f"  inserted        : {inserted:,}")
    print(f"  skipped (dup)   : {skipped_dup:,}")
    print(f"  skipped (no_map): {skipped_no_match:,}")
    print()
    print("Next steps:")
    print("  1. Verify counts: SELECT count(*) FROM fees_raw WHERE source='migration_v10';")
    print("  2. Run Darwin against the clean canvas to promote fees_raw -> fees_verified.")
    print("     (Cost tracking is now wired correctly per classifier.py refactor.)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
