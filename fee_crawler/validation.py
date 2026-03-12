"""Post-extraction validation rules for fee data quality.

Runs after LLM extraction, before INSERT. Produces validation flags
and determines initial review_status (staged/flagged/pending/approved).
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from fee_crawler.config import Config
from fee_crawler.fee_amount_rules import (
    FALLBACK_RULES,
    FEE_AMOUNT_RULES,
    NON_FEE_SUBSTRINGS,
)
from fee_crawler.fee_analysis import normalize_fee_name
from fee_crawler.pipeline.extract_llm import ExtractedFee

VALID_FREQUENCIES = {"per_occurrence", "monthly", "annual", "one_time", "daily", "other"}

CAP_CATEGORIES = {"od_daily_cap", "nsf_daily_cap"}

# Fee names that imply $0 / free / waived are normal
FREE_FEE_KEYWORDS = {"free", "no charge", "no fee", "waived", "included", "$0"}

AUTO_APPROVE_CONFIDENCE = 0.90


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


def _check_amount_range(
    fee: ExtractedFee, fee_category: str | None = None,
) -> list[ValidationFlag]:
    """Flag amounts outside expected ranges using category-specific bounds."""
    flags = []
    if fee.amount is None:
        return flags

    if fee_category and fee_category in FEE_AMOUNT_RULES:
        min_amt, max_amt, hard_ceiling, _ = FEE_AMOUNT_RULES[fee_category]
    else:
        min_amt, max_amt, hard_ceiling, _ = FALLBACK_RULES

    if fee.amount < 0:
        flags.append(ValidationFlag(
            rule="amount_out_of_range",
            severity="warning",
            message=f"Amount ${fee.amount:.2f} is negative",
        ))
    elif fee.amount > hard_ceiling:
        flags.append(ValidationFlag(
            rule="amount_out_of_range",
            severity="error",
            message=f"Amount ${fee.amount:.2f} exceeds hard ceiling (${hard_ceiling:.0f}) for {fee_category or 'uncategorized'}",
        ))
    elif fee.amount > max_amt:
        flags.append(ValidationFlag(
            rule="amount_out_of_range",
            severity="warning",
            message=f"Amount ${fee.amount:.2f} exceeds typical max (${max_amt:.0f}) for {fee_category or 'uncategorized'}",
        ))
    elif fee.amount < min_amt and fee.amount > 0:
        flags.append(ValidationFlag(
            rule="amount_out_of_range",
            severity="info",
            message=f"Amount ${fee.amount:.2f} below typical min (${min_amt:.0f}) for {fee_category or 'uncategorized'}",
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
            severity="info",
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


def _check_cap_frequency(
    fee: ExtractedFee, fee_category: str | None
) -> list[ValidationFlag]:
    """Flag cap fees that have a non-daily frequency."""
    if fee_category not in CAP_CATEGORIES:
        return []
    if fee.frequency == "daily":
        return []
    return [ValidationFlag(
        rule="cap_frequency_mismatch",
        severity="info",
        message=f"Daily fee cap has frequency '{fee.frequency}' (expected 'daily'); will be auto-corrected",
    )]


def _check_non_fee_data(fee: ExtractedFee) -> list[ValidationFlag]:
    """Flag entries that look like misextracted non-fee data."""
    name_lower = fee.fee_name.lower()
    for substring in NON_FEE_SUBSTRINGS:
        if substring in name_lower:
            return [ValidationFlag(
                rule="non_fee_data",
                severity="error",
                message=f"Fee name contains '{substring}' — likely not a fee",
            )]
    return []


def validate_fee(
    fee: ExtractedFee,
    existing_canonical: list[str],
    config: Config,
    fee_category: str | None = None,
) -> list[ValidationFlag]:
    """Run all validation rules on a single fee."""
    threshold = config.extraction.confidence_auto_stage_threshold
    flags: list[ValidationFlag] = []
    flags.extend(_check_required_fields(fee))
    flags.extend(_check_non_fee_data(fee))
    flags.extend(_check_amount_range(fee, fee_category))
    flags.extend(_check_null_amount(fee))
    flags.extend(_check_low_confidence(fee, threshold))
    flags.extend(_check_duplicate(fee, existing_canonical))
    flags.extend(_check_frequency(fee))
    flags.extend(_check_cap_frequency(fee, fee_category))
    return flags


def _amount_in_range(amount: float | None, fee_category: str) -> bool:
    """Check if amount falls within the auto-approve range for a category."""
    rules = FEE_AMOUNT_RULES.get(fee_category, FALLBACK_RULES)
    min_amt, max_amt, _, allows_zero = rules

    if amount is None:
        return allows_zero
    if amount == 0:
        return allows_zero
    return min_amt <= amount <= max_amt


def determine_review_status(
    flags: list[ValidationFlag],
    confidence: float,
    config: Config,
    fee_category: str | None = None,
    amount: float | None = None,
) -> str:
    """Determine initial review_status based on validation results.

    Returns:
        'approved' if auto-approve criteria met (high confidence, in range, no warnings)
        'flagged' if any error or warning flags exist
        'staged' if confidence >= threshold AND no error/warning flags
        'pending' otherwise
    """
    threshold = config.extraction.confidence_auto_stage_threshold
    has_blocking = any(f.severity in ("error", "warning") for f in flags)

    if has_blocking:
        return "flagged"

    # Auto-approve: high confidence + categorized + amount in range
    if (
        fee_category
        and confidence >= AUTO_APPROVE_CONFIDENCE
        and _amount_in_range(amount, fee_category)
    ):
        return "approved"

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
    fee_categories: list[str | None] | None = None,
) -> list[tuple[ExtractedFee, list[ValidationFlag], str]]:
    """Validate a batch of fees for one institution.

    Returns list of (fee, flags, review_status) tuples.
    If fee_categories is provided (one per fee), auto-approve can fire
    for high-confidence, in-range, categorized fees.
    """
    results = []
    seen_canonical: list[str] = []

    for i, fee in enumerate(fees):
        cat = fee_categories[i] if fee_categories else None
        flags = validate_fee(fee, seen_canonical, config, fee_category=cat)
        status = determine_review_status(
            flags, fee.confidence, config,
            fee_category=cat, amount=fee.amount,
        )
        results.append((fee, flags, status))

        # Track canonical names for duplicate detection
        canonical = normalize_fee_name(fee.fee_name)
        seen_canonical.append(canonical)

    return results
