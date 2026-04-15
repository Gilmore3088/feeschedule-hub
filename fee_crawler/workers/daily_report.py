"""Daily pipeline performance report.

Generates a summary of what happened in the last 24 hours:
- Discovery: URLs found, institutions probed
- Extraction: fees extracted, approval rate
- Coverage: total progress toward 50% goal
- Data freshness: stalest data, ingest status
- Errors: failed jobs, connection issues

Output goes to stdout (Modal logs) and optionally email.
"""

import os
import psycopg2
import psycopg2.extras
from datetime import datetime

from fee_crawler.db import require_postgres


def generate_report() -> str:
    require_postgres("daily_report requires pipeline tables (jobs)")
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    lines = []
    lines.append("=" * 60)
    lines.append(f"BANK FEE INDEX — DAILY REPORT")
    lines.append(f"{datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("=" * 60)

    # Coverage funnel
    cur.execute("""
        SELECT
            COUNT(*) as total,
            COUNT(website_url) as has_website,
            COUNT(fee_schedule_url) as has_fee_url,
            (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees) as with_fees,
            (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees WHERE review_status = 'approved') as with_approved
        FROM crawl_targets
    """)
    f = cur.fetchone()
    pct_fee_url = 100 * f["has_fee_url"] / f["total"] if f["total"] else 0
    pct_fees = 100 * f["with_fees"] / f["total"] if f["total"] else 0
    pct_approved = 100 * f["with_approved"] / f["total"] if f["total"] else 0

    lines.append("")
    lines.append("COVERAGE FUNNEL")
    lines.append(f"  Institutions:     {f['total']:,}")
    lines.append(f"  Has website:      {f['has_website']:,} ({100*f['has_website']/f['total']:.1f}%)")
    lines.append(f"  Has fee URL:      {f['has_fee_url']:,} ({pct_fee_url:.1f}%)")
    lines.append(f"  With fees:        {f['with_fees']:,} ({pct_fees:.1f}%)")
    lines.append(f"  With approved:    {f['with_approved']:,} ({pct_approved:.1f}%)")
    lines.append(f"  Target (50%):     {int(f['total']*0.5):,}  {'REACHED' if pct_fees >= 50 else f'{50-pct_fees:.1f}% to go'}")

    # Discovery (last 24h)
    cur.execute("""
        SELECT status, COUNT(*) as n
        FROM jobs
        WHERE queue = 'discovery' AND completed_at > NOW() - INTERVAL '24 hours'
        GROUP BY status
    """)
    disc = {r["status"]: r["n"] for r in cur.fetchall()}
    disc_completed = disc.get("completed", 0)
    disc_failed = disc.get("failed", 0)

    cur.execute("SELECT COUNT(*) as n FROM jobs WHERE queue = 'discovery' AND status = 'pending'")
    disc_pending = cur.fetchone()["n"]

    lines.append("")
    lines.append("DISCOVERY (last 24h)")
    lines.append(f"  Completed:  {disc_completed}")
    lines.append(f"  Failed:     {disc_failed}")
    lines.append(f"  Pending:    {disc_pending:,}")
    if disc_completed > 0:
        lines.append(f"  Est. days remaining: {disc_pending // max(disc_completed, 1)}")

    # Extraction (last 24h)
    cur.execute("""
        SELECT COUNT(*) as n FROM extracted_fees
        WHERE created_at > NOW() - INTERVAL '24 hours'
    """)
    new_fees = cur.fetchone()["n"]

    cur.execute("""
        SELECT review_status, COUNT(*) as n FROM extracted_fees
        GROUP BY review_status ORDER BY n DESC
    """)
    statuses = {r["review_status"]: r["n"] for r in cur.fetchall()}

    lines.append("")
    lines.append("FEES")
    lines.append(f"  New (24h):     {new_fees}")
    lines.append(f"  Total:         {sum(statuses.values()):,}")
    lines.append(f"  Approved:      {statuses.get('approved', 0):,}")
    lines.append(f"  Staged:        {statuses.get('staged', 0):,}")
    lines.append(f"  Flagged:       {statuses.get('flagged', 0):,}")
    lines.append(f"  Rejected:      {statuses.get('rejected', 0):,}")

    # Time series
    cur.execute("SELECT COUNT(*) as n, COUNT(DISTINCT snapshot_date) as dates FROM fee_snapshots")
    snap = cur.fetchone()
    lines.append("")
    lines.append("TIME SERIES")
    lines.append(f"  Snapshots:  {snap['n']:,} across {snap['dates']} dates")

    # Job queue overview
    cur.execute("""
        SELECT queue, status, COUNT(*) as n
        FROM jobs GROUP BY queue, status ORDER BY queue, n DESC
    """)
    lines.append("")
    lines.append("JOB QUEUE")
    for r in cur.fetchall():
        lines.append(f"  {r['queue']:12s} {r['status']:12s} {r['n']:,}")

    # Research data freshness
    tables = [
        ("fed_economic_indicators", "fetched_at"),
        ("institution_financials", "fetched_at"),
        ("branch_deposits", "fetched_at"),
        ("institution_complaints", "fetched_at"),
        ("fed_beige_book", "fetched_at"),
    ]
    lines.append("")
    lines.append("DATA FRESHNESS")
    for table, col in tables:
        try:
            cur.execute(f"SELECT COUNT(*) as n, MAX({col}) as latest FROM {table}")
            r = cur.fetchone()
            latest = str(r["latest"])[:10] if r["latest"] else "never"
            lines.append(f"  {table:30s} {r['n']:>8,} rows  latest: {latest}")
        except Exception:
            lines.append(f"  {table:30s}    ERROR")
            conn.rollback()

    # Discovery success rate
    cur.execute("""
        SELECT status, COUNT(*) as n
        FROM jobs WHERE queue = 'discovery'
        GROUP BY status ORDER BY n DESC
    """)
    disc_all = {r["status"]: r["n"] for r in cur.fetchall()}
    total_disc = sum(disc_all.values())
    completed_disc = disc_all.get("completed", 0)
    failed_disc = disc_all.get("failed", 0)

    lines.append("")
    lines.append("DISCOVERY PIPELINE")
    lines.append(f"  Total jobs:      {total_disc:,}")
    lines.append(f"  Completed:       {completed_disc:,} ({100*completed_disc/max(total_disc,1):.1f}%)")
    lines.append(f"  Failed:          {failed_disc:,} ({100*failed_disc/max(total_disc,1):.1f}%)")
    lines.append(f"  Hit rate:        {100*completed_disc/max(completed_disc+failed_disc,1):.1f}% (found URL / probed)")
    lines.append(f"  Still pending:   {disc_all.get('pending', 0):,}")
    lines.append(f"  In progress:     {disc_all.get('running', 0):,}")

    # Errors (last 24h)
    cur.execute("""
        SELECT error, COUNT(*) as n
        FROM jobs
        WHERE status = 'failed' AND completed_at > NOW() - INTERVAL '24 hours'
        AND error IS NOT NULL
        GROUP BY error ORDER BY n DESC LIMIT 5
    """)
    errors = cur.fetchall()
    if errors:
        lines.append("")
        lines.append("TOP ERRORS (last 24h)")
        for e in errors:
            lines.append(f"  [{e['n']:3d}x] {str(e['error'])[:80]}")

    lines.append("")
    lines.append("=" * 60)

    conn.close()
    return "\n".join(lines)


if __name__ == "__main__":
    print(generate_report())
