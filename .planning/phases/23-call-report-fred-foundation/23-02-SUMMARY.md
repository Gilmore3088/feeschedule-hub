---
phase: 23-call-report-fred-foundation
plan: 02
subsystem: database
tags: [fred, economic-indicators, call-reports, typescript, python, vitest]

# Dependency graph
requires:
  - phase: 23-call-report-fred-foundation
    provides: fed_economic_indicators table populated with national + district FRED series
provides:
  - UMCSENT and PERMIT series in NATIONAL_SERIES ingestion list
  - 12 nonfarm payroll series (MANA-CANA) in DISTRICT_SERIES ingestion list
  - getDistrictEconomicSummary() returning unemployment + nonfarm payroll + YoY% for any Fed district
  - getDistrictFeeRevenue() aggregating service charge and noninterest income per district
  - fed.test.ts with 10 tests covering national summary, CPI YoY, district economic data
  - call-reports.test.ts extended with 5 tests for getDistrictFeeRevenue
affects: [hamilton-research, district-economic-outlook, executive-report, fee-revenue-correlation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DISTRICT_UNEMPLOYMENT_SERIES + DISTRICT_PAYROLL_SERIES constant maps keyed by district number"
    - "buildRichIndicator(seriesId, historyLimit) called with 13-month limit for YoY computation"
    - "nonfarm_yoy_pct = ((history[0] - history[12]) / history[12]) * 100"
    - "getDistrictFeeRevenue uses sql.unsafe for parameterized JOIN query across district boundary"

key-files:
  created:
    - fee_crawler/commands/ingest_fred.py (modified — UMCSENT, PERMIT, 12 nonfarm series)
    - src/lib/crawler-db/fed.test.ts
  modified:
    - fee_crawler/commands/ingest_fred.py
    - src/lib/crawler-db/fed.ts
    - src/lib/crawler-db/call-reports.ts
    - src/lib/crawler-db/call-reports.test.ts

key-decisions:
  - "DISTRICT_PAYROLL_SERIES uses {2-letter state}NA FRED naming convention (e.g. MANA = Massachusetts nonfarm all)"
  - "nonfarm_yoy_pct is computed at query time from 13-month history — not stored in DB"
  - "getDistrictFeeRevenue returns total_sc_income (RIAD4080 aggregate) as overdraft proxy per D-06"
  - "buildRichIndicator remains module-private; getDistrictEconomicSummary calls it directly"

patterns-established:
  - "Pattern 1: District series maps (unemployment + payroll) indexed by Fed district number 1-12"
  - "Pattern 2: YoY computation from ordered history array — history[0] current, history[12] prior year"

requirements-completed: [FRED-01, FRED-02, FRED-03, FRED-04]

# Metrics
duration: 12min
completed: 2026-04-08
---

# Phase 23 Plan 02: FRED Complete + District Economic Queries Summary

**UMCSENT + PERMIT + 12 nonfarm payroll series added to ingestion; getDistrictEconomicSummary() and getDistrictFeeRevenue() deliver district-level employment and fee revenue data for Hamilton.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-08T05:01:00Z
- **Completed:** 2026-04-08T05:13:43Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments

- Added `UMCSENT` (consumer sentiment) and `PERMIT` (housing permits) to `NATIONAL_SERIES` — next `ingest-fred` run populates both
- Added 12 nonfarm payroll series (`MANA` through `CANA`) to `DISTRICT_SERIES` — all 12 Fed districts now have unemployment + payroll coverage
- `getDistrictEconomicSummary(district)` returns unemployment rate, nonfarm payroll sparkline, and YoY% growth for any of the 12 districts
- `getDistrictFeeRevenue(district)` aggregates service charge income and other noninterest income per district from Call Reports
- 31 tests passing across `fed.test.ts` (10 tests) and `call-reports.test.ts` (21 tests including 5 new)
- CPI YoY correctness verified by test: result is ~3.2% not a raw index value of 315

## Task Commits

Each task was committed atomically:

1. **Task 1: Add UMCSENT + housing permits + nonfarm payroll series to FRED ingestion config** - `2264012` (feat)
2. **Task 2: Add getDistrictEconomicSummary(), getDistrictFeeRevenue(), and create fed.test.ts** - `05e4926` (feat)

## Files Created/Modified

- `fee_crawler/commands/ingest_fred.py` — Added UMCSENT + PERMIT to NATIONAL_SERIES; added 12 nonfarm payroll series to DISTRICT_SERIES (24 district entries total)
- `src/lib/crawler-db/fed.ts` — Added DISTRICT_UNEMPLOYMENT_SERIES, DISTRICT_PAYROLL_SERIES maps, DistrictEconomicSummary interface, getDistrictEconomicSummary() function
- `src/lib/crawler-db/fed.test.ts` — Created with 10 tests: national summary shape, null handling, UMCSENT presence, CPI YoY percentage validation, district economic summary shape, nonfarm YoY math, missing data handling
- `src/lib/crawler-db/call-reports.ts` — Added DistrictFeeRevenue interface and getDistrictFeeRevenue() function; fixed pre-existing missing try-catch in getRevenueTrend
- `src/lib/crawler-db/call-reports.test.ts` — Added getDistrictFeeRevenue import + 5 test cases; updated type imports

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing try-catch in getRevenueTrend**
- **Found during:** Task 2 (test run revealed pre-existing failure)
- **Issue:** `getRevenueTrend()` called `sql.unsafe(...)` without any error handling; test `returns empty trend on DB error` was already failing before this plan
- **Fix:** Wrapped entire function body in try-catch returning `{ quarters: [], latest: null }` on error — consistent with all other query functions in the file
- **Files modified:** `src/lib/crawler-db/call-reports.ts`
- **Commit:** `05e4926`

## Known Stubs

None — all functions query live data from `fed_economic_indicators`, `institution_financials`, and `crawl_targets`. No hardcoded or placeholder values.

## Threat Flags

None — no new network endpoints or auth paths introduced. `getDistrictFeeRevenue` aggregates admin-only data consistent with T-23-10 (accepted risk).

## Self-Check: PASSED

- FOUND: src/lib/crawler-db/fed.test.ts
- FOUND: src/lib/crawler-db/fed.ts
- FOUND: src/lib/crawler-db/call-reports.ts
- FOUND: fee_crawler/commands/ingest_fred.py
- FOUND commit: 2264012 (Task 1)
- FOUND commit: 05e4926 (Task 2)
