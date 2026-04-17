"""Plan 62B-09 (OBS-05): agent_health_rollup helpers tests.

Covers the Python side of OBS-05 D-15:
  - 5 metric names constant is exact (loop_completion_rate, review_latency_seconds,
    pattern_promotion_rate, confidence_drift, cost_to_value_ratio)
  - get_agent_health_sparkline validates the metric name against the whitelist
  - get_agent_health_sparkline returns [] for unknown/empty agents
  - trigger_rollup_refresh invokes refresh_agent_health_rollup() and returns a count
  - list_agent_health_tiles returns {agent: {metric: latest_value}} for the 5 metrics
  - refresh is idempotent (ON CONFLICT DO UPDATE path exercised)

DB-backed tests use the per-test db_schema fixture (schema-scoped pool). They rebind
the module-level pool singleton to the test pool via _bind_pool(pool) — same pattern
used by test_reasoning_trace.py / test_tools_agent_infra.py. Tests skip cleanly when
DATABASE_URL_TEST is unset.
"""

from __future__ import annotations

import pytest

from fee_crawler.agent_base.health_rollup import (
    HEALTH_METRICS,
    get_agent_health_sparkline,
    list_agent_health_tiles,
    trigger_rollup_refresh,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _bind_pool(pool):
    """Redirect the module-level agent_tools pool singleton to the per-test pool.

    Matches the pattern used by test_reasoning_trace.py — lets async helpers that
    call get_pool() hit the schema-scoped pool instead of the production singleton.
    """
    from fee_crawler.agent_tools import pool as pool_mod

    original = pool_mod._pool
    pool_mod._pool = pool

    def restore() -> None:
        pool_mod._pool = original

    return restore


# ---------------------------------------------------------------------------
# Pure-Python contract tests (no DB required)
# ---------------------------------------------------------------------------


def test_five_metrics_constant():
    """HEALTH_METRICS is exactly the 5 OBS-05 names, no more, no fewer."""
    assert len(HEALTH_METRICS) == 5
    assert set(HEALTH_METRICS) == {
        "loop_completion_rate",
        "review_latency_seconds",
        "pattern_promotion_rate",
        "confidence_drift",
        "cost_to_value_ratio",
    }


# ---------------------------------------------------------------------------
# DB-backed integration tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unknown_metric_raises(db_schema):
    """Passing a non-whitelisted metric name raises ValueError — the f-string
    interpolation threat mitigation (T-62B-09-01) rejects inputs before the DB
    call is made."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        with pytest.raises(ValueError, match="unknown metric"):
            await get_agent_health_sparkline("knox", "bogus; DROP TABLE x;--")
    finally:
        restore()


@pytest.mark.asyncio
async def test_empty_agent_sparkline_is_empty_list(db_schema):
    """Empty agent (no rollup rows) returns [] — graceful degradation, not NULL
    or exception. Required because /admin/agents renders sparklines for every
    registered agent, including brand-new ones."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        result = await get_agent_health_sparkline(
            "nonexistent_agent_xyz", "loop_completion_rate"
        )
        assert result == []
    finally:
        restore()


@pytest.mark.asyncio
async def test_refresh_and_read_sparkline(db_schema):
    """Seed agent_events rows, call trigger_rollup_refresh, then read the
    sparkline back — exercises the full write+read path end to end."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        async with pool.acquire() as conn:
            # Seed a handful of Knox events over the last hour so the rollup has
            # data to aggregate.
            for i in range(5):
                await conn.execute(
                    """INSERT INTO agent_events
                         (agent_name, action, tool_name, entity, status,
                          cost_cents, confidence, created_at)
                       VALUES ('knox', 'extract', 'extract_fees', 'fees_raw',
                               'success', 10, 0.9,
                               NOW() - make_interval(mins => $1))""",
                    i * 10,
                )
        count = await trigger_rollup_refresh(since_hours=2)
        assert count >= 1

        sparkline = await get_agent_health_sparkline(
            "knox", "loop_completion_rate"
        )
        # We get at least one bucket back; values are floats (or 0.0 when NULL).
        assert isinstance(sparkline, list)
        assert len(sparkline) >= 1
        for v in sparkline:
            assert isinstance(v, float)
    finally:
        restore()


@pytest.mark.asyncio
async def test_all_five_metrics_supported(db_schema):
    """Every metric name in HEALTH_METRICS is accepted by get_agent_health_sparkline
    — guards against a metric being added to the constant but not wired into the
    SQL query."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, status,
                      cost_cents, confidence)
                   VALUES ('darwin', 'verify', 'promote_to_tier2',
                           'fees_verified', 'success', 5, 0.85)"""
            )
        await trigger_rollup_refresh(since_hours=1)

        for metric in HEALTH_METRICS:
            result = await get_agent_health_sparkline("darwin", metric)
            assert isinstance(result, list), (
                f"metric {metric!r} returned {type(result).__name__}, not list"
            )
    finally:
        restore()


@pytest.mark.asyncio
async def test_list_tiles_returns_five_metric_keys(db_schema):
    """list_agent_health_tiles returns {agent: {metric: value, bucket_start: iso}}
    with all 5 metric keys present per agent."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, status,
                      cost_cents, confidence)
                   VALUES ('darwin', 'verify', 'promote_to_tier2',
                           'fees_verified', 'success', 5, 0.85)"""
            )
        await trigger_rollup_refresh(since_hours=1)

        tiles = await list_agent_health_tiles(agent_names=["darwin"])
        assert "darwin" in tiles
        metric_keys = set(tiles["darwin"].keys()) - {"bucket_start"}
        assert metric_keys >= set(HEALTH_METRICS), (
            f"missing metrics: {set(HEALTH_METRICS) - metric_keys}"
        )
    finally:
        restore()


@pytest.mark.asyncio
async def test_refresh_idempotent(db_schema):
    """Calling refresh twice does not raise — exercises ON CONFLICT DO UPDATE.
    The second call re-upserts the same bucket rows."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, status)
                   VALUES ('knox', 'step', 'tool_x', 'entity_x', 'success')"""
            )
        c1 = await trigger_rollup_refresh(since_hours=1)
        c2 = await trigger_rollup_refresh(since_hours=1)
        # Both calls complete without error; second hits the ON CONFLICT branch.
        assert c1 >= 0
        assert c2 >= 0
    finally:
        restore()
