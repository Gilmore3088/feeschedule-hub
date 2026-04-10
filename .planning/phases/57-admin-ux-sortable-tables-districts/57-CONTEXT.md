# Phase 57: Admin UX -- Sortable Tables & Districts - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Make every admin table sortable (client-side for bounded tables, server-side for unbounded), surface the full district intelligence built in Phase 23-24, and ensure all admin pages render without horizontal overflow on tablet viewports with adaptive layouts where beneficial.

</domain>

<decisions>
## Implementation Decisions

### Sortable Table Rollout
- **D-01:** All admin tables with 3+ rows adopt sortable behavior. No exceptions -- consistent UX across all pages.
- **D-02:** Default sort is alphabetical by name/label column ascending on first page load. Domain-specific defaults are NOT used.
- **D-03:** Sort state persists in URL params (?sort=name&dir=asc). Shareable links, back-button friendly. Consistent with existing peer filter URL param pattern.
- **D-04:** Hybrid approach -- client-side SortableTable for bounded tables (under ~500 rows), server-side ORDER BY for unbounded tables (review queue, fees catalog).

### Server-Side Sort for Large Tables
- **D-05:** Review queue and fees catalog use server-side pagination with URL params (?page=1&per=50&sort=name&dir=asc).
- **D-06:** Page size is user-selectable via dropdown with 25/50/100 options. Default is 50.
- **D-07:** Separate ServerSortableTable component (server component reading searchParams). Client-side SortableTable stays as-is for bounded tables. Two distinct components, clean separation.
- **D-08:** Existing client-side SortableTable component updated to persist sort state in URL params (currently uses local useState).

### District Detail Page Content
- **D-09:** Full intelligence panel on district detail -- Beige Book themes, economic indicators (FRED), CFPB complaint summary, district median fees, fee revenue from Call Reports. Bloomberg-grade district profile.
- **D-10:** Tabbed section layout: Economy | Fees | Complaints | Beige Book. Keeps each section focused, reduces scroll.
- **D-11:** Districts index page (/admin/districts) also upgraded -- sortable table with key metrics per district (institution count, avg fees, complaint rate). Click-through to detail.
- **D-12:** Beige Book themes displayed as cards with sentiment indicators (positive/neutral/negative) and key excerpts from the report text.

### Responsive / Tablet Pass
- **D-13:** Adaptive layouts -- tables become stacked cards on mobile where appropriate, sidebar collapses. Full mobile-first treatment beyond just overflow fixes.
- **D-14:** Wide tables on tablet get horizontal scroll within overflow-x-auto container. Preserves all data columns, user scrolls to see them.
- **D-15:** Claude's Discretion on which pages get full adaptive layout treatment vs just overflow fixes -- triage by visual complexity and user value.

### Claude's Discretion
- D-15: Prioritize adaptive layouts for the most visual/complex pages (districts, dashboard) while simpler pages may just get overflow fixes.
- Column classification for responsive hide/show: not used -- horizontal scroll is the standard approach.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Components
- `src/components/sortable-table.tsx` -- Current client-side SortableTable with Column<T> interface, pagination, and sort logic
- `src/components/sortable-header.tsx` -- Header component used by SortableTable
- `src/app/admin/index/index-table.tsx` -- Example of SortableTable adoption (reference implementation)

### District Data Layer (Phase 23-24)
- `src/lib/crawler-db/fed.ts` -- 12+ district query functions (getDistrictEconomicSummary, getBeigeBookThemes, getLatestBeigeBook, getDistrictIndicators, etc.)
- `src/lib/crawler-db/complaints.ts` -- getDistrictComplaintSummary, getNationalComplaintSummary
- `src/lib/crawler-db/call-reports.ts` -- getDistrictFeeRevenue
- `src/app/admin/districts/[id]/page.tsx` -- Current district detail page (already imports queries but may not fully render them)
- `src/app/admin/districts/page.tsx` -- Current districts index (basic list, needs upgrade)

### Design System Reference
- `src/app/admin/layout.tsx` -- Admin layout with sticky header, nav, Cmd+K
- `src/app/admin/market/page.tsx` -- Market index page (tabbed pattern reference)
- `src/lib/fed-districts.ts` -- DISTRICT_NAMES, parsePeerFilters, PeerFilters type

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SortableTable<T>` component: Generic, typed, supports column config, pagination, default sort -- ready for rollout to all bounded tables
- `SortableHeader` component: Standalone header with sort icons (ArrowUpDown, ArrowUp, ArrowDown from lucide-react)
- District query functions: 15+ functions across fed.ts, complaints.ts, call-reports.ts -- all Postgres, all tested
- `parsePeerFilters()` in fed-districts.ts: URL param parsing pattern to follow for sort params

### Established Patterns
- URL-based filters: `?charter=bank&tier=a,b&district=1,3,7` pattern in peer pages -- sort params should follow same style
- Server components for pages, client components only for interactivity
- `searchParams` is Promise-based in Next.js 16 (must await)
- Admin design system: Geist font, `text-[11px] uppercase tracking-wider` headers, `tabular-nums`, `hover:bg-gray-50/50`

### Integration Points
- 11 admin pages with `<table>` markup need SortableTable adoption
- District detail page needs to render data from already-imported query functions
- Districts index needs to be converted from basic list to sortable table
- Review queue and fees catalog need server-side query modifications for ORDER BY + LIMIT/OFFSET

</code_context>

<specifics>
## Specific Ideas

- District detail page uses tabs (Economy | Fees | Complaints | Beige Book) similar to how market page organizes sections
- Beige Book section uses sentiment-tagged cards (positive=emerald, neutral=gray, negative=red) with excerpts
- ServerSortableTable is a NEW server component, not an extension of the existing client-side one
- Page size selector as a small dropdown (25/50/100) in the table footer area

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 57-admin-ux-sortable-tables-districts*
*Context gathered: 2026-04-10*
