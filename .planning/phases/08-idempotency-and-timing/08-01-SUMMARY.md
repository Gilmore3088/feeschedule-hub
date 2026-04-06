---
phase: 08-idempotency-and-timing
plan: 01
subsystem: testing
tags: [pytest, sqlite, idempotency, timing, synthetic-data, categorize_fees, backfill_validation]

requires:
  - phase: 06-validation-stage-tests
    provides: validated_db fixture pattern, _teardown/_insert_scaffold helpers, backfill_validation.run() integration
  - phase: 05-categorization-stage-tests
    provides: _FEE_ROWS synthetic data pattern, categorize_fees.run() integration

provides:
  - IDEM-01: idempotency tests for categorize_fees.run() and backfill_validation.run()
  - TIME-01: timing tests asserting both stages complete under 5s budget on synthetic data
  - function-scoped idem_db fixture with _teardown/_insert_scaffold helpers for phase 08+

affects:
  - 09-full-pipeline-e2e
  - any phase that runs categorize or validate stages twice

tech-stack:
  added: []
  patterns:
    - "Function-scoped idem_db fixture: _teardown before yield + after yield for full isolation"
    - "Idempotency check: run stage twice, assert COUNT(*) == _ROW_COUNT both times"
    - "Time budget: time.monotonic() wrap around stage call, assert elapsed < BUDGET constant"
    - "No-op path timing: second run processes 0 rows, still asserted under budget"

key-files:
  created:
    - fee_crawler/tests/e2e/test_idempotency_and_timing.py
  modified: []

key-decisions:
  - "Function-scoped idem_db fixture used for all 3 tests — each gets fresh rows, full isolation"
  - "All 3 tests written in single pass (both tasks in one file) since plan specified full content"
  - "BUDGET_CATEGORIZE_S = BUDGET_VALIDATE_S = 5.0 — generous 10x expected for hang detection only"

patterns-established:
  - "Idempotency assertion pattern: run1_count == run2_count AND run2_count == _ROW_COUNT"
  - "Time budget pattern: monotonic start/stop around each stage, separate runs for active + no-op paths"

requirements-completed: [IDEM-01, TIME-01]

duration: 5min
completed: 2026-04-06
---

# Phase 8 Plan 1: Idempotency and Timing Summary

**Idempotency and timing coverage for categorize_fees.run() and backfill_validation.run() using 6-row synthetic data and monotonic time assertions against 5s budgets**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-06T18:00:00Z
- **Completed:** 2026-04-06T18:05:00Z
- **Tasks:** 2 (Tasks 1 and 2 executed together — same output file)
- **Files modified:** 1

## Accomplishments

- Added 3 passing e2e tests covering IDEM-01 and TIME-01 requirements
- test_categorize_is_idempotent: confirms categorize_fees.run() twice yields the same row count
- test_validate_is_idempotent: confirms backfill_validation.run() twice yields the same row count
- test_stage_time_budgets: both stages (run 1 + no-op run 2) complete well under 5s each
- Full e2e suite remains green: 19 passed, 2 skipped (LLM extraction skips)
- All tests complete in 0.20s combined (well within time budgets)

## Task Commits

1. **Tasks 1 + 2: Idempotency and timing tests (IDEM-01, TIME-01)** - `9e1646d` (test)

## Files Created/Modified

- `fee_crawler/tests/e2e/test_idempotency_and_timing.py` - 3 e2e tests: IDEM-01 x2, TIME-01 x1; function-scoped idem_db fixture; _teardown/_insert_scaffold helpers; BUDGET constants

## Decisions Made

- Tasks 1 and 2 were written together in one pass since the plan specified the complete file content for both. No separate RED commits — both tasks share a single file and all tests passed green on first run.
- Used function-scoped idem_db for all 3 tests (not separate fixtures per test) — keeps fixture count minimal while maintaining isolation.
- BUDGET constants set to 5.0s each (D-06): generous enough to catch hangs on any reasonable machine without flaky timing failures.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. Tests passed on first run (0.20s for all 3). The existing categorize_fees.run() WHERE fee_category IS NULL guard and backfill_validation.run() WHERE validation_flags IS NULL guard made both stages correctly idempotent without any changes to production code.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None.

## Next Phase Readiness

- IDEM-01 and TIME-01 requirements fully covered
- Phase 9 (full pipeline e2e) can rely on stages being idempotent — re-runs will not corrupt the DB
- idem_db fixture pattern available for any phase 9+ tests that need fresh synthetic data with _teardown isolation

---
*Phase: 08-idempotency-and-timing*
*Completed: 2026-04-06*
