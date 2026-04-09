# Phase 40: Hamilton Shell - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the shared Hamilton layout shell that wraps all 5 Pro screens: server-rendered layout with top nav, context bar, left rail, institutional context flow, Pro auth gating, and admin bypass. No individual screen content is built in this phase — only the shell that all screens render inside.

</domain>

<decisions>
## Implementation Decisions

### Route Structure
- **D-01:** Hamilton screens are direct children of `/pro/`:
  - `/pro/hamilton` — Home / Executive Briefing
  - `/pro/analyze` — Analysis workspace
  - `/pro/simulate` — Scenario modeling
  - `/pro/reports` — Report Builder
  - `/pro/monitor` — Continuous surveillance (DEFAULT)
- **D-02:** `/pro` redirects to `/pro/monitor`. Monitor is the default landing page for Pro users — the daily-use screen.
- **D-03:** `/pro/hamilton` (Home / Executive Briefing) is accessible as a quick link from Monitor, not the default landing.
- **D-04:** Existing `/pro` pages (dashboard, research, etc.) stay as-is for now. Gradual migration — this phase adds new routes alongside existing ones.
- **D-05:** The Hamilton shell layout wraps the 5 Hamilton routes specifically (hamilton, analyze, simulate, reports, monitor). Other `/pro` pages continue using the existing `ProLayout`.

### Left Rail
- **D-06:** Left rail content is screen-specific (Claude's discretion on exact implementation). Each screen has its own left rail sections matching the HTML prototypes. The `LEFT_RAIL_CONFIG` from `navigation.ts` (Phase 38) defines the structure per screen.
- **D-07:** Empty state shows guided onboarding — prompts like "Set up your institution profile", "Run your first analysis", "Create a peer set". A $5,000/yr tool must actively guide users through their first session.
- **D-08:** Left rail is collapsible on smaller screens. Mobile gets a bottom nav or hamburger menu (Claude's discretion matching prototype patterns).

### Auth + Upgrade Flow
- **D-09:** Non-subscribers who hit a Hamilton URL see a Hamilton-branded upgrade page within the shell — preview of features, pricing ($500/mo or $5,000/yr), CTA to Stripe checkout. NOT a generic /subscribe redirect.
- **D-10:** Admin users fully bypass the paywall with a subtle "Admin Mode" indicator bar (reuses the current "Viewing as admin" pattern from `/pro/layout.tsx`).
- **D-11:** Auth check lives in the Hamilton shell layout, not in individual screen components. Follows the existing `getCurrentUser()` + `canAccessPremium()` pattern from `/pro/layout.tsx`.

### Shell Layout Architecture
- **D-12:** Hamilton shell is a server component. Interactive children (left rail collapse, context bar dropdowns) are client components pushed as low as possible in the tree. Follows the existing `ProLayout` pattern (server component wrapping isolated client children).
- **D-13:** The `.hamilton-shell` CSS class (Phase 38) wraps the entire Hamilton layout — all editorial design tokens scope within it.
- **D-14:** Institutional context (institution name, type, asset tier) flows from the user's profile (set in Settings, Phase 41) into the context bar. All child screens read this from the layout — no per-screen institution selection.
- **D-15:** `ensureHamiltonProTables()` (Phase 39) is called once from the Hamilton shell layout on first render, following the `ensureHamiltonTables()` cold-start pattern.

### Claude's Discretion
- Whether to use a Next.js route group `(hamilton)` with a `layout.tsx` or a wrapper component approach for the Hamilton shell
- Exact left rail collapse/expand animation behavior
- Mobile navigation pattern (bottom nav vs hamburger)
- How the Hamilton-branded upgrade page is structured (could be a page or a modal)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Prototypes (visual targets)
- `Hamilton-Design/1-executive_home_briefing_final_polish/screen.png` — Home screen layout with nav + content
- `Hamilton-Design/2-ask_hamilton_deep_analysis_workspace/screen.png` — Analyze with left rail workspace
- `Hamilton-Design/3-simulation_mode_interactive_decision_terminal/screen.png` — Simulate with left rail
- `Hamilton-Design/4-report_builder/screen.png` — Report Builder with sidebar
- `Hamilton-Design/5-monitoring_alerts/screen.png` — Monitor with left rail (Intelligence/Strategy/Risk/Terminal)

### Navigation & Architecture
- `Hamilton-Design/hamilton_revamp_package/02-navigation-and-information-architecture.md` — Nav structure, left rail, tab conventions
- `Hamilton-Design/hamilton_revamp_package/07-ui-component-map.md` — Shell component names (HamiltonShell, HamiltonTopNav, HamiltonContextBar, HamiltonLeftRail)
- `Hamilton-Design/hamilton_revamp_package/proposed-file-tree.txt` — Suggested file structure

### Design System
- `Hamilton-Design/hamilton_sovereign/DESIGN.md` — Editorial design system spec (ignore "Sovereign" naming — use "Hamilton")

### Existing Code
- `src/app/pro/layout.tsx` — Current Pro layout with auth gating, personalization, admin bar. Pattern to follow/extend.
- `src/lib/hamilton/navigation.ts` — HAMILTON_NAV, LEFT_RAIL_CONFIG, CTA_HIERARCHY (Phase 38)
- `src/lib/hamilton/modes.ts` — HamiltonMode, MODE_BEHAVIOR (Phase 38)
- `src/app/globals.css` — `.hamilton-shell` CSS isolation tokens (Phase 38)
- `src/lib/hamilton/pro-tables.ts` — `ensureHamiltonProTables()` (Phase 39)
- `src/lib/auth.ts` — `getCurrentUser()`, role/permission checks
- `src/lib/access.ts` — `canAccessPremium()` check
- `src/components/pro-nav.tsx` — Current ProNav (to be replaced by HamiltonTopNav for Hamilton routes)

### Phase 38 Context (prior decisions)
- `.planning/phases/38-architecture-foundation/38-CONTEXT.md` — D-01 through D-17 carry forward

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/pro/layout.tsx` — Auth pattern (getCurrentUser → canAccessPremium → redirect), personalization derivation, admin bar. The Hamilton shell reuses this auth flow.
- `src/components/pro-nav.tsx` / `pro-mobile-nav.tsx` — Existing nav components. Hamilton replaces these with HamiltonTopNav for Hamilton routes.
- `src/lib/personalization.ts` — `derivePersonalizationContext()` for user-specific content adaptation
- `src/lib/hamilton/navigation.ts` — HAMILTON_NAV array with 6 entries, LEFT_RAIL_CONFIG per screen

### Established Patterns
- Server component layout wrapping client interactive children (ProLayout pattern)
- `Suspense` boundary at layout level for async data loading
- `bg-[#FAF7F2]` warm background already used in ProLayout (close to parchment)
- Admin bar: conditional rendering based on `user.role`

### Integration Points
- New route files: `src/app/pro/hamilton/page.tsx`, `src/app/pro/analyze/page.tsx`, etc. (or via route group)
- New layout: Hamilton shell layout wrapping these routes
- `ensureHamiltonProTables()` call in layout
- HamiltonTopNav, HamiltonContextBar, HamiltonLeftRail components in `src/components/hamilton/layout/`

</code_context>

<specifics>
## Specific Ideas

- Monitor is the daily-use screen (default at /pro/monitor) — the retention engine
- Hamilton Home is the deep-dive briefing, accessed from Monitor as a quick link
- Empty workspace shows guided onboarding prompts, not empty placeholders
- Hamilton-branded upgrade page (not generic /subscribe) for non-subscribers
- The 5 HTML prototype screenshots are the visual targets for shell layout

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 40-hamilton-shell*
*Context gathered: 2026-04-09*
