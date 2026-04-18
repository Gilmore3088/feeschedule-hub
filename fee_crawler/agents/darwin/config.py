"""Darwin tunables — single source of truth for thresholds and policy."""
from dataclasses import dataclass


@dataclass(frozen=True)
class DarwinConfig:
    # Classification policy
    auto_promote_threshold: float = 0.90
    digest_sample_rate: float = 0.05   # q2_high_confidence: 5% of auto-promotes sampled to digest

    # LLM batching
    llm_batch_size: int = 50
    model: str = "claude-haiku-4-5-20251001"
    max_tokens: int = 2048

    # Retry policy
    max_retries: int = 3
    backoff_base_seconds: float = 1.0
    backoff_max_seconds: float = 30.0
    inter_batch_delay_seconds: float = 0.2

    # Circuit breaker
    consecutive_failures_to_halt: int = 5
    error_rate_window: int = 50
    error_rate_threshold: float = 0.20
    consecutive_rate_limits_to_halt: int = 3

    # Cost estimate defaults (dollars per row, used before any history exists)
    bootstrap_cost_per_row_usd: float = 0.002


DEFAULT = DarwinConfig()
