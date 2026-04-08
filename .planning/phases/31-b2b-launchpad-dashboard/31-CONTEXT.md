# Phase 31: B2B Launchpad Dashboard - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Pro subscribers land on a coherent starting point -- a four-door launchpad surfacing their most relevant tools, a peer snapshot against the national median, recent activity, and a personalized Beige Book digest for their district.

</domain>

<decisions>
## Implementation Decisions

### Dashboard Layout
- Four-door grid: Hamilton gets col-span-2 top row (prominent), Peer Builder / Reports / Federal Data fill remaining slots
- Peer snapshot as right sidebar panel (col-span-4 in a 12-col grid)
- Recent activity: last 3 Hamilton conversations + last 3 generated reports
- Beige Book digest: bottom card with 2-3 sentence district summary

### Personalization & Data Sources
- Use `derivePersonalizationContext()` from Phase 28 for peer group (charter, tier, district)
- Peer vs national: top 3 spotlight categories with delta % indicators
- Hamilton conversations via `listConversations('hamilton', userId)` (already wired)
- Beige Book via `getBeigeBookThemes(district)` from Phase 24

### Visual Design & Interaction
- Door cards link directly to destinations (no modal/expand)
- Warm pro palette (#FAF7F2 bg, terracotta accents) matching existing pro layout
- No empty states needed -- all data sources have content
- Report links: direct download for completed, "Generating..." for in-progress

### Claude's Discretion
- Exact grid proportions and responsive breakpoints
- Card border/shadow styling details
- Icon choices for the four doors

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/pro/dashboard.tsx` -- existing ProDashboard component (server component, fetches national index + peer data)
- `src/app/pro/layout.tsx` -- ProLayout with auth guard, personalization, ProNav
- `src/lib/personalization.ts` -- `derivePersonalizationContext()` returns institution, district, tier, peer group
- `src/lib/research/history.ts` -- `listConversations()`, `getUsageStats()`
- `src/lib/crawler-db/` -- `getNationalIndexCached()`, `getPeerIndex()`, `getBeigeBookThemes()`

### Established Patterns
- Server components for pages, client components only for interactivity
- Warm pro palette: #FAF7F2 bg, #1A1815 text, #C44B2E terracotta accent, #E8DFD1 borders
- Newsreader serif for headings, system font for body
- `tabular-nums` for all numeric displays
- `formatAmount()` for currency formatting

### Integration Points
- `src/app/pro/page.tsx` -- currently has dual path: pro users get ProDashboard, non-pro get marketing page
- ProDashboard receives `user` prop with id, institution_name, state_code, email, role
- Four doors link to: `/pro/research` (Hamilton), `/pro/market` (Peer Builder), `/pro/reports` (Reports), `/pro/data` (Federal Data)

</code_context>

<specifics>
## Specific Ideas

- Success criteria from ROADMAP: 4 action doors, peer snapshot with delta, recent activity with resume/download links, Beige Book digest for user's district
- Existing dashboard.tsx already fetches spotlight categories and state comparison -- extend rather than rewrite

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>
