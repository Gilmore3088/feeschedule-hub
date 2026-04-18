"""Knox tunables — single source of truth for review rules."""

from dataclasses import dataclass


@dataclass(frozen=True)
class KnoxConfig:
    """Knox v1 review rules configuration."""

    batch_size: int = 100

    # Rule 1: reject if amount > N × peer_median
    reject_threshold_multiplier: float = 5.0

    # Rule 1 safety: skip excess check if fewer than N peers exist (median is noisy)
    min_peers_for_excess_check: int = 5

    # Rule 2: free-fee keywords for zero-amount validation (case-insensitive)
    free_fee_keywords: tuple[str, ...] = (
        "free",
        "waived",
        "no charge",
        "no fee",
        "complimentary",
        "included",
    )


DEFAULT = KnoxConfig()
