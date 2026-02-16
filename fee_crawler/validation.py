"""Post-extraction validation rules for fee data quality.

Runs after LLM extraction, before INSERT. Produces validation flags
and determines initial review_status (staged/flagged/pending).
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from fee_crawler.config import Config
from fee_crawler.fee_analysis import normalize_fee_name
from fee_crawler.pipeline.extract_llm import ExtractedFee

VALID_FREQUENCIES = {"per_occurrence", "monthly", "annual", "one_time", "other"}

# Fee names that imply $0 / free / waived are normal
FREE_FEE_KEYWORDS = {"free", "no charge", "no fee", "waived", "included", "$0"}

# Typical amount ranges (in dollars)
TYPICAL_FEE_MAX = 500.0
TYPICAL_FEE_MIN = 0.0


@dataclass(frozen=True)
class ValidationFlag:
    """A single validation issue found on an extracted fee."""

    rule: str
    severity: str  # error | warning | info
    message: str


def _check_required_fields(fee: ExtractedFee) -> list[ValidationFlag]:
    """Flag if fee_name is empty."""
    flags = []
    if not fee.fee_name or not fee.fee_name.strip():
        flags.append(ValidationFlag(
            rule="missing_fee_name",
            severity="error",
            message="Fee name is empty or whitespace",
        ))
    return flags


def _check_amount_range(fee: ExtractedFee) -> list[ValidationFlag]:
    """Flag amounts outside expected ranges."""
    flags = []
    if fee.amount is None:
        return flags

    if fee.amount < TYPICAL_FEE_MIN:
        flags.append(ValidationFlag(
            rule="amount_out_of_range",
            severity="warning",
            message=f"Amount ${fee.amount:.2f} is negative",
        ))
    elif fee.amount > TYPICAL_FEE_MAX:
        flags.append(ValidationFlag(
            rule="amount_out_of_range",
            severity="warning",
            message=f"Amount ${fee.amount:.2f} exceeds typical range ($0-$500)",
        ))

    return flags


def _check_null_amount(fee: ExtractedFee) -> list[ValidationFlag]:
    """Flag null amounts that don't seem intentionally free."""
    if fee.amount is not None:
        return []

    name_lower = fee.fee_name.lower()
    conditions_lower = (fee.conditions or "").lower()
    combined = name_lower + " " + conditions_lower

    # If any "free" keyword appears, null amount is expected
    for keyword in FREE_FEE_KEYWORDS:
        if keyword in combined:
            return []

    return [ValidationFlag(
        rule="amount_null_suspicious",
        severity="info",
        message=f"Amount is null but fee name doesn't suggest free/waived",
    )]


def _check_low_confidence(
    fee: ExtractedFee, threshold: float
) -> list[ValidationFlag]:
    """Flag if extraction confidence is below threshold."""
    if fee.confidence < threshold:
        return [ValidationFlag(
            rule="low_confidence",
            severity="warning",
            message=f"Confidence {fee.confidence:.0%} is below {threshold:.0%} threshold",
        )]
    return []


def _check_duplicate(
    fee: ExtractedFee, existing_canonical: list[str]
) -> list[ValidationFlag]:
    """Flag if a near-duplicate fee name already exists for same institution."""
    canonical = normalize_fee_name(fee.fee_name)
    if canonical in existing_canonical:
        return [ValidationFlag(
            rule="duplicate_fee_name",
            severity="warning",
            message=f"Duplicate canonical name '{canonical}' already seen for this institution",
        )]
    return []


def _check_frequency(fee: ExtractedFee) -> list[ValidationFlag]:
    """Flag if frequency is not one of the known values."""
    if fee.frequency is None:
        return []
    if fee.frequency not in VALID_FREQUENCIES:
        return [ValidationFlag(
            rule="invalid_frequency",
            severity="warning",
            message=f"Frequency '{fee.frequency}' is not a recognized value",
        )]
    return []


def validate_fee(
    fee: ExtractedFee,
    existing_canonical: list[str],
    config: Config,
) -> list[ValidationFlag]:
    """Run all validation rules on a single fee."""
    threshold = config.extraction.confidence_auto_stage_threshold
    flags: list[ValidationFlag] = []
    flags.extend(_check_required_fields(fee))
    flags.extend(_check_amount_range(fee))
    flags.extend(_check_null_amount(fee))
    flags.extend(_check_low_confidence(fee, threshold))
    flags.extend(_check_duplicate(fee, existing_canonical))
    flags.extend(_check_frequency(fee))
    return flags


def determine_review_status(
    flags: list[ValidationFlag],
    confidence: float,
    config: Config,
) -> str:
    """Determine initial review_status based on validation results.

    Returns:
        'staged' if confidence >= threshold AND no error/warning flags
        'flagged' if any error or warning flags exist
        'pending' otherwise
    """
    threshold = config.extraction.confidence_auto_stage_threshold
    has_errors = any(f.severity in ("error", "warning") for f in flags)

    if has_errors:
        return "flagged"
    if confidence >= threshold:
        return "staged"
    return "pending"


def flags_to_json(flags: list[ValidationFlag]) -> str | None:
    """Serialize validation flags to JSON for storage."""
    if not flags:
        return None
    return json.dumps([
        {"rule": f.rule, "severity": f.severity, "message": f.message}
        for f in flags
    ])


def validate_and_classify_fees(
    fees: list[ExtractedFee],
    config: Config,
) -> list[tuple[ExtractedFee, list[ValidationFlag], str]]:
    """Validate a batch of fees for one institution.

    Returns list of (fee, flags, review_status) tuples.
    """
    results = []
    seen_canonical: list[str] = []

    for fee in fees:
        flags = validate_fee(fee, seen_canonical, config)
        status = determine_review_status(flags, fee.confidence, config)
        results.append((fee, flags, status))

        # Track canonical names for duplicate detection
        canonical = normalize_fee_name(fee.fee_name)
        seen_canonical.append(canonical)

    return results
