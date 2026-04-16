"""Data integrity checks for Bank Fee Index.

Validates referential integrity, data quality, and consistency
across all tables. Returns a scored report with pass/fail/warn
for each check.

Run: modal run fee_crawler/modal_app.py::check_integrity
Or:  DATABASE_URL=... python -m fee_crawler.workers.data_integrity
"""

import os
import psycopg2
import psycopg2.extras
from datetime import datetime

from fee_crawler.db import require_postgres


def run_checks() -> dict:
    """Run all integrity checks. Returns structured results."""
    require_postgres("data_integrity requires pipeline tables (jobs)")
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        return _run_checks_with_conn(conn)
    finally:
        conn.close()


def _run_checks_with_conn(conn) -> dict:
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    results = []

    def check(name: str, query: str, expect_zero: bool = True, threshold: int = 0):
        """Run a check. expect_zero=True means 0 rows = PASS."""
        try:
            cur.execute(query)
            row = cur.fetchone()
            count = int(row["n"]) if row else 0
            if expect_zero:
                status = "PASS" if count <= threshold else "FAIL"
            else:
                status = "PASS" if count > threshold else "FAIL"
            results.append({"name": name, "status": status, "count": count})
        except Exception as e:
            conn.rollback()
            results.append({"name": name, "status": "ERROR", "count": -1, "error": str(e)[:100]})

    # ── REFERENTIAL INTEGRITY ──────────────────────────────────────────

    check(
        "FK: extracted_fees → crawl_targets",
        "SELECT COUNT(*) as n FROM extracted_fees ef WHERE NOT EXISTS (SELECT 1 FROM crawl_targets ct WHERE ct.id = ef.crawl_target_id)",
    )

    check(
        "FK: fee_reviews → extracted_fees",
        "SELECT COUNT(*) as n FROM fee_reviews fr WHERE NOT EXISTS (SELECT 1 FROM extracted_fees ef WHERE ef.id = fr.fee_id)",
    )

    check(
        "FK: crawl_results → crawl_runs",
        "SELECT COUNT(*) as n FROM crawl_results cr WHERE NOT EXISTS (SELECT 1 FROM crawl_runs r WHERE r.id = cr.crawl_run_id)",
    )

    check(
        "FK: crawl_results → crawl_targets",
        "SELECT COUNT(*) as n FROM crawl_results cr WHERE NOT EXISTS (SELECT 1 FROM crawl_targets ct WHERE ct.id = cr.crawl_target_id)",
    )

    check(
        "FK: fee_snapshots → crawl_targets",
        "SELECT COUNT(*) as n FROM fee_snapshots fs WHERE NOT EXISTS (SELECT 1 FROM crawl_targets ct WHERE ct.id = fs.crawl_target_id)",
    )

    check(
        "FK: fee_change_events → crawl_targets",
        "SELECT COUNT(*) as n FROM fee_change_events fce WHERE NOT EXISTS (SELECT 1 FROM crawl_targets ct WHERE ct.id = fce.crawl_target_id)",
    )

    # ── DATA QUALITY ───────────────────────────────────────────────────

    check(
        "Fees with NULL amount AND NULL fee_name",
        "SELECT COUNT(*) as n FROM extracted_fees WHERE amount IS NULL AND fee_name IS NULL",
    )

    check(
        "Approved fees with no category",
        "SELECT COUNT(*) as n FROM extracted_fees WHERE review_status = 'approved' AND fee_category IS NULL",
        threshold=50,  # some uncategorized is ok
    )

    check(
        "Fees with negative amounts",
        "SELECT COUNT(*) as n FROM extracted_fees WHERE amount < 0",
    )

    check(
        "Fees with amount > $10,000 (likely misextracted)",
        "SELECT COUNT(*) as n FROM extracted_fees WHERE amount > 10000 AND review_status != 'rejected'",
    )

    check(
        "Institutions with fee_url but 0 extracted fees",
        """SELECT COUNT(*) as n FROM crawl_targets ct
           WHERE ct.fee_schedule_url IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM extracted_fees ef WHERE ef.crawl_target_id = ct.id)""",
        threshold=500,  # some lag is normal
    )

    check(
        "Duplicate fees (same institution + category + amount)",
        """SELECT COUNT(*) as n FROM (
             SELECT crawl_target_id, fee_category, amount, COUNT(*) as dupes
             FROM extracted_fees
             WHERE review_status != 'rejected' AND fee_category IS NOT NULL
             GROUP BY crawl_target_id, fee_category, amount
             HAVING COUNT(*) > 1
           ) sub""",
        threshold=100,
    )

    check(
        "Institutions with > 100 fees (extraction anomaly)",
        """SELECT COUNT(*) as n FROM (
             SELECT crawl_target_id, COUNT(*) as cnt
             FROM extracted_fees WHERE review_status != 'rejected'
             GROUP BY crawl_target_id HAVING COUNT(*) > 100
           ) sub""",
    )

    # ── CONSISTENCY ────────────────────────────────────────────────────

    check(
        "Institutions exist (non-empty)",
        "SELECT COUNT(*) as n FROM crawl_targets",
        expect_zero=False,
        threshold=0,
    )

    check(
        "Fee index cache populated",
        "SELECT COUNT(*) as n FROM fee_index_cache",
        expect_zero=False,
        threshold=0,
    )

    check(
        "Fee snapshots exist (time series started)",
        "SELECT COUNT(*) as n FROM fee_snapshots",
        expect_zero=False,
        threshold=0,
    )

    check(
        "Approved fees with review trail",
        """SELECT COUNT(*) as n FROM extracted_fees ef
           WHERE ef.review_status = 'approved'
           AND NOT EXISTS (
             SELECT 1 FROM fee_reviews fr WHERE fr.fee_id = ef.id AND fr.new_status = 'approved'
           )""",
        threshold=1000,  # auto-staged fees may not have explicit review
    )

    check(
        "Stale institutions (fee_url set, last_success > 180 days)",
        """SELECT COUNT(*) as n FROM crawl_targets
           WHERE fee_schedule_url IS NOT NULL
           AND last_success_at IS NOT NULL
           AND last_success_at < NOW() - INTERVAL '180 days'""",
        threshold=100,
    )

    check(
        "Zombie jobs (running > 24h)",
        """SELECT COUNT(*) as n FROM jobs
           WHERE status = 'running'
           AND locked_at < NOW() - INTERVAL '24 hours'""",
    )

    # ── COVERAGE SANITY ────────────────────────────────────────────────

    check(
        "Every state has institutions",
        """SELECT COUNT(*) as n FROM (
             SELECT state_code FROM crawl_targets
             WHERE state_code IS NOT NULL
             GROUP BY state_code
           ) sub""",
        expect_zero=False,
        threshold=40,  # should have 50+ states
    )

    check(
        "Charter type distribution (both banks and CUs)",
        """SELECT COUNT(DISTINCT charter_type) as n FROM crawl_targets
           WHERE charter_type IN ('bank', 'credit_union')""",
        expect_zero=False,
        threshold=1,  # need both
    )

    # ── AMOUNT BOUNDS (spot check known categories) ────────────────────

    check(
        "Overdraft fees in reasonable range ($0-$75)",
        """SELECT COUNT(*) as n FROM extracted_fees
           WHERE fee_category = 'overdraft' AND review_status = 'approved'
           AND (amount < 0 OR amount > 75)""",
    )

    check(
        "Monthly maintenance in reasonable range ($0-$50)",
        """SELECT COUNT(*) as n FROM extracted_fees
           WHERE fee_category = 'monthly_maintenance' AND review_status = 'approved'
           AND (amount < 0 OR amount > 50)""",
    )

    check(
        "Wire domestic outgoing in reasonable range ($0-$75)",
        """SELECT COUNT(*) as n FROM extracted_fees
           WHERE fee_category = 'wire_domestic_outgoing' AND review_status = 'approved'
           AND (amount < 0 OR amount > 75)""",
    )

    # Score
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")
    errors = sum(1 for r in results if r["status"] == "ERROR")
    total = len(results)
    score = round(100 * passed / total) if total else 0

    return {
        "timestamp": datetime.utcnow().isoformat(),
        "score": score,
        "passed": passed,
        "failed": failed,
        "errors": errors,
        "total": total,
        "checks": results,
    }


def print_report(results: dict) -> str:
    lines = []
    lines.append("=" * 60)
    lines.append(f"DATA INTEGRITY REPORT — Score: {results['score']}%")
    lines.append(f"{results['timestamp']}")
    lines.append(f"Passed: {results['passed']} | Failed: {results['failed']} | Errors: {results['errors']}")
    lines.append("=" * 60)

    for check in results["checks"]:
        icon = {"PASS": "OK", "FAIL": "FAIL", "ERROR": "ERR"}[check["status"]]
        count_str = f"({check['count']:,})" if check["count"] >= 0 else ""
        lines.append(f"  [{icon:4s}] {check['name']:55s} {count_str}")
        if check.get("error"):
            lines.append(f"         {check['error']}")

    lines.append("")
    lines.append("=" * 60)
    report = "\n".join(lines)
    return report


if __name__ == "__main__":
    results = run_checks()
    print(print_report(results))
