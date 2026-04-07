# Phase 23: Call Report & FRED Foundation - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix all Call Report revenue queries to return correct dollar amounts (not thousands) with trend, segmentation, and charter splits. Make FRED economic data complete and queryable as a national summary with rich history. This is the data foundation that Phases 24-27 and Hamilton reports depend on.

Requirements: CALL-01, CALL-02, CALL-03, CALL-04, CALL-05, CALL-06, FRED-01, FRED-02, FRED-03, FRED-04

</domain>

<decisions>
## Implementation Decisions

### Scaling Fix Strategy
- **D-01:** Apply `* 1000` multiplier directly in each SQL query (`SUM(service_charge_income * 1000)`). No wrapper functions, no DB views. Explicit and grep-able.
- **D-02:** For other financial fields (total_assets, total_deposits, total_loans), Claude checks actual data during research and applies scaling wherever the thousands convention applies.

### Revenue Query API Shape
- **D-03:** One function per requirement: `getRevenueTrend()`, `getRevenueByCharter()`, `getRevenueByTier()`, `getTopInstitutions()`, `getFeeIncomeRatio()`, etc. Matches existing codebase pattern in `crawler-db/`.
- **D-04:** Guiding principle for file organization and all implementation choices: accuracy, consistency, and value for Hamilton reports. Whatever produces the most accurate report and the most consistent data layer wins.

### FRED Summary Design
- **D-05:** FRED summary queries extend existing `src/lib/crawler-db/fed.ts` (currently ~100 lines, Beige Book only). All Fed/economic data in one file.
- **D-06:** National economic summary returns rich objects with current value + last 4 values + trend direction. Shape per indicator: `{ current: number, history: { date: string, value: number }[], trend: 'rising' | 'falling' | 'stable', asOf: string }`. Hamilton gets full context for analysis.
- **D-07:** CPI YoY computation approach (SQL window function vs TypeScript) is Claude's discretion -- pick whichever produces the most accurate, verifiable result.

### Test Coverage
- **D-08:** Reconciliation tests that verify mathematical consistency: sum of charter splits = national total, sum of tier segments = national total, scaled values match expected magnitudes. This catches the exact class of bugs (wrong scaling, double counting) that matter for report accuracy.

### Claude's Discretion
- D-02: Which financial fields beyond service_charge_income need the thousands scaling fix
- D-04: File organization (keep in call-reports.ts vs split) based on final line count and cohesion
- D-07: CPI YoY computation approach (SQL vs TypeScript)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data Layer
- `src/lib/crawler-db/call-reports.ts` -- Existing revenue queries (getRevenueTrend, getTopRevenueInstitutions) that need scaling fix
- `src/lib/crawler-db/call-reports.test.ts` -- Existing test file to extend with reconciliation tests
- `src/lib/crawler-db/fed.ts` -- Beige Book queries to extend with FRED summary functions
- `src/lib/crawler-db/fee-revenue.ts` -- Fee-revenue correlation queries that also need scaling fix
- `src/lib/crawler-db/financial.ts` -- InstitutionFinancial interface and stats queries
- `src/lib/crawler-db/connection.ts` -- DB connection pattern (getSql() for read, getWriteDb() for write)

### Requirements
- `.planning/REQUIREMENTS.md` -- CALL-01 through CALL-06, FRED-01 through FRED-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `call-reports.ts`: `getRevenueTrend()` (8-quarter trend with YoY) and `getTopRevenueInstitutions()` -- need scaling fix but structure is sound
- `fee-revenue.ts`: `getFeeRevenueData()` with charter/tier joins -- pattern for segmented queries
- `fed.ts`: `getLatestBeigeBook()`, `getBeigeBookEditions()`, `getBeigeBookHeadline()` -- patterns for Fed data queries
- `financial.ts`: `InstitutionFinancial` interface with all financial fields (roa, roe, efficiency_ratio, etc.)

### Established Patterns
- Template literal SQL with `postgres` client (no ORM)
- `getSql()` for read queries, `sql` tagged template for simpler queries
- Async functions returning typed interfaces
- Number coercion from Postgres string results (`Number(row.field)`)
- Try-catch with empty array fallback for query errors

### Integration Points
- `crawl_targets` table JOIN for charter_type, cert_number, asset_size_tier
- `institution_financials` table for all financial data
- `fed_economic_indicators` table for FRED data
- Hamilton tool layer (Phase 25) will consume these queries

</code_context>

<specifics>
## Specific Ideas

- Rich indicator objects with history enable Hamilton to make trend-aware analysis (e.g., "unemployment has been falling for 4 consecutive quarters")
- Reconciliation tests are specifically chosen because the failure mode is wrong numbers in executive reports -- the tests must catch scaling errors and double-counting
- 38,949 rows of Call Report data across 8 quarters (Q1 2024 - Q4 2025) already ingested
- 48,925 FRED rows already in DB
- Consumer sentiment (UMCSENT) may need ingestion if not yet present (FRED-02)

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 23-call-report-fred-foundation*
*Context gathered: 2026-04-07*
