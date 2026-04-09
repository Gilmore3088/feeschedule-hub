# Phase 46: Monitor - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Monitor screen at `/pro/monitor` — the default Pro landing page. Continuous surveillance with status strip, priority alert card, signal feed timeline, watchlist panel, floating chat overlay, and fee movements display. This is the retention screen.

</domain>

<decisions>
## Implementation Decisions

### Signal & Alert Display
- **D-01:** Status strip shows overall system state (stable/watch/worsening) derived from signal severity distribution. New signals count and high-priority alerts count.
- **D-02:** Priority Alert card displays top alert with severity badge, impact description, "Why It Matters" text, and recommended next move with "Execute" CTA.
- **D-03:** Signal Feed is a reverse-chronological timeline with left-border severity indicator. Each signal shows: institution name, "What Changed", "Why It Matters", recommended next move.
- **D-04:** Match Screen 5 prototype from `Hamilton-Design/5-monitoring_alerts/screen.png`.

### Watchlist & Fee Movements
- **D-05:** Watchlist panel (right sidebar) shows tracked institutions with renewal/review status indicators (green check, amber warning, gray unknown).
- **D-06:** Fee Movements panel shows key metrics: custodial premium change, management alpha change, advisory spread status — with alignment badges.

### Floating Chat
- **D-07:** Floating chat overlay in bottom-right — allows user to ask Hamilton questions without leaving Monitor. Uses existing Hamilton streaming chat API with `mode: "monitor"`.
- **D-08:** Chat overlay is collapsible — minimized by default, expands on click. Does not disrupt the signal feed.

### Data Sources
- **D-09:** Signals from `hamilton_signals` table (Phase 39). For v8.0, signals must be pre-seeded with test data — the automated pipeline is deferred.
- **D-10:** Watchlist configuration from `hamilton_watchlists` table (Phase 39).
- **D-11:** Priority alerts from `hamilton_priority_alerts` table (Phase 39).
- **D-12:** Since Monitor is the DEFAULT landing page (/pro redirects here per Phase 40 D-02), it must handle the empty state gracefully — guided onboarding when no signals exist.

### Claude's Discretion
- Exact signal feed polling strategy (page-load only vs periodic refresh)
- Floating chat implementation (React Portal vs positioned div)
- How to seed test signals for v8.0 demo

</decisions>

<canonical_refs>
## Canonical References

### Design Target
- `Hamilton-Design/5-monitoring_alerts/screen.png` — Visual target
- `Hamilton-Design/hamilton_revamp_package/03-screen-specs.md` — Screen 5 spec
- `Hamilton-Design/hamilton_revamp_package/06-api-and-agent-contracts.md` — MonitorResponse

### Existing Code
- `src/lib/hamilton/types.ts` — MonitorResponse DTO (Phase 38)
- `src/lib/hamilton/pro-tables.ts` — hamilton_signals, hamilton_watchlists, hamilton_priority_alerts tables (Phase 39)
- `src/app/pro/(hamilton)/monitor/page.tsx` — Current stub
- `src/app/api/research/hamilton/route.ts` — Hamilton streaming API (for floating chat)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- hamilton_signals, hamilton_watchlists, hamilton_priority_alerts tables (Phase 39)
- Hamilton streaming API for floating chat
- MonitorResponse type already defined
- Home screen's signal query patterns from Phase 42 (WhatChangedCard, PriorityAlertsCard)

### Integration Points
- Replace stub at `src/app/pro/(hamilton)/monitor/page.tsx`
- New components in `src/components/hamilton/monitor/`
- Floating chat component (likely in `src/components/hamilton/layout/` or `monitor/`)
- Signal seed script or fixture data for v8.0

</code_context>

<specifics>
## Specific Ideas

- Monitor is the daily-use retention screen — it should be compelling enough to check every morning
- Signal feed should feel like a Bloomberg terminal's alert feed, not a log viewer
- Floating chat lets power users get answers without navigating away

</specifics>

<deferred>
## Deferred Ideas

- Automated signal generation pipeline — post v8.0
- Real-time WebSocket signal updates — polling is sufficient for v8.0
- Watchlist editing UI — basic display only for v8.0, configuration via Settings

</deferred>

---

*Phase: 46-monitor*
*Context gathered: 2026-04-09*
