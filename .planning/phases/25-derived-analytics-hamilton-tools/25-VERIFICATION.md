---
phase: 25-derived-analytics-hamilton-tools
verified: 2026-04-07T14:45:00Z
status: gaps_found
score: 3/4
overrides_applied: 0
gaps:
  - truth: "Fee dependency ratio is queryable by charter type and asset tier with overdraft vs other SC breakdown"
    status: partial
    reason: "getFeeDependencyRatio correctly queries and computes overdraft breakdown in TypeScript, but the overdraft_revenue column is absent from the actual database schema (scripts/migrate-schema.sql CREATE TABLE has no overdraft_revenue column, no ALTER TABLE migration exists) and the FDIC ingestion (fee_crawler/commands/ingest_fdic.py) does not extract or store overdraft_revenue. The column only exists in the TypeScript InstitutionFinancial interface. At runtime, overdraft_revenue will always be NULL because the DB column does not exist."
    artifacts:
      - path: "scripts/migrate-schema.sql"
        issue: "institution_financials CREATE TABLE missing overdraft_revenue BIGINT column. No ALTER TABLE ADD COLUMN IF NOT EXISTS overdraft_revenue migration found."
      - path: "fee_crawler/commands/ingest_fdic.py"
        issue: "No overdraft_revenue in INSERT column list, VALUES tuple, or ON CONFLICT DO UPDATE SET clause. The RIAD4070 extraction attempt required by plan is absent."
    missing:
      - "Add overdraft_revenue BIGINT after service_charge_income in institution_financials CREATE TABLE in scripts/migrate-schema.sql"
      - "Add ALTER TABLE institution_financials ADD COLUMN IF NOT EXISTS overdraft_revenue BIGINT; in the migrations section of migrate-schema.sql"
      - "Add overdraft_revenue extraction from FDIC API response in ingest_fdic.py (RIAD4070 attempt, NULL if unavailable)"
      - "Add overdraft_revenue to the INSERT column list, VALUES tuple, and ON CONFLICT DO UPDATE SET in ingest_fdic.py"
---

# Phase 25: Derived Analytics & Hamilton Tools — Verification Report

**Phase Goal:** Cross-source derived metrics are computed and Hamilton can access all summary data (Call Reports, FRED, Beige Book, health, derived) through its existing tool/query layer
**Verified:** 2026-04-07T14:45:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Revenue concentration analysis returns top N fee categories with share percentages that sum correctly | VERIFIED | `src/lib/crawler-db/derived.ts` exports `getRevenueConcentration(topN)` with CTE-based SQL join, cumulative_pct computed via TypeScript reduce. 21/21 unit tests pass. |
| 2 | Fee dependency ratio is queryable by charter type and asset tier with overdraft vs other SC breakdown | PARTIAL | `getFeeDependencyRatio()` query logic and TypeScript overdraft computation are correct, but `overdraft_revenue` column is absent from `scripts/migrate-schema.sql` and `fee_crawler/commands/ingest_fdic.py`. Column only exists in TypeScript interface — the DB has no such column, so `overdraft_revenue` will always be NULL at runtime. |
| 3 | Revenue per institution averages are computed by asset tier and charter with correct dollar scaling | VERIFIED | `getRevenuePerInstitution()` uses `array_agg` + TypeScript median computation, scales * 1000. Tests pass. |
| 4 | Hamilton can call tools that return all national summary data (Call Report trends, FRED summary, Beige Book summaries, health metrics, derived analytics) and incorporate them into analysis | VERIFIED | `queryNationalData` tool added to `buildHamiltonTools()` in `hamilton-agent.ts`. Imports all five data sources. Section enum enforced via Zod. Legacy agent IDs (ask, fee-analyst, content-writer, custom-query) all route to Hamilton via `agents.ts`. System prompt updated with tool usage guidance. |

**Score:** 3/4 truths verified (SC-2 is partial — implementation exists but schema/ingestion gap prevents runtime data)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/crawler-db/derived.ts` | Three derived analytics functions | VERIFIED | Exports `getRevenueConcentration`, `getFeeDependencyRatio`, `getRevenuePerInstitution` with all required interfaces. 283 lines, substantive. |
| `src/lib/crawler-db/derived.test.ts` | Unit tests for all three functions | VERIFIED | 21 tests across 6 describe blocks. Tests cover structure, scaling, monotonic cumulative_pct, error handling. All pass. |
| `scripts/migrate-schema.sql` | overdraft_revenue column on institution_financials | STUB | `institution_financials` CREATE TABLE (line 137-160) has no `overdraft_revenue` column. No ALTER TABLE migration found. Column is absent from the schema entirely. |
| `src/lib/hamilton/hamilton-agent.ts` | queryNationalData tool in buildHamiltonTools | VERIFIED | Tool defined, imports all five data sources, returned in tool set, system prompt updated. |
| `src/lib/research/agents.ts` | Legacy agents consolidated to route through Hamilton | VERIFIED | All four legacy agent IDs map to `buildHamiltonAgent()`. Legacy prompt builders (`buildAskPrompt` etc.) are absent. `getAgent`, `getPublicAgents`, `getAdminAgents` exports preserved. |
| `fee_crawler/commands/ingest_fdic.py` | overdraft_revenue in INSERT and ON CONFLICT | STUB | No `overdraft_revenue` found anywhere in ingest_fdic.py. RIAD4070 extraction not implemented. |
| `src/lib/crawler-db/financial.ts` | overdraft_revenue field in InstitutionFinancial interface | VERIFIED | Field present in interface (line 11), SELECT query (line 65), and return mapping (line 94). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/hamilton/hamilton-agent.ts` | `src/lib/crawler-db/derived.ts` | import getRevenueConcentration, getFeeDependencyRatio, getRevenuePerInstitution | WIRED | Line 19: `import { getRevenueConcentration, getFeeDependencyRatio, getRevenuePerInstitution } from "@/lib/crawler-db/derived"` |
| `src/lib/hamilton/hamilton-agent.ts` | `src/lib/crawler-db/call-reports.ts` | import getRevenueTrend | WIRED | Line 16: `import { getRevenueTrend } from "@/lib/crawler-db/call-reports"` |
| `src/lib/hamilton/hamilton-agent.ts` | `src/lib/crawler-db/fed.ts` | import getNationalEconomicSummary, getNationalBeigeBookSummary | WIRED | Line 17: imports both functions, called in queryNationalData execute block |
| `src/lib/hamilton/hamilton-agent.ts` | `src/lib/crawler-db/health.ts` | import getIndustryHealthMetrics | WIRED | Line 18: import confirmed, called in load("health", ...) |
| `src/lib/crawler-db/derived.ts` | `institution_financials` | SQL with * 1000 scaling | PARTIAL | SQL correctly uses `service_charge_income * 1000` and references `overdraft_revenue`, but the `overdraft_revenue` column does not exist in the actual schema — runtime query will fail or return NULL. |
| `src/lib/crawler-db/derived.ts` | `src/lib/crawler-db/fed.ts` | RichIndicator and deriveTrend imports | NOT_WIRED | Plan 01 specified this link but derived.ts does not import from fed.ts. The plan was speculative — derived.ts computes cumulative_pct via TypeScript reduce (simpler, correct approach). This deviation does not block the goal. |
| `src/lib/research/agents.ts` | `src/lib/hamilton/hamilton-agent.ts` | buildHamiltonTools, buildHamiltonSystemPrompt | WIRED | Line 2: import confirmed. Both functions called in buildHamiltonAgent(). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `getRevenueConcentration` | SQL rows from `extracted_fees JOIN institution_financials` | DB query via `sql.unsafe()` | Yes — real join query | FLOWING (pending DB having data) |
| `getFeeDependencyRatio` | `overdraft_revenue` from `institution_financials` | DB column does not exist in schema | No — column missing from schema | DISCONNECTED for overdraft fields; SC income fields flow correctly |
| `queryNationalData` in hamilton-agent | result from all five data sources | Five DB query functions called in parallel | Yes — each source calls real DB queries | FLOWING (data availability depends on DB population) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| derived.test.ts suite | `npx vitest run src/lib/crawler-db/derived.test.ts` | 21/21 tests pass | PASS |
| TypeScript production code compiles | `npx tsc --noEmit` (non-test files) | 0 errors in production files | PASS |
| queryNationalData in hamilton-agent.ts | grep queryNationalData | Tool definition found, returned in tool set | PASS |
| Legacy agents absent | grep buildAskPrompt agents.ts | No matches — legacy builders removed | PASS |
| Schema has overdraft_revenue | grep in migrate-schema.sql | No matches | FAIL |
| FDIC ingestion has overdraft_revenue | grep in ingest_fdic.py | No matches | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DERIVE-01 | 25-01 | Revenue concentration analysis (% of total SC income from top N categories) | SATISFIED | `getRevenueConcentration()` in derived.ts, tested, wired into Hamilton queryNationalData |
| DERIVE-02 | 25-01 | Fee dependency ratio (SC income / total revenue) by charter, tier | PARTIAL | `getFeeDependencyRatio()` logic is correct; overdraft breakdown is hollow at runtime because schema column is missing |
| DERIVE-03 | 25-01 | Revenue per institution averages by asset tier and charter | SATISFIED | `getRevenuePerInstitution()` in derived.ts, tested, wired into Hamilton |
| ADMIN-05 | 25-02 | Hamilton can access all summary data via existing tool/query layer | SATISFIED | `queryNationalData` tool provides all five sections; legacy agent consolidation complete |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/migrate-schema.sql` | 137-160 | Missing column in CREATE TABLE (overdraft_revenue) | Blocker | `getFeeDependencyRatio` will return NULL for overdraft fields at runtime; schema inconsistent with TypeScript interface |
| `fee_crawler/commands/ingest_fdic.py` | ~168-190 | Missing column in INSERT/ON CONFLICT | Blocker | FDIC ingestion will not store overdraft_revenue even if column is added to schema; data will remain NULL |

### Human Verification Required

None. All verifiable behaviors confirmed programmatically.

### Gaps Summary

One gap blocks full DERIVE-02 achievement: the `overdraft_revenue` column was added to the TypeScript `InstitutionFinancial` interface and referenced in `derived.ts` SQL queries, but the underlying database schema (`scripts/migrate-schema.sql`) was never updated and neither was the FDIC Python ingestion script (`fee_crawler/commands/ingest_fdic.py`).

The effect: `getFeeDependencyRatio()` will query `overdraft_revenue` from a column that does not exist in the DB, causing the query to fail (Postgres will throw "column overdraft_revenue does not exist") or return NULL for every institution. The TypeScript error handler will catch the failure and return an empty array. The overdraft breakdown (`overdraft_share`, `other_sc_income`) that is central to DERIVE-02's goal — "overdraft fees represent 63% of service charge revenue for community banks" — will never work.

The key_link from `derived.ts` to `fed.ts` (via deriveTrend/RichIndicator imports) was listed in Plan 01 but the implementation correctly avoided this dependency — cumulative_pct is simpler to compute in TypeScript without deriveTrend. This is not a gap.

All other goals are achieved: three functions exported and tested, Hamilton has `queryNationalData` with all five data sections, legacy agent consolidation is complete, TypeScript compiles cleanly.

**Root cause of gap:** Plan 25-01 Task 2 targeted two files (`scripts/migrate-schema.sql` and `fee_crawler/commands/ingest_fdic.py`) for the overdraft_revenue changes. The Summary for Plan 01 is absent (only Plan 02 summary exists), suggesting Task 2 of Plan 01 was either not executed or its changes were not committed.

---

_Verified: 2026-04-07T14:45:00Z_
_Verifier: Claude (gsd-verifier)_
