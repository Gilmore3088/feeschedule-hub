---
phase: 55-canonical-taxonomy-foundation
plan: "03"
subsystem: fee-crawler
tags: [roomba, data-quality, canonical-taxonomy, outlier-detection, audit-trail]
dependency_graph:
  requires: [55-01]
  provides: [canonical-outlier-sweep, canonical-reassignment-sweep]
  affects: [extracted_fees.review_status, roomba_log]
tech_stack:
  added: []
  patterns:
    - Pure function extraction (detect_canonical_outliers, compute_canonical_stats) for testability without DB
    - 3-stddev threshold outlier detection grouped by canonical_fee_key
    - Graceful column-existence guard via information_schema query
    - Flags-only policy (never auto-rejects) for canonical outliers
key_files:
  created:
    - fee_crawler/tests/test_roomba_canonical.py
  modified:
    - fee_crawler/commands/roomba.py
decisions:
  - Pure functions extract the core outlier logic so tests need no DB connection
  - Min-5-observation guard prevents false positives on sparse categories
  - Flags never auto-reject (human review required per T-55-07 threat mitigation)
  - Graceful skip via information_schema guard — safe to run before migration is applied
metrics:
  duration: "~20 minutes"
  completed: "2026-04-10"
  tasks_completed: 2
  files_changed: 2
---

# Phase 55 Plan 03: Canonical Roomba Sweeps Summary

**One-liner:** Roomba extended with canonical_fee_key outlier detection (3-stddev threshold) and stale-assignment correction, both with full roomba_log audit trail and graceful pre-migration degradation.

## What Was Built

Two new sweep functions added to `fee_crawler/commands/roomba.py` and wired into the main `run()` entry point as Sweep 4 and Sweep 5:

**Sweep 4 — `sweep_canonical_reassignments(conn, fix=False)`**
Identifies fees where `canonical_fee_key` disagrees with what `CANONICAL_KEY_MAP` would assign for the fee's current `fee_category`. Catches stale assignments that arise after alias table updates. In fix mode, corrects the key and logs the old/new values to `roomba_log` with `field_changed = 'canonical_fee_key'` and `reason = 'canonical_reassignment: alias table updated'`.

**Sweep 5 — `sweep_canonical_outliers(conn, fix=False)`**
Groups non-rejected, non-$0, non-null-key fees by `canonical_fee_key`. For each category with >= 5 observations, computes median and stddev; fees deviating 3+ stddev in either direction are flagged for human review (never auto-rejected). In fix mode, sets `review_status = 'flagged'` and logs to `roomba_log` with `reason` containing `'canonical_outlier'`.

**Pure function helpers (for testability)**
- `compute_canonical_stats(rows)` — computes per-key stats from a list of dicts, no DB required
- `detect_canonical_outliers(stats, fees)` — applies 3-stddev threshold logic, no DB required

Both DB-integrated functions guard against the `canonical_fee_key` column not existing (graceful skip via `information_schema.columns` check).

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| RED tests | 9 failing tests covering outlier detection, null skips, $0 skips, stats contract | 5d96c79 |
| Task 1 + 2 implementation | sweep_canonical_outliers, sweep_canonical_reassignments, pure helpers, run() wiring | dbf0a96 |

## Verification Results

```
fee_crawler/tests/test_roomba_canonical.py::test_roomba_canonical_outlier_below PASSED
fee_crawler/tests/test_roomba_canonical.py::test_roomba_canonical_no_flag_within_range PASSED
fee_crawler/tests/test_roomba_canonical.py::test_roomba_canonical_skips_null_key PASSED
fee_crawler/tests/test_roomba_canonical.py::test_roomba_canonical_skips_insufficient_data PASSED
fee_crawler/tests/test_roomba_canonical.py::test_roomba_canonical_stats_contract PASSED
fee_crawler/tests/test_roomba_canonical.py::test_roomba_canonical_skips_zero_amounts PASSED
fee_crawler/tests/test_roomba_canonical.py::test_roomba_canonical_outlier_above PASSED
fee_crawler/tests/test_roomba_canonical.py::test_roomba_canonical_skips_already_flagged PASSED
fee_crawler/tests/test_roomba_canonical.py::test_sweep_canonical_reassignments_importable PASSED

9 passed in 0.03s
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 5 expectation corrected for min-5-observation boundary**
- **Found during:** GREEN phase (first test run)
- **Issue:** `test_roomba_canonical_stats_contract` asserted `obs_count == 4` and expected the key to appear in stats, but `compute_canonical_stats` correctly excludes groups with < 5 observations (4 valid rows from the test dataset). Test expectation contradicted the spec.
- **Fix:** Rewrote the test to assert both behaviors: 4 valid rows -> key excluded; 5 valid rows -> key included with correct `obs_count`.
- **Files modified:** `fee_crawler/tests/test_roomba_canonical.py`
- **Commit:** dbf0a96 (included in implementation commit)

### Plan Naming Note

The plan references `run_roomba()` but the existing function is named `run()`. The new sweeps were wired into `run()` — the actual function that exists — which is the correct behavior.

## Known Stubs

None. Both sweeps are fully implemented with DB queries, fix-mode mutations, and audit logging. The graceful-skip guard for pre-migration environments is intentional behavior, not a stub.

## Threat Flags

None beyond what the plan's threat model covered. No new network endpoints or auth paths introduced. All writes are guarded by the existing `review_status != 'rejected'` filter and the flags-only policy.

## Self-Check: PASSED

- [x] `fee_crawler/tests/test_roomba_canonical.py` -- exists, 9 tests pass
- [x] `fee_crawler/commands/roomba.py` -- contains `sweep_canonical_outliers`, `sweep_canonical_reassignments`, `detect_canonical_outliers`, `compute_canonical_stats`
- [x] Both sweeps wired into `run()` as Sweep 4 and Sweep 5
- [x] Commits 5d96c79 and dbf0a96 exist in git log
