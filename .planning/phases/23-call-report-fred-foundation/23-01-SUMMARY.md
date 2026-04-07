---
phase: 23-call-report-fred-foundation
plan: 01
subsystem: crawler-db
tags: [call-reports, scaling, sql, tdd, revenue-data]
dependency_graph:
  requires: []
  provides:
    - getRevenueTrend (with * 1000 scaling)
    - getTopRevenueInstitutions (with * 1000 scaling)
    - getRevenueByCharter
    - getRevenueByTier
    - getFeeIncomeRatio
  affects:
    - Hamilton reports (revenue data foundation)
    - Any consumer of call-reports.ts exports
tech_stack:
  added: []
  patterns:
    - SQL * 1000 multiplier applied directly in query (not in JS wrapper)
    - sql.unsafe(query, [params]) positional param pattern for dynamic queries
    - TDD: RED tests written first, GREEN implementation passes all
key_files:
  created: []
  modified:
    - src/lib/crawler-db/call-reports.ts
    - src/lib/crawler-db/call-reports.test.ts
decisions:
  - "Apply * 1000 in SQL, not in JS wrappers -- aligns with D-01, single source of truth"
  - "fee_income_ratio is dimensionless (thousands/thousands cancel) -- not scaled"
  - "File kept under 300 lines (296) -- no split to call-reports-segmented.ts needed"
metrics:
  duration: 4m 13s
  completed: 2026-04-07T18:54:21Z
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 23 Plan 01: Call Report Revenue Query Fixes Summary

**One-liner:** Fixed all Call Report revenue queries to apply `* 1000` scaling in SQL and added four segmentation functions (charter, tier, fee-income ratio) with 38 passing unit + reconciliation tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix scaling in existing functions + add getRevenueByCharter | 1bbd412 | call-reports.ts, call-reports.test.ts |
| 2 | Add getRevenueByTier, getFeeIncomeRatio, and reconciliation tests | 5badf73 | call-reports.ts, call-reports.test.ts |

## What Was Built

### Fixed: * 1000 Scaling in Existing Functions

`getRevenueTrend()` — applied `* 1000` to `SUM(inf.service_charge_income)` for total, bank, and cu splits (3 SQL lines).

`getTopRevenueInstitutions()` — applied `* 1000` to both `inf.service_charge_income` and `inf.total_assets` in SELECT.

### New: getRevenueByCharter (CALL-03, CALL-04)

Returns charter-level (bank / credit_union) revenue aggregation for the latest quarter or a specified quarter. Uses positional `$1` parameter for optional quarter filter.

### New: getRevenueByTier (CALL-05)

Returns asset_size_tier-level revenue aggregation ordered by average total_assets ascending (community → mega).

### New: getFeeIncomeRatio (CALL-06)

Returns institution-level fee income ratio entries. Key design decision: `fee_income_ratio` is dimensionless (ratio of two thousands-denominated values) so it is NOT multiplied by 1000. `service_charge_income` and `total_revenue` ARE multiplied by 1000.

### New: Reconciliation Tests (D-08)

Three reconciliation tests verify:
1. Charter splits (bank + credit_union) sum to national total within 1 dollar tolerance
2. Tier splits (all tiers) sum to national total within 1 dollar tolerance
3. Scaled service_charge_income values are in plausible dollar ranges (> 1000, not raw thousands)

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all functions return real SQL query results; no hardcoded placeholders.

## Threat Flags

No new security surface introduced. All dynamic parameters use `$1` positional params via `sql.unsafe(query, [params])` as specified in T-23-01. No user input flows into these functions.

## Test Results

```
Test Files  1 passed (1)
     Tests  38 passed (38)
  Duration  ~125ms
```

## Self-Check: PASSED

- src/lib/crawler-db/call-reports.ts: FOUND (296 lines)
- src/lib/crawler-db/call-reports.test.ts: FOUND (38 tests, all passing)
- Commit 1bbd412: FOUND
- Commit 5badf73: FOUND
- `getRevenueTrend` exports with `* 1000` scaling: CONFIRMED (6 occurrences)
- `getTopRevenueInstitutions` exports with `* 1000`: CONFIRMED
- `getRevenueByCharter` exported: CONFIRMED
- `getRevenueByTier` exported: CONFIRMED
- `getFeeIncomeRatio` exported: CONFIRMED
- `fee_income_ratio` NOT multiplied by 1000 in SQL: CONFIRMED
- Reconciliation tests present: CONFIRMED
