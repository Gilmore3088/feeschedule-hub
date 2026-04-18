"""Magellan tunables."""
from dataclasses import dataclass


@dataclass(frozen=True)
class MagellanConfig:
    # Retry window for retry_after state
    retry_after_days: int = 30

    # Circuit breaker (duck-types _HasCircuitConfig in agents._common)
    consecutive_failures_to_halt: int = 5
    error_rate_window: int = 50
    error_rate_threshold: float = 0.30
    consecutive_rate_limits_to_halt: int = 3

    # Per-batch soft cap (USD) for rungs that cost money
    per_batch_soft_cap_usd: float = 5.00

    inter_target_delay_seconds: float = 0.1


DEFAULT = MagellanConfig()
