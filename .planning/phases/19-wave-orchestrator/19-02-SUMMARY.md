---
phase: 19-wave-orchestrator
plan: "02"
subsystem: fee_crawler/wave
tags: [wave, orchestrator, cli, sequential-execution, campaign, resume, python]
dependency_graph:
  requires: [wave-data-layer, wave-persistence, state-coverage, state-recommendation]
  provides: [wave-orchestrator, wave-cli, campaign-execution]
  affects: [fee_crawler/wave/orchestrator.py, fee_crawler/wave/cli.py, fee_crawler/__main__.py]
tech_stack:
  added: []
  patterns: [sequential-loop-execution, hard-vs-soft-failure-separation, tdd-red-green, mock-based-tests]
key_files:
  created:
    - fee_crawler/wave/orchestrator.py
    - fee_crawler/wave/cli.py
    - fee_crawler/tests/test_wave_orchestrator.py
  modified:
    - fee_crawler/__main__.py
decisions:
  - "MAX_CONCURRENT_STATES=1 enforces cron slot budget (WAVE-03) via sequential synchronous loop — no new Modal cron slots consumed"
  - "Hard failures (psycopg2.OperationalError, InterfaceError, KeyError) re-raise and stop campaign; soft per-state exceptions are caught, logged, and skipped (D-04)"
  - "No Modal HTTP endpoint for wave orchestration (D-06 deliberate omission — CLI-only for v3.0)"
  - "State codes validated to uppercase before SQL via CLI layer (T-19-04)"
  - "wave_size argument recorded in DB but run_wave() defaults to len(states) when omitted"
metrics:
  duration_seconds: 210
  completed_date: "2026-04-08"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 1
---

# Phase 19 Plan 02: Wave Orchestrator Engine Summary

**One-liner:** Sequential wave campaign engine (MAX_CONCURRENT_STATES=1) with per-state error isolation, crash-resume support, and CLI commands (wave run / recommend / resume) integrating into the existing fee_crawler CLI.

## What Was Built

### Task 1: Wave orchestrator engine (TDD)

Created `fee_crawler/wave/orchestrator.py` with four exports:

- **`MAX_CONCURRENT_STATES = 1`** — module-level constant with docstring explaining WAVE-03 cron slot budget enforcement. The orchestrator runs via CLI (not a Modal cron slot), and the sequential loop ensures at most one state agent runs at any time.
- **`run_wave(conn, states, wave_size, campaign_id)`** — creates a wave_run record, sets status="running", iterates states sequentially via `_run_single_state()`, tracks completed/failed counts, sets status="complete". Hard failures re-raise; soft failures are caught and the loop continues.
- **`resume_wave(conn, wave_run_id)`** — calls `get_incomplete_states()` and runs only those, skipping already-complete/skipped states per WAVE-04. No-op if all states are complete.
- **`run_campaign(conn, wave_size, states)`** — fire-and-forget per D-03. If `states` is None, calls `recommend_states(conn, wave_size=50)` to rank all states by coverage gap (D-02), then chunks into wave_size batches and calls `run_wave()` for each. Generates a `campaign-YYYYMMDD-HHMMSS` campaign_id for grouping. Hard failures stop the campaign and log which wave failed.

Internal `_run_single_state()` handles all state execution:
- Updates wave_state_run status to "running" before calling `run_state_agent()`
- On success: updates to "complete" with agent_run_id and logs timing
- On HARD_FAILURES (psycopg2.OperationalError, InterfaceError, KeyError): re-raises
- On any other Exception: updates to "failed" with truncated error string (max 500 chars), logs error, returns None

**Test suite** (`fee_crawler/tests/test_wave_orchestrator.py`) — 12 tests using unittest.mock:
- TestMaxConcurrentStates: constant equals 1
- TestRunWave (5 tests): sequential order, wave_run creation, per-state error continues, hard failure stops, status transitions running→complete
- TestResumeWave (2 tests): skips completed states, no-op when all complete
- TestRunCampaign (4 tests): chunks into waves, respects states override, stops on hard failure, empty states is no-op

### Task 2: CLI wave subcommand

Created `fee_crawler/wave/cli.py` with three command handlers:

- **`cmd_wave_run(args)`** — if `--states` provided, parses comma-separated codes (`.upper()` each), calls `run_wave()`; otherwise calls `run_campaign()`. Prints wave_id(s) on completion.
- **`cmd_wave_recommend(args)`** — calls `recommend_states(conn, wave_size=50)` + `print_recommendations()`. No DB writes — read-only operator preview.
- **`cmd_wave_resume(args)`** — calls `resume_wave(conn, wave_run_id=args.wave_id)`.

Modified `fee_crawler/__main__.py`:
- Added `wave_parser = subparsers.add_parser("wave", ...)` with nested `wave_sub`
- Three sub-parsers: `run` (--states, --wave-size), `recommend` (--wave-size), `resume` (wave_id positional)
- Uses lazy `__import__` pattern consistent with existing codebase for deferred imports
- Dispatches via `args.func(args)` — existing dispatch pattern, no new routing needed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test assertion used positional arg index for keyword argument**
- **Found during:** Task 1 TDD GREEN
- **Issue:** Test checked `c.args[3] == "failed"` but `update_wave_state(conn, wave_run_id, state_code, status=...)` passes `status` as a keyword arg — `c.args[3]` raised IndexError
- **Fix:** Changed assertion to `c.kwargs.get("status") == "failed"` to match actual call signature
- **Files modified:** `fee_crawler/tests/test_wave_orchestrator.py`
- **Commit:** included in feat(19-02) commit

## Known Stubs

None. All functions are fully implemented. `run_state_agent()` is the real implementation from Plan 19-01's state agent — the orchestrator calls it directly.

## Threat Surface Scan

No new network endpoints introduced. CLI is operator-only (requires DATABASE_URL env var). T-19-04 mitigation applied: state codes are uppercased in cli.py before being passed to SQL layer (which uses parameterized queries throughout per T-19-01 from Plan 01). T-19-05 mitigation applied: MAX_CONCURRENT_STATES=1 enforced via sequential loop — no resource exhaustion possible.

## Self-Check: PASSED

Files exist:
- fee_crawler/wave/orchestrator.py: FOUND
- fee_crawler/wave/cli.py: FOUND
- fee_crawler/tests/test_wave_orchestrator.py: FOUND

Commits:
- 346c944: test(19-02): add failing tests for wave orchestrator engine
- 4af1990: feat(19-02): wave orchestrator engine with sequential execution
- ef8eb20: feat(19-02): CLI wave subcommand (run, recommend, resume)

Verification:
- `python -m fee_crawler wave --help` shows run/recommend/resume
- `python -m fee_crawler wave run --help` shows --states and --wave-size
- `python -m fee_crawler wave resume --help` shows wave_id positional argument
- `python -m pytest fee_crawler/tests/test_wave_orchestrator.py -v` → 12 passed
- `grep MAX_CONCURRENT_STATES fee_crawler/wave/orchestrator.py` → line 40: `MAX_CONCURRENT_STATES = 1`
- No f-string SQL in any wave module
