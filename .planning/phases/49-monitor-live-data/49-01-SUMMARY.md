---
phase: 49-monitor-live-data
plan: "01"
subsystem: hamilton-monitor
tags: [monitor, live-data, empty-state, watchlist, seed-data]
dependency_graph:
  requires: []
  provides: [monitor-live-data-wiring]
  affects: [src/app/pro/(hamilton)/monitor, src/components/hamilton/monitor, src/lib/hamilton]
tech_stack:
  added: []
  patterns: [server-component-data-fetch, designed-empty-state, dev-only-guard]
key_files:
  created: []
  modified:
    - src/app/pro/(hamilton)/monitor/page.tsx
    - src/lib/hamilton/seed-monitor-data.ts
    - src/components/hamilton/monitor/SignalFeed.tsx
    - src/components/hamilton/monitor/WatchlistPanel.tsx
decisions:
  - "Kept seed-monitor-data.ts file intact (dev CLI utility) but guarded with NODE_ENV production check"
  - "FeeMovements section removed entirely with Phase 50 TODO — deferred to fee_change_events wiring"
metrics:
  duration_seconds: 114
  completed_date: "2026-04-09"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 4
  files_created: 0
---

# Phase 49 Plan 01: Strip Demo Data from Monitor Screen Summary

**One-liner:** Monitor screen now fetches exclusively from `hamilton_signals` and `hamilton_watchlists` DB tables, with a designed serif empty state replacing the broken plain-text fallback and all hardcoded FEE_MOVEMENTS removed.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Strip demo data from Monitor page and design empty state | `4029969` | page.tsx, seed-monitor-data.ts, SignalFeed.tsx, WatchlistPanel.tsx |

## What Was Built

**monitor/page.tsx:** Removed the `seedMonitorData` import and `await seedMonitorData(user.id)` call. Page now flows directly: `getCurrentUser` → `fetchMonitorPageData` → render. No demo data injected on page load.

**seed-monitor-data.ts:** Added `NODE_ENV === "production"` guard at top of function body (returns early with console.warn). Added `@deprecated` JSDoc noting it is a dev-only utility. File retained for CLI/test seeding use.

**SignalFeed.tsx:** Replaced the minimal `<p>` empty state with a designed onboarding card — serif `<h3>` "No signals yet." headline, body copy directing users to add watchlist institutions, `borderLeft: "4px solid var(--hamilton-outline-variant)"` accent, and rounded container matching Hamilton surface tokens.

**WatchlistPanel.tsx:** Removed the entire `FEE_MOVEMENTS` constant array, the `FeeMovements()` component function, and its `<FeeMovements />` call in the render tree. Left a `// TODO Phase 50: wire fee movements to real fee_change_events data` comment in place.

## Verification Results

| Check | Result |
|-------|--------|
| `seedMonitorData` count in page.tsx | 0 (PASS) |
| `fetchMonitorPageData` present in page.tsx | FOUND (PASS) |
| `NODE_ENV` guard in seed-monitor-data.ts | FOUND (PASS) |
| "Add institutions to your watchlist" in SignalFeed.tsx | FOUND (PASS) |
| `borderLeft` in EmptyState | FOUND (PASS) |
| `FEE_MOVEMENTS` count in WatchlistPanel.tsx | 0 (PASS) |
| `npx tsc --noEmit` (production files) | No errors (PASS) |
| `npx vitest run` | 357 passed, 1 pre-existing fail (PASS) |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

**Fee Movements section (WatchlistPanel.tsx):** Removed entirely. A `// TODO Phase 50` comment marks where real `fee_change_events` data will be wired. The absence of this section does not prevent the plan's goal (removing hardcoded data) from being achieved — it is intentional deferral documented for Phase 50.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes introduced. Existing `addToWatchlist`/`removeFromWatchlist` server actions continue to scope mutations to `userId` from `getCurrentUser()` (T-49-01 already mitigated).

## Self-Check: PASSED

- `src/app/pro/(hamilton)/monitor/page.tsx` — exists, seedMonitorData removed
- `src/lib/hamilton/seed-monitor-data.ts` — exists, production guard added
- `src/components/hamilton/monitor/SignalFeed.tsx` — exists, onboarding empty state present
- `src/components/hamilton/monitor/WatchlistPanel.tsx` — exists, FEE_MOVEMENTS removed
- Commit `4029969` — confirmed in git log
