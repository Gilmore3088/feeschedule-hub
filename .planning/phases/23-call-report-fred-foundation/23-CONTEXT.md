# Phase 23: Call Report & FRED Foundation - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix Call Report revenue queries (thousands scaling), complete FRED economic summaries, add district-level indicators, add CFPB complaint data, and establish per-institution financial context that connects Call Report data to institution slugs for B2B value. This is the data foundation that Hamilton and all downstream analysis depends on.

</domain>

<decisions>
## Implementation Decisions

### Scaling fix approach
- **D-01:** Fix at the ingestion layer — store actual dollars in DB, not thousands. Requires a migration + backfill of ~38K existing `call_report` rows, plus updating the ingestion pipeline to multiply by 1000 on ingest going forward.
- **D-02:** Verify with both methods: (a) spot-check 5-10 well-known banks (JPMorgan, Wells Fargo, etc.) against FFIEC CDR filings, and (b) automated range assertion tests that validate dollar values are in sane ranges per institution size.

### Asset tier segmentation
- **D-03:** Use FDIC standard asset size groupings (not the existing 5-tier system in fed-districts.ts). Research the official FDIC tier breakpoints during planning.
- **D-04:** Replace the existing tier system everywhere — fee index, peer filters, market explorer, Call Report segmentation. One tier system across the entire platform for consistency.

### District-level indicators
- **D-05:** Per Fed district, provide: unemployment rate, employment growth (nonfarm payrolls change), and housing/CRE data.
- **D-06:** Per district, also provide fee-specific banking metrics: overdraft revenue generated, other fee revenue, and CFPB complaint data.
- **D-07:** CFPB complaint data is a new data source — ingest from CFPB's public complaint API, filtered by fee-related categories (overdraft, NSF, account fees). Store with institution linkage.

### B2B institution connection
- **D-08:** Call Report data connects to institution slugs via both profile pages AND peer comparison. Each institution's page (`/institutions/[slug]`) shows their Call Report financials (SC income, fee dependency ratio, revenue trend) alongside their extracted fee schedule.
- **D-09:** Peer comparison powered by Call Report data: "Your SC income is $X, ranking #N in your peer group. Your fee dependency ratio is Y% vs peer median Z%."
- **D-10:** The key insight for bank executives is full financial context: competitive positioning + trends + regulatory risk signals. This is what Hamilton needs to produce McKinsey-grade per-institution analysis.

### Scope verification
- **D-11:** Audit existing implementations first before planning. Run each query (CALL-02 through CALL-05, FRED-01 through FRED-03), verify output is correct and complete. Mark truly-done requirements as done. Plan only for fixes + gaps.

### Claude's Discretion
- Migration strategy for the 38K row backfill (batch size, zero-downtime approach)
- CFPB API pagination and rate limiting approach
- Specific FRED series IDs for district-level employment growth and housing data
- SQL query structure for per-institution financial context views

</decisions>

<specifics>
## Specific Ideas

- Call Report data should tell a story per institution: positioning ("You rank #N"), trends ("Your SC income grew X% vs peers Y%"), and risk ("Your overdraft revenue concentration is Z% — regulatory risk signal")
- This is the data layer that makes Hamilton's per-institution analysis credible — without it, reports are generic
- CFPB complaints add a regulatory risk dimension that competitors likely don't have
- FDIC tier consistency means a bank executive sees the same peer group definition everywhere on the platform

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Call Report data layer
- `src/lib/crawler-db/call-reports.ts` — Existing revenue query functions (getRevenueTrend, getTopRevenueInstitutions) that need scaling fix
- `src/lib/crawler-db/call-reports.test.ts` — Existing unit tests for Call Report queries
- `src/app/admin/national/call-reports-panel.tsx` — UI consuming Call Report data

### FRED economic data
- `src/lib/crawler-db/financial.ts` — Existing FRED query functions (getLatestIndicators, getCpiContext, getRevenueIndexByDate)
- `src/app/admin/national/economic-panel.tsx` — UI consuming FRED data

### Tier system
- `src/lib/fed-districts.ts` — Current tier definitions (PeerFilters, parsePeerFilters) — will be replaced with FDIC standard tiers

### Institution pages
- `src/app/admin/national/page.tsx` — National data admin portal (5-tab layout)

### Fee taxonomy
- `src/lib/fee-taxonomy.ts` — 9 families, 49 categories, tier system definitions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/crawler-db/call-reports.ts`: Revenue query functions exist — need scaling fix + asset tier parameter
- `src/lib/crawler-db/financial.ts`: FRED indicator queries exist — need district-level extension
- `src/lib/crawler-db/fed.ts`: Beige Book queries exist (getLatestBeigeBook, getBeigeBookHeadline)
- `src/app/admin/national/`: Full 5-tab admin portal already built (overview, call-reports, economic, health, intelligence)
- `src/lib/format.ts`: formatAmount, formatAssets, formatPct helpers

### Established Patterns
- Raw template-literal SQL with postgres client in `src/lib/crawler-db/*.ts`
- Typed interfaces for all query return values (e.g., RevenueSnapshot)
- Server components with Suspense boundaries for admin pages
- Recharts for chart components (revenue-trend-chart.tsx)

### Integration Points
- Institution slug pages need Call Report financial data injected
- Peer comparison tools need Call Report metrics for benchmarking
- Hamilton's tool layer needs access to all new summary queries
- CFPB complaint data needs new DB table(s) and ingestion pipeline

</code_context>

<deferred>
## Deferred Ideas

- Housing/CRE detailed analysis per district — capture basic data now, deep analysis in a future phase
- CFPB complaint trend analysis over time — basic ingestion now, analytics later
- Institution-level financial health scoring (combining Call Report + fee data + complaints into a composite score) — future phase after all data sources are verified

</deferred>

---

*Phase: 23-call-report-fred-foundation*
*Context gathered: 2026-04-07*
