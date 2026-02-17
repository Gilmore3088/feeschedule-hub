"""Retroactively re-validate all extracted_fees with current rules.

Skips already-rejected fees. Writes audit records for auto-approved fees.
"""

from fee_crawler.config import load_config
from fee_crawler.db import Database
from fee_crawler.fee_analysis import normalize_fee_name
from fee_crawler.pipeline.extract_llm import ExtractedFee
from fee_crawler.validation import (
    determine_review_status,
    flags_to_json,
    validate_fee,
)

SKIP_STATUSES = {"rejected"}


def run(db: Database) -> None:
    """Re-validate all extracted fees with current rules."""
    config = load_config()

    fees = db.fetchall(
        """SELECT id, crawl_target_id, fee_name, amount, frequency,
                  conditions, extraction_confidence, review_status,
                  validation_flags, fee_category
           FROM extracted_fees
           ORDER BY crawl_target_id, fee_name"""
    )

    if not fees:
        print("No extracted fees to validate.")
        return

    total = len(fees)
    updated = 0
    skipped = 0
    auto_approved = 0
    stats: dict[str, int] = {}

    current_target_id = None
    seen_canonical: list[str] = []

    for row in fees:
        # Skip rejected fees
        if row["review_status"] in SKIP_STATUSES:
            skipped += 1
            continue

        # Reset per-institution state
        if row["crawl_target_id"] != current_target_id:
            current_target_id = row["crawl_target_id"]
            seen_canonical = []

        fee = ExtractedFee(
            fee_name=row["fee_name"],
            amount=row["amount"],
            frequency=row["frequency"],
            conditions=row["conditions"],
            confidence=row["extraction_confidence"],
        )

        fee_category = row["fee_category"]
        flags = validate_fee(fee, seen_canonical, config, fee_category)
        new_status = determine_review_status(
            flags, fee.confidence, config, fee_category, fee.amount,
        )
        flags_json = flags_to_json(flags)

        seen_canonical.append(normalize_fee_name(fee.fee_name))

        old_status = row["review_status"]

        # Update the row
        db.execute(
            """UPDATE extracted_fees
               SET review_status = ?, validation_flags = ?
               WHERE id = ?""",
            (new_status, flags_json, row["id"]),
        )

        # Write audit record for auto-approved fees
        if new_status == "approved" and old_status != "approved":
            db.execute(
                """INSERT INTO fee_reviews
                   (fee_id, action, username, previous_status, new_status, notes)
                   VALUES (?, 'auto_approve', 'system/auto-review', ?, 'approved',
                           'Auto-approved: confidence >= 0.90, amount in category range')""",
                (row["id"], old_status),
            )
            auto_approved += 1

        stats[new_status] = stats.get(new_status, 0) + 1
        updated += 1

    db.commit()

    print(f"Validated {updated}/{total} fees (skipped {skipped} rejected):")
    for status, count in sorted(stats.items()):
        if count > 0:
            print(f"  {status}: {count}")
    if auto_approved:
        print(f"  auto-approved (new): {auto_approved}")
