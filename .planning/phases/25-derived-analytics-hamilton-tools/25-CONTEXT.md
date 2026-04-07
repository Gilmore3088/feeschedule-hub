# Phase 25: Derived Analytics & Hamilton Tools - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Compute cross-source derived metrics (revenue concentration, fee dependency with overdraft granularity, revenue-per-institution). Wire ALL national summary data into Hamilton's tool layer. Consolidate legacy agents into Hamilton as the single universal agent.

Requirements: DERIVE-01, DERIVE-02, DERIVE-03, ADMIN-05

</domain>

<decisions>
## Implementation Decisions

### Derived Analytics Placement
- **D-01:** New file `src/lib/crawler-db/derived.ts` for derived analytics. Cross-source nature (fees + financials + Call Reports) makes it a distinct domain from `fee-revenue.ts`.

### Revenue Concentration (DERIVE-01)
- **D-02:** `getRevenueConcentration(topN = 5)` takes configurable N parameter. Returns top N fee categories by total revenue share + cumulative percentage. Hamilton can request top 3, 5, or 10 depending on report context.

### Fee Dependency with Overdraft Granularity (DERIVE-02)
- **D-03:** Extend FDIC/NCUA ingestion to capture overdraft-specific revenue (RIAD4070 from Call Reports) as a new `overdraft_revenue` column in `institution_financials`. This provides genuine granularity: overdraft revenue vs other service charge revenue vs total revenue.
- **D-04:** Fee dependency ratio returns aggregate ratios by charter + tier with distribution stats (median, P25/P75). Breaks down service charge income into overdraft revenue and other fee revenue components.

### Hamilton Tool Wiring (ADMIN-05)
- **D-05:** Single `queryNationalData` tool with a `section` parameter (`callReports | fred | beigeBook | health | derived | all`). Hamilton calls with `section='all'` for full picture or targeted sections. Clean, discoverable.
- **D-06:** Tool returns full RichIndicator objects with history + trend. Hamilton has the context to make trend-aware claims. Token cost is acceptable for report quality.

### Hamilton Consolidation
- **D-07:** Full consolidation: remove all legacy agent definitions, merge all tools into Hamilton as the single universal agent. No dead ends, no legacy agents. Hamilton is THE consulting guru, data analyst, and chart creator.

### Service Charge Revenue Granularity
- **D-08:** Service charge income must NOT be treated as one monolithic number. Reports need to clearly break up: overdraft revenue (RIAD4070), other service charges, and total service charge income. This granularity flows through to all derived analytics and Hamilton's tool responses.

### Carrying Forward from Phases 23-24
- **D-09:** `* 1000` scaling at SQL level for monetary fields
- **D-10:** One function per requirement pattern
- **D-11:** RichIndicator shape for time-series data
- **D-12:** Accuracy, consistency, value for Hamilton reports

### Claude's Discretion
- Test file organization (derived.test.ts or combined)
- Exact FDIC field name for overdraft revenue (likely RIAD4070 or similar)
- How to handle legacy agent file cleanup (rename, delete, or deprecate)
- Tool Zod schema design details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Hamilton Tool System
- `src/lib/research/tools.ts` -- Public Hamilton tools pattern (searchFees, searchIndex)
- `src/lib/research/tools-internal.ts` -- Admin tools pattern (queryDistrictData, queryFeeRevenueCorrelation)
- `src/lib/research/agents.ts` -- Agent definitions (legacy multi-agent setup to consolidate)
- `src/lib/research/skills.ts` -- Skill injection pattern (buildSkillExecution, buildSkillInjection)
- `src/app/api/research/[agentId]/route.ts` -- Research API route (agent.tools wiring)

### Data Layer (Phases 23-24 patterns)
- `src/lib/crawler-db/call-reports.ts` -- Revenue queries with `* 1000` scaling, `priorYearQuarter()` export
- `src/lib/crawler-db/fed.ts` -- `RichIndicator`, `deriveTrend()`, Beige Book summary queries, `getNationalEconomicSummary()`
- `src/lib/crawler-db/health.ts` -- Industry health metrics pattern
- `src/lib/crawler-db/fee-revenue.ts` -- Fee-to-revenue correlation (related domain)
- `src/lib/crawler-db/financial.ts` -- `InstitutionFinancial` interface (needs `overdraft_revenue` field)

### Ingestion (for overdraft field)
- `fee_crawler/commands/ingest_fdic.py` -- FDIC Call Report ingestion (extend for RIAD4070)
- `fee_crawler/commands/ingest_ncua.py` -- NCUA ingestion (extend if applicable)

### Requirements
- `.planning/REQUIREMENTS.md` -- DERIVE-01, DERIVE-02, DERIVE-03, ADMIN-05

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RichIndicator` + `deriveTrend()` from `fed.ts` -- for any time-series derived metrics
- `priorYearQuarter()` from `call-reports.ts` -- YoY computation
- `tool()` from `ai` SDK + `z` from `zod` -- Hamilton tool definition pattern
- `getFeeRevenueData()` in `fee-revenue.ts` -- existing fee-to-revenue join pattern
- `getTierFeeRevenueSummary()`, `getCharterFeeRevenueSummary()` -- charter/tier segmentation pattern

### Established Patterns
- Hamilton tools are defined as exports from `tools.ts` / `tools-internal.ts`
- Each tool has: `description`, `inputSchema` (Zod), `execute` (async)
- Tools call DB functions directly (no HTTP round-trip)
- Agent definitions in `agents.ts` map agents to tool sets

### Integration Points
- `src/app/api/research/[agentId]/route.ts` -- where agent.tools gets passed to streamText
- `institution_financials` table -- needs `overdraft_revenue` column added
- `crawl_targets` JOIN for charter_type, asset_size_tier segmentation

</code_context>

<specifics>
## Specific Ideas

- Hamilton consolidation means one agent definition with ALL tools (public + admin + national data)
- Overdraft revenue from RIAD4070 enables reports to say "63% of XYZ Bank's service charge income comes from overdraft fees" -- powerful competitive intelligence
- `queryNationalData({ section: 'all' })` gives Hamilton a complete national snapshot in one tool call
- Revenue concentration with configurable N lets Hamilton adapt: "top 3 categories account for 72% of service charge income" or "top 10 categories cover 94%"

</specifics>

<deferred>
## Deferred Ideas

- Agent consolidation details (exact legacy agent removal list, skill migration) -- may need its own sub-phase if complex
- BLS data integration, additional FRED series, national surveys -- Phase 27 (External Intelligence)

</deferred>

---

*Phase: 25-derived-analytics-hamilton-tools*
*Context gathered: 2026-04-07*
