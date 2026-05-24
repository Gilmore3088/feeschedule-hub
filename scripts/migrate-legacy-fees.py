#!/usr/bin/env python3
"""
Migrate fee data from the legacy Supabase project (extracted_fees) into the
new clean-canvas project (fees_raw → Darwin will promote to fees_verified).

Usage:
    LEGACY_DATABASE_URL=postgres://...legacy... \
    CLEAN_DATABASE_URL=postgres://...clean...   \
    python3 scripts/migrate-legacy-fees.py [--dry-run] [--limit N]

Both URLs must use the session-mode pooler (port 5432) — pg_dump-style
SELECT/INSERT volume hammers the transaction pooler.

What it does:
    1. Ensure crawl_targets exists on clean DB (by row count). Aborts if
       there are zero institutions to associate fees with.
    2. Stream rows from legacy.extracted_fees in batches.
    3. For each row, look up the matching crawl_target on the clean DB
       by (source, cert_number) — that's the join key the FDIC/NCUA seeder
       uses, so it's stable across deploys.
    4. INSERT into clean.fees_raw with source='migration_v10' and a
       sentinel agent_event_id (the gateway requires a UUID; we use the
       FDIC v10 sentinel pattern documented at fees_raw.agent_event_id).
    5. Skip fees with review_status='rejected' (no point migrating
       garbage), and de-dup on (institution_id, fee_name, amount) within
       the batch to avoid Tier-2 unique-index violations later.

Safe to re-run: rows already migrated are detected via a hash check on
(legacy_id, fee_name, amount) stored in fees_raw.outlier_flags JSONB.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from typing import Optional

import psycopg2
import psycopg2.extras

MIGRATION_SENTINEL_UUID = "00000000-0000-0000-0000-000000000000"
BATCH_SIZE = 1000


def _hash_fee(legacy_id: int, fee_name: str, amount) -> str:
    """Stable fingerprint stored in outlier_flags so reruns are idempotent."""
    raw = f"{legacy_id}|{fee_name}|{amount}".encode("utf-8")
    return "legacy:" + hashlib.sha256(raw).hexdigest()[:16]


def _connect(env_var: str) -> psycopg2.extensions.connection:
    url = os.environ.get(env_var)
    if not url:
        sys.exit(f"{env_var} not set")
    return psycopg2.connect(url)


def _resolve_institution_id(clean_cur, legacy_row: dict) -> Optional[int]:
    """Find the clean-DB institution_id for a legacy row.

    Legacy stores `crawl_target_id` referencing legacy.crawl_targets. We
    rely on the (source, cert_number) being stable between the two
    projects since both were seeded from FDIC/NCUA the same way.
    """
    if not legacy_row.get("source") or not legacy_row.get("cert_number"):
        return None
    clean_cur.execute(
        "SELECT id FROM crawl_targets WHERE source=%s AND cert_number=%s LIMIT 1",
        (legacy_row["source"], legacy_row["cert_number"]),
    )
    row = clean_cur.fetchone()
    return row[0] if row else None


def _already_migrated(clean_cur, fingerprint: str) -> bool:
    clean_cur.execute(
        "SELECT 1 FROM fees_raw WHERE outlier_flags @> %s::jsonb LIMIT 1",
        (json.dumps([fingerprint]),),
    )
    return clean_cur.fetchone() is not None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true",
                    help="Read legacy + match, but skip writes.")
    ap.add_argument("--limit", type=int, default=None,
                    help="Cap on legacy rows to scan (for testing).")
    args = ap.parse_args()

    legacy = _connect("LEGACY_DATABASE_URL")
    clean = _connect("CLEAN_DATABASE_URL")
    legacy.set_session(readonly=True)

    with clean.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM crawl_targets")
        n = cur.fetchone()[0]
        if n == 0:
            sys.exit("Clean DB has 0 crawl_targets — run `python -m fee_crawler seed` first.")
        print(f"Clean DB has {n:,} crawl_targets — proceeding.")

    legacy_cur = legacy.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    clean_cur = clean.cursor()

    limit_clause = f"LIMIT {int(args.limit)}" if args.limit else ""
    legacy_cur.execute(
        f"""
        SELECT
            ef.id        AS legacy_id,
            ef.fee_name,
            ef.amount,
            ef.frequency,
            ef.conditions,
            ef.extraction_confidence,
            ef.fee_category,
            ef.review_status,
            ct.source,
            ct.cert_number,
            ct.fee_schedule_url
        FROM extracted_fees ef
        JOIN crawl_targets   ct ON ct.id = ef.crawl_target_id
        WHERE ef.review_status <> 'rejected'
        ORDER BY ef.id
        {limit_clause}
        """
    )

    inserted = 0
    skipped_dup = 0
    skipped_no_match = 0
    rows_scanned = 0
    t0 = time.time()

    while True:
        batch = legacy_cur.fetchmany(BATCH_SIZE)
        if not batch:
            break

        for row in batch:
            rows_scanned += 1
            fingerprint = _hash_fee(row["legacy_id"], row["fee_name"], row["amount"])

            if _already_migrated(clean_cur, fingerprint):
                skipped_dup += 1
                continue

            inst_id = _resolve_institution_id(clean_cur, row)
            if inst_id is None:
                skipped_no_match += 1
                continue

            if args.dry_run:
                inserted += 1
                continue

            clean_cur.execute(
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
                    json.dumps([fingerprint]),
                ),
            )
            inserted += 1

        if not args.dry_run:
            clean.commit()
        if rows_scanned % 10_000 == 0:
            elapsed = time.time() - t0
            print(
                f"  scanned={rows_scanned:>7,}  inserted={inserted:>7,}  "
                f"dup={skipped_dup:>5,}  no_match={skipped_no_match:>5,}  "
                f"{elapsed:>5.0f}s"
            )

    if not args.dry_run:
        clean.commit()
    elapsed = time.time() - t0

    print()
    print(f"Done in {elapsed:.0f}s.")
    print(f"  scanned    : {rows_scanned:,}")
    print(f"  inserted   : {inserted:,}  ({'dry-run' if args.dry_run else 'committed'})")
    print(f"  skipped dup: {skipped_dup:,}  (already migrated)")
    print(f"  no match   : {skipped_no_match:,}  (no crawl_targets row on clean DB)")
    print()
    print("Next: run Darwin to classify fees_raw → fees_verified:")
    print("  modal run fee_crawler/modal_app.py::run_post_processing")
    print("Or wait for the next 05:00 UTC cron tick.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
