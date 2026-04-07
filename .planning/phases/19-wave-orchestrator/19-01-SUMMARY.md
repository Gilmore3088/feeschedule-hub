---
phase: 19-wave-orchestrator
plan: "01"
subsystem: fee_crawler/wave
tags: [wave, orchestrator, coverage, prioritization, db-schema, python]
dependency_graph:
  requires: []
  provides: [wave-data-layer, wave-persistence, state-coverage, state-recommendation]
  affects: [fee_crawler/wave/*, supabase/migrations]
tech_stack:
  added: [fee_crawler/wave package]
  patterns: [psycopg2-connection-first, parameterized-sql, dataclass-models, mock-based-tests]
key_files:
  created:
    - supabase/migrations/20260407_wave_runs.sql
    - fee_crawler/wave/__init__.py
    - fee_crawler/wave/models.py
    - fee_crawler/wave/coverage.py
    - fee_crawler/wave/recommend.py
    - fee_crawler/tests/test_wave_coverage.py
  modified: []
decisions:
  - "All SQL uses %s parameterized queries — no f-string interpolation of user-supplied values (T-19-01)"
  - "Connection-first pattern: all functions take conn as first arg, never create connections internally"
  - "ensure_tables() added for envs where Supabase migration hasn't run yet"
  - "Tiebreaker for equal coverage: larger total_institutions ranked first (higher impact per wave)"
metrics:
  duration_seconds: 157
  completed_date: "2026-04-07"
  tasks_completed: 2
  tasks_total: 2
  files_created: 6
  files_modified: 0
---

# Phase 19 Plan 01: Wave Data Layer Summary

**One-liner:** Wave DB schema (wave_runs + wave_state_runs), psycopg2 persistence models with parameterized SQL, and coverage-gap state ranking engine for the wave orchestrator.

## What Was Built

### Task 1: Wave DB schema and persistence models

Created the PostgreSQL migration and Python persistence layer:

- **`supabase/migrations/20260407_wave_runs.sql`** — two tables with CHECK constraints and indexes:
  - `wave_runs`: tracks a wave's state list, progress counters, status, and optional campaign_id
  - `wave_state_runs`: per-state tracking with unique(wave_run_id, state_code), linking to agent_runs via agent_run_id
- **`fee_crawler/wave/__init__.py`** — package marker
- **`fee_crawler/wave/models.py`** — WaveRun and WaveStateRun dataclasses plus CRUD:
  - `create_wave_run()` — inserts wave_runs row + N state rows, returns WaveRun
  - `update_wave_state()` — sets status, timestamps, agent_run_id, error
  - `update_wave_run()` — generic column updater (same pattern as state_agent._update_run)
  - `get_wave_run()` / `get_incomplete_states()` / `get_latest_wave()`
  - `ensure_tables()` — schema bootstrap for non-migrated environments

### Task 2: Coverage computation and recommendation engine

- **`fee_crawler/wave/coverage.py`** — `get_state_coverage()` queries crawl_targets LEFT JOIN extracted_fees, groups by state_code, computes coverage_pct = (institutions_with_fees / total) * 100
- **`fee_crawler/wave/recommend.py`** — `recommend_states()` sorts by coverage_pct ASC (lowest first per D-02) with total_institutions DESC tiebreaker; `print_recommendations()` outputs formatted table

### Test suite

**`fee_crawler/tests/test_wave_coverage.py`** — 25 tests using unittest.mock (no live DB required):
- 6 tests: create_wave_run
- 3 tests: update_wave_state
- 3 tests: get_incomplete_states
- 2 tests: get_wave_run
- 5 tests: get_state_coverage
- 4 tests: recommend_states
- 2 tests: print_recommendations

All 25 tests pass.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. All new surface is internal Python modules with no public exposure. T-19-01 (parameterized SQL) applied throughout models.py — no f-string SQL interpolation of any values.

## Known Stubs

None. All functions are fully implemented with real SQL queries and logic.

## Self-Check: PASSED

Files exist:
- fee_crawler/wave/__init__.py: FOUND
- fee_crawler/wave/models.py: FOUND
- fee_crawler/wave/coverage.py: FOUND
- fee_crawler/wave/recommend.py: FOUND
- supabase/migrations/20260407_wave_runs.sql: FOUND
- fee_crawler/tests/test_wave_coverage.py: FOUND

Commits exist:
- 64b0391: test(19-01): add failing tests
- 3852a27: feat(19-01): wave DB schema and persistence models
- 1576c2d: feat(19-01): coverage computation and state recommendation engine
