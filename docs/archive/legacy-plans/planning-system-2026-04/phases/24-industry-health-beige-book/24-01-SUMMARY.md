---
phase: 24-industry-health-beige-book
plan: "01"
subsystem: data-layer
tags: [health-metrics, institution-financials, tdd, vitest, call-reports]
dependency_graph:
  requires: []
  provides: [health-queries-tested, institution-count-trends]
  affects: [src/lib/crawler-db/health.ts]
tech_stack:
  added: []
  patterns: [vi.mock connection pattern, sql.unsafe for dynamic column queries, QoQ change computation]
key_files:
  created:
    - src/lib/crawler-db/health.test.ts
  modified:
    - src/lib/crawler-db/health.ts
decisions:
  - "Used sql.unsafe() for getInstitutionCountTrends to match existing buildHealthIndicator pattern"
  - "QoQ change computed in application layer (not SQL) for simplicity and testability"
  - "LIMIT $1 parameter added to prevent unbounded result sets (T-24-02 mitigation)"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-08"
  tasks_completed: 1
  files_changed: 2
---

# Phase 24 Plan 01: Health Data Layer Tests + Institution Count Trends Summary

Audited and tested all existing health metric queries; implemented missing `getInstitutionCountTrends()` with quarter-over-quarter change percentages using vitest TDD workflow.

## What Was Built

**Task 1 (TDD):** Added `src/lib/crawler-db/health.test.ts` with 29 tests covering all 5 health query functions, then implemented the missing `getInstitutionCountTrends` function in `health.ts`.

### New function: `getInstitutionCountTrends(quarterCount = 8)`

Queries `institution_financials JOIN crawl_targets` to count distinct active institutions per quarter by charter type. Returns `InstitutionCountTrend[]` with:
- `quarter`: formatted as `YYYY-QN`
- `bank_count`, `cu_count`, `total`: numeric institution counts
- `bank_change_pct`, `cu_change_pct`: quarter-over-quarter change percentages (null for oldest row)

### Existing functions audited (all passing):
- `getIndustryHealthMetrics` (HEALTH-01): ROA/ROE/efficiency_ratio medians by quarter
- `getHealthMetricsByCharter` (HEALTH-04): same metrics split by bank vs credit_union
- `getDepositGrowthTrend` (HEALTH-02): YoY deposit growth with 4-quarter comparison
- `getLoanGrowthTrend` (HEALTH-02): YoY loan growth with 4-quarter comparison

## Test Results

- 29/29 tests passing
- RED phase: 8 tests failing (getInstitutionCountTrends not yet implemented)
- GREEN phase: all 29 passing after implementation
- health.ts production file: `npx tsc --noEmit` reports 0 errors on health.ts

## Deviations from Plan

None — plan executed exactly as written. The pre-existing TypeScript cast error in test files (`getSql() as MockSql`) also exists in `fed.test.ts` and is a known codebase pattern, not a regression.

## Known Stubs

None. All functions return live data from `institution_financials` table.

## Threat Flags

None. The new function follows existing patterns:
- LIMIT $1 parameter prevents unbounded result sets (T-24-02)
- Returns aggregated counts only — no institution-specific PII (T-24-01)

## Self-Check: PASSED

- `src/lib/crawler-db/health.test.ts`: FOUND
- `src/lib/crawler-db/health.ts` (modified): FOUND
- commit `ca1dccb` (RED tests): FOUND
- commit `5315730` (GREEN implementation): FOUND
- 29/29 tests passing: CONFIRMED
- `getInstitutionCountTrends` exported: CONFIRMED (grep match)
- 5 exported async functions: CONFIRMED
