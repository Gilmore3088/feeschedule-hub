---
phase: 06-validation-stage-tests
plan: 01
subsystem: testing
tags: [pytest, sqlite, validation, confidence-threshold, outlier-detection, iqr, fee-reviews]

# Dependency graph
requires:
  - phase: 05-categorization-stage-tests
    provides: function-scoped fixture pattern with FK-safe teardown, session-scoped test_db and test_config

provides:
  - VALD-01: confidence threshold review_status transitions (staged/flagged/pending)
  - VALD-02: IQR-based statistical outlier detection flags extreme fee amounts
  - FK-safe teardown pattern including fee_reviews and gold_standard_fees tables

affects: [07-audit-trail-tests, 08-full-pipeline-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "function-scoped validated_db fixture: insert synthetic fees, run backfill_validation, yield, full FK teardown"
    - "outlier_db fixture: pre-staged fees with tight IQR cluster + extreme outlier, run run_outlier_detection"
    - "FK teardown order: gold_standard_fees -> fee_reviews -> extracted_fees -> crawl_results -> crawl_runs -> crawl_targets"

key-files:
  created:
    - fee_crawler/tests/e2e/test_validation_stage.py
    - .planning/phases/06-validation-stage-tests/06-01-PLAN.md
  modified:
    - fee_crawler/pipeline/outlier_detection.py

key-decisions:
  - "low_confidence warning flag from _check_low_confidence() is a blocking flag — confidence < 0.85 → flagged (not pending)"
  - "fees with fee_category IS NULL are skipped by backfill_validation and remain pending"
  - "outlier_db pre-stages all 6 ATM fees (5 normal + 1 extreme) to satisfy >= 5 staged/approved minimum for IQR stats"
  - "Rule 1 auto-fix: outlier_detection.py used user_id=0 violating FK constraint; fixed to NULL"

patterns-established:
  - "Pattern: FK-safe teardown must delete fee_reviews and gold_standard_fees before extracted_fees"
  - "Pattern: validated_db fixture pre-sets fee_category to ensure backfill_validation processes rows"
  - "Pattern: outlier fixture directly inserts review_status='staged' to bypass validation pipeline"

requirements-completed: [VALD-01, VALD-02]

# Metrics
duration: 18min
completed: 2026-04-06
---

# Phase 6 Plan 1: Validation Stage Tests Summary

**Confidence-threshold review_status transitions (staged/flagged/pending) and IQR-based statistical outlier flagging verified with synthetic data and no LLM calls**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-06T17:36:10Z
- **Completed:** 2026-04-06T17:54:00Z
- **Tasks:** 2
- **Files modified:** 2 (created 1 test file, fixed 1 production bug)

## Accomplishments

- VALD-01: test_confidence_threshold_transitions proves backfill_validation correctly transitions confidence >= 0.85 fees to staged, low-confidence fees to flagged (via low_confidence warning flag), and skips uncategorized fees (stays pending)
- VALD-02: test_outlier_detection_flags_statistical_outlier proves run_outlier_detection IQR analysis flags $500 ATM fee as statistical outlier among a $2-$5 cluster (6 staged rows, tight IQR upper_bound $6.50)
- Fixed FK integrity bug in outlier_detection.py: system audit trail inserts now use user_id=NULL instead of 0

## Task Commits

Each task was committed atomically:

1. **Task 1+2: validation stage e2e tests (VALD-01, VALD-02)** - `a1da330` (feat)
2. **Deviation fix: outlier_detection FK bug** - `830740f` (fix)

**Plan metadata:** committed with this SUMMARY

## Files Created/Modified

- `fee_crawler/tests/e2e/test_validation_stage.py` - 327-line test file with 2 function-scoped fixtures and 2 @pytest.mark.e2e tests
- `fee_crawler/pipeline/outlier_detection.py` - Fixed user_id=0 → NULL in fee_reviews INSERT

## Decisions Made

- Confidence 0.85 is inclusive (staged), 0.849 → flagged due to low_confidence warning flag; "pending" only applies to uncategorized (skipped) fees
- outlier_db fixture pre-stages all rows directly (INSERT with review_status='staged') rather than running backfill_validation, to control exact initial state for outlier detection
- 5 normal amounts [2.0, 2.5, 3.0, 3.5, 5.0] chosen to produce tight IQR (upper_bound ~$6.50), making $500.00 unambiguously outlying

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed user_id=0 FK violation in outlier_detection.py**
- **Found during:** Task 2 (outlier_db fixture setup, run_outlier_detection() call)
- **Issue:** `run_outlier_detection()` inserts fee_reviews audit entries with `user_id=0`. No user with id=0 exists in the users table. FK constraint on `fee_reviews.user_id REFERENCES users(id)` raised `sqlite3.IntegrityError: FOREIGN KEY constraint failed`.
- **Fix:** Changed `VALUES (?, ?, 0, 'system', ?, ?, ?)` to `VALUES (?, ?, NULL, 'system', ?, ?, ?)`. The column is nullable (no NOT NULL constraint); NULL correctly represents a system-generated entry with no human actor.
- **Files modified:** `fee_crawler/pipeline/outlier_detection.py`
- **Verification:** Both tests pass. Full e2e suite (13 tests) passes.
- **Committed in:** `830740f`

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug)
**Impact on plan:** Fix was required for VALD-02 to execute at all. No scope creep.

## Issues Encountered

- Initial test design assumed low-confidence fees → pending. Actual behavior: `_check_low_confidence()` adds a warning flag → `determine_review_status()` returns 'flagged'. Test assertions adjusted to match actual production semantics before committing (no production code change needed for this).

## Known Stubs

None — both tests assert real production code behavior with no placeholder data.

## Threat Flags

None — test file only; no new network endpoints, auth paths, or schema changes.

## Next Phase Readiness

- Validation stage tests complete; VALD-01 and VALD-02 requirements satisfied
- FK-safe teardown pattern (gold_standard_fees -> fee_reviews -> extracted_fees chain) established for all future phases
- Phase 7 (audit trail tests) can build on validated_db fixture pattern and confirmed fee_reviews insert behavior

---
*Phase: 06-validation-stage-tests*
*Completed: 2026-04-06*

## Self-Check: PASSED

- FOUND: fee_crawler/tests/e2e/test_validation_stage.py
- FOUND: fee_crawler/pipeline/outlier_detection.py (modified)
- FOUND: commit a1da330 (feat: validation stage e2e tests)
- FOUND: commit 830740f (fix: outlier_detection FK bug)
