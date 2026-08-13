# Phase 24: Industry Health & Beige Book - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Compute industry health metrics (ROA, ROE, efficiency ratio, deposit/loan growth) from institution financials and condense Beige Book reports into district-level and national summaries with LLM-extracted themes. Data layer only — UI views are Phase 26.

</domain>

<decisions>
## Implementation Decisions

### Audit approach
- **D-01:** Audit existing implementations first (same as Phase 23). Run each query in `health.ts` and `fed.ts`, verify output is correct and complete post-scaling fix. Mark working requirements done. Plan only fixes + gaps.

### Institution count trends
- **D-02:** Compute quarter-over-quarter from `institution_financials`. Count distinct institutions with filings per quarter. No filing = presumed inactive. Simple, uses existing data — no new data source needed.

### Theme extraction
- **D-03:** Use Claude Haiku to extract growth/employment/prices/lending themes from Beige Book text. Store as structured JSON per district. Approximately $0.01 per district per extraction.
- **D-04:** Both pre-compute at ingestion time (themes available instantly) AND Hamilton can re-extract for deeper analysis during report generation. Dual-path ensures instant access plus fresh deeper analysis when needed.

### Health metric formulas
- **D-05:** Claude's discretion on which Call Report fields to use for ROA, ROE, efficiency ratio. Use the best available fields from `institution_financials`. Prefer FFIEC standard definitions where fields exist, fall back to simplified proxies if fields are missing.

### Consumer + Pro data access
- **D-06:** Phase 24 is data layer only — build the queries and summaries. Consumer-facing aggregations (plain-language fee averages with trend arrows) and Pro dashboard widgets (industry health KPIs) are wired into views in Phase 26 (Admin Portal). Both use the same underlying data, different presentations.

### Claude's Discretion
- Exact fields for ROA/ROE/efficiency ratio computation from institution_financials
- LLM prompt design for Beige Book theme extraction
- JSON schema for stored themes
- Whether to add a `beige_book_themes` DB table or store inline in `fed_beige_book`
- Test structure and mock patterns for health queries

</decisions>

<specifics>
## Specific Ideas

- Health metrics should be segmented by bank vs credit union (HEALTH-04) — the charter split pattern from Phase 23's Call Report work applies here
- Beige Book themes should follow a fixed taxonomy: growth, employment, prices, lending conditions — so Hamilton can query by theme category
- Consumer aggregations are "the story behind the number" — not raw data dumps
- Pro quick-access is "at-a-glance KPI cards" — clickable to drill down

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Health metrics data layer
- `src/lib/crawler-db/health.ts` — Existing health query functions (getIndustryHealthMetrics, getHealthMetricsByCharter, getDepositGrowthTrend, getLoanGrowthTrend)
- `src/app/admin/national/health-panel.tsx` — Existing admin UI consuming health data (shows what queries are already wired)

### Beige Book data layer
- `src/lib/crawler-db/fed.ts` — Existing Beige Book queries (getLatestBeigeBook, getDistrictBeigeBookSummaries, getNationalEconomicSummary, getBeigeBookHeadlines)
- `fee_crawler/commands/ingest_beige_book.py` — Beige Book ingestion pipeline (where theme extraction at ingestion would be added)

### Financial data (from Phase 23)
- `src/lib/crawler-db/call-reports.ts` — Revenue queries, getDistrictFeeRevenue, getRevenueByTier (established query patterns to follow)
- `src/lib/crawler-db/financial.ts` — FRED indicator queries (existing pattern for economic data)

### Tier system
- `src/lib/fed-districts.ts` — FDIC_TIER_LABELS, FDIC_TIER_BREAKPOINTS (Phase 23 established — use for any tier-segmented health queries)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `health.ts`: getIndustryHealthMetrics, getHealthMetricsByCharter, getDepositGrowthTrend, getLoanGrowthTrend — likely already working, need audit
- `fed.ts`: getDistrictBeigeBookSummaries, getNationalEconomicSummary — may already satisfy BEIGE-01 and BEIGE-02
- `health-panel.tsx`: Admin UI already built and consuming health queries
- Sparkline component for trend visualization
- FDIC tier system from Phase 23 for segmentation

### Established Patterns
- Raw SQL with postgres client in crawler-db/*.ts
- Typed interfaces for all query returns
- Server components with Suspense for admin pages
- Anthropic SDK for LLM calls (used by Hamilton — same pattern for Beige Book theme extraction)

### Integration Points
- `ingest_beige_book.py` — add theme extraction step after ingestion
- `health.ts` — add institution count trend query (HEALTH-03)
- `fed.ts` — add theme extraction results query if stored in new table
- Hamilton's tool layer will consume all health/beige queries in Phase 25

</code_context>

<deferred>
## Deferred Ideas

- Consumer-facing fee average pages with trend arrows — Phase 26 (UI)
- Pro dashboard industry health KPI cards — Phase 26 (UI)
- FDIC/NCUA charter event tracking for precise new charter/closure detection — future phase if institution count trends from financials prove insufficient

</deferred>

---

*Phase: 24-industry-health-beige-book*
*Context gathered: 2026-04-08*
