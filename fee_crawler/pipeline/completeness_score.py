"""Extraction completeness scoring.

Measures how complete a fee extraction is by checking which core
categories are present and comparing fee count to expected range
for the institution's asset tier.

Problem 4 from accuracy audit: 3 fees from JPMorgan and 3 from
a $50M community bank look identical in the DB. This score
distinguishes them.
"""

from __future__ import annotations

# Core categories that virtually every fee schedule should have
CORE_CATEGORIES = {
    "overdraft",
    "nsf",
    "monthly_maintenance",
    "wire_domestic_outgoing",
    "atm_non_network",
    "stop_payment",
}

# Extended categories commonly found in fee schedules
EXTENDED_CATEGORIES = {
    "wire_domestic_incoming",
    "wire_intl_outgoing",
    "cashiers_check",
    "money_order",
    "card_replacement",
    "card_foreign_txn",
    "dormant_account",
    "paper_statement",
    "check_printing",
    "ach_origination",
    "coin_counting",
    "safe_deposit_box",
}

# Expected fee count ranges by asset tier
EXPECTED_RANGES: dict[str, tuple[int, int]] = {
    "community_small": (5, 20),      # < $100M assets
    "community_mid": (8, 25),        # $100M - $500M
    "community_large": (10, 30),     # $500M - $1B
    "regional": (12, 35),            # $1B - $10B
    "large_regional": (15, 40),      # $10B - $50B
    "super_regional": (18, 50),      # > $50B
}
DEFAULT_RANGE = (5, 25)


def compute_completeness(
    fee_categories: list[str],
    asset_tier: str | None = None,
) -> dict:
    """Compute extraction completeness for an institution.

    Args:
        fee_categories: List of fee_category values extracted for this institution
        asset_tier: Institution's asset size tier (for expected range)

    Returns:
        {
            "score": float (0.0 - 1.0),
            "label": str (complete | partial | likely_incomplete | not_extracted),
            "core_present": int,
            "core_total": int,
            "extended_present": int,
            "fee_count": int,
            "expected_min": int,
            "expected_max": int,
        }
    """
    if not fee_categories:
        return {
            "score": 0.0,
            "label": "not_extracted",
            "core_present": 0,
            "core_total": len(CORE_CATEGORIES),
            "extended_present": 0,
            "fee_count": 0,
            "expected_min": 0,
            "expected_max": 0,
        }

    cat_set = set(fee_categories)
    fee_count = len(fee_categories)

    # Core category coverage (0-1)
    core_present = len(cat_set & CORE_CATEGORIES)
    core_score = core_present / len(CORE_CATEGORIES)

    # Extended category coverage (bonus, 0-1)
    extended_present = len(cat_set & EXTENDED_CATEGORIES)
    extended_score = extended_present / len(EXTENDED_CATEGORIES)

    # Fee count vs expected range
    expected_min, expected_max = EXPECTED_RANGES.get(asset_tier or "", DEFAULT_RANGE)
    if fee_count >= expected_min:
        count_score = min(1.0, fee_count / expected_max)
    else:
        count_score = fee_count / expected_min * 0.5  # below minimum gets at most 0.5

    # Weighted composite: 50% core, 25% count, 25% extended
    score = round(core_score * 0.50 + count_score * 0.25 + extended_score * 0.25, 3)

    # Label assignment
    if score >= 0.6 and core_present >= 4:
        label = "complete"
    elif core_present >= 3 or (score >= 0.3 and core_present >= 2):
        label = "partial"
    else:
        label = "likely_incomplete"

    return {
        "score": score,
        "label": label,
        "core_present": core_present,
        "core_total": len(CORE_CATEGORIES),
        "extended_present": extended_present,
        "fee_count": fee_count,
        "expected_min": expected_min,
        "expected_max": expected_max,
    }
