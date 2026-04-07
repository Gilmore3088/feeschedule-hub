---
phase: 25-derived-analytics-hamilton-tools
plan: "01"
subsystem: data-layer
tags: [derived-analytics, call-reports, fdic, hamilton, postgresql]
dependency_graph:
  requires:
    - institution_financials table (Phase 23)
    - extracted_fees table (Phase 01)
    - crawl_targets table (Phase 01)
  provides:
    - getRevenueConcentration()
    - getFeeDependencyRatio()
    - getRevenuePerInstitution()
    - overdraft_revenue column in institution_financials
  affects:
    - Hamilton research agent (consumes these analytics)
    - Phase 25 Plan 02 (Hamilton tool integration)
tech_stack:
  added:
    - vitest (installed as dev dependency for TypeScript test runner)
  patterns:
    - sql.unsafe() with positional params for parameterized LIMIT
    - array_agg for per-institution value collection, percentiles in TypeScript
    - DISTINCT ON (crawl_target_id) ORDER BY report_date DESC for latest-record pattern
    - * 1000 scaling in TypeScript (not SQL) so mock data in thousands matches tests
key_files:
  created:
    - src/lib/crawler-db/derived.ts
    - src/lib/crawler-db/derived.test.ts
  modified:
    - scripts/migrate-schema.sql
    - fee_crawler/commands/ingest_fdic.py
    - src/lib/crawler-db/financial.ts
decisions:
  - "scale-in-typescript: Monetary fields (total_sc_income, sc_values, avg_sc) scaled * 1000 in TypeScript rather than SQL to keep mock data in natural thousands units matching DB storage convention"
  - "array-agg-percentile: Use array_agg to collect per-institution values and compute p25/p50/p75 in TypeScript rather than SQL percentile_cont() for portability across Postgres versions"
  - "cumulative-typescript: cumulative_pct computed via TypeScript reduce() rather than SQL window SUM() to avoid floating-point accumulation differences between test mocks and SQL"
  - "riad4070-graceful-null: RIAD4070 overdraft field not exposed by FDIC BankFind API; store NULL gracefully rather than block ingestion"
metrics:
  duration_minutes: 6
  completed_date: "2026-04-07"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 3
---

# Phase 25 Plan 01: Derived Analytics Data Layer Summary

Three cross-source derived analytics functions enabling Hamilton to make claims like "top 5 fee categories account for 72% of service charge income" from live pipeline data — plus overdraft_revenue schema column with graceful FDIC extraction.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Derived analytics functions + tests | 09f8b6f | src/lib/crawler-db/derived.ts, derived.test.ts |
| 2 | overdraft_revenue column + FDIC ingestion | 9b30ae1 | scripts/migrate-schema.sql, fee_crawler/commands/ingest_fdic.py, src/lib/crawler-db/financial.ts |

## What Was Built

### `src/lib/crawler-db/derived.ts`

Three exported async functions:

**`getRevenueConcentration(topN = 5)`** — Joins `extracted_fees` to `institution_financials` via `crawl_target_id`, groups by `fee_category`, and returns the top N categories ranked by total service charge contribution. SQL computes `share_pct` from a grand total CTE; `cumulative_pct` is accumulated in TypeScript via `reduce()`. Uses `sql.unsafe(query, [topN])` for parameterized LIMIT (per T-25-01 threat mitigation).

**`getFeeDependencyRatio(opts?)`** — Groups institution financials by `charter_type` + `asset_size_tier`, collecting `fee_income_ratio` values via `array_agg`. Percentiles (p25/median/p75) are computed in TypeScript from the sorted array. Overdraft breakdown (`overdraft_revenue`, `other_sc_income`, `overdraft_share`) is derived in TypeScript when `overdraft_revenue` is non-null. Optional charter/tier filters use safe parameterized clauses.

**`getRevenuePerInstitution()`** — Aggregates `service_charge_income` (in thousands) per charter+tier group using `array_agg` for TypeScript-side median computation. `avg_sc_income` and `median_sc_income` are scaled `* 1000` to dollars.

All three functions wrap in try/catch and return `[]` on error with `console.error` logging.

### Schema + Ingestion

- `institution_financials.overdraft_revenue BIGINT` added to CREATE TABLE (after `service_charge_income`)
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS overdraft_revenue BIGINT` for existing databases
- FDIC ingestion attempts extraction via `RIAD4070`, `RIAD4070a`, `IDRSSD4070` key variants; stores `NULL` when unavailable
- INSERT and ON CONFLICT DO UPDATE both include `overdraft_revenue`
- `InstitutionFinancial` TypeScript interface includes `overdraft_revenue: number | null`

## Test Results

21 vitest tests passing across 6 describe blocks:
- Type-level shape checks for all three interfaces
- `getRevenueConcentration`: structure, share_pct summation, monotonic cumulative_pct, N-row limit, parameterized unsafe call, error handling
- `getFeeDependencyRatio`: structure, * 1000 scaling, overdraft_share computation, null overdraft handling, charter filter, error handling
- `getRevenuePerInstitution`: structure, median computation, error handling, empty data

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vitest not installed**
- **Found during:** Task 1 RED phase
- **Issue:** `vitest` was not in `package.json` devDependencies; existing test files referenced it but it was not installed
- **Fix:** `npm install --save-dev vitest vite-tsconfig-paths`
- **Files modified:** package.json, package-lock.json
- **Commit:** included in Task 1 commit

**2. [Rule 1 - Bug] WHERE clause reference in getFeeDependencyRatio subquery**
- **Found during:** Task 1 implementation
- **Issue:** Plan's WHERE clause template used `ifin.` prefix which doesn't apply on the outer query after the subquery alias; rewritten to use clean `extraWhere` pattern appended to the outer query's WHERE
- **Fix:** Replaced string-replace approach with `filterClauses` array building pattern
- **Commit:** included in Task 1 commit

**3. [Rule 1 - Bug] Scaling convention mismatch in getRevenuePerInstitution**
- **Found during:** Task 1 GREEN phase
- **Issue:** SQL `array_agg(service_charge_income * 1000)` would return dollars, but test mocks provide thousands values and expect `* 1000` in TypeScript
- **Fix:** SQL returns raw thousands via `array_agg(service_charge_income)`; TypeScript multiplies by 1000 — consistent with `getFeeDependencyRatio` pattern and test mock convention

## Known Stubs

None. All three functions are fully wired to SQL queries. `overdraft_revenue` will be NULL for most FDIC records until RIAD4070 becomes available in the API — this is expected and documented.

## Threat Flags

No new threat surface introduced. All queries follow T-25-01 mitigation (parameterized via `sql.unsafe(query, params)`). No user input reaches derived.ts SQL directly.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/lib/crawler-db/derived.ts exists | FOUND |
| src/lib/crawler-db/derived.test.ts exists | FOUND |
| 25-01-SUMMARY.md exists | FOUND |
| Commit 09f8b6f (Task 1) exists | FOUND |
| Commit 9b30ae1 (Task 2) exists | FOUND |
| 21 vitest tests passing | PASSED |
