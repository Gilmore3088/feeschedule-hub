"""Knox review rules — pure functions for accept/reject decisions.

Rule 1: REJECT if amount > N × peer_median (default 5×)
  - peer = same canonical_fee_key + same asset_size_tier, excluding row under review
  - Skipped if fewer than min_peers_for_excess_check peers exist (median too noisy)

Rule 2: REJECT if amount = 0 AND fee_name does NOT contain free-fee wording
  - Keywords: "free", "waived", "no charge", "no fee", "complimentary", "included"
  - Case-insensitive substring search

Otherwise: ACCEPT.
"""

from typing import Optional


def check_excessive_amount(
    amount: float,
    peer_median: Optional[float],
    peer_count: int,
    threshold_multiplier: float = 5.0,
    min_peers: int = 5,
) -> tuple[str, str]:
    """Rule 1: reject if amount > threshold_multiplier × peer_median."""
    if peer_count < min_peers:
        return (
            "accept",
            f"peer_count={peer_count} below min {min_peers}; skipping excess check",
        )
    if peer_median is None or peer_median <= 0:
        return ("accept", "no valid peer median for comparison")

    threshold = threshold_multiplier * peer_median
    if amount > threshold:
        return (
            "reject",
            f"amount={amount:.2f} exceeds {threshold_multiplier}x peer_median={peer_median:.2f} (n={peer_count})",
        )
    return (
        "accept",
        f"amount={amount:.2f} within {threshold_multiplier}x peer_median={peer_median:.2f} (n={peer_count})",
    )


def check_zero_without_waiver(
    amount: float,
    fee_name: str,
    free_keywords: tuple[str, ...] = (
        "free",
        "waived",
        "no charge",
        "no fee",
        "complimentary",
        "included",
    ),
) -> tuple[str, str]:
    """Rule 2: reject if amount = 0 AND fee_name lacks free-fee wording."""
    if amount != 0:
        return ("accept", f"amount={amount:.2f} (non-zero, skips zero-waiver check)")

    fee_lower = fee_name.lower()
    found_keywords = [k for k in free_keywords if k.lower() in fee_lower]

    if found_keywords:
        return (
            "accept",
            f"amount=0 with waiver wording: {', '.join(found_keywords)}",
        )
    return (
        "reject",
        f"amount=0 but fee_name has no free-fee wording (searched: {free_keywords})",
    )


def apply_rules(
    amount: float,
    fee_name: str,
    peer_median: Optional[float],
    peer_count: int,
    config_threshold: float = 5.0,
    min_peers: int = 5,
    config_keywords: tuple[str, ...] = (
        "free",
        "waived",
        "no charge",
        "no fee",
        "complimentary",
        "included",
    ),
) -> tuple[str, list[str]]:
    """Apply all Knox v1 rules; return overall decision + reason list.

    Short-circuits on the first reject.
    """
    reasons: list[str] = []

    rule1_decision, rule1_reason = check_excessive_amount(
        amount, peer_median, peer_count, config_threshold, min_peers
    )
    reasons.append(rule1_reason)
    if rule1_decision == "reject":
        return ("reject", reasons)

    rule2_decision, rule2_reason = check_zero_without_waiver(
        amount, fee_name, config_keywords
    )
    reasons.append(rule2_reason)
    if rule2_decision == "reject":
        return ("reject", reasons)

    return ("accept", reasons)
