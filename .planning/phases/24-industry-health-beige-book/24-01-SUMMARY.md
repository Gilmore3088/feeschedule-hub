---
phase: 24-industry-health-beige-book
plan: 01
subsystem: crawler-db
tags: [health-metrics, industry-analytics, call-reports, vitest, tdd]
dependency_graph:
  requires: [23-call-report-fred-foundation]
  provides: [industry-health-query-layer]
  affects: [hamilton-research-agents, report-engine]
tech_stack:
  added: []
  patterns: [RichIndicator-shaped-returns, priorYearQuarter-label-matching, charter-type-segmentation, try-catch-null-fallback]
key_files:
  created:
    - src/lib/crawler-db/health.ts
    - src/lib/crawler-db/health.test.ts
  modified:
    - src/lib/crawler-db/fed.ts
    - src/lib/crawler-db/call-reports.ts
decisions:
  - "RichIndicator and deriveTrend added to fed.ts (not a separate file) to keep economic indicator logic co-located"
  - "priorYearQuarter added to call-reports.ts top-level export rather than health.ts to be reusable across modules"
  - "GrowthTrend returns null (not GrowthTrend with all-nulls) on DB error for cleaner null-check at call sites"
  - "getNationalEconomicSummary and getDistrictUnemployment restored to fed.ts to fix regression from pre-existing worktree state"
metrics:
  duration: 65m
  completed: 2026-04-07T20:15:08Z
  tasks_completed: 2
  files_created: 2
  files_modified: 2
---

# Phase 24 Plan 01: Industry Health Metrics Query Layer Summary

**One-liner:** Industry health query layer returning RichIndicator-shaped ROA/ROE/efficiency, YoY deposit/loan growth via priorYearQuarter label matching, institution counts with bank/credit_union split, and charter segmentation -- all with try-catch null fallback for Hamilton analysis.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Export helpers + create health.ts with ROA/ROE/efficiency metrics + tests | 2f66fbd | fed.ts, call-reports.ts, health.ts, health.test.ts |
| 2 | Add deposit/loan growth, institution counts, charter segmentation | e4f3a9d | fed.ts |

## What Was Built

**`src/lib/crawler-db/health.ts`** exports 5 async functions and 4 interfaces:

- `getIndustryHealthMetrics()` → `{ roa, roe, efficiency_ratio }` each as `RichIndicator | null`
- `getDepositGrowthTrend(quarterCount?)` → `GrowthTrend | null` with YoY pct via priorYearQuarter label matching
- `getLoanGrowthTrend(quarterCount?)` → `GrowthTrend | null` (same pattern as deposits)
- `getInstitutionCountTrend(quarterCount?)` → `InstitutionCountSnapshot[]` with bank/cu split and period-over-period change
- `getHealthMetricsByCharter()` → `HealthByCharter` with separate `IndustryHealthMetrics` for bank vs credit_union

**`src/lib/crawler-db/fed.ts`** now exports:
- `RichIndicator` interface
- `deriveTrend()` function (exported)
- `NationalEconomicSummary` interface
- `getNationalEconomicSummary()` function
- `getDistrictUnemployment()` function

**`src/lib/crawler-db/call-reports.ts`** now exports:
- `priorYearQuarter()` helper

## Test Coverage

26 tests in health.test.ts covering:
- All-null fallback on DB error for every function
- Empty result set handling
- RichIndicator shape validation (current, history, trend, asOf)
- ROA/ROE/efficiency NOT multiplied by 1000 (FLOAT ratio, not monetary)
- YoY label matching via priorYearQuarter (not positional offset)
- Deposit/loan total uses * 1000 scaling (BIGINT monetary fields)
- Institution count period-over-period change computation
- Charter segmentation (bank vs credit_union) via JOIN crawl_targets
- GrowthTrend current_yoy_pct null when no prior year data in window

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored missing getNationalEconomicSummary and getDistrictUnemployment to fed.ts**
- **Found during:** Task 2 verification -- npx vitest run src/lib/crawler-db/fed.test.ts showed 13 failures
- **Issue:** The worktree's pre-existing fed.ts (257 lines) was missing these functions that existed in HEAD (404 lines). The git reset --soft preserved working tree state but HEAD's fed.test.ts expected the full function set.
- **Fix:** Added NationalEconomicSummary interface, fetchRichIndicator, fetchCpiYoyIndicator, getNationalEconomicSummary, and getDistrictUnemployment back to fed.ts
- **Files modified:** src/lib/crawler-db/fed.ts
- **Commit:** e4f3a9d

**2. [Rule 1 - Pre-existing] fees.test.ts has 2 pre-existing winsorization test failures**
- **Found during:** Full crawler-db suite run
- **Issue:** computeStats winsorization tests fail with unexpected avg values -- pre-dates this plan
- **Action:** Confirmed pre-existing (fails on committed state), logged as out-of-scope per deviation rules
- **Not fixed:** Out of scope for this plan

## Known Stubs

None. All 5 exported functions are fully implemented with real SQL queries and return structured data.

## Threat Flags

No new security-relevant surface introduced. All SQL uses parameterized queries (`$1`, `$2`) with static field name interpolation limited to the allowlisted set `('roa', 'roe', 'efficiency_ratio')`. DB errors return null/empty, never exposing error details.

## Self-Check: PASSED

- health.ts: FOUND
- health.test.ts: FOUND
- Commit 2f66fbd: FOUND
- Commit e4f3a9d: FOUND
