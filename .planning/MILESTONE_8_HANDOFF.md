# v8.0 → v8.1 Handoff

## What v8.0 Built (Phases 38-46)

### Solid Foundation (no rework needed)
- **Phase 38:** CSS isolation (`.hamilton-shell` with full M3 color token system), TypeScript DTOs (AnalyzeResponse, SimulationResponse, ReportSummaryResponse, MonitorResponse), MODE_BEHAVIOR config, navigation source of truth (HAMILTON_NAV, LEFT_RAIL_CONFIG, CTA_HIERARCHY)
- **Phase 39:** 6 PostgreSQL tables (hamilton_saved_analyses, hamilton_scenarios, hamilton_reports, hamilton_watchlists, hamilton_signals, hamilton_priority_alerts), `ensureHamiltonProTables()`, confidence tier logic (strong=20+, provisional=10-19, insufficient blocks simulation)
- **Phase 40:** `(hamilton)` route group under `/pro/`, server-rendered shell layout with auth gating, HamiltonTopNav, HamiltonContextBar, HamiltonLeftRail, HamiltonUpgradeGate, `/pro` → `/pro/monitor` redirect
- **Phase 41:** Settings page at `/pro/settings` — institution profile form, peer set management (uses existing saved_peer_sets), intelligence snapshot panel, feature access toggles, billing display, avatar dropdown in TopNav

### Screen Shells (need v8.1 live data wiring)
- **Phase 42:** Home / Executive Briefing at `/pro/hamilton` — has components (HamiltonViewCard, WhatChangedCard, PriorityAlertsCard, RecommendedActionCard, PositioningEvidence, MonitorFeedPreview) but polish pass added hardcoded content instead of wiring to real data
- **Phase 43:** Analyze at `/pro/analyze` — has streaming workspace (AnalyzeWorkspace with useChat/sendMessage), focus tabs, save/list analyses server actions, BUT polish pass may have introduced static content
- **Phase 44:** Simulate at `/pro/simulate` — has simulation math (simulation.ts), FeeSlider (Radix), CurrentVsProposed, StrategicTradeoffs, RecommendedPositionCard, scenario save/load, BUT was narrowed to overdraft-specific content instead of being category-agnostic
- **Phase 45:** Reports at `/pro/reports` — has template gallery, config sidebar, report generation actions, PDF export via @react-pdf/renderer API route, BUT report templates are oriented toward admin content (quarterly strategy) not client analysis
- **Phase 46:** Monitor at `/pro/monitor` — has StatusStrip, PriorityAlertCard, SignalFeed, WatchlistPanel, FloatingChatOverlay, signal seeder, BUT has hardcoded demo signals

## Critical Product Distinction for v8.1

**Two Hamiltons — do NOT confuse them:**

### Admin Hamilton (content marketing — already exists)
- Quarterly strategy reports, monthly pulse, national overviews
- Purpose: generate leads, build credibility for Bank Fee Index
- Lives in: admin report engine (`src/lib/report-engine/`, admin skills)
- NOT what Pro clients pay for

### Client Hamilton (paid analysis — what v8.1 must deliver)
- Peer benchmarking against their configured peer set
- MSA (Metropolitan Statistical Area) fee analysis
- Regional fee landscape comparisons
- State-level fee analysis
- Category-specific fee deep dives
- Competitive positioning intelligence
- Purpose: the $500/mo value proposition — "what should I know about my fee position?"
- Lives in: the 5 Hamilton Pro screens

### Pro Access is more than Hamilton
- Clients also get database access (fee data browsing, institution lookup)
- Hamilton is the AI analyst layer ON TOP of the data
- Existing `/pro/` pages (categories, districts, market, peers, data) are part of Pro access too
- v8.1 should ensure Hamilton screens complement (not replace) direct data access

## What v8.1 Must Fix Per Screen

### Screen 1: Settings (`/pro/settings`) — MOSTLY DONE
- Minor: `fed_district` column migration needs to run on production DB
- Minor: Stripe billing portal URL needs real `stripe.billingPortal.sessions.create()` wiring
- Otherwise functional — institution profile saves, peer sets CRUD works

### Screen 2: Monitor (`/pro/monitor`) — STRIP FAKE, WIRE REAL
- Remove hardcoded demo signals from `seed-monitor-data.ts` (or make it dev-only)
- Wire signal queries to real `hamilton_signals` table (empty state when no data)
- Watchlist add/remove should work with real `hamilton_watchlists` table
- FloatingChatOverlay needs real Hamilton streaming (may already work)
- Empty state: "No signals yet. Hamilton will surface changes as fee data updates."

### Screen 3: Home / Briefing (`/pro/hamilton`) — WIRE REAL HAMILTON
- HamiltonViewCard: call real `generateGlobalThesis()` with user's peer context, not hardcoded thesis text
- PositioningEvidence: query real `getNationalIndex()` for user's institution's fee categories
- WhatChangedCard: query real `hamilton_signals` (same as Monitor, last 3)
- PriorityAlertsCard: query real `hamilton_priority_alerts`
- RecommendedActionCard: derive from thesis analysis, link to Simulate with suggested category
- All "default data" / fallback content from polish pass must be removed

### Screen 4: Analyze (`/pro/analyze`) — VERIFY STREAMING WORKS
- Verify `AnalyzeWorkspace` streaming works with real Hamilton API (`mode: "analyze"`)
- Focus tabs (Pricing/Risk/Peer Position/Trend) must inject correct context into system prompt
- Save/load analyses must work end-to-end with `hamilton_saved_analyses`
- Explore Further prompts should come from Hamilton response, not hardcoded
- Screen boundary: NO recommendation language — verify system prompt enforces this
- Strip any hardcoded analysis content from polish pass

### Screen 5: Simulate (`/pro/simulate`) — MAKE CATEGORY-AGNOSTIC
- **Critical:** Simulate must work for ANY fee category, not just overdraft
- Category selector: let user pick any of the 49 fee categories
- Fee distribution data: fetch from real `getNationalIndex()` for selected category
- Confidence gating: `canSimulate()` blocks categories with insufficient data
- Slider: min/max from real P25/P75 or min/max of the category
- Hamilton interpretation: stream from real API with the specific scenario context
- Scenario save: store with real category, real values, real confidence tier
- Strip all overdraft-specific hardcoded text

### Screen 6: Reports (`/pro/reports`) — REFRAME FOR CLIENTS
- **Critical:** Report templates must be CLIENT-oriented, not admin marketing
  - Peer Benchmarking Report (compare institution vs peer set)
  - Regional Fee Landscape (fees by Fed district or state)
  - Category Deep Dive (single fee category analysis)
  - Competitive Positioning (institution vs specific competitors)
- NOT: "Quarterly Strategy Report" or "Monthly Pulse" — those are admin content tools
- Config sidebar: use client's institution profile + saved peer sets from Settings
- Generation: call real `generateSection()` with client-specific data context
- PDF export: verify `@react-pdf/renderer` API route works end-to-end
- Scenario-linked reports: pull from `hamilton_scenarios` when user comes from Simulate

## Known Technical Issues

1. **`fed_district` column:** Added to User TypeScript type but removed from SQL queries (column doesn't exist in DB yet). Migration at `scripts/migrations/041-user-fed-district.sql` needs to run.
2. **Route conflict resolved:** `/pro/reports` renamed to `/pro/reports-legacy`. Old ProNav stripped from `/pro/layout.tsx`.
3. **Material Symbols font:** Added to Hamilton layout via Google Fonts CDN link. Icons render correctly now.
4. **Worktree merge issues:** Cherry-pick from worktrees caused file deletions in earlier phases. Safe file-copy pattern works better. Consider `workflow.use_worktrees: false` for v8.1.
5. **Pre-existing TS errors:** `integration.test.ts` and several `*.test.ts` files have mock type errors. Not from v8.0 — pre-existing.
6. **`@ai-sdk/react` v3 API break:** `useChat` API changed in v3. `AnalyzeWorkspace` was rewritten to use `DefaultChatTransport` + `sendMessage`. Verify this works.

## Design System Reference

The HTML prototypes in `Hamilton-Design/` are the visual source of truth:
- `1-executive_home_briefing_final_polish/code.html` — Home screen
- `2-ask_hamilton_deep_analysis_workspace/code.html` — Analyze screen
- `3-simulation_mode_interactive_decision_terminal/code.html` — Simulate screen
- `4-report_builder/code.html` — Report Builder screen
- `5-monitoring_alerts/code.html` — Monitor screen

Each HTML file contains the exact Tailwind config with M3 color tokens (now in `globals.css` `.hamilton-shell` block), font families, shadow values, and component markup. Use the **styling** from these files, NOT the **content** (which is placeholder).

## Files Changed in v8.0 (key paths)

```
src/app/pro/(hamilton)/layout.tsx          — Hamilton shell layout
src/app/pro/(hamilton)/hamilton/page.tsx    — Home / Executive Briefing
src/app/pro/(hamilton)/analyze/page.tsx     — Analyze Workspace
src/app/pro/(hamilton)/simulate/page.tsx    — Simulate
src/app/pro/(hamilton)/reports/page.tsx     — Report Builder
src/app/pro/(hamilton)/monitor/page.tsx     — Monitor
src/app/pro/(hamilton)/settings/page.tsx    — Settings
src/app/pro/layout.tsx                     — Stripped to auth-only wrapper
src/app/pro/page.tsx                       — Redirects premium to /pro/monitor

src/components/hamilton/layout/            — Shell components (5)
src/components/hamilton/home/              — Home components (6)
src/components/hamilton/analyze/           — Analyze components (9)
src/components/hamilton/simulate/          — Simulate components (10)
src/components/hamilton/reports/           — Report components (8+)
src/components/hamilton/monitor/           — Monitor components (5)

src/lib/hamilton/types.ts                  — Screen DTOs added
src/lib/hamilton/modes.ts                  — HamiltonMode + MODE_BEHAVIOR
src/lib/hamilton/navigation.ts             — HAMILTON_NAV, LEFT_RAIL_CONFIG, etc.
src/lib/hamilton/pro-tables.ts             — 6 table creation + DB queries
src/lib/hamilton/confidence.ts             — Confidence tier logic
src/lib/hamilton/simulation.ts             — Percentile math (client-safe)
src/lib/hamilton/home-data.ts              — Home briefing data fetcher
src/lib/hamilton/monitor-data.ts           — Monitor page data fetcher
src/lib/hamilton/seed-monitor-data.ts      — Demo signal seeder

src/app/globals.css                        — .hamilton-shell M3 token system
src/app/api/hamilton/simulate/route.ts     — Simulate streaming API
src/app/api/pro/report-pdf/route.ts        — PDF export API
```

## Recommended v8.1 Phase Order

1. Settings cleanup (minor — migration + Stripe wiring)
2. Monitor (strip fake signals, wire real DB, verify empty state)
3. Home / Briefing (wire real thesis + index data)
4. Analyze (verify streaming, strip hardcoded content)
5. Simulate (make category-agnostic, wire real distribution data)
6. Reports (reframe templates for clients, wire real generation)
7. Integration pass (verify screen-to-screen flows: Home CTA → Simulate → Report)

## Unpushed Commits

**108+ commits on main, not pushed to origin.** All v8.0 work is local only. Push when v8.1 is stable enough for production.
