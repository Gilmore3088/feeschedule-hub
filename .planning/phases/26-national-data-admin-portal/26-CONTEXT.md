# Phase 26: National Data Admin Portal - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Build `/admin/national` pages so admins can view, verify, and explore all national data sources (Call Reports, FRED, Beige Book, Industry Health) before data flows into reports. This is Hamilton's workbench -- the admin verifies data accuracy here before Hamilton uses it in analysis.

Requirements: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04

</domain>

<decisions>
## Implementation Decisions

### Page Structure
- **D-01:** Single `/admin/national` page with tabbed panels: Overview | Call Reports | Economic | Health. Matches existing Market page pattern (sticky tabs, content switches). No sub-routes.

### Visual Design
- **D-02:** Recharts line charts for 8-quarter trends (revenue, deposits, loans, health metrics). Stat cards with current value + sparkline for indicators (ROA, unemployment, CPI YoY). Recharts 3.7.0 already in project.
- **D-03:** Follow existing design system: `.admin-card` class, Geist font, `tabular-nums`, emerald/amber status badges, `text-[11px] font-semibold text-gray-400 uppercase tracking-wider` for labels.

### Data Freshness
- **D-04:** Each data source card shows "Last updated: X days ago" with badge. Green = <7 days, Amber = 7-30 days, Red = >30 days or missing data. Badge uses existing emerald/amber/red pattern.

### Tab Content (per Success Criteria)
- **D-05:** Overview tab: summary cards for each data source with key numbers and freshness badges. At-a-glance view of all national data health.
- **D-06:** Call Reports tab: 8-quarter revenue trend chart, top 10 institutions by SC income table, bank vs CU charter split comparison. Uses `getRevenueTrend()`, `getTopRevenueInstitutions()`, `getRevenueByCharter()`.
- **D-07:** Economic tab: FRED indicators (fed funds rate, unemployment, CPI YoY, sentiment) as stat cards with sparklines. Beige Book district summaries as a 12-district grid or list. Uses `getNationalEconomicSummary()`, `getDistrictBeigeBookSummaries()`.
- **D-08:** Health tab: ROA, ROE, efficiency ratio stat cards with trend. Deposit/loan growth charts. Charter segmentation comparison. Uses `getIndustryHealthMetrics()`, `getDepositGrowthTrend()`, `getLoanGrowthTrend()`, `getHealthMetricsByCharter()`.

### Architecture
- **D-09:** Server components for the page and tab panels. Client component only for tab switching (URL search params or lightweight state). Matches existing admin pattern.
- **D-10:** Use Suspense boundaries with SkeletonCards for loading states per tab. Existing `SkeletonCards`, `SkeletonTable` components from `src/components/skeleton.tsx`.

### Carrying Forward
- **D-11:** All data queries are built and tested (Phases 23-25)
- **D-12:** Design system conventions from MEMORY.md (see Design System section)

### Claude's Discretion
- Chart colors and exact Recharts configuration
- Card grid layout (2-col, 3-col, responsive)
- District summary presentation (grid vs list vs accordion)
- Whether to add the page to AdminNav immediately or keep it as a hidden route initially

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data Queries (built in Phases 23-25)
- `src/lib/crawler-db/call-reports.ts` -- `getRevenueTrend()`, `getTopRevenueInstitutions()`, `getRevenueByCharter()`, `getRevenueByTier()`
- `src/lib/crawler-db/fed.ts` -- `getNationalEconomicSummary()`, `getDistrictBeigeBookSummaries()`, `getNationalBeigeBookSummary()`, `getDistrictUnemployment()`
- `src/lib/crawler-db/health.ts` -- `getIndustryHealthMetrics()`, `getDepositGrowthTrend()`, `getLoanGrowthTrend()`, `getInstitutionCountTrend()`, `getHealthMetricsByCharter()`
- `src/lib/crawler-db/derived.ts` -- `getRevenueConcentration()`, `getFeeDependencyRatio()`, `getRevenuePerInstitution()`

### UI Patterns
- `src/app/admin/market/page.tsx` -- Tabbed panel pattern to follow
- `src/app/admin/layout.tsx` -- Admin layout with nav, auth check
- `src/app/admin/admin-nav.tsx` -- Navigation items
- `src/components/skeleton.tsx` -- SkeletonCards, SkeletonTable components
- `src/components/sparkline.tsx` -- SVG sparkline component
- `src/app/globals.css` -- `.admin-card`, `.skeleton`, staggered animations

### Requirements
- `.planning/REQUIREMENTS.md` -- ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Sparkline` component (`src/components/sparkline.tsx`) -- pure SVG mini chart, accepts `data: number[]`
- `SkeletonCards`, `SkeletonTable` -- loading states
- `.admin-card` CSS class -- white bg, subtle border, shadow-xs, hover shadow-sm, dark mode
- Recharts 3.7.0 -- already used on dashboard for histograms
- `timeAgo()` from `src/lib/format.ts` -- for freshness timestamps
- `formatAmount()`, `formatPct()` from `src/lib/format.ts` -- number formatting

### Established Patterns
- Server components for pages, `"use client"` only for interactivity
- URL search params for filters/tabs (server-side via `searchParams` prop)
- Suspense boundaries for concurrent data loading
- `getCurrentUser()` auth check in layout

### Integration Points
- `src/app/admin/layout.tsx` -- wraps all admin pages with auth + nav
- `admin-nav.tsx` -- nav items array, needs new entry for "National"
- All data queries are async functions returning typed interfaces

</code_context>

<specifics>
## Specific Ideas

- Overview tab should feel like a "data health dashboard" -- at a glance, admin knows if all sources are fresh and populated
- Call Reports tab is the "revenue command center" -- trends, top players, charter comparison
- Economic tab merges FRED numbers with Beige Book prose -- quantitative + qualitative side by side
- Health tab shows the banking industry's vital signs with charter segmentation
- Each tab should have enough data to verify what Hamilton will use in reports

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 26-national-data-admin-portal*
*Context gathered: 2026-04-07*
