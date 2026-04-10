"""Data Roomba — continuous database quality sweep.

Runs against extracted_fees to find and fix data quality issues:
1. Amount outliers (per-category rejection bands)
2. Re-categorization (freeform → canonical 49-category taxonomy)
3. Duplicate fees (same institution, same category, different amounts)
4. Inferred fees (NSF created from overdraft language)
5. Dead URLs (fee_schedule_url returning 4xx/5xx)

Philosophy: review, refine, approve — never reject without clear reason.
Every change is tracked in roomba_log table for audit trail.

Usage:
    python -m fee_crawler roomba                    # dry-run (report only)
    python -m fee_crawler roomba --fix              # apply fixes + log changes
    python -m fee_crawler roomba --fix --urls       # also check URL health
    python -m fee_crawler roomba --recategorize     # only run re-categorization
"""

import os
import re
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

log = logging.getLogger(__name__)


# ── Per-category rejection bands ─────────────────────────────────────────
# $0 is always legitimate (institution doesn't charge).
# Amounts in the "reject" range are almost certainly extraction errors.
# Amounts in the "flag" range are suspicious but may be real.

REJECTION_BANDS = {
    # Category: (reject_below, flag_below, flag_above, reject_above)
    # reject = auto-reject, flag = mark for review
    "overdraft":                    (0.01, 10.00, 50.00, 100.00),
    "nsf":                          (0.01, 10.00, 50.00, 100.00),
    "wire_domestic_outgoing":       (0.01,  5.00, 75.00, 150.00),
    "wire_domestic_incoming":       (0.01,  3.00, 50.00, 100.00),
    "wire_international_outgoing":  (0.01, 10.00, 100.00, 200.00),
    "wire_international_incoming":  (0.01,  5.00, 75.00, 150.00),
    "stop_payment":                 (0.01,  5.00, 50.00, 100.00),
    "cashiers_check":               (0.01,  2.00, 30.00,  75.00),
    "monthly_maintenance":          (0.01,  1.00, 50.00, 100.00),
    "overdraft_daily_cap":          (0.01, 20.00, 500.00, 1000.00),
    "nsf_daily_cap":                (0.01, 20.00, 500.00, 1000.00),
}


# ── Freeform → canonical category mapping ────────────────────────────────
# Keywords that map freeform fee_category names to canonical categories.
# Checked in order — first match wins. More specific patterns first.

CATEGORY_REMAP = [
    # Overdraft / NSF
    (r"od_daily_cap|overdraft.*daily.*cap|od.*max", "od_daily_cap"),
    (r"nsf_daily_cap|nsf.*daily.*cap|nsf.*max", "nsf_daily_cap"),
    (r"overdraft|od_fee|od_charge|courtesy_pay|honor_fee", "overdraft"),
    (r"nsf|non.?sufficient|returned.*item|returned.*check|bounced", "nsf"),
    # Transfers / ACH
    (r"wire.*international.*out|intl.*wire.*out", "wire_international_outgoing"),
    (r"wire.*international.*in|intl.*wire.*in", "wire_international_incoming"),
    (r"wire.*out|outgoing.*wire|domestic.*wire.*out", "wire_domestic_outgoing"),
    (r"wire.*in|incoming.*wire|domestic.*wire.*in", "wire_domestic_incoming"),
    (r"ach.*return|ach.*reject", "ach_return"),
    (r"ach|electronic.*transfer|eft", "ach_origination"),
    (r"od.*protect|overdraft.*protect|overdraft.*transfer|courtesy.*transfer", "od_protection_transfer"),
    # ATM
    (r"atm.*international|international.*atm|foreign.*atm", "atm_international"),
    (r"atm.*non.?network|out.?of.?network.*atm|surcharge.*atm|non.*atm", "atm_non_network"),
    (r"atm.*balance|balance.*atm", "balance_inquiry"),
    (r"atm", "atm_non_network"),
    # Cards
    (r"card.*replace|replace.*card|lost.*card|new.*card|reissue.*card", "card_replacement"),
    (r"foreign.*trans|intl.*trans|international.*trans|currency.*conv", "card_foreign_txn"),
    (r"debit.*card|card_fee", "card_replacement"),
    # Checks / paper
    (r"cashier|official.*check|bank.*check|teller.*check", "cashiers_check"),
    (r"money.*order", "money_order"),
    (r"check.*print|order.*check|reorder.*check", "check_printing"),
    (r"check.*image|copy.*check|check.*copy|image.*check", "check_image"),
    (r"counter.*check|temp.*check|starter.*check", "counter_check"),
    (r"check.*cash", "check_cashing"),
    (r"certified.*check", "certified_check"),
    # Account fees
    (r"monthly.*maint|maintenance.*fee|service.*charge.*monthly|account.*fee.*monthly", "monthly_maintenance"),
    (r"minimum.*balance|below.*minimum|low.*balance", "minimum_balance"),
    (r"dormant|inactiv|escheat", "dormant_account"),
    (r"account.*clos|early.*clos|close.*account", "account_closing"),
    (r"account.*research|research.*fee|record.*search", "account_research"),
    # Statements
    (r"paper.*statement|statement.*fee|printed.*statement|mailed.*statement", "paper_statement"),
    (r"e.?statement|electronic.*statement", "estatement_fee"),
    # Other services
    (r"stop.*pay|payment.*stop", "stop_payment"),
    (r"deposit.*return|returned.*deposit|deposited.*item.*return", "deposited_item_return"),
    (r"notary", "notary_fee"),
    (r"safe.*deposit|safety.*box", "safe_deposit_box"),
    (r"bill.*pay|online.*pay", "bill_pay"),
    (r"coin.*count|coin.*wrap|coin.*sort", "coin_counting"),
    (r"mobile.*deposit", "mobile_deposit"),
    (r"zelle|p2p|person.*person", "zelle_fee"),
    (r"legal.*process|garnish|levy|subpoena", "legal_process"),
    (r"collect|collection", "collection_fee"),
    (r"balance.*inq|inquiry.*fee", "balance_inquiry"),
]

_REMAP_COMPILED = [(re.compile(pat, re.IGNORECASE), target) for pat, target in CATEGORY_REMAP]


def _remap_category(freeform: str) -> str | None:
    """Map a freeform category name to canonical taxonomy. Returns None if no match."""
    for pattern, canonical in _REMAP_COMPILED:
        if pattern.search(freeform):
            return canonical
    return None


def ensure_roomba_log(conn):
    """Create the roomba_log table if it doesn't exist."""
    conn.cursor().execute("""
        CREATE TABLE IF NOT EXISTS roomba_log (
            id SERIAL PRIMARY KEY,
            fee_id INTEGER NOT NULL,
            field_changed TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            reason TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    conn.commit()


def log_change(conn, fee_id: int, field: str, old_val, new_val, reason: str):
    """Record a Roomba change for audit trail."""
    conn.cursor().execute(
        "INSERT INTO roomba_log (fee_id, field_changed, old_value, new_value, reason) VALUES (%s, %s, %s, %s, %s)",
        (fee_id, field, str(old_val), str(new_val), reason),
    )


@dataclass
class RoombaFinding:
    fee_id: int
    institution_name: str
    state_code: str
    fee_category: str
    fee_name: str
    amount: float
    issue: str
    action: str  # "reject", "flag", "info"


def _connect():
    conn = psycopg2.connect(
        os.environ["DATABASE_URL"],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    conn.cursor().execute("SET statement_timeout = '300s'")
    conn.commit()
    return conn


def sweep_amount_outliers(conn) -> list[RoombaFinding]:
    """Find fees with amounts outside expected ranges."""
    findings = []
    cur = conn.cursor()

    for category, (reject_lo, flag_lo, flag_hi, reject_hi) in REJECTION_BANDS.items():
        # Auto-reject: amount in (0, reject_lo) or above reject_hi
        cur.execute("""
            SELECT ef.id, ef.fee_name, ef.amount, ef.fee_category,
                   ct.institution_name, ct.state_code
            FROM extracted_fees ef
            JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
            WHERE ef.fee_category = %s
              AND ef.review_status != 'rejected'
              AND ef.amount IS NOT NULL
              AND ((ef.amount > 0 AND ef.amount < %s) OR ef.amount > %s)
        """, (category, reject_lo, reject_hi))

        for r in cur.fetchall():
            if r["amount"] > 0 and r["amount"] < reject_lo:
                issue = f"${r['amount']} is below ${reject_lo} minimum for {category}"
            else:
                issue = f"${r['amount']} exceeds ${reject_hi} maximum for {category}"
            findings.append(RoombaFinding(
                fee_id=r["id"], institution_name=r["institution_name"],
                state_code=r["state_code"], fee_category=r["fee_category"],
                fee_name=r["fee_name"], amount=r["amount"],
                issue=issue, action="reject",
            ))

        # Flag: amount in [reject_lo, flag_lo) or (flag_hi, reject_hi]
        cur.execute("""
            SELECT ef.id, ef.fee_name, ef.amount, ef.fee_category,
                   ct.institution_name, ct.state_code
            FROM extracted_fees ef
            JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
            WHERE ef.fee_category = %s
              AND ef.review_status != 'rejected'
              AND ef.amount IS NOT NULL
              AND ((ef.amount >= %s AND ef.amount < %s) OR (ef.amount > %s AND ef.amount <= %s))
        """, (category, reject_lo, flag_lo, flag_hi, reject_hi))

        for r in cur.fetchall():
            issue = f"${r['amount']} is outside typical range ${flag_lo}-${flag_hi} for {category}"
            findings.append(RoombaFinding(
                fee_id=r["id"], institution_name=r["institution_name"],
                state_code=r["state_code"], fee_category=r["fee_category"],
                fee_name=r["fee_name"], amount=r["amount"],
                issue=issue, action="flag",
            ))

    return findings


def sweep_duplicates(conn) -> list[RoombaFinding]:
    """Find duplicate fees: same institution + same category + different amounts."""
    findings = []
    cur = conn.cursor()

    cur.execute("""
        SELECT ct.id as target_id, ct.institution_name, ct.state_code,
               ef.fee_category, COUNT(*) as cnt,
               ARRAY_AGG(ef.id ORDER BY ef.amount) as fee_ids,
               ARRAY_AGG(ef.amount ORDER BY ef.amount) as amounts
        FROM extracted_fees ef
        JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
        WHERE ef.review_status != 'rejected'
          AND ef.amount IS NOT NULL
          AND ef.fee_category IN ('overdraft', 'nsf', 'monthly_maintenance',
                                   'wire_domestic_outgoing', 'stop_payment')
          AND (ef.fee_name NOT ILIKE '%cap%' AND ef.fee_name NOT ILIKE '%maximum%')
        GROUP BY ct.id, ct.institution_name, ct.state_code, ef.fee_category
        HAVING COUNT(*) > 1
          AND COUNT(DISTINCT ef.amount) > 1
    """)

    for r in cur.fetchall():
        amounts_str = ", ".join(f"${a}" for a in r["amounts"])
        # Flag all but keep the median-closest one
        for fee_id, amount in zip(r["fee_ids"], r["amounts"]):
            findings.append(RoombaFinding(
                fee_id=fee_id, institution_name=r["institution_name"],
                state_code=r["state_code"], fee_category=r["fee_category"],
                fee_name=r["fee_category"], amount=amount,
                issue=f"Duplicate {r['fee_category']}: {r['cnt']} entries at {amounts_str}",
                action="flag",
            ))

    return findings


def sweep_inferred_fees(conn) -> list[RoombaFinding]:
    """Find cases where NSF was likely inferred from overdraft (same institution, same amount)."""
    findings = []
    cur = conn.cursor()

    cur.execute("""
        SELECT nsf.id as nsf_id, nsf.amount, nsf.fee_name,
               ct.institution_name, ct.state_code
        FROM extracted_fees nsf
        JOIN crawl_targets ct ON nsf.crawl_target_id = ct.id
        JOIN extracted_fees od ON od.crawl_target_id = nsf.crawl_target_id
          AND od.fee_category = 'overdraft'
          AND od.amount = nsf.amount
          AND od.review_status != 'rejected'
        WHERE nsf.fee_category = 'nsf'
          AND nsf.review_status != 'rejected'
          AND nsf.amount IS NOT NULL
          AND nsf.amount > 0
    """)

    for r in cur.fetchall():
        findings.append(RoombaFinding(
            fee_id=r["nsf_id"], institution_name=r["institution_name"],
            state_code=r["state_code"], fee_category="nsf",
            fee_name=r["fee_name"], amount=r["amount"],
            issue=f"NSF ${r['amount']} matches overdraft exactly — may be inferred, not explicit",
            action="flag",
        ))

    return findings


def sweep_recategorize(conn) -> tuple[int, int]:
    """Re-map freeform fee_category values to canonical 49-category taxonomy.

    Returns (remapped_count, unmatched_count).
    Every change is logged to roomba_log for audit trail.
    """
    cur = conn.cursor()

    # Get canonical categories
    import sys
    sys.path.insert(0, ".")
    from fee_crawler.fee_analysis import FEE_FAMILIES
    canonical = set()
    for cats in FEE_FAMILIES.values():
        canonical.update(cats)

    # Find all non-canonical categories
    placeholders = ",".join(["%s"] * len(canonical))
    cur.execute(f"""
        SELECT DISTINCT fee_category, COUNT(*) as cnt
        FROM extracted_fees
        WHERE review_status != 'rejected'
          AND fee_category NOT IN ({placeholders})
        GROUP BY fee_category
        ORDER BY COUNT(*) DESC
    """, tuple(canonical))

    freeform_cats = cur.fetchall()
    remapped = 0
    unmatched = 0
    unmatched_samples = []

    for row in freeform_cats:
        old_cat = row["fee_category"]
        new_cat = _remap_category(old_cat)

        if new_cat and new_cat in canonical:
            # Batch update in chunks of 500 to avoid statement timeout
            cur.execute("""
                SELECT id FROM extracted_fees
                WHERE fee_category = %s AND review_status != 'rejected'
            """, (old_cat,))
            fee_ids = [r["id"] for r in cur.fetchall()]

            for i in range(0, len(fee_ids), 500):
                batch = fee_ids[i:i + 500]
                cur.execute("""
                    UPDATE extracted_fees
                    SET fee_category = %s
                    WHERE id = ANY(%s)
                """, (new_cat, batch))
                conn.commit()

            updated = len(fee_ids)
            log_change(conn, 0, "fee_category", old_cat, new_cat,
                       f"Roomba recategorized {updated} fees: {old_cat} -> {new_cat}")
            conn.commit()

            remapped += updated
        else:
            unmatched += row["cnt"]
            if len(unmatched_samples) < 20:
                unmatched_samples.append((old_cat, row["cnt"]))

    conn.commit()

    if unmatched_samples:
        print(f"  Top unmatched freeform categories:")
        for cat, cnt in unmatched_samples:
            print(f"    {cat:<50} {cnt:>5} fees")

    return remapped, unmatched


def compute_canonical_stats(rows: list[dict]) -> dict[str, dict]:
    """Compute per-canonical-key statistics from fee rows (pure function for testing).

    Excludes $0 amounts (legitimate "no charge" entries) and rejected fees.
    Only includes keys with >= 5 valid observations.

    Args:
        rows: List of dicts with keys: amount, canonical_fee_key, review_status

    Returns:
        Dict mapping canonical_fee_key -> stats dict with median_amount, stddev_amount, obs_count
    """
    import statistics as stats_mod

    groups: dict[str, list[float]] = {}
    for row in rows:
        key = row.get("canonical_fee_key")
        amount = row.get("amount")
        status = row.get("review_status", "")

        if not key:
            continue
        if not amount or amount <= 0:
            continue
        if status == "rejected":
            continue

        groups.setdefault(key, []).append(float(amount))

    result = {}
    for key, amounts in groups.items():
        if len(amounts) < 5:
            continue
        median = stats_mod.median(amounts)
        stddev = stats_mod.stdev(amounts) if len(amounts) > 1 else 0.0
        result[key] = {
            "canonical_fee_key": key,
            "median_amount": median,
            "stddev_amount": stddev,
            "obs_count": len(amounts),
        }

    return result


def detect_canonical_outliers(
    stats: dict[str, dict],
    fees: list[dict],
) -> list[dict]:
    """Identify fees whose amount deviates 3+ stddev from canonical category median.

    Pure function — takes pre-computed stats and fee rows. No DB access.
    Skips: $0 amounts, null canonical keys, already flagged/rejected fees,
    categories with < 5 observations (obs_count check in stats).

    Args:
        stats: Dict from compute_canonical_stats() — maps canonical_fee_key -> stats
        fees: List of fee dicts with id, fee_name, amount, canonical_fee_key, review_status

    Returns:
        List of outlier dicts with fee_id, fee_name, amount, canonical_key, median, stddev
    """
    flagged = []

    for fee in fees:
        key = fee.get("canonical_fee_key")
        amount = fee.get("amount")
        status = fee.get("review_status", "")

        if not key:
            continue
        if not amount or amount <= 0:
            continue
        if status in ("rejected", "flagged"):
            continue

        s = stats.get(key)
        if s is None:
            continue
        if s["obs_count"] < 5:
            continue

        stddev = s["stddev_amount"]
        if not stddev or stddev == 0:
            continue

        median = s["median_amount"]
        threshold_low = median - 3 * stddev
        threshold_high = median + 3 * stddev

        # Clamp low threshold to 0.01 (amounts are always positive)
        effective_low = max(threshold_low, 0.01)

        if amount < effective_low or amount > threshold_high:
            flagged.append({
                "fee_id": fee["id"],
                "fee_name": fee.get("fee_name", ""),
                "amount": amount,
                "canonical_key": key,
                "median": median,
                "stddev": stddev,
            })

    return flagged


def sweep_canonical_outliers(conn, fix: bool = False) -> list[dict]:
    """Flag fees whose amount deviates 3+ stddev from canonical category median.

    Groups by canonical_fee_key (not fee_category) to catch outliers that are
    technically categorized correctly but have suspicious amounts. Skips categories
    with < 5 observations (insufficient statistical basis). Skips $0 amounts
    (legitimate "no charge" entries).

    Gracefully skips if canonical_fee_key column does not exist yet.

    Args:
        conn: psycopg2 connection
        fix: If True, updates review_status to 'flagged' and logs to roomba_log

    Returns:
        List of outlier dicts
    """
    cur = conn.cursor()

    # Graceful skip if column not yet migrated
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'extracted_fees' AND column_name = 'canonical_fee_key'
    """)
    if not cur.fetchone():
        log.info("Canonical outlier sweep: canonical_fee_key column not found — skipping")
        return []

    # Get per-canonical-key statistics (DB-side computation for efficiency)
    cur.execute("""
        SELECT canonical_fee_key,
               AVG(amount) as mean_amount,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) as median_amount,
               STDDEV(amount) as stddev_amount,
               COUNT(*) as obs_count
        FROM extracted_fees
        WHERE canonical_fee_key IS NOT NULL
          AND amount IS NOT NULL
          AND amount > 0
          AND review_status != 'rejected'
        GROUP BY canonical_fee_key
        HAVING COUNT(*) >= 5
    """)
    stats = {row["canonical_fee_key"]: row for row in cur.fetchall()}

    # Fetch candidate fees (excluding $0, null key, rejected/already-flagged)
    cur.execute("""
        SELECT id, fee_name, amount, canonical_fee_key, review_status
        FROM extracted_fees
        WHERE canonical_fee_key IS NOT NULL
          AND amount IS NOT NULL
          AND amount > 0
          AND review_status NOT IN ('rejected', 'flagged')
    """)
    fees = [dict(row) for row in cur.fetchall()]

    flagged = detect_canonical_outliers(stats, fees)

    log.info(
        "Canonical outlier sweep: %d outliers found across %d categories",
        len(flagged),
        len(stats),
    )
    for f in flagged:
        log.info(
            "  [%s] $%.2f -- median $%.2f, stddev $%.2f -- %s",
            f["canonical_key"], f["amount"], f["median"], f["stddev"], f["fee_name"],
        )

    if fix and flagged:
        ensure_roomba_log(conn)
        for f in flagged:
            cur.execute(
                "UPDATE extracted_fees SET review_status = 'flagged' WHERE id = %s",
                (f["fee_id"],),
            )
            log_change(
                conn,
                f["fee_id"],
                "review_status",
                "pending",
                "flagged",
                (
                    f"canonical_outlier: ${f['amount']:.2f} is 3+ stddev from "
                    f"{f['canonical_key']} median ${f['median']:.2f}"
                ),
            )
        conn.commit()
        log.info("Flagged %d outlier fees for review", len(flagged))

    return flagged


def sweep_canonical_reassignments(conn, fix: bool = False) -> list[dict]:
    """Identify and fix stale canonical_fee_key assignments after alias table updates.

    Compares each fee's canonical_fee_key against what CANONICAL_KEY_MAP would
    assign for the fee's current fee_category. When they disagree the assignment
    is stale and needs correction.

    Gracefully skips if canonical_fee_key column does not exist yet.

    Args:
        conn: psycopg2 connection
        fix: If True, updates canonical_fee_key and logs changes to roomba_log

    Returns:
        List of reassignment dicts with fee_id, fee_category, old_key, new_key
    """
    import sys
    sys.path.insert(0, ".")
    from fee_crawler.fee_analysis import CANONICAL_KEY_MAP

    cur = conn.cursor()

    # Graceful skip if column not yet migrated
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'extracted_fees' AND column_name = 'canonical_fee_key'
    """)
    if not cur.fetchone():
        log.info("Canonical reassignment sweep: canonical_fee_key column not found — skipping")
        return []

    cur.execute("""
        SELECT id, fee_name, fee_category, canonical_fee_key
        FROM extracted_fees
        WHERE canonical_fee_key IS NOT NULL
          AND fee_category IS NOT NULL
          AND review_status != 'rejected'
    """)
    fees = cur.fetchall()

    reassignments = []
    for row in fees:
        fee_category = row["fee_category"]
        current_key = row["canonical_fee_key"]
        expected_key = CANONICAL_KEY_MAP.get(fee_category)

        if expected_key is None:
            # Category not in map — nothing to reassign
            continue
        if expected_key == current_key:
            continue

        reassignments.append({
            "fee_id": row["id"],
            "fee_name": row["fee_name"],
            "fee_category": fee_category,
            "old_key": current_key,
            "new_key": expected_key,
        })

    log.info(
        "Canonical reassignment sweep: %d stale assignments found",
        len(reassignments),
    )
    for r in reassignments:
        log.info(
            "  [%s] canonical_fee_key %s -> %s -- %s",
            r["fee_category"], r["old_key"], r["new_key"], r["fee_name"],
        )

    if fix and reassignments:
        ensure_roomba_log(conn)
        for r in reassignments:
            cur.execute(
                "UPDATE extracted_fees SET canonical_fee_key = %s WHERE id = %s",
                (r["new_key"], r["fee_id"]),
            )
            log_change(
                conn,
                r["fee_id"],
                "canonical_fee_key",
                r["old_key"],
                r["new_key"],
                "canonical_reassignment: alias table updated",
            )
        conn.commit()
        log.info("Reassigned %d fees to updated canonical keys", len(reassignments))

    return reassignments


def apply_fixes(conn, findings: list[RoombaFinding], dry_run: bool = True) -> dict:
    """Apply auto-rejections and return stats."""
    cur = conn.cursor()
    stats = {"rejected": 0, "flagged": 0, "total": len(findings)}

    for f in findings:
        if f.action == "reject" and not dry_run:
            cur.execute("""
                UPDATE extracted_fees
                SET review_status = 'rejected',
                    validation_flags = jsonb_build_object('roomba', %s)
                WHERE id = %s AND review_status != 'rejected'
            """, (f.issue, f.fee_id))
            log_change(conn, f.fee_id, "review_status", "staged", "rejected", f"Roomba: {f.issue}")
            stats["rejected"] += 1
        elif f.action == "reject":
            stats["rejected"] += 1
        elif f.action == "flag":
            stats["flagged"] += 1

    if not dry_run:
        conn.commit()

    return stats


def run(fix: bool = False, check_urls: bool = False, recategorize_only: bool = False):
    """Run the full Roomba sweep."""
    conn = _connect()
    ensure_roomba_log(conn)

    print("=" * 60)
    print("DATA ROOMBA — Database Quality Sweep")
    print("=" * 60)
    mode = "RECATEGORIZE ONLY" if recategorize_only else ("FIX" if fix else "DRY RUN")
    print(f"Mode: {mode}")
    print()

    # Always run re-categorization (it's non-destructive — just refines)
    print("Sweep 0: Re-categorize freeform → canonical taxonomy...")
    if fix or recategorize_only:
        remapped, unmatched = sweep_recategorize(conn)
        print(f"  Remapped: {remapped} fees to canonical categories")
        print(f"  Unmatched: {unmatched} fees (no pattern match)")
    else:
        # Dry run — just count
        cur = conn.cursor()
        from fee_crawler.fee_analysis import FEE_FAMILIES
        canonical = set()
        for cats in FEE_FAMILIES.values():
            canonical.update(cats)
        placeholders = ",".join(["%s"] * len(canonical))
        cur.execute(f"""
            SELECT COUNT(*) FROM extracted_fees
            WHERE review_status != 'rejected' AND fee_category NOT IN ({placeholders})
        """, tuple(canonical))
        freeform_count = cur.fetchone()[0]
        print(f"  Would remap: ~{freeform_count} freeform fees (run with --fix to apply)")

    if recategorize_only:
        print("=" * 60)
        conn.close()
        return {"remapped": remapped if fix else 0}

    print()

    # 1. Amount outliers
    print("Sweep 1: Amount outliers...")
    outliers = sweep_amount_outliers(conn)
    reject_count = sum(1 for f in outliers if f.action == "reject")
    flag_count = sum(1 for f in outliers if f.action == "flag")
    print(f"  Found: {reject_count} to reject, {flag_count} to flag")

    # 2. Duplicates
    print("Sweep 2: Duplicate fees...")
    dupes = sweep_duplicates(conn)
    print(f"  Found: {len(dupes)} duplicate entries to review")

    # 3. Inferred fees
    print("Sweep 3: Inferred NSF from overdraft...")
    inferred = sweep_inferred_fees(conn)
    print(f"  Found: {len(inferred)} possible inferred NSF fees")

    # 4. Canonical reassignments (stale canonical_fee_key after alias table updates)
    print("Sweep 4: Canonical key reassignment (stale alias check)...")
    reassignments = sweep_canonical_reassignments(conn, fix=fix)
    print(f"  Found: {len(reassignments)} stale canonical key assignments")

    # 5. Canonical outliers (3+ stddev from category median)
    print("Sweep 5: Canonical key outlier detection (3+ stddev)...")
    canonical_outliers = sweep_canonical_outliers(conn, fix=fix)
    print(f"  Found: {len(canonical_outliers)} canonical outlier fees flagged for review")

    all_findings = outliers + dupes + inferred

    # Print summary of findings
    print()
    print("-" * 60)
    rejections = [f for f in all_findings if f.action == "reject"]
    flags = [f for f in all_findings if f.action == "flag"]
    print(f"REJECTIONS: {len(rejections)}")
    for f in rejections[:15]:
        print(f"  {f.state_code} {f.institution_name[:35]:<35} {f.fee_category:<25} ${f.amount:>8}")
    if len(rejections) > 15:
        print(f"  ... and {len(rejections) - 15} more")

    print(f"\nFLAGS: {len(flags)}")
    for f in flags[:15]:
        print(f"  {f.state_code} {f.institution_name[:35]:<35} {f.fee_category:<25} ${f.amount:>8}")
    if len(flags) > 15:
        print(f"  ... and {len(flags) - 15} more")

    # Apply fixes
    print()
    stats = apply_fixes(conn, all_findings, dry_run=not fix)
    print("=" * 60)
    print(f"SUMMARY: {stats['rejected']} rejected, {stats['flagged']} flagged, {stats['total']} total findings")
    if not fix:
        print("Run with --fix to apply rejections")
    else:
        print(f"Applied {stats['rejected']} rejections to database")
    print("=" * 60)

    conn.close()
    return stats
