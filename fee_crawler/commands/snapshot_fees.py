"""Take a quarterly snapshot of current fees for QoQ delta detection (D-08).

Writes to two Postgres tables:
- fee_index_snapshots: category-level aggregates (median, P25, P75)
- institution_fee_snapshots: per-institution fee state

Both tables use ON CONFLICT DO UPDATE so re-running on the same date is idempotent.
"""

from __future__ import annotations

import statistics
from datetime import datetime


def run(conn, *, snapshot_date: str | None = None) -> dict:
    """Snapshot current approved+staged fees to Postgres snapshot tables.

    Args:
        conn: psycopg2 connection
        snapshot_date: ISO date string (YYYY-MM-DD). Defaults to today.

    Returns:
        dict with category_snapshots, institution_snapshots, snapshot_date.
    """
    date = snapshot_date or datetime.now().strftime("%Y-%m-%d")

    category_count = _snapshot_categories(conn, date)
    institution_count = _snapshot_institutions(conn, date)
    conn.commit()

    print(
        f"Snapshot {date}: {category_count} category rows, "
        f"{institution_count} institution rows"
    )
    return {
        "snapshot_date": date,
        "category_snapshots": category_count,
        "institution_snapshots": institution_count,
    }


def _snapshot_categories(conn, date: str) -> int:
    """Write category-level aggregates to fee_index_snapshots."""
    cur = conn.cursor()

    # Fetch all approved+staged fees with amount and category
    cur.execute("""
        SELECT fee_category, canonical_fee_key,
               crawl_target_id, amount, charter
        FROM extracted_fees
        JOIN crawl_targets ON crawl_targets.id = extracted_fees.crawl_target_id
        WHERE review_status IN ('approved', 'staged')
          AND fee_category IS NOT NULL
          AND amount IS NOT NULL
    """)
    rows = cur.fetchall()

    # Group by (fee_category, canonical_fee_key, charter)
    groups: dict[tuple, list[float]] = {}
    institution_sets: dict[tuple, set[int]] = {}

    for row in rows:
        fee_category = row[0]
        canonical_fee_key = row[1]
        crawl_target_id = row[2]
        amount = float(row[3])
        charter = row[4] if len(row) > 4 else None

        key = (fee_category, canonical_fee_key, charter)
        groups.setdefault(key, []).append(amount)
        institution_sets.setdefault(key, set()).add(crawl_target_id)

    count = 0
    for (fee_category, canonical_fee_key, charter), amounts in groups.items():
        sorted_amounts = sorted(amounts)
        n = len(sorted_amounts)
        median_amount = statistics.median(sorted_amounts)
        if n >= 2:
            quantiles = statistics.quantiles(sorted_amounts, n=4)
            p25 = quantiles[0]
            p75 = quantiles[2]
        else:
            p25 = sorted_amounts[0]
            p75 = sorted_amounts[0]
        institution_count = len(institution_sets[(fee_category, canonical_fee_key, charter)])
        fee_count = n

        cur.execute("""
            INSERT INTO fee_index_snapshots
                (snapshot_date, fee_category, canonical_fee_key,
                 median_amount, p25_amount, p75_amount,
                 institution_count, fee_count, charter)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (snapshot_date, fee_category, COALESCE(charter, ''))
            DO UPDATE SET
                canonical_fee_key = EXCLUDED.canonical_fee_key,
                median_amount = EXCLUDED.median_amount,
                p25_amount = EXCLUDED.p25_amount,
                p75_amount = EXCLUDED.p75_amount,
                institution_count = EXCLUDED.institution_count,
                fee_count = EXCLUDED.fee_count
        """, (
            date, fee_category, canonical_fee_key,
            round(median_amount, 2), round(p25, 2), round(p75, 2),
            institution_count, fee_count, charter,
        ))
        count += 1

    return count


def _snapshot_institutions(conn, date: str) -> int:
    """Write per-institution fee state to institution_fee_snapshots."""
    cur = conn.cursor()

    cur.execute("""
        SELECT crawl_target_id, canonical_fee_key, amount, review_status
        FROM extracted_fees
        WHERE canonical_fee_key IS NOT NULL
          AND review_status != 'rejected'
    """)
    rows = cur.fetchall()

    count = 0
    for row in rows:
        crawl_target_id, canonical_fee_key, amount, review_status = row

        cur.execute("""
            INSERT INTO institution_fee_snapshots
                (snapshot_date, crawl_target_id, canonical_fee_key, amount, review_status)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (snapshot_date, crawl_target_id, canonical_fee_key)
            DO UPDATE SET
                amount = EXCLUDED.amount,
                review_status = EXCLUDED.review_status
        """, (date, crawl_target_id, canonical_fee_key, amount, review_status))
        count += 1

    return count
