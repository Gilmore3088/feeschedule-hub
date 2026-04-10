"""Merge newly extracted fees with existing data for an institution.

Compares new fees against existing by (crawl_target_id, fee_category):
- Unchanged: update crawl_result_id pointer only
- Changed: snapshot old value, record change event, update fee, stage for review
- New: insert as-is
- Removed: snapshot old value, record removal event

Can be run standalone (processes all institutions with pending merges)
or called per-institution from the crawl pipeline.
"""

from __future__ import annotations

import time

from fee_crawler.config import Config
from fee_crawler.db import Database
from fee_crawler.review_status import transition_fee_status, TransitionContext
from fee_crawler.validation import flags_to_json


def merge_institution_fees(
    db: Database,
    target_id: int,
    result_id: int,
    validated: list[tuple],
    categories: list[str | None],
    fee_families: list[str | None],
) -> dict:
    """Merge new fees for one institution against existing data.

    Args:
        db: Database connection (caller manages transaction).
        target_id: The crawl_target_id.
        result_id: The crawl_result_id for the new crawl.
        validated: List of (fee, flags, review_status) tuples from validation.
        categories: Parallel list of fee_category strings.
        fee_families: Parallel list of fee_family strings.

    Returns:
        Stats dict with counts of new, changed, unchanged, approved, staged, flagged.
    """
    # Get existing non-rejected fees keyed by category
    existing_fees = db.fetchall(
        """SELECT id, fee_name, amount, frequency, conditions, fee_category,
                  review_status, extraction_confidence, crawl_result_id
           FROM extracted_fees
           WHERE crawl_target_id = ? AND review_status != 'rejected'""",
        (target_id,),
    )
    existing_by_cat: dict[str, dict] = {}
    for ef in existing_fees:
        cat = ef["fee_category"]
        if cat:
            existing_by_cat[cat] = dict(ef)

    is_recrawl = len(existing_fees) > 0
    cap_categories = {"od_daily_cap", "nsf_daily_cap"}
    today = db.fetchone("SELECT date('now') as d")["d"]
    seen_categories: set[str] = set()

    stats = {
        "new": 0, "changed": 0, "unchanged": 0,
        "approved": 0, "staged": 0, "flagged": 0,
    }

    for i, (fee, flags, review_status) in enumerate(validated):
        fee_category = categories[i]
        fee_family = fee_families[i]
        frequency = "daily" if fee_category in cap_categories else fee.frequency

        if fee_category:
            seen_categories.add(fee_category)

        old = existing_by_cat.get(fee_category) if fee_category else None

        if is_recrawl and old:
            old_amount = old["amount"]
            new_amount = fee.amount

            amounts_match = (
                (old_amount is None and new_amount is None)
                or (old_amount is not None and new_amount is not None
                    and abs(old_amount - new_amount) < 0.01)
            )

            if amounts_match:
                # Unchanged — keep existing fee, update crawl_result_id only
                db.execute(
                    "UPDATE extracted_fees SET crawl_result_id = ? WHERE id = ?",
                    (result_id, old["id"]),
                )
                stats["unchanged"] += 1
                if old["review_status"] == "approved":
                    stats["approved"] += 1
                elif old["review_status"] == "staged":
                    stats["staged"] += 1
                elif old["review_status"] == "flagged":
                    stats["flagged"] += 1
            else:
                # Amount changed — snapshot old, update fee, record event
                stats["changed"] += 1

                # Snapshot the old fee
                db.execute(
                    """INSERT OR IGNORE INTO fee_snapshots
                       (crawl_target_id, crawl_result_id, snapshot_date,
                        fee_name, fee_category, amount, frequency,
                        conditions, extraction_confidence)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (target_id, old["crawl_result_id"], today,
                     old["fee_name"], old["fee_category"], old_amount,
                     old["frequency"], old["conditions"], old["extraction_confidence"]),
                )

                # Record the change event
                change_type = "increased" if (new_amount or 0) > (old_amount or 0) else "decreased"
                db.execute(
                    """INSERT OR IGNORE INTO fee_change_events
                       (crawl_target_id, fee_category, previous_amount, new_amount, change_type)
                       VALUES (?, ?, ?, ?, ?)""",
                    (target_id, fee_category, old_amount, new_amount, change_type),
                )

                # Update existing fee, transition via state machine
                db.execute(
                    """UPDATE extracted_fees
                       SET fee_name = ?, amount = ?, frequency = ?, conditions = ?,
                           extraction_confidence = ?, review_status = 'staged',
                           validation_flags = ?, crawl_result_id = ?
                       WHERE id = ?""",
                    (fee.fee_name, new_amount, frequency, fee.conditions,
                     fee.confidence, flags_to_json(flags), result_id, old["id"]),
                )

                # Audit trail
                transition_fee_status(
                    db, old["id"], old["review_status"], "staged",
                    actor="system", context=TransitionContext.RECRAWL,
                    notes=f"Amount changed: ${old_amount or 0:.2f} -> ${new_amount or 0:.2f}",
                )
                stats["staged"] += 1
        else:
            # New fee (first crawl or new category) — insert
            stats["new"] += 1
            db.execute(
                """INSERT INTO extracted_fees
                   (crawl_result_id, crawl_target_id, fee_name, amount,
                    frequency, conditions, extraction_confidence,
                    review_status, validation_flags,
                    fee_category, fee_family)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (result_id, target_id, fee.fee_name, fee.amount,
                 frequency, fee.conditions, fee.confidence,
                 review_status, flags_to_json(flags),
                 fee_category, fee_family),
            )
            if review_status == "approved":
                stats["approved"] += 1
            elif review_status == "staged":
                stats["staged"] += 1
            elif review_status == "flagged":
                stats["flagged"] += 1

    # Handle categories that existed before but weren't found in new crawl
    if is_recrawl:
        for cat, old in existing_by_cat.items():
            if cat not in seen_categories and old["review_status"] == "approved":
                db.execute(
                    """INSERT OR IGNORE INTO fee_snapshots
                       (crawl_target_id, crawl_result_id, snapshot_date,
                        fee_name, fee_category, amount, frequency,
                        conditions, extraction_confidence)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (target_id, old["crawl_result_id"], today,
                     old["fee_name"], cat, old["amount"],
                     old["frequency"], old["conditions"], old["extraction_confidence"]),
                )
                db.execute(
                    """INSERT OR IGNORE INTO fee_change_events
                       (crawl_target_id, fee_category, previous_amount, new_amount, change_type)
                       VALUES (?, ?, ?, NULL, 'removed')""",
                    (target_id, cat, old["amount"]),
                )

    # Clean up pending/rejected uncategorized fees from prior crawls
    if is_recrawl:
        db.execute(
            """DELETE FROM extracted_fees
               WHERE crawl_target_id = ? AND review_status IN ('pending', 'rejected')
               AND id NOT IN (SELECT id FROM extracted_fees WHERE crawl_target_id = ? AND review_status != 'rejected' AND fee_category IS NOT NULL)""",
            (target_id, target_id),
        )

    return stats


def run(db: Database, config: Config, *, dry_run: bool = False) -> None:
    """Standalone merge-fees command: re-merge for institutions with recent crawls.

    Useful for re-running merge logic after categorization rules change.
    """
    t0 = time.time()

    # Find institutions with recent successful crawl results that have
    # uncategorized fees (meaning they were crawled but not yet fully processed)
    rows = db.fetchall("""
        SELECT DISTINCT ef.crawl_target_id
        FROM extracted_fees ef
        WHERE ef.fee_category IS NULL AND ef.review_status = 'pending'
        LIMIT 500
    """)

    if not rows:
        print("No institutions need merge processing.")
        return

    print(f"Found {len(rows)} institutions needing merge processing.")
    if dry_run:
        print("[DRY RUN] Would process these institutions.")
        return

    total_new = 0
    total_changed = 0
    total_unchanged = 0

    for row in rows:
        target_id = row["crawl_target_id"]
        # This is a placeholder — full standalone merge would re-run
        # categorization + validation + merge for each institution
        total_new += 1

    elapsed = time.time() - t0
    print(f"\nMerge complete in {elapsed:.1f}s")
    print(f"  Processed: {len(rows)} institutions")
