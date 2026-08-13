---
phase: 20-iterative-deepening
plan: "02"
subsystem: fee-crawler-pipeline
tags: [iterative-deepening, wave-orchestrator, pass-loop, cli, tdd]
requirements: [ITER-01, ITER-02, ITER-03]

dependency_graph:
  requires:
    - fee_crawler/agents/strategy.py (TIER1/TIER2/TIER3, tier_for_pass, DEFAULT_MAX_PASSES, EARLY_STOP_COVERAGE_PCT)
    - fee_crawler/agents/state_agent.py (run_state_agent with pass_number, strategy params)
    - fee_crawler/wave/models.py (update_wave_state_pass, get_last_completed_pass)
    - fee_crawler/wave/orchestrator.py (run_wave, resume_wave, run_campaign)
    - fee_crawler/wave/cli.py (cmd_wave_run, cmd_wave_resume)
    - fee_crawler/__main__.py (wave subcommand argparse)
  provides:
    - fee_crawler/wave/orchestrator.py (_run_single_state with inner pass loop)
    - fee_crawler/wave/orchestrator.py (_get_coverage_pct helper)
    - fee_crawler/wave/cli.py (--max-passes flag for run and resume)
  affects:
    - fee_crawler/tests/test_iterative_deepening.py (8 new integration tests)
    - fee_crawler/tests/test_wave_orchestrator.py (updated to match new interface)

tech_stack:
  added: []
  patterns:
    - inner pass loop with strategy escalation via tier_for_pass()
    - coverage-gated early stop: minimum 3 passes enforced (ITER-01)
    - resume via start_pass derived from get_last_completed_pass()
    - T-20-04 DoS mitigation: max_passes validated in [1, 10] at CLI boundary
    - soft per-pass failure: log and continue; hard failures propagate

key_files:
  created: []
  modified:
    - fee_crawler/wave/orchestrator.py
    - fee_crawler/wave/cli.py
    - fee_crawler/__main__.py
    - fee_crawler/tests/test_iterative_deepening.py
    - fee_crawler/tests/test_wave_orchestrator.py

decisions:
  - "Early stop minimum 3 passes: ITER-01 requires each state get at least 3 agent_runs entries, so pass_num >= 3 AND coverage >= 90% is the gate condition"
  - "Soft per-pass failure: individual pass exceptions are caught and logged; only if ALL passes fail is the state marked failed"
  - "max_passes validated [1, 10] at CLI: T-20-04 threat addressed in _validate_max_passes() in cli.py"
  - "update_wave_state_pass() called after each pass with agent_run_id: enables per-pass audit trail and granular resume"

metrics:
  duration_seconds: 900
  tasks_completed: 2
  files_created: 0
  files_modified: 5
  tests_added: 12
  tests_passing: 107
  completed_date: "2026-04-08"
---

# Phase 20 Plan 02: Iterative Deepening Pass Loop Summary

**One-liner:** Inner pass loop in _run_single_state with tier1→tier2→tier3 escalation, coverage-gated early stop (minimum 3 passes enforced), resume-from-last-pass support, and --max-passes CLI flag with DoS validation.

## What Was Built

### Task 1: Inner Pass Loop in Wave Orchestrator

**fee_crawler/wave/orchestrator.py** — rewritten `_run_single_state()`:

- New signature: `_run_single_state(conn, wave_run_id, state_code, max_passes=3, start_pass=1)`
- Inner loop from `start_pass` to `max_passes` (inclusive) calling `run_state_agent(state_code, pass_number=N, strategy=tier_for_pass(N))`
- `update_wave_state_pass(conn, wave_run_id, state_code, last_completed_pass=N, agent_run_id=run_id)` called after each successful pass
- `_get_coverage_pct(conn, state_code)` helper queries `crawl_targets` — handles both dict cursor (RealDictCursor) and tuple cursor; returns 0.0 on empty
- Early stop condition: `pass_num >= 3 AND coverage >= 90.0` — the `>= 3` check is the ITER-01 minimum enforcement
- Soft per-pass failure: exceptions caught and logged, loop continues; state marked failed only if all passes fail
- Final `update_wave_state("complete", agent_run_id=last_run_id)` uses the last successful pass's run_id

**run_wave(), resume_wave(), run_campaign()** — all updated:
- Accept `max_passes: int = DEFAULT_MAX_PASSES` parameter and pass through to `_run_single_state()`
- `resume_wave()` calls `get_last_completed_pass(conn, wave_run_id, state_code)` → `start_pass = last_pass + 1`

**Integration tests added (test_iterative_deepening.py):**
- `test_three_passes_created`: asserts 3 `run_state_agent` calls with TIER1/TIER2/TIER3 and `update_wave_state_pass` called 3 times
- `test_early_stop_after_three_passes`: with max_passes=5 and 95% coverage, exactly 3 passes run
- `test_early_stop_not_before_three`: with 95% coverage after pass 1, still runs all 3 minimum passes
- `test_resume_from_last_pass`: start_pass=2 → first agent call uses pass_number=2
- `test_last_pass_run_id_recorded`: final `update_wave_state("complete")` uses run_id from pass 3 (not pass 1)
- `test_coverage_pct_query`: verifies SQL hits `crawl_targets`, returns float
- `test_coverage_pct_tuple_row`: tuple cursor compatibility
- `test_coverage_pct_none_row`: returns 0.0 when no rows

### Task 2: CLI --max-passes Flag + Per-Pass Log Tests

**fee_crawler/wave/cli.py** — updated:
- `cmd_wave_run()` reads `args.max_passes` and passes to `run_wave()` / `run_campaign()`
- `cmd_wave_resume()` reads `args.max_passes` and passes to `resume_wave()`
- `_validate_max_passes(value)` enforces [1, 10] range — exits with error message on violation (T-20-04)
- Updated docstrings to mention iterative deepening

**fee_crawler/__main__.py** — updated:
- Added `--max-passes` (type int, default 3) to `wave run` parser
- Added `--max-passes` (type int, default 3) to `wave resume` parser
- Help text: "Number of discovery passes per state (default: 3). Each pass escalates strategy: tier1 -> tier2 -> tier3."

**Log format tests added (test_iterative_deepening.py):**
- `test_per_pass_log_format`: asserts `write_learnings()` output contains "Pass 2 (tier2)" and "Coverage: 45.3%"
- `test_per_pass_log_without_pass_info`: backward compat — no crash, no "Pass None" artifact

### Deviation: Auto-fixed Regression in test_wave_orchestrator.py (Rule 1 - Bug)

**Found during:** Task 2 full test suite run
**Issue:** `test_wave_orchestrator.py` mocked `run_state_agent(state_code)` with old positional-only signature. The new inner pass loop calls `run_state_agent(state_code, pass_number=N, strategy=tier)` which broke all orchestrator tests with `TypeError: got an unexpected keyword argument 'pass_number'`.
**Fix:** Updated 5 test methods to:
- Accept `pass_number` and `strategy` kwargs in mock side_effect functions
- Add missing patches for `update_wave_state_pass`, `_get_coverage_pct`, `get_last_completed_pass`
- Update `call_count` assertions: 2 states × 3 passes = 6 calls (not 2); 3 states × 3 passes = 9 calls
- Fix `test_resume_only_runs_incomplete_states`: 2 incomplete states × 3 passes = 6 calls
**Files modified:** `fee_crawler/tests/test_wave_orchestrator.py`
**Commit:** ed8aede

## Verification Results

```
python -m pytest fee_crawler/tests/test_iterative_deepening.py -x -q
28 passed

python -m pytest fee_crawler/tests/ --ignore=fee_crawler/tests/e2e -q
107 passed

python -m fee_crawler wave run --help
  --max-passes MAX_PASSES  (shown with tier1->tier2->tier3 description)

python -c "from fee_crawler.wave.orchestrator import _run_single_state; import inspect; print(inspect.signature(_run_single_state))"
(conn, wave_run_id: 'int', state_code: 'str', max_passes: 'int' = 3, start_pass: 'int' = 1) -> 'dict | None'
```

## Known Stubs

None. The pass loop is fully wired: orchestrator → state_agent → DB update → coverage query → early stop check.

## Threat Flags

None. T-20-04 (--max-passes DoS) addressed via `_validate_max_passes()` in cli.py. T-20-05 and T-20-06 accepted per plan threat register.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| fee_crawler/wave/orchestrator.py | FOUND |
| fee_crawler/wave/cli.py | FOUND |
| fee_crawler/tests/test_iterative_deepening.py | FOUND |
| .planning/phases/20-iterative-deepening/20-02-SUMMARY.md | FOUND |
| commit f01d5b2 (Task 1) | FOUND |
| commit ed8aede (Task 2) | FOUND |
| 107 non-e2e tests passing | VERIFIED |
