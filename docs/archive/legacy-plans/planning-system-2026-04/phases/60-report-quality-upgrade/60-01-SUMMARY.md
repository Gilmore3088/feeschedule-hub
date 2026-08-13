---
phase: 60-report-quality-upgrade
plan: 01
subsystem: data-layer
tags: [call-reports, thousands-scaling, financial-data, bug-fix]
dependency_graph:
  requires: []
  provides: [correct-dollar-values]
  affects: [report-engine, hamilton-agents, institution-pages, district-pages]
tech_stack:
  added: []
  patterns: [dollarOrNull-helper, THOUSANDS-constant]
key_files:
  created:
    - src/lib/crawler-db/financial.test.ts
  modified:
    - src/lib/crawler-db/financial.ts
    - src/lib/crawler-db/call-reports.ts
    - src/lib/crawler-db/call-reports.test.ts
decisions:
  - "Fix at query layer (not display layer) so all downstream consumers get correct values"
  - "Export dollarOrNull as _dollarOrNull_FOR_TESTING for direct unit testing"
  - "Module-level numOrNull and dollarOrNull in financial.ts (removed local function)"
metrics:
  duration: 5m02s
  completed: 2026-04-12T01:34:33Z
  tasks_completed: 2
  tasks_total: 2
  files_changed: 4
  tests_added: 18
---

# Phase 60 Plan 01: Call Report Thousands Scaling Fix Summary

Fix FDIC/NCUA Call Report thousands-scaling bug so dollar-denominated financial data returns actual dollars, not the raw thousands convention stored in the database.

## What Changed

### Task 1: Fix thousands scaling in financial.ts (TDD)

Added `THOUSANDS = 1000` constant and `dollarOrNull` helper function that wraps `numOrNull` with `* THOUSANDS` multiplication. Applied `dollarOrNull` to all dollar-denominated columns in `getFinancialsByInstitution()`: total_assets, total_deposits, total_loans, service_charge_income, other_noninterest_income, total_revenue, overdraft_revenue. Left ratio columns (roa, roe, net_interest_margin, efficiency_ratio, tier1_capital_ratio, fee_income_ratio) and count columns (branch_count, employee_count, member_count) unchanged using `numOrNull`. Also multiplied `avg_service_charge` by THOUSANDS in `getRevenueIndexByDate()`.

- **Commit:** c813b5c
- **Tests:** 11 tests (5 dollarOrNull unit tests, 4 getFinancialsByInstitution scaling tests, 2 getRevenueIndexByDate tests)

### Task 2: Fix thousands scaling in call-reports.ts (TDD)

Added `THOUSANDS = 1000` constant. Applied `* THOUSANDS` to all dollar-denominated return fields across 5 functions:
- `getRevenueTrend()`: total_service_charges, bank_service_charges, cu_service_charges
- `getTopRevenueInstitutions()`: service_charge_income, total_assets
- `getInstitutionRevenueTrend()`: service_charge_income (both current and prior year for YoY)
- `getDistrictFeeRevenue()`: total_sc_income, avg_sc_income, total_other_noninterest
- `getRevenueByTier()`: total_sc_income, avg_sc_income

Updated 4 pre-existing tests to expect scaled values. Added 7 new scaling tests.

- **Commit:** 1a980c3
- **Tests:** 43 total (7 new scaling tests, 4 updated pre-existing tests)

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx vitest run src/lib/crawler-db/financial.test.ts` -- 11/11 pass
- `npx vitest run src/lib/crawler-db/call-reports.test.ts` -- 43/43 pass
- Full suite: 6 pre-existing failures in unrelated files (hamilton types/voice, fees computeStats, research agents model name, report-engine integration) -- none caused by this plan

## Self-Check: PASSED

- All 4 files exist on disk
- Both commits (c813b5c, 1a980c3) present in git log
- THOUSANDS constant present in both financial.ts (3 occurrences) and call-reports.ts (13 occurrences)
- dollarOrNull helper present in financial.ts (9 occurrences)
