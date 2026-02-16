"""Retroactively validate existing extracted_fees that have no validation_flags."""

from fee_crawler.config import Config, load_config
from fee_crawler.db import Database
from fee_crawler.fee_analysis import normalize_fee_name
from fee_crawler.pipeline.extract_llm import ExtractedFee
from fee_crawler.validation import (
    ValidationFlag,
    determine_review_status,
    flags_to_json,
    validate_fee,
)


def run(db: Database) -> None:
    """Re-validate all extracted fees that lack validation_flags."""
    config = load_config()

    # Get all fees grouped by institution
    fees = db.fetchall(
        """SELECT id, crawl_target_id, fee_name, amount, frequency,
                  conditions, extraction_confidence, review_status, validation_flags
           FROM extracted_fees
           ORDER BY crawl_target_id, fee_name"""
    )

    if not fees:
        print("No extracted fees to validate.")
        return

    total = len(fees)
    updated = 0
    stats = {"staged": 0, "flagged": 0, "pending": 0}

    # Group by institution for duplicate detection
    current_target_id = None
    seen_canonical: list[str] = []

    for row in fees:
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

        flags = validate_fee(fee, seen_canonical, config)
        new_status = determine_review_status(flags, fee.confidence, config)
        flags_json = flags_to_json(flags)

        # Track canonical for duplicate detection
        seen_canonical.append(normalize_fee_name(fee.fee_name))

        # Update the row
        db.execute(
            """UPDATE extracted_fees
               SET review_status = ?, validation_flags = ?
               WHERE id = ?""",
            (new_status, flags_json, row["id"]),
        )
        stats[new_status] = stats.get(new_status, 0) + 1
        updated += 1

    db.commit()

    print(f"Validated {updated}/{total} fees:")
    for status, count in sorted(stats.items()):
        if count > 0:
            print(f"  {status}: {count}")
