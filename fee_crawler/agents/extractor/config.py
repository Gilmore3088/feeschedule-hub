"""Extractor agent tunables."""
from dataclasses import dataclass


@dataclass(frozen=True)
class ExtractorConfig:
    # Recrawl cadence — skip targets whose last successful extraction is newer.
    recrawl_after_days: int = 30

    # Per-target soft budget so a single oversized PDF can't burn the batch.
    per_target_soft_cap_usd: float = 0.50

    # Per-batch soft cap before the agent halts early.
    per_batch_soft_cap_usd: float = 10.00

    # Sleep between targets so we don't hammer any single domain.
    inter_target_delay_seconds: float = 0.5

    # Document-type filter passed by the cron entry point.
    # None = both pdf and html. "pdf" / "html" = restricted.
    document_type: str | None = None

    # If True, retry previously-failed targets (consecutive_failures > 0).
    include_failing: bool = False

    # Circuit breaker (duck-types fee_crawler.agents._common.circuit._HasCircuitConfig).
    # Matches Magellan's defaults so behaviour is symmetric across agents.
    consecutive_failures_to_halt: int = 5
    error_rate_window: int = 20
    error_rate_threshold: float = 0.50
    consecutive_rate_limits_to_halt: int = 3


DEFAULT = ExtractorConfig()
