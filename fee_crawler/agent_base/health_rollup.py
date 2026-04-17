"""Health-metric rollup helpers (Phase 62b OBS-05, decision D-15).

Server-side query helpers consumed by the `/admin/agents` Overview tab
(Plan 62B-10). The underlying table `agent_health_rollup` and the
`refresh_agent_health_rollup()` SQL function are defined in
`supabase/migrations/20260509_agent_health_rollup.sql`.

Five metrics are tracked per agent on 15-minute buckets. A 7-day sparkline
is the default read window: 7 days x 24 h x 4 buckets/hour = 672 buckets.

Threat model (plan 62B-09 T-62B-09-01):
    The `metric` parameter is interpolated into a literal SQL string
    (the column-name position is not parameterizable in SQL). The helper
    validates the input against the HEALTH_METRICS whitelist BEFORE any
    interpolation occurs. Unknown names raise ValueError; the whitelist
    only contains identifier-safe tokens, so no injection surface remains.
"""

from __future__ import annotations

from typing import Optional

from fee_crawler.agent_tools.pool import get_pool

# The canonical 5 OBS-05 metric names. Order is not load-bearing; set-equality
# is the contract (see test_five_metrics_constant).
HEALTH_METRICS: tuple[str, ...] = (
    "loop_completion_rate",
    "review_latency_seconds",
    "pattern_promotion_rate",
    "confidence_drift",
    "cost_to_value_ratio",
)

# 7 days x 24 hours x 4 buckets-per-hour.
DEFAULT_BUCKET_COUNT = 672


async def trigger_rollup_refresh(since_hours: Optional[int] = 1) -> int:
    """Invoke `refresh_agent_health_rollup(NOW() - INTERVAL '$since_hours hours')`.

    Returns the number of bucket rows upserted (from the function's
    `GET DIAGNOSTICS ROW_COUNT`). Callers should treat the return value as
    informational only — ON CONFLICT DO UPDATE re-upserts existing rows, so
    a positive return does not mean "new" rows.

    Args:
        since_hours: Look-back window in hours. Defaults to 1 (the migration's
            default behavior). Pass 24 on deploy to seed the last day; pass
            larger windows for backfills.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchval(
            "SELECT refresh_agent_health_rollup(NOW() - make_interval(hours => $1))",
            since_hours,
        )
    return int(result) if result is not None else 0


async def get_agent_health_sparkline(
    agent_name: str,
    metric: str,
    *,
    bucket_count: int = DEFAULT_BUCKET_COUNT,
) -> list[float]:
    """Return an oldest-first list of metric values for a single agent.

    Time flows left-to-right in the /admin/agents sparkline component, so
    the list is ordered ascending by `bucket_start`. Empty agents or missing
    metrics return `[]` (not None, not an exception) so the UI renders a
    flat baseline rather than crashing.

    Args:
        agent_name: Agent identifier from `agent_registry.agent_name`.
        metric: One of `HEALTH_METRICS`. ValueError is raised otherwise.
        bucket_count: Maximum number of buckets to return (default 672 = 7 days).

    Returns:
        List of floats, oldest-first, length 0..bucket_count. NULLs in the
        underlying numeric column are coerced to 0.0 so the consumer sees a
        dense time-series ready for rendering.

    Raises:
        ValueError: If `metric` is not a whitelisted name — the only
            entry-point where user input influences SQL identifiers.
    """
    if metric not in HEALTH_METRICS:
        raise ValueError(
            f"unknown metric {metric!r}; must be one of {HEALTH_METRICS}"
        )
    pool = await get_pool()
    # Safe interpolation: `metric` is validated against HEALTH_METRICS above;
    # `agent_name` and `bucket_count` are bound as parameters.
    query = f"""
        SELECT {metric} AS v, bucket_start
          FROM agent_health_rollup
         WHERE agent_name = $1
         ORDER BY bucket_start DESC
         LIMIT $2
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, agent_name, bucket_count)
    # Reverse to oldest-first so the sparkline renders left-to-right.
    return [float(r["v"]) if r["v"] is not None else 0.0 for r in reversed(rows)]


async def list_agent_health_tiles(
    agent_names: Optional[list[str]] = None,
) -> dict[str, dict]:
    """Return `{agent_name: {metric: latest_value, ..., bucket_start: iso}}`.

    One row per agent — the most recent bucket per agent via
    `SELECT DISTINCT ON (agent_name) ... ORDER BY agent_name, bucket_start DESC`.

    Args:
        agent_names: Optional list of agent names to filter. When None, returns
            every agent that has at least one rollup row.

    Returns:
        Dict keyed by agent_name. Each value is a dict with all 5 HEALTH_METRICS
        plus `bucket_start` (ISO-8601 string). NULL metric columns become None
        (UI renders em-dash); the bucket_start is always populated.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        if agent_names:
            rows = await conn.fetch(
                """
                SELECT DISTINCT ON (agent_name)
                       agent_name, bucket_start,
                       loop_completion_rate, review_latency_seconds,
                       pattern_promotion_rate, confidence_drift,
                       cost_to_value_ratio
                  FROM agent_health_rollup
                 WHERE agent_name = ANY($1::TEXT[])
                 ORDER BY agent_name, bucket_start DESC
                """,
                agent_names,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT DISTINCT ON (agent_name)
                       agent_name, bucket_start,
                       loop_completion_rate, review_latency_seconds,
                       pattern_promotion_rate, confidence_drift,
                       cost_to_value_ratio
                  FROM agent_health_rollup
                 ORDER BY agent_name, bucket_start DESC
                """
            )
    return {
        r["agent_name"]: {
            "loop_completion_rate": (
                float(r["loop_completion_rate"])
                if r["loop_completion_rate"] is not None
                else None
            ),
            "review_latency_seconds": (
                int(r["review_latency_seconds"])
                if r["review_latency_seconds"] is not None
                else None
            ),
            "pattern_promotion_rate": (
                float(r["pattern_promotion_rate"])
                if r["pattern_promotion_rate"] is not None
                else None
            ),
            "confidence_drift": (
                float(r["confidence_drift"])
                if r["confidence_drift"] is not None
                else None
            ),
            "cost_to_value_ratio": (
                float(r["cost_to_value_ratio"])
                if r["cost_to_value_ratio"] is not None
                else None
            ),
            "bucket_start": (
                r["bucket_start"].isoformat() if r["bucket_start"] else None
            ),
        }
        for r in rows
    }


__all__ = [
    "HEALTH_METRICS",
    "DEFAULT_BUCKET_COUNT",
    "trigger_rollup_refresh",
    "get_agent_health_sparkline",
    "list_agent_health_tiles",
]
