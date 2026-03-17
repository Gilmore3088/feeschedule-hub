"""Take a snapshot of current fees and detect changes since last snapshot."""

from __future__ import annotations

from datetime import datetime

from fee_crawler.config import Config
from fee_crawler.db import Database


def snapshot_fees(
    db: Database,
    *,
    snapshot_date: str | None = None,
) -> dict:
    """Copy current approved+staged fees to fee_snapshots and detect changes.

    Returns dict with snapshot_count, changes_detected, increases, decreases.
    """
    date = snapshot_date or datetime.now().strftime("%Y-%m-%d")

    # Get the most recent previous snapshot date for change detection
    prev = db.fetchone(
        """SELECT MAX(snapshot_date) as d FROM fee_snapshots
           WHERE snapshot_date < ?""",
        (date,),
    )
    prev_date = prev["d"] if prev else None

    # Build map of previous snapshot amounts for change detection
    prev_amounts: dict[tuple[int, str], float] = {}
    if prev_date:
        prev_rows = db.fetchall(
            """SELECT crawl_target_id, fee_category, amount
               FROM fee_snapshots
               WHERE snapshot_date = ? AND fee_category IS NOT NULL AND amount IS NOT NULL""",
            (prev_date,),
        )
        for row in prev_rows:
            prev_amounts[(row["crawl_target_id"], row["fee_category"])] = row["amount"]

    # Snapshot current approved + staged fees
    fees = db.fetchall(
        """SELECT crawl_target_id, id as crawl_result_id, fee_name,
                  fee_category, amount, frequency, conditions,
                  account_product_type, extraction_confidence
           FROM extracted_fees
           WHERE review_status IN ('approved', 'staged')
             AND fee_category IS NOT NULL
             AND amount IS NOT NULL"""
    )

    print(f"Snapshotting {len(fees):,} fees as of {date}...")

    snapshot_count = 0
    skipped = 0
    for fee in fees:
        try:
            db.execute(
                """INSERT INTO fee_snapshots
                   (crawl_target_id, crawl_result_id, snapshot_date,
                    fee_name, fee_category, amount, frequency,
                    conditions, account_product_type, extraction_confidence)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(crawl_target_id, snapshot_date, fee_category) DO UPDATE SET
                    fee_name = excluded.fee_name,
                    amount = excluded.amount,
                    frequency = excluded.frequency,
                    conditions = excluded.conditions,
                    account_product_type = excluded.account_product_type,
                    extraction_confidence = excluded.extraction_confidence""",
                (
                    fee["crawl_target_id"],
                    fee["crawl_result_id"],
                    date,
                    fee["fee_name"],
                    fee["fee_category"],
                    fee["amount"],
                    fee["frequency"],
                    fee["conditions"],
                    fee["account_product_type"],
                    fee["extraction_confidence"],
                ),
            )
            snapshot_count += 1
        except Exception as e:
            skipped += 1
            if skipped <= 3:
                print(f"  Error: {e}")

    db.commit()
    print(f"  Snapshot: {snapshot_count:,} fees stored ({skipped} skipped)")

    # Detect changes vs previous snapshot
    increases = 0
    decreases = 0
    changes_detected = 0

    if prev_date and prev_amounts:
        print(f"\nDetecting changes since {prev_date}...")
        current_rows = db.fetchall(
            """SELECT crawl_target_id, fee_category, amount
               FROM fee_snapshots
               WHERE snapshot_date = ? AND fee_category IS NOT NULL AND amount IS NOT NULL""",
            (date,),
        )

        for row in current_rows:
            key = (row["crawl_target_id"], row["fee_category"])
            if key not in prev_amounts:
                continue

            old_amount = prev_amounts[key]
            new_amount = row["amount"]

            if abs(new_amount - old_amount) < 0.01:
                continue

            change_type = "increase" if new_amount > old_amount else "decrease"
            if change_type == "increase":
                increases += 1
            else:
                decreases += 1
            changes_detected += 1

            db.execute(
                """INSERT OR IGNORE INTO fee_change_events
                   (crawl_target_id, fee_category, previous_amount, new_amount, change_type)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    row["crawl_target_id"],
                    row["fee_category"],
                    old_amount,
                    new_amount,
                    change_type,
                ),
            )

        db.commit()
        print(f"  Changes: {changes_detected} ({increases} increases, {decreases} decreases)")
    else:
        print("  No previous snapshot for change detection (first snapshot)")

    return {
        "snapshot_date": date,
        "snapshot_count": snapshot_count,
        "changes_detected": changes_detected,
        "increases": increases,
        "decreases": decreases,
    }


def run(
    db: Database,
    config: Config,
    *,
    date: str | None = None,
) -> None:
    """Entry point for the CLI command."""
    result = snapshot_fees(db, snapshot_date=date)

    # Summary
    total = db.fetchone("SELECT COUNT(*) as cnt FROM fee_snapshots")
    dates = db.fetchall(
        "SELECT snapshot_date, COUNT(*) as cnt FROM fee_snapshots GROUP BY snapshot_date ORDER BY snapshot_date DESC"
    )
    events = db.fetchone("SELECT COUNT(*) as cnt FROM fee_change_events")

    print(f"\nTotal snapshots: {total['cnt']:,}")
    print(f"Change events: {events['cnt']:,}")
    print("Snapshot dates:")
    for d in dates[:5]:
        print(f"  {d['snapshot_date']}: {d['cnt']:,} fees")
