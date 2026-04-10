# Phase 25: Derived Analytics & Hamilton Tools - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Compute cross-source derived metrics (revenue concentration, fee dependency ratio, per-institution averages) with trend signals, and wire ALL national data sources into Hamilton's tool layer via a unified queryNationalData tool. Data layer only — no new UI pages.

</domain>

<decisions>
## Implementation Decisions

### Hamilton tool strategy
- **D-01:** Create one unified `queryNationalData` tool that accepts a `source` parameter. Hamilton calls one tool instead of many. Less clutter, fewer tool calls per analysis.
- **D-02:** Source categories: `call_reports` (revenue trends, top institutions, charter splits, tier breakdowns), `economic` (FRED indicators, district summaries, Beige Book themes), `health` (ROA, ROE, efficiency, deposit/loan growth, institution counts), `complaints` (CFPB district + institution summaries), `fee_index` (national/peer fee index data).
- **D-03:** The tool routes internally to existing query functions from Phases 23-24. No new DB queries needed for the tool wiring — it's a facade over existing functions.

### Revenue concentration
- **D-04:** Two-axis concentration analysis: (a) rank fee categories by total SC income across all institutions (dollar volume), and (b) rank by institution prevalence (how many institutions charge each category). Classic Pareto for dollars, coverage breadth for institutions.
- **D-05:** Output shows % of total that top N categories represent, for both axes. Enables "Top 5 fee categories account for X% of all service charge income and are charged by Y% of institutions."

### Derived metric design
- **D-06:** Add QoQ and YoY trend signals for all derived metrics (concentration, dependency, per-institution averages). Shows momentum alongside position — "Your fee dependency is rising while peers' is falling."
- **D-07:** Stick to DERIVE-01, DERIVE-02, DERIVE-03 as the core metrics, plus trend signals. Don't add peer percentiles or other extras in this phase.

### Audit approach
- **D-08:** Audit existing `fee-revenue.ts` queries first (same pattern as Phases 23-24). `getTierFeeRevenueSummary`, `getCharterFeeRevenueSummary`, `getRevenueIndexByDate` may already cover DERIVE-02 and DERIVE-03. Plan only fixes + gaps.

### Claude's Discretion
- Internal routing logic for queryNationalData (switch/map pattern)
- Which existing query functions to call for each source category
- Exact Pareto calculation approach for concentration
- Whether trend signals need new DB queries or can be computed from existing time-series data
- Test structure for the unified tool

</decisions>

<specifics>
## Specific Ideas

- The unified tool should feel like an API for Hamilton: "give me national data about X" — not "which of 15 tools do I call?"
- Fee index data as a source category is important — it's the core product and Hamilton should be able to query it alongside Call Reports and economic data
- Trend signals should enable narrative like "Fee dependency ratios are rising industry-wide, driven by overdraft and NSF revenue concentration increasing QoQ"
- Two-axis concentration enables both "where's the money?" (dollar volume) and "what's universal?" (institution prevalence) insights

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Hamilton tool layer
- `src/lib/research/tools-internal.ts` — Existing Hamilton tools (queryDistrictData, queryFeeRevenueCorrelation, etc.) — the unified tool must follow this pattern
- `src/lib/research/agents.ts` — Hamilton agent configuration (how tools are registered and invoked)

### Derived analytics data sources
- `src/lib/crawler-db/fee-revenue.ts` — Existing fee-revenue correlation queries (may cover DERIVE-02/03)
- `src/lib/crawler-db/financial.ts` — getRevenueIndexByDate with fee_income_ratio (partial DERIVE-02)
- `src/lib/crawler-db/call-reports.ts` — Revenue queries from Phase 23 (getRevenueTrend, getRevenueByTier, getDistrictFeeRevenue, getInstitutionRevenueTrend, getInstitutionPeerRanking)
- `src/lib/crawler-db/health.ts` — Health metrics from Phase 24 (getIndustryHealthMetrics, getInstitutionCountTrends)
- `src/lib/crawler-db/fed.ts` — FRED + Beige Book from Phase 24 (getNationalEconomicSummary, getBeigeBookThemes)
- `src/lib/crawler-db/complaints.ts` — CFPB complaints from Phase 23 (getDistrictComplaintSummary, getInstitutionComplaintProfile)
- `src/lib/crawler-db/fee-index.ts` — National/peer fee index queries

### Tier system
- `src/lib/fed-districts.ts` — FDIC_TIER_LABELS, FDIC_TIER_BREAKPOINTS (use for tier-segmented derived metrics)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fee-revenue.ts`: getTierFeeRevenueSummary, getCharterFeeRevenueSummary — may already satisfy DERIVE-02/03
- `financial.ts`: getRevenueIndexByDate with fee_income_ratio — partial DERIVE-02
- `tools-internal.ts`: 12+ existing Hamilton tools — follow the `tool({...})` pattern from Vercel AI SDK
- All Phase 23-24 query functions — the unified tool routes to these

### Established Patterns
- Hamilton tools use Vercel AI SDK `tool()` function with Zod schema validation
- Tools return structured objects that Hamilton weaves into narrative
- Each tool has a description string that Hamilton uses to decide when to call it
- Existing tools in `internalTools` object — new tools get added there

### Integration Points
- `queryNationalData` tool registered in `internalTools` object in tools-internal.ts
- Hamilton agent (agents.ts) automatically discovers tools from internalTools
- Derived analytics queries added to crawler-db/ as new functions
- Fee index queries need to be imported into tools-internal.ts

</code_context>

<deferred>
## Deferred Ideas

- Peer percentiles (P25/P50/P75 positioning per metric) — future phase after core derived metrics are validated
- Admin portal pages for derived analytics — Phase 26
- Consumer-facing derived metric summaries — Phase 26

</deferred>

---

*Phase: 25-derived-analytics-hamilton-tools*
*Context gathered: 2026-04-08*
