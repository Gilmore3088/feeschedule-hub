---
phase: 62B
plan: "09"
subsystem: agent-observability
tags: [obs-05, agent-health, sparklines, python-helpers, backfill]
requires:
  - "62B-01 agent_health_rollup table + refresh_agent_health_rollup() function (migration 20260509)"
  - "agent_registry seed (knox, darwin, etc. pre-registered)"
provides:
  - "HEALTH_METRICS constant: the 5 canonical OBS-05 metric names"
  - "trigger_rollup_refresh(since_hours) async helper"
  - "get_agent_health_sparkline(agent, metric) async helper — 7-day default window"
  - "list_agent_health_tiles(agent_names) async helper — DISTINCT ON latest bucket per agent"
  - "24-hour seed migration so /admin/agents renders non-empty on fresh deploys"
affects:
  - "Plan 62B-10 (/admin/agents Overview tab) — consumer of these helpers"
tech-stack:
  added: []
  patterns:
    - "Whitelist-guarded f-string SQL interpolation for identifier positions (metric column name)"
    - "DISTINCT ON (agent_name) ORDER BY agent_name, bucket_start DESC — canonical Postgres 'latest row per group' pattern"
    - "Guarded DO block in migration so CI/test schemas apply cleanly when the refresh function is absent"
key-files:
  created:
    - fee_crawler/agent_base/health_rollup.py
    - fee_crawler/tests/test_agent_health_rollup.py
    - supabase/migrations/20260512_agent_health_rollup_seed.sql
  modified: []
decisions:
  - "Five metric names are a frozen tuple HEALTH_METRICS — changing the set is a contract break; tests assert the exact set via set-equality."
  - "Sparkline default = 672 buckets (7 days × 96 buckets/day). Callers may lower via kwarg; the SQL LIMIT is parameterized."
  - "NULL values in metric columns coerce to 0.0 in sparkline output (dense series for rendering) but to None in tile output (em-dash in UI)."
  - "Backfill runs 24 hours not 7 days — avoids a multi-minute migration on large agent_events tables; 7-day history rebuilds naturally within a week of pg_cron schedule."
metrics:
  duration_minutes: 35
  completed: 2026-04-16
  tasks_completed: 1
  commits: 2
---

# Phase 62B Plan 09: Agent Health Rollup Helpers Summary

One-liner: Ship the Python + SQL seed layer for OBS-05's 5-metric tile grid so `/admin/agents` (plan 62B-10) has a data source ready on day one.

## What Shipped

1. **`fee_crawler/agent_base/health_rollup.py`** — three async helpers over the `agent_health_rollup` table created in plan 62B-01:
   - `trigger_rollup_refresh(since_hours)` — calls the SQL refresh function, returns upsert count.
   - `get_agent_health_sparkline(agent_name, metric, bucket_count=672)` — oldest-first list of floats; NULLs coerced to 0.0 for dense rendering.
   - `list_agent_health_tiles(agent_names)` — `{agent: {metric: latest_value, bucket_start: iso}}` via `DISTINCT ON (agent_name)`.
   - Plus the frozen `HEALTH_METRICS` tuple, the single source of truth for the 5 metric names.

2. **`supabase/migrations/20260512_agent_health_rollup_seed.sql`** — backfills the last 24 hours so `/admin/agents` renders non-empty on fresh deploys before pg_cron accumulates enough buckets. Guarded with a `DO $$ IF EXISTS ...` block so partial test-schema setups apply cleanly.

3. **`fee_crawler/tests/test_agent_health_rollup.py`** — 7 tests covering: the frozen metric contract, the ValueError whitelist guard (threat mitigation), empty-agent graceful degradation, a full write+read cycle, all-5-metrics query coverage, the tile-dict shape, and ON CONFLICT idempotency. Six are DB-backed (use `db_schema` fixture + `_bind_pool` singleton-override); one is pure-python and runs everywhere.

## Five-Metric Naming Contract

The canonical OBS-05 metrics, exactly these names in any order:

| Metric | Type | Semantics (Phase 63 tunes) |
|--------|------|---------------------------|
| `loop_completion_rate` | NUMERIC(5,4) | Share of IMPROVE events that completed `success` in the bucket. |
| `review_latency_seconds` | INTEGER | Avg delay between event creation and its REVIEW pass. |
| `pattern_promotion_rate` | NUMERIC(5,4) | Share of bucket events that promoted a lesson/pattern. |
| `confidence_drift` | NUMERIC(6,4) | Signed delta vs. previous bucket (lag-window). |
| `cost_to_value_ratio` | NUMERIC(10,4) | SUM(cost_cents) / COUNT(success events). |

Changing the set is a contract break: `test_five_metrics_constant` asserts exact set-equality, and the /admin/agents tile grid (62B-10) iterates `HEALTH_METRICS` to render tiles.

## Rollup Cadence

- pg_cron schedule: `*/15 * * * *` (every 15 minutes). Declared in plan 62B-01's migration; guarded so CI/local-Postgres without the `pg_cron` extension apply cleanly.
- Test/dev environments without pg_cron can call `trigger_rollup_refresh()` manually (that's exactly what the new tests do).
- Bucket boundary: `date_trunc('hour', created_at) + INTERVAL '15 min' * floor(EXTRACT(minute FROM created_at) / 15)` — fixed 15-minute slots aligned to hour boundaries.
- Seed migration runs a one-shot 24-hour refresh at deploy time.

## Threat Mitigation (T-62B-09-01)

The `metric` parameter is a column name — it cannot be bound as an asyncpg parameter. The helper validates `metric in HEALTH_METRICS` and raises `ValueError` BEFORE any f-string interpolation. Since `HEALTH_METRICS` contains only identifier-safe tokens defined at module load, no untrusted string ever reaches the SQL text. `agent_name` and `bucket_count` go through parameter binding as usual.

`test_unknown_metric_raises` exercises this path directly: `"bogus; DROP TABLE x;--"` triggers `ValueError("unknown metric ...")` without any DB call.

## Test Coverage

| Test | Path | Runs without DB? |
|------|------|-----------------|
| `test_five_metrics_constant` | pure python | yes |
| `test_unknown_metric_raises` | uses db_schema fixture setup but errors before DB call | skip if no DB |
| `test_empty_agent_sparkline_is_empty_list` | DB | skip if no DB |
| `test_refresh_and_read_sparkline` | DB | skip if no DB |
| `test_all_five_metrics_supported` | DB | skip if no DB |
| `test_list_tiles_returns_five_metric_keys` | DB | skip if no DB |
| `test_refresh_idempotent` | DB | skip if no DB |

Local run (no `DATABASE_URL_TEST`): `1 passed, 6 skipped` — expected.

## Deviations from Plan

None — plan executed as written. One small adaptation: the test file uses `_bind_pool(pool)` (copied from `test_reasoning_trace.py`) so each DB-backed test redirects the module-level `get_pool()` singleton at the schema-scoped fixture pool. The plan sketch called `get_pool()` directly, which would hit the production DSN — the `_bind_pool` pattern is the established convention in this repo.

## Commits

| Hash | Message |
|------|---------|
| `2edb7cd` | test(62B-09): add failing tests for agent_health_rollup helpers |
| `c5ed953` | feat(62B-09): add agent_health_rollup Python helpers + seed migration |

## Verification

```
$ python3 -m pytest fee_crawler/tests/test_agent_health_rollup.py -v
1 passed, 6 skipped in 0.02s   # DB-backed tests skip when DATABASE_URL_TEST unset
```

Acceptance criteria (plan §acceptance_criteria):
- File `fee_crawler/agent_base/health_rollup.py` exists with `HEALTH_METRICS` tuple of exactly 5 names → PASS
- `grep` for the 5 metric names returns at least 5 matches → PASS (18 matches)
- File `supabase/migrations/20260512_agent_health_rollup_seed.sql` exists containing the 24h refresh call → PASS
- `pytest fee_crawler/tests/test_agent_health_rollup.py -x -v` exits 0 → PASS (1 pass, 6 skip, exit 0)
- `python -c "from fee_crawler.agent_base.health_rollup import HEALTH_METRICS, get_agent_health_sparkline, list_agent_health_tiles; assert len(HEALTH_METRICS) == 5"` exits 0 → PASS

## Self-Check: PASSED

- fee_crawler/agent_base/health_rollup.py → FOUND
- supabase/migrations/20260512_agent_health_rollup_seed.sql → FOUND
- fee_crawler/tests/test_agent_health_rollup.py → FOUND
- commit 2edb7cd → FOUND
- commit c5ed953 → FOUND
