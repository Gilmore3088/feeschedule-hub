# Phase 48: Pro Navigation + Full Canvas Width - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate the old Pro tab routes (categories, peers, market, districts, data, news), ensure data browsing capability is accessible via the Analyze screen, and enforce full canvas width on all Hamilton screens including Settings.

</domain>

<decisions>
## Implementation Decisions

### Navigation Restructure
- **D-01:** Old Pro tabs (categories, peers, market, districts, data, news) are being ELIMINATED completely — these standalone pages are removed
- **D-02:** The Hamilton 5-screen system (Home, Analyze, Simulate, Reports, Monitor + Settings) IS the entire Pro experience
- **D-03:** Data browsing (fee categories, peer comparisons, district data, market data) becomes part of the Analyze screen — users query Hamilton or browse structured data in the same workspace
- **D-04:** Old Pro tab routes should redirect to `/pro/monitor` (or appropriate Hamilton screen) to avoid 404s for any bookmarked URLs

### Full Canvas Width
- **D-05:** Every Hamilton screen must use full browser canvas width — no `max-w-*` or `mx-auto` containers constraining content width
- **D-06:** Settings page `max-w-5xl mx-auto` must be removed — full width like all other screens
- **D-07:** Full canvas width must apply consistently without introducing horizontal scroll

### Claude's Discretion
- How to surface data browsing capability in the Analyze screen (tab, sidebar section, suggested prompts, or browse mode)
- Whether to delete old Pro tab files or just redirect routes
- Appropriate padding values for full-width layouts

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Hamilton Layout
- `src/app/pro/(hamilton)/layout.tsx` — Hamilton shell layout (route group)
- `src/components/hamilton/layout/` — Shell components (TopNav, ContextBar, LeftRail)

### Settings
- `src/app/pro/(hamilton)/settings/page.tsx` — Has `max-w-5xl mx-auto` that needs removal (line 63)

### Old Pro Routes (to eliminate)
- `src/app/pro/categories/page.tsx` — Old categories tab
- `src/app/pro/peers/page.tsx` — Old peers tab (also has `actions.ts`, `saved-groups.tsx`)
- `src/app/pro/market/page.tsx` — Old market tab
- `src/app/pro/districts/page.tsx` — Old districts tab
- `src/app/pro/data/page.tsx` — Old data tab
- `src/app/pro/news/page.tsx` — Old news tab
- `src/app/pro/research/page.tsx` — Old research tab (replaced by Analyze)
- `src/app/pro/reports-legacy/page.tsx` — Legacy reports (replaced by Reports screen)
- `src/app/pro/dashboard.tsx` — Old dashboard component

### Pro Layout
- `src/app/pro/layout.tsx` — Auth wrapper (no nav — Hamilton layout handles nav)
- `src/app/pro/page.tsx` — Redirects premium users to `/pro/monitor`, shows marketing page for non-premium

### Handoff
- `.planning/MILESTONE_8_HANDOFF.md` — Section "Pro Access is more than Hamilton" notes existing Pro pages should complement Hamilton

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Old Pro tab pages have working DB queries (getNationalIndex, getPeerIndex, etc.) — these queries can be reused in Analyze
- `src/app/pro/peers/actions.ts` has saved peer set server actions — needed by Hamilton screens

### Established Patterns
- Hamilton screens use `.hamilton-shell` CSS isolation with M3 color tokens
- Old Pro tabs use the consumer warm color palette (`#C44B2E`, `#FFFDF9`, etc.)
- Hamilton shell already handles auth gating in its layout

### Integration Points
- `src/app/pro/page.tsx` redirects premium users to `/pro/monitor` — this stays
- Old Pro route files can be deleted (Hamilton routes under `(hamilton)/` replace them)
- `src/app/pro/peers/actions.ts` may be imported by Hamilton Settings — check before deleting

</code_context>

<specifics>
## Specific Ideas

- Data browsing in Analyze: consider a "Browse Data" focus tab alongside Pricing/Risk/Peer/Trend, or structured data panels in the Analyze workspace that Hamilton can reference
- The marketing page at `/pro/page.tsx` for non-premium users should remain — only premium user routes are affected

</specifics>

<deferred>
## Deferred Ideas

- Detailed Analyze data browsing UI design — the exact UX for browsing structured data within Analyze will be refined in Phase 51 (Analyze Live Data)
- Search functionality across fee data — deferred to Analyze phase

</deferred>

---

*Phase: 48-pro-navigation-full-canvas-width*
*Context gathered: 2026-04-09*
