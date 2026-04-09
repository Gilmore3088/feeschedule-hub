# Phase 49: Monitor Live Data - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Strip all demo/fake signal data from the Monitor screen, verify real DB queries work against hamilton_signals and hamilton_watchlists tables, implement watchlist CRUD, verify Hamilton floating chat streaming, wire the left rail (Pinned Institutions + Peer Sets + Saved Analyses) to real data, and design proper empty states.

</domain>

<decisions>
## Implementation Decisions

### Demo Data Removal
- **D-01:** Remove `seedMonitorData(user.id)` call from `monitor/page.tsx` — no fake signals injected on page load
- **D-02:** Guard or delete `seed-monitor-data.ts` — keep only as a dev-only utility (not called in production page render)
- **D-03:** All monitor data must come from real DB queries via `fetchMonitorPageData()` — already implemented in `monitor-data.ts`

### Empty State
- **D-04:** When hamilton_signals table is empty, show onboarding guidance: "Add institutions to your watchlist to start receiving signals" with a CTA to Settings or watchlist add action
- **D-05:** Empty state must look intentional (designed card), not broken layout

### Watchlist CRUD
- **D-06:** User can add institutions or Fed agencies to their watchlist — persists to hamilton_watchlists table immediately
- **D-07:** User can remove items from watchlist — deletes from hamilton_watchlists immediately
- **D-08:** Watchlist panel shows real items from DB, not hardcoded names

### Floating Chat
- **D-09:** FloatingChatOverlay must stream real Hamilton responses via the Hamilton API — verify existing implementation works

### Left Rail Wiring (all sections)
- **D-10:** Pinned Institutions section = real watchlist items from hamilton_watchlists table (same data as Monitor watchlist panel)
- **D-11:** Peer Sets section = real saved_peer_sets from the user's Settings configuration
- **D-12:** Saved Analyses section = real entries from hamilton_saved_analyses table (empty state if none)
- **D-13:** Recent Work section = real recent analyses from hamilton_saved_analyses ordered by updated_at
- **D-14:** Strip ALL hardcoded left rail items (Goldman Sachs, Morgan Stanley, Top 5 Global, Domestic Mid-Caps, Overdraft Yield Audit, etc.)

### Claude's Discretion
- How to implement "add to watchlist" UX (inline button, modal, or search)
- Exact empty state visual styling within Hamilton design system
- Whether Simulate a Change CTA in left rail links to /pro/simulate or waits for Phase 52

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Monitor Page
- `src/app/pro/(hamilton)/monitor/page.tsx` — Main page, currently calls seedMonitorData (line 21)
- `src/app/pro/(hamilton)/monitor/actions.ts` — Server actions for watchlist CRUD

### Monitor Components
- `src/components/hamilton/monitor/SignalFeed.tsx` — Signal feed component
- `src/components/hamilton/monitor/WatchlistPanel.tsx` — Watchlist panel
- `src/components/hamilton/monitor/FloatingChatOverlay.tsx` — Chat overlay
- `src/components/hamilton/monitor/StatusStrip.tsx` — Overall status indicator
- `src/components/hamilton/monitor/PriorityAlertCard.tsx` — Top alert card

### Data Layer
- `src/lib/hamilton/monitor-data.ts` — Real DB queries (fetchMonitorPageData) — already reads from hamilton_signals/watchlists
- `src/lib/hamilton/seed-monitor-data.ts` — Demo data seeder (to remove/guard)
- `src/lib/hamilton/pro-tables.ts` — Table creation + DB queries for all hamilton_* tables

### Left Rail
- `src/components/hamilton/layout/HamiltonLeftRail.tsx` — Left sidebar with hardcoded items to strip
- `src/lib/crawler-db/saved-peers.ts` — Saved peer set queries (for Peer Sets section)

### Handoff
- `.planning/MILESTONE_8_HANDOFF.md` — Section "Screen 2: Monitor" describes exact requirements

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fetchMonitorPageData()` in monitor-data.ts already queries real DB tables — returns MonitorPageData with status, topAlert, signalFeed, watchlist
- `ensureHamiltonProTables()` creates all 6 hamilton_* tables on first access
- `getSavedPeerSets()` already exists in saved-peers.ts for left rail peer sets
- Server actions pattern established in monitor/actions.ts

### Established Patterns
- Hamilton screens use server components with `fetchXxxPageData()` pattern
- Server actions for mutations (add/remove/save)
- Left rail is a shared component across all Hamilton screens — changes here affect all screens

### Integration Points
- Left rail gets its data from the Hamilton layout — may need to pass user context from layout to left rail
- Watchlist data shared between Monitor watchlist panel AND left rail Pinned Institutions

</code_context>

<specifics>
## Specific Ideas

- Empty state should guide users to add watchlist items, making the Monitor immediately useful
- Left rail wiring is a global change — it applies to all Hamilton screens, not just Monitor

</specifics>

<deferred>
## Deferred Ideas

- Signal pipeline automation (auto-generating signals from fee changes) — deferred post-v8.1
- "Simulate a Change" CTA in left rail — wire to /pro/simulate in Phase 52

</deferred>

---

*Phase: 49-monitor-live-data*
*Context gathered: 2026-04-09*
