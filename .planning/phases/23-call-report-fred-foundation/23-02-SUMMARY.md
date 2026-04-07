---
phase: 23-call-report-fred-foundation
plan: "02"
subsystem: economic-data
tags: [fred, economic-indicators, typescript, unit-tests, python-config]
dependency_graph:
  requires: []
  provides: [getNationalEconomicSummary, getDistrictUnemployment, RichIndicator, fed.test.ts]
  affects: [src/lib/crawler-db/fed.ts, fee_crawler/commands/ingest_fred.py, fee_crawler/config.py]
tech_stack:
  added: []
  patterns: [rich-indicator-shape, trend-derivation, parallel-promise-all, tdd-red-green]
key_files:
  created:
    - src/lib/crawler-db/fed.test.ts
  modified:
    - src/lib/crawler-db/fed.ts
    - fee_crawler/commands/ingest_fred.py
    - fee_crawler/config.py
decisions:
  - CPI YoY computed in TypeScript via 13-row fetch (index 0 vs index 12), not stored as a series -- prevents raw index values from flowing into reports
  - deriveTrend uses 0.5% threshold to distinguish signal from noise in economic rates
  - getNationalEconomicSummary runs all four indicators in parallel via Promise.all for performance
  - getFredSummary preserved unchanged for backward compatibility with existing dashboard consumers
metrics:
  duration_minutes: 15
  completed_date: "2026-04-07"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 3
---

# Phase 23 Plan 02: FRED Economic Summary Foundation Summary

FRED data layer extended with trend-aware RichIndicator objects per D-06 shape: getNationalEconomicSummary returns current/history/trend/asOf per indicator, getDistrictUnemployment returns per-district unemployment Map, UMCSENT added to Python ingestion pipeline, and full unit test coverage in fed.test.ts.

## What Was Built

### Task 1: UMCSENT ingestion config + test scaffold (FRED-01, FRED-02)

Added `"UMCSENT"` (University of Michigan Consumer Sentiment) to:
- `fee_crawler/commands/ingest_fred.py` — `NATIONAL_SERIES` list
- `fee_crawler/config.py` — `FREDConfig.series` list

Created `src/lib/crawler-db/fed.test.ts` with 18 vitest tests covering:
- `getFredSummary` backward compatibility (5 tests)
- `getNationalEconomicSummary` (9 tests)
- `getDistrictUnemployment` (4 tests)

### Task 2: getNationalEconomicSummary + getDistrictUnemployment (FRED-03, FRED-04)

Extended `src/lib/crawler-db/fed.ts` with:

**New interfaces:**
- `RichIndicator` — `{ current, history[], trend, asOf }` per D-06
- `NationalEconomicSummary` — four keyed RichIndicator fields

**New private helpers:**
- `deriveTrend(current, history)` — 'rising' / 'falling' / 'stable' at 0.5% threshold
- `fetchRichIndicator(seriesId)` — fetches last 5 observations, builds RichIndicator
- `fetchCpiYoyIndicator()` — fetches 17 CPI rows, computes YoY at up to 4 points via TypeScript

**New exports:**
- `getNationalEconomicSummary()` — parallel fetch of all four indicators
- `getDistrictUnemployment()` — DISTINCT ON query returning `Map<number, number>`

**Preserved:** `getFredSummary()` unchanged for backward compatibility.

## Verification

All plan success criteria met:

```
npx vitest run src/lib/crawler-db/fed.test.ts
  Tests  18 passed (18)
```

```
grep "UMCSENT" fee_crawler/commands/ingest_fred.py  → found
grep "UMCSENT" fee_crawler/config.py                → found
grep "getNationalEconomicSummary" src/lib/crawler-db/fed.ts → found
grep "getDistrictUnemployment" src/lib/crawler-db/fed.ts    → found
grep "RichIndicator" src/lib/crawler-db/fed.ts              → found (interface + 4 usages)
grep "getFredSummary" src/lib/crawler-db/fed.ts             → found (backward compat)
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | b9289a8 | feat(23-02): add UMCSENT to FRED ingestion config and scaffold fed.test.ts |
| Task 2 | 89104ae | feat(23-02): add getNationalEconomicSummary and getDistrictUnemployment to fed.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All functions query real DB tables (`fed_economic_indicators`) with proper SQL. No placeholder returns or hardcoded mock data flows to UI.

## Threat Flags

None. All SQL uses `sql` tagged template literals with parameterized `${value}` interpolation per T-23-03 mitigation. No new network endpoints or auth paths introduced.

## Self-Check: PASSED

- `src/lib/crawler-db/fed.ts` — FOUND (modified, 257 lines with new exports)
- `src/lib/crawler-db/fed.test.ts` — FOUND (created, 319 lines, 18 tests)
- `fee_crawler/commands/ingest_fred.py` — FOUND (UMCSENT in NATIONAL_SERIES)
- `fee_crawler/config.py` — FOUND (UMCSENT in FREDConfig.series)
- Commit b9289a8 — FOUND (Task 1)
- Commit 89104ae — FOUND (Task 2)
