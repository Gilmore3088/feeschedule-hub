# Phase 26: National Data Admin Portal - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Enhance the existing `/admin/national` portal with Phase 23-25 data (corrected Call Reports, FRED gaps, health metrics, Beige Book themes, derived analytics, CFPB complaints). Also add Pro dashboard KPI cards and consumer fee average pages. Audit existing panels first, enhance with new data, add missing visualizations.

</domain>

<decisions>
## Implementation Decisions

### Admin portal completeness
- Audit existing 5 panels first (overview, call-reports, economic, health, intelligence) — verify data flows correctly post-Phase-23 scaling fix
- Enhance existing panels with Phase 23-24-25 data, not rebuild from scratch
- Add derived analytics section (concentration, dependency, trends) to overview panel
- Add CFPB complaint data to economic conditions panel

### Data visualization
- Use Recharts (already in project) for all charts
- Follow existing admin design system (admin-card, tabular-nums, Geist font, Bloomberg-grade density)
- Revenue trend chart: 8 quarters with bank/CU split bars + YoY line overlay
- Health metrics: stat cards with sparkline trend + delta indicator (existing pattern)

### Consumer + Pro data access
- Consumer pages get plain-language fee averages with trend arrows on public fee pages
- Pro dashboard gets industry health KPI cards (ROA, efficiency, deposit growth) clickable to drill down
- Both use same underlying queries from Phases 23-25, different presentation layers
- All three audiences in this phase: admin portal enhancement + Pro KPI dashboard + consumer fee average pages

### Claude's Discretion
- Exact chart configurations and color palette
- Card layout and grid arrangement within panels
- Consumer page URL structure
- Pro dashboard widget positioning
- How to render Beige Book themes visually (tags, pills, narrative sections)

</decisions>

<specifics>
## Specific Ideas

- Admin panels should look like Bloomberg terminals — dense, precise, professional
- Consumer fee averages should be warm and editorial (FT-style, per brand guidelines)
- Pro KPI cards should enable "at-a-glance then drill down" workflow
- Derived analytics on overview: "Top 5 fee categories account for X% of revenue" type headlines

</specifics>

<canonical_refs>
## Canonical References

### Existing admin portal
- `src/app/admin/national/page.tsx` — 5-tab router (overview, call-reports, economic, health, intelligence)
- `src/app/admin/national/call-reports-panel.tsx` — Existing Call Report revenue display
- `src/app/admin/national/economic-panel.tsx` — FRED indicators + Beige Book display
- `src/app/admin/national/health-panel.tsx` — Health metrics display
- `src/app/admin/national/overview-panel.tsx` — Summary overview
- `src/app/admin/national/revenue-trend-chart.tsx` — Recharts revenue chart
- `src/app/admin/national/growth-chart.tsx` — Growth trend chart

### Data layer (Phases 23-25)
- `src/lib/crawler-db/call-reports.ts` — All revenue queries including getRevenueByTier, getInstitutionRevenueTrend
- `src/lib/crawler-db/fed.ts` — FRED + Beige Book queries including getBeigeBookThemes
- `src/lib/crawler-db/health.ts` — Health metrics including getInstitutionCountTrends
- `src/lib/crawler-db/complaints.ts` — CFPB complaint queries
- `src/lib/crawler-db/derived-analytics.ts` — Revenue concentration, fee dependency trends, revenue-per-institution
- `src/lib/crawler-db/fee-index.ts` — National/peer fee index

### Design system
- `src/components/sparkline.tsx` — SVG sparkline component
- `src/components/skeleton.tsx` — Loading skeleton components
- Design tokens in globals.css (shadow depth, admin-card class, staggered animations)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- All 5 admin panels already exist and render data
- Recharts for charts (BarChart, LineChart, Area)
- Sparkline component for inline trends
- admin-card CSS class for consistent card styling
- Skeleton components for loading states
- Tab navigation component

### Established Patterns
- Server components with Suspense for admin pages
- Client components only for interactivity (charts, dark mode)
- URL search params for filters
- Stat cards: value + label + sparkline + delta

### Integration Points
- Overview panel needs derived analytics data
- Economic panel needs CFPB complaint integration
- Pro dashboard at `/pro/` needs new KPI section
- Consumer pages at `/(public)/fees/` or similar need fee average display

</code_context>

<deferred>
## Deferred Ideas

None — all three audiences (admin, pro, consumer) included in this phase.

</deferred>

---

*Phase: 26-national-data-admin-portal*
*Context gathered: 2026-04-08*
