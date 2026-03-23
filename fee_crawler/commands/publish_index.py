"""Publish the fee index: materialize cache, coverage snapshot, DB maintenance.

This is the final pipeline stage. It:
1. Materializes the fee_index_cache table (precomputed stats per category)
2. Updates the coverage_snapshots table with current metrics
3. Revalidates the Next.js ISR cache so public pages reflect new data
4. Runs PRAGMA optimize and WAL checkpoint for DB health
"""

from __future__ import annotations

import json
import statistics
import time
import urllib.request

from fee_crawler.config import Config
from fee_crawler.db import Database


def _compute_index_cache(db: Database) -> int:
    """Materialize per-category stats into fee_index_cache. Returns category count.

    Only includes the 49 canonical taxonomy categories, not raw fee names.
    """
    from fee_crawler.fee_analysis import FEE_FAMILIES
    canonical_cats: set[str] = set()
    for members in FEE_FAMILIES.values():
        canonical_cats.update(members)

    placeholders = ",".join("?" for _ in canonical_cats)
    rows = db.fetchall(f"""
        SELECT ef.fee_category, ef.fee_family, ef.amount,
               ef.crawl_target_id, ef.review_status, ct.charter_type
        FROM extracted_fees ef
        JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
        WHERE ef.fee_category IN ({placeholders}) AND ef.review_status != 'rejected'
    """, tuple(canonical_cats))

    grouped: dict[str, dict] = {}
    for row in rows:
        cat = row["fee_category"]
        if cat not in grouped:
            grouped[cat] = {
                "family": row["fee_family"],
                "amounts": [],
                "banks": set(),
                "cus": set(),
                "approved": 0,
                "total": 0,
            }
        entry = grouped[cat]
        entry["total"] += 1
        if row["amount"] is not None and row["amount"] > 0:
            entry["amounts"].append(row["amount"])
        if row["charter_type"] == "bank":
            entry["banks"].add(row["crawl_target_id"])
        else:
            entry["cus"].add(row["crawl_target_id"])
        if row["review_status"] == "approved":
            entry["approved"] += 1

    # Clear and rebuild
    db.execute("DELETE FROM fee_index_cache")

    for cat, data in grouped.items():
        amounts = sorted(data["amounts"])
        n = len(amounts)
        inst_count = len(data["banks"] | data["cus"])

        if n == 0:
            median = p25 = p75 = min_amt = max_amt = None
        elif n == 1:
            median = p25 = p75 = min_amt = max_amt = amounts[0]
        else:
            median = statistics.median(amounts)
            q = statistics.quantiles(amounts, n=4) if n >= 4 else [amounts[0], median, amounts[-1]]
            p25 = q[0]
            p75 = q[2] if len(q) > 2 else q[-1]
            min_amt = amounts[0]
            max_amt = amounts[-1]

        maturity = "insufficient"
        if data["approved"] >= 10:
            maturity = "strong"
        elif data["total"] >= 10:
            maturity = "provisional"

        db.execute(
            """INSERT INTO fee_index_cache
               (fee_category, fee_family, median_amount, p25_amount, p75_amount,
                min_amount, max_amount, institution_count, observation_count,
                approved_count, bank_count, cu_count, maturity_tier, computed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
            (cat, data["family"], median, p25, p75, min_amt, max_amt,
             inst_count, data["total"], data["approved"],
             len(data["banks"]), len(data["cus"]), maturity),
        )

    db.commit()
    return len(grouped)


def run(db: Database, config: Config, *, dry_run: bool = False) -> None:
    """Publish the fee index and run post-pipeline maintenance."""
    t0 = time.time()

    # 1. Materialize fee index cache
    if not dry_run:
        cat_count = _compute_index_cache(db)
        print(f"Fee index cache: {cat_count} categories materialized.")
    else:
        print("[DRY RUN] Would materialize fee index cache.")
        cat_count = 0

    # 2. Coverage snapshot (upsert for today)
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

    # 3. Revalidate Next.js cache
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

    # 4. DB maintenance
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
        "categories_cached": cat_count,
        "coverage_with_fees": snapshot["with_fees"] if snapshot else 0,
        "approved_fees": snapshot["approved_fees"] if snapshot else 0,
        "cache_revalidated": revalidated,
    }
    from fee_crawler.job_result import emit_result
    emit_result(result)
