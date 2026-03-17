"""Validate extracted fees and assign review status.

Operates on categorized fees that haven't been validated yet (validation_flags IS NULL),
or re-validates all non-rejected fees when --force is used.

Uses the review status state machine to protect manual approvals from automated demotion.
"""

from fee_crawler.config import Config, load_config
from fee_crawler.db import Database
from fee_crawler.fee_analysis import normalize_fee_name
from fee_crawler.pipeline.extract_llm import ExtractedFee
from fee_crawler.review_status import can_transition, transition_fee_status, TransitionContext
from fee_crawler.validation import (
    determine_review_status,
    flags_to_json,
    validate_fee,
)


def run(db: Database, config: Config | None = None, *, force: bool = False) -> None:
    """Validate extracted fees with current rules.

    By default, only processes fees with fee_category IS NOT NULL AND validation_flags IS NULL.
    With --force, re-validates all non-rejected fees.
    """
    if config is None:
        config = load_config()

    if force:
        fees = db.fetchall(
            """SELECT id, crawl_target_id, fee_name, amount, frequency,
                      conditions, extraction_confidence, review_status,
                      validation_flags, fee_category
               FROM extracted_fees
               WHERE review_status != 'rejected'
               ORDER BY crawl_target_id, fee_name"""
        )
    else:
        fees = db.fetchall(
            """SELECT id, crawl_target_id, fee_name, amount, frequency,
                      conditions, extraction_confidence, review_status,
                      validation_flags, fee_category
               FROM extracted_fees
               WHERE fee_category IS NOT NULL AND validation_flags IS NULL
               ORDER BY crawl_target_id, fee_name"""
        )

    if not fees:
        print("No extracted fees to validate.")
        return

    total = len(fees)
    updated = 0
    skipped = 0
    protected = 0
    stats: dict[str, int] = {}

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

        fee_category = row["fee_category"]
        flags = validate_fee(fee, seen_canonical, config, fee_category)
        new_status = determine_review_status(
            flags, fee.confidence, config, fee_category, fee.amount,
        )
        flags_json = flags_to_json(flags)

        seen_canonical.append(normalize_fee_name(fee.fee_name))

        old_status = row["review_status"]

        # Always update validation_flags (these are objective results)
        db.execute(
            "UPDATE extracted_fees SET validation_flags = ? WHERE id = ?",
            (flags_json, row["id"]),
        )

        # Only change status if the transition is valid per the state machine
        if old_status != new_status:
            if can_transition(old_status, new_status, actor="system", context=TransitionContext.REVIEW):
                transition_fee_status(
                    db, row["id"], old_status, new_status,
                    actor="system", context=TransitionContext.REVIEW,
                    notes=f"Validation: {len(flags)} flags, confidence={fee.confidence:.0%}",
                )
                updated += 1
            else:
                protected += 1
        else:
            skipped += 1

        stats[new_status] = stats.get(new_status, 0) + 1

    db.commit()

    print(f"Validated {total} fees:")
    print(f"  Status changed: {updated}")
    print(f"  Protected (manual approval): {protected}")
    print(f"  Unchanged: {skipped}")
    for status, count in sorted(stats.items()):
        if count > 0:
            print(f"  -> {status}: {count}")
