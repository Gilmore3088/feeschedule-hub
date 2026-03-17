"""Publish the fee index: coverage snapshot, cache revalidation, DB maintenance.

This is the final pipeline stage. It:
1. Updates the coverage_snapshots table with current metrics
2. Revalidates the Next.js ISR cache so public pages reflect new data
3. Runs PRAGMA optimize and WAL checkpoint for DB health
"""

from __future__ import annotations

import json
import time
import urllib.request

from fee_crawler.config import Config
from fee_crawler.db import Database


def run(db: Database, config: Config, *, dry_run: bool = False) -> None:
    """Publish the fee index and run post-pipeline maintenance."""
    t0 = time.time()

    # 1. Coverage snapshot (upsert for today)
    snapshot = db.fetchone("""
        SELECT
          (SELECT COUNT(*) FROM crawl_targets) as total,
          (SELECT COUNT(*) FROM crawl_targets WHERE fee_schedule_url IS NOT NULL AND fee_schedule_url != '') as with_url,
          (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees WHERE review_status != 'rejected') as with_fees,
          (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees WHERE review_status = 'approved') as with_approved,
          (SELECT COUNT(*) FROM extracted_fees WHERE review_status != 'rejected') as total_fees,
          (SELECT COUNT(*) FROM extracted_fees WHERE review_status = 'approved') as approved_fees
    """)

    if snapshot:
        print(f"Coverage: {snapshot['with_fees']:,} institutions with fees, "
              f"{snapshot['approved_fees']:,} approved fees")

        if not dry_run:
            db.execute(
                """INSERT INTO coverage_snapshots
                   (snapshot_date, total_institutions, with_fee_url, with_fees,
                    with_approved, total_fees, approved_fees)
                   VALUES (date('now'), ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(snapshot_date) DO UPDATE SET
                     total_institutions = excluded.total_institutions,
                     with_fee_url = excluded.with_fee_url,
                     with_fees = excluded.with_fees,
                     with_approved = excluded.with_approved,
                     total_fees = excluded.total_fees,
                     approved_fees = excluded.approved_fees""",
                (snapshot["total"], snapshot["with_url"], snapshot["with_fees"],
                 snapshot["with_approved"], snapshot["total_fees"], snapshot["approved_fees"]),
            )
            db.commit()

    # 2. Revalidate Next.js cache
    revalidated = False
    try:
        base_url = "http://localhost:3000"
        secret = "revalidate-secret"
        url = f"{base_url}/api/revalidate?secret={secret}"
        if not dry_run:
            req = urllib.request.Request(url, method="POST")
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    revalidated = True
                    print("Cache revalidated.")
        else:
            print("[DRY RUN] Would revalidate cache.")
    except Exception as e:
        print(f"Cache revalidation skipped: {e}")

    # 3. DB maintenance
    if not dry_run:
        db.execute("PRAGMA optimize")
        db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        print("DB maintenance: PRAGMA optimize + WAL checkpoint(TRUNCATE).")
    else:
        print("[DRY RUN] Would run PRAGMA optimize + WAL checkpoint.")

    elapsed = time.time() - t0
    result = {
        "version": 1,
        "command": "publish-index",
        "status": "completed",
        "duration_s": round(elapsed, 1),
        "coverage_with_fees": snapshot["with_fees"] if snapshot else 0,
        "approved_fees": snapshot["approved_fees"] if snapshot else 0,
        "cache_revalidated": revalidated,
    }
    print(f"##RESULT_JSON##{json.dumps(result)}")
