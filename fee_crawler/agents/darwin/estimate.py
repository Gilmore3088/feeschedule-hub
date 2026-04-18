"""Cost estimator. Pure function — no I/O, no state."""
from typing import Optional

from fee_crawler.agents.darwin.config import DarwinConfig


def estimate_batch_cost_usd(
    *,
    size: int,
    cache_hit_rate: Optional[float],
    avg_cost_per_miss_usd: Optional[float],
    config: DarwinConfig,
) -> float:
    """Estimate batch cost given size and historical stats.

    Args:
        size: number of candidate rows.
        cache_hit_rate: fraction of rows expected to hit classification_cache
          (None = no history yet).
        avg_cost_per_miss_usd: observed dollar cost per LLM miss from prior
          runs (None = no history yet).

    Returns:
        Estimated dollars for the batch.
    """
    if cache_hit_rate is None or avg_cost_per_miss_usd is None:
        return size * config.bootstrap_cost_per_row_usd
    misses = size * (1.0 - cache_hit_rate)
    return misses * avg_cost_per_miss_usd
