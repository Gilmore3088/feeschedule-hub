---
phase: 23-call-report-fred-foundation
verified: 2026-04-07T12:05:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 23: Call Report & FRED Foundation Verification Report

**Phase Goal:** All Call Report revenue queries return correct dollar amounts with trend, segmentation, and charter splits; FRED economic data is complete and queryable as a national summary
**Verified:** 2026-04-07T12:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Querying service charge income returns dollar amounts (not thousands) matching Call Report filings | VERIFIED | `* 1000` appears 11 times in `call-reports.ts`; all monetary SQL selects multiply stored thousands |
| 2 | A YoY revenue trend query returns 8 quarters of data with computed growth rates | VERIFIED | `getRevenueTrend(quarterCount = 8)` with `yoy_change_pct` computed via index i vs i+4 comparison |
| 3 | Revenue can be split by bank vs credit union and by asset tier, with correct totals that reconcile to national aggregate | VERIFIED | `getRevenueByCharter()` and `getRevenueByTier()` both exist; reconciliation tests assert charter and tier sums equal national total within 1 dollar tolerance |
| 4 | A national economic summary returns fed funds rate, unemployment rate, CPI YoY (not raw index), and consumer sentiment with current values | VERIFIED | `getNationalEconomicSummary()` returns `RichIndicator` per key; CPI computed via TypeScript (rows[0].value vs rows[12].value / prior * 100); test confirms value < 50 (not raw index > 100) |
| 5 | District-level economic indicators are queryable (at minimum unemployment per district) | VERIFIED | `getDistrictUnemployment()` returns `Map<number, number>` keyed by district; queries `fed_economic_indicators WHERE series_id LIKE '%UR'` |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `src/lib/crawler-db/call-reports.ts` | All Call Report revenue query functions | VERIFIED | 296 lines; exports `getRevenueTrend`, `getTopRevenueInstitutions`, `getRevenueByCharter`, `getRevenueByTier`, `getFeeIncomeRatio` and all interfaces |
| `src/lib/crawler-db/call-reports.test.ts` | Unit + reconciliation tests for all Call Report functions | VERIFIED | 38 tests pass; contains `describe("Reconciliation"` with charter-sum, tier-sum, and plausible-range tests |
| `src/lib/crawler-db/fed.ts` | FRED economic summary and district unemployment functions | VERIFIED | 401 lines; exports `getFredSummary`, `getNationalEconomicSummary`, `getDistrictUnemployment`, `RichIndicator`, `NationalEconomicSummary` |
| `src/lib/crawler-db/fed.test.ts` | Unit tests for FRED summary functions | VERIFIED | 18 tests pass; contains `describe("getNationalEconomicSummary"` and `describe("getDistrictUnemployment"` |
| `fee_crawler/commands/ingest_fred.py` | UMCSENT added to NATIONAL_SERIES | VERIFIED | Line 28: `"UMCSENT",  # University of Michigan Consumer Sentiment (monthly)` |
| `fee_crawler/config.py` | UMCSENT added to FREDConfig.series | VERIFIED | Line 70: `"UMCSENT",  # Consumer Sentiment (monthly)` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `call-reports.ts` | `institution_financials` | SQL with `* 1000` scaling | WIRED | `SUM(inf.service_charge_income * 1000)` confirmed in `getRevenueTrend`, `getRevenueByCharter`, `getRevenueByTier`; `inf.service_charge_income * 1000` in `getTopRevenueInstitutions` and `getFeeIncomeRatio` |
| `call-reports.ts` | `crawl_targets` | `JOIN crawl_targets ct ON ct.id = inf.crawl_target_id` | WIRED | JOIN present in all 4 segmentation queries; provides `charter_type`, `asset_size_tier`, `cert_number` |
| `fed.ts` | `fed_economic_indicators` | SQL queries for FEDFUNDS, UNRATE, CPIAUCSL, UMCSENT | WIRED | `fetchRichIndicator()` queries `WHERE series_id = ${seriesId}`; `fetchCpiYoyIndicator()` queries `WHERE series_id = 'CPIAUCSL'`; `getDistrictUnemployment()` queries `WHERE series_id LIKE '%UR'` |
| `fee_crawler/commands/ingest_fred.py` | FRED API | UMCSENT series ingestion | WIRED | `"UMCSENT"` in `NATIONAL_SERIES` list at line 28 |

### Data-Flow Trace (Level 4)

These are DB query functions, not React components. Data flow is SQL query → mapped TypeScript object returned to caller. No rendering layer to trace.

| Function | Data Source | Produces Real Data | Status |
|----------|-------------|-------------------|--------|
| `getRevenueTrend` | `institution_financials` via `sql.unsafe` | Yes — `SUM(service_charge_income * 1000)` with GROUP BY quarter | FLOWING |
| `getRevenueByCharter` | `institution_financials JOIN crawl_targets` | Yes — aggregated by `charter_type` | FLOWING |
| `getRevenueByTier` | `institution_financials JOIN crawl_targets` | Yes — aggregated by `asset_size_tier` | FLOWING |
| `getFeeIncomeRatio` | `institution_financials JOIN crawl_targets` | Yes — institution-level rows ordered by ratio | FLOWING |
| `getTopRevenueInstitutions` | `institution_financials JOIN crawl_targets` | Yes — filtered to latest `report_date`, ordered by income | FLOWING |
| `getNationalEconomicSummary` | `fed_economic_indicators` | Yes — 4 parallel fetches via `sql` tagged template | FLOWING |
| `getDistrictUnemployment` | `fed_economic_indicators` | Yes — DISTINCT ON query returning Map | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| call-reports: all 38 unit + reconciliation tests pass | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | 38 passed (143ms) | PASS |
| fed: all 18 unit tests pass | `npx vitest run src/lib/crawler-db/fed.test.ts` | 18 passed (112ms) | PASS |
| call-reports.ts * 1000 scaling count | `grep -c "* 1000" call-reports.ts` | 11 occurrences | PASS |
| fee_income_ratio not scaled | `grep "fee_income_ratio" call-reports.ts \| grep -v "* 1000"` | Only interface/WHERE/ORDER/mapping lines — no `* 1000` on the ratio field | PASS |
| UMCSENT in ingest_fred.py | `grep UMCSENT fee_crawler/commands/ingest_fred.py` | Line 28 found | PASS |
| UMCSENT in config.py | `grep UMCSENT fee_crawler/config.py` | Line 70 found | PASS |
| All 4 plan commits exist | `git log --oneline --all` | 1bbd412, 5badf73, b9289a8, 89104ae all found | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CALL-01 | Plan 01 | Revenue queries return correct dollar amounts (fix thousands scaling) | SATISFIED | `* 1000` applied in SQL for all monetary fields in all 5 functions |
| CALL-02 | Plan 01 | YoY revenue trend available for last 8 quarters with growth rate | SATISFIED | `getRevenueTrend(quarterCount = 8)` defaults to 8 quarters; `yoy_change_pct` computed by comparing quarter i to quarter i+4 |
| CALL-03 | Plan 01 | Bank vs credit union revenue split queryable | SATISFIED | `getRevenueByCharter()` groups by `charter_type`, returns bank and credit_union rows |
| CALL-04 | Plan 01 | Top institutions by service charge income with name, assets, charter | SATISFIED | `getTopRevenueInstitutions()` returns `cert_number`, `institution_name`, `charter_type`, `service_charge_income`, `total_assets` all scaled |
| CALL-05 | Plan 01 | Fee income ratio (service charges / total revenue) computed per institution | SATISFIED | `getFeeIncomeRatio()` returns institution-level rows with `fee_income_ratio` (dimensionless, not scaled), `service_charge_income`, `total_revenue` |
| CALL-06 | Plan 01 | Revenue segmented by asset tier (community, mid-size, regional, large, mega) | SATISFIED | `getRevenueByTier()` groups by `asset_size_tier`, ordered by avg total_assets ascending |
| FRED-01 | Plan 02 | CPI year-over-year change computed correctly (not raw index) | SATISFIED | `fetchCpiYoyIndicator()` fetches 17 rows, computes `((latest - prior) / prior) * 100`; test confirms value < 50 |
| FRED-02 | Plan 02 | Consumer sentiment (UMCSENT) available — ingest if missing | SATISFIED | UMCSENT added to `NATIONAL_SERIES` in `ingest_fred.py` and `FREDConfig.series` in `config.py` |
| FRED-03 | Plan 02 | National economic summary available (fed funds rate, unemployment, CPI YoY, sentiment) | SATISFIED | `getNationalEconomicSummary()` returns `NationalEconomicSummary` with all four `RichIndicator` fields |
| FRED-04 | Plan 02 | District-level economic indicators queryable (per-district unemployment) | SATISFIED | `getDistrictUnemployment()` returns `Map<number, number>` for districts with unemployment data |

All 10 requirements claimed by Phase 23 plans are satisfied.

**Orphaned requirements check:** REQUIREMENTS.md maps CALL-01 through CALL-06 and FRED-01 through FRED-04 to Phase 23. All 10 are accounted for in plans and verified above. No orphaned requirements.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `call-reports.ts` | `console.warn` on DB errors (4 occurrences) | Info | Intentional server-side error logging per threat model T-23-02; not debug statements |

No TODO/FIXME/placeholder comments, empty implementations, or hardcoded stub data found in any phase 23 files.

### Human Verification Required

None. All phase deliverables are pure TypeScript/Python data-layer modules with comprehensive unit tests. No UI components, visual output, or external service integration requiring human observation.

### Gaps Summary

No gaps. All 5 roadmap success criteria are verified against actual code. All 10 requirements are satisfied by substantive, wired implementations. Both test suites (38 + 18 = 56 tests total) pass. All 4 commits exist in git history.

---

_Verified: 2026-04-07T12:05:00Z_
_Verifier: Claude (gsd-verifier)_
