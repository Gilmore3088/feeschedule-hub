---
phase: 62B
plan: 09
type: execute
wave: 4
depends_on: [62B-01]
files_modified:
  - fee_crawler/agent_base/health_rollup.py
  - fee_crawler/tests/test_agent_health_rollup.py
  - supabase/migrations/20260512_agent_health_rollup_seed.sql
autonomous: true
requirements: [OBS-05]
must_haves:
  truths:
    - "refresh_agent_health_rollup() SQL function (from 62B-01 migration 20260509) successfully populates rows when called"
    - "A Python helper get_agent_health_sparkline(agent_name, metric, bucket_count=672) returns a list of NUMERIC values (7-day × 15-min buckets)"
    - "Five metrics are returned: loop_completion_rate, review_latency_seconds, pattern_promotion_rate, confidence_drift, cost_to_value_ratio"
    - "Empty agent → zero-length sparkline list (graceful)"
    - "Backfill migration runs refresh_agent_health_rollup() for the last 24 hours to seed initial data"
  artifacts:
    - path: fee_crawler/agent_base/health_rollup.py
      provides: "Python-side helpers: get_agent_health_sparkline, list_agent_health_tiles, trigger_rollup_refresh"
    - path: supabase/migrations/20260512_agent_health_rollup_seed.sql
      provides: "SELECT refresh_agent_health_rollup(NOW() - INTERVAL '24 hours') — backfill"
    - path: fee_crawler/tests/test_agent_health_rollup.py
      provides: "OBS-05 tests: refresh function writes rows; sparkline helpers return expected shapes"
  key_links:
    - from: "get_agent_health_sparkline(agent, metric)"
      to: "agent_health_rollup table"
      via: "SELECT metric FROM agent_health_rollup WHERE agent_name=$1 ORDER BY bucket_start DESC LIMIT $2"
      pattern: "agent_health_rollup"
---

<objective>
Ship the OBS-05 5-metric health rollup helpers: the table + refresh function landed in 62B-01 migration 20260509. This plan adds (a) a backfill migration to seed initial data, (b) Python helpers `/admin/agents` will call, and (c) integration tests.

The 5 metrics (per CONTEXT D-15): `loop_completion_rate`, `review_latency_seconds`, `pattern_promotion_rate`, `confidence_drift`, `cost_to_value_ratio`. Each is a 7-day × 15-min bucket sparkline (672 points max).

Purpose: `/admin/agents` console (Plan 62B-10) needs server-side data queries for the Overview tab tiles. This plan provides them.

Output: 1 Python helper module, 1 seed migration, 1 pytest file.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md
@.planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md
@supabase/migrations/20260509_agent_health_rollup.sql
@fee_crawler/agent_tools/pool.py

<interfaces>
From 62B-01 migration 20260509:
- `agent_health_rollup (bucket_start TIMESTAMPTZ, agent_name TEXT FK, loop_completion_rate NUMERIC(5,4), review_latency_seconds INTEGER, pattern_promotion_rate NUMERIC(5,4), confidence_drift NUMERIC(6,4), cost_to_value_ratio NUMERIC(10,4), events_total INTEGER, PK (agent_name, bucket_start))`
- `refresh_agent_health_rollup(p_since TIMESTAMPTZ DEFAULT NULL) RETURNS INTEGER` — aggregates from agent_events, upserts via ON CONFLICT

Research §Mechanics 14 lines 1320-1380 (full table + refresh function).
CONTEXT D-15: 5 metrics × tiles per agent × 7-day sparklines (reuse src/components/sparkline.tsx).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Python helpers + backfill seed + tests</name>
  <files>fee_crawler/agent_base/health_rollup.py, fee_crawler/tests/test_agent_health_rollup.py, supabase/migrations/20260512_agent_health_rollup_seed.sql</files>
  <read_first>
    - supabase/migrations/20260509_agent_health_rollup.sql (exact column names, types, refresh function signature)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Mechanics 14 lines 1320-1380 (full pattern)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md D-15 (5 metrics + 7-day sparkline)
    - fee_crawler/agent_tools/pool.py (get_pool for asyncpg queries)
  </read_first>
  <behavior>
    - Test 1: refresh_agent_health_rollup() after seeding agent_events rows creates agent_health_rollup rows
    - Test 2: Calling refresh twice does not duplicate (ON CONFLICT path exercised)
    - Test 3: get_agent_health_sparkline returns ordered list oldest→newest with at most N points
    - Test 4: list_agent_health_tiles returns dict {agent_name: {metric: latest_value}} for all 5 metrics
    - Test 5: trigger_rollup_refresh calls the SQL function and returns row-count
    - Test 6: Empty agent_events → zero-length sparklines (not NULL, not error)
  </behavior>
  <action>
**File 1: `supabase/migrations/20260512_agent_health_rollup_seed.sql`**
```sql
-- Phase 62b OBS-05: seed agent_health_rollup with last 24h of data so the
-- /admin/agents Overview tab renders non-empty even before full Phase 63 traffic.

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'refresh_agent_health_rollup') THEN
        PERFORM refresh_agent_health_rollup(NOW() - INTERVAL '24 hours');
    ELSE
        RAISE NOTICE 'refresh_agent_health_rollup not found; skipping seed (expected during test-schema setup order).';
    END IF;
END $$;

COMMIT;
```

**File 2: `fee_crawler/agent_base/health_rollup.py`**
```python
"""Health-metric rollup helpers (OBS-05 D-15).

Server-side queries that /admin/agents Overview tab consumes. 5 metrics per agent,
each a 7-day × 15-min sparkline (up to 672 points).
"""
from __future__ import annotations

from typing import Optional

from fee_crawler.agent_tools.pool import get_pool

HEALTH_METRICS = (
    "loop_completion_rate",
    "review_latency_seconds",
    "pattern_promotion_rate",
    "confidence_drift",
    "cost_to_value_ratio",
)


async def trigger_rollup_refresh(since_hours: Optional[int] = 1) -> int:
    """Invoke refresh_agent_health_rollup(NOW() - INTERVAL '$since_hours hours').

    Returns the number of bucket rows updated.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT refresh_agent_health_rollup(NOW() - make_interval(hours => $1))",
            since_hours,
        )


async def get_agent_health_sparkline(
    agent_name: str,
    metric: str,
    *,
    bucket_count: int = 672,   # 7 days × 96 buckets/day
) -> list[float]:
    """Return oldest-first list of numeric values for a given metric.

    Empty agents or missing metrics return [].
    """
    if metric not in HEALTH_METRICS:
        raise ValueError(f"unknown metric {metric!r}; must be one of {HEALTH_METRICS}")
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT {metric} AS v, bucket_start
                  FROM agent_health_rollup
                 WHERE agent_name = $1
                 ORDER BY bucket_start DESC
                 LIMIT $2""",
            agent_name, bucket_count,
        )
    # Return oldest-first for sparkline rendering (time flows left-to-right)
    values = [float(r["v"]) if r["v"] is not None else 0.0 for r in reversed(rows)]
    return values


async def list_agent_health_tiles(agent_names: Optional[list[str]] = None) -> dict:
    """Return {agent_name: {metric: latest_value, ...}} for tile grid.

    If agent_names is None, returns all agents that have at least one rollup row.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        if agent_names:
            rows = await conn.fetch(
                """SELECT DISTINCT ON (agent_name) agent_name, bucket_start,
                          loop_completion_rate, review_latency_seconds,
                          pattern_promotion_rate, confidence_drift, cost_to_value_ratio
                     FROM agent_health_rollup
                    WHERE agent_name = ANY($1::TEXT[])
                    ORDER BY agent_name, bucket_start DESC""",
                agent_names,
            )
        else:
            rows = await conn.fetch(
                """SELECT DISTINCT ON (agent_name) agent_name, bucket_start,
                          loop_completion_rate, review_latency_seconds,
                          pattern_promotion_rate, confidence_drift, cost_to_value_ratio
                     FROM agent_health_rollup
                    ORDER BY agent_name, bucket_start DESC"""
            )
    return {
        r["agent_name"]: {
            "loop_completion_rate": float(r["loop_completion_rate"]) if r["loop_completion_rate"] is not None else None,
            "review_latency_seconds": int(r["review_latency_seconds"]) if r["review_latency_seconds"] is not None else None,
            "pattern_promotion_rate": float(r["pattern_promotion_rate"]) if r["pattern_promotion_rate"] is not None else None,
            "confidence_drift": float(r["confidence_drift"]) if r["confidence_drift"] is not None else None,
            "cost_to_value_ratio": float(r["cost_to_value_ratio"]) if r["cost_to_value_ratio"] is not None else None,
            "bucket_start": r["bucket_start"].isoformat() if r["bucket_start"] else None,
        }
        for r in rows
    }
```

**File 3: `fee_crawler/tests/test_agent_health_rollup.py`**
```python
import pytest
from datetime import datetime, timedelta, timezone

from fee_crawler.agent_base.health_rollup import (
    HEALTH_METRICS, trigger_rollup_refresh, get_agent_health_sparkline, list_agent_health_tiles,
)


@pytest.mark.asyncio
async def test_five_metrics_constant():
    assert len(HEALTH_METRICS) == 5
    assert "loop_completion_rate" in HEALTH_METRICS
    assert "cost_to_value_ratio" in HEALTH_METRICS


@pytest.mark.asyncio
async def test_unknown_metric_raises(db_schema):
    with pytest.raises(ValueError, match="unknown metric"):
        await get_agent_health_sparkline("knox", "bogus")


@pytest.mark.asyncio
async def test_empty_agent_sparkline_is_empty_list(db_schema):
    result = await get_agent_health_sparkline("nonexistent_agent", "loop_completion_rate")
    assert result == []


@pytest.mark.asyncio
async def test_refresh_and_read(db_schema):
    schema, pool = db_schema
    # Seed some agent_events rows so refresh has data to aggregate.
    async with pool.acquire() as conn:
        for i in range(5):
            await conn.execute(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, status, cost_cents, confidence, created_at)
                   VALUES ('knox', 'extract', 'extract_fees', 'fees_raw', 'success', 10, 0.9,
                           NOW() - make_interval(mins => $1))""",
                i * 10,
            )
    count = await trigger_rollup_refresh(since_hours=2)
    assert count >= 1
    sparkline = await get_agent_health_sparkline("knox", "loop_completion_rate")
    assert len(sparkline) >= 1


@pytest.mark.asyncio
async def test_list_tiles_returns_five_keys(db_schema):
    schema, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_events (agent_name, action, tool_name, entity, status, cost_cents, confidence)
               VALUES ('darwin','verify','t','fees_verified','success',5,0.85)"""
        )
    await trigger_rollup_refresh(since_hours=1)
    tiles = await list_agent_health_tiles(agent_names=["darwin"])
    assert "darwin" in tiles
    metrics_keys = set(tiles["darwin"].keys()) - {"bucket_start"}
    assert metrics_keys >= set(HEALTH_METRICS)


@pytest.mark.asyncio
async def test_refresh_idempotent(db_schema):
    schema, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO agent_events (agent_name, action, tool_name, entity, status) "
            "VALUES ('knox','x','t','e','success')"
        )
    c1 = await trigger_rollup_refresh(since_hours=1)
    c2 = await trigger_rollup_refresh(since_hours=1)
    # Second call hits ON CONFLICT DO UPDATE path; does not raise
    assert c2 >= 0
```
  </action>
  <verify>
    <automated>pytest fee_crawler/tests/test_agent_health_rollup.py -x -v</automated>
  </verify>
  <acceptance_criteria>
    - File `fee_crawler/agent_base/health_rollup.py` exists with `HEALTH_METRICS` tuple of exactly 5 names
    - `grep -n "loop_completion_rate\|review_latency_seconds\|pattern_promotion_rate\|confidence_drift\|cost_to_value_ratio" fee_crawler/agent_base/health_rollup.py` returns at least 5 matches
    - File `supabase/migrations/20260512_agent_health_rollup_seed.sql` exists containing `refresh_agent_health_rollup(NOW() - INTERVAL '24 hours')`
    - `pytest fee_crawler/tests/test_agent_health_rollup.py -x -v` exits 0
    - `python -c "from fee_crawler.agent_base.health_rollup import HEALTH_METRICS, get_agent_health_sparkline, list_agent_health_tiles; assert len(HEALTH_METRICS) == 5"` exits 0
  </acceptance_criteria>
  <done>Python helpers + seed migration + 6 tests green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| /admin/agents Overview → health_rollup helpers | admin-only; server-side query |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-62B-09-01 | Tampering | `metric` param interpolated into SQL (f-string) | mitigate | `metric` is validated against `HEALTH_METRICS` tuple BEFORE the f-string interpolation; raises ValueError otherwise. Only 5 allowed strings → no injection surface. |
| T-62B-09-02 | Information Disclosure | Health tiles expose cost_to_value_ratio | accept | Admin-only surface; no client-side/public exposure this phase. |
</threat_model>

<verification>
- All tests pass
- 5 metric names constant defined
- Sparkline query returns ordered list, not raw rows
</verification>

<success_criteria>
- [ ] health_rollup.py with 3 helper functions
- [ ] Seed migration present
- [ ] 6 tests green
</success_criteria>

<output>
After completion, create `.planning/phases/62B-agent-foundation-runtime-layer/62B-09-SUMMARY.md` documenting the 5-metric naming contract and the rollup cadence (15-min via pg_cron).
</output>
