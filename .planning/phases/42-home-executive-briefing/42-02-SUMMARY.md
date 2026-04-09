---
phase: 42-home-executive-briefing
plan: "02"
subsystem: hamilton-home
tags: [hamilton, executive-briefing, signals, alerts, server-components, suspense]
dependency_graph:
  requires: [42-01]
  provides: [complete-executive-briefing-screen]
  affects: [src/app/pro/(hamilton)/hamilton/page.tsx, src/lib/hamilton/home-data.ts]
tech_stack:
  added: []
  patterns:
    - unstable_noStore() for fresh data within ISR-cached page
    - Suspense boundary splitting ISR-cached and fresh-data server components
    - Promise.all parallel signal/alert fetches
    - User-scoped SQL queries with LIMIT bounds (T-42-04, T-42-06)
key_files:
  created:
    - src/components/hamilton/home/WhatChangedCard.tsx
    - src/components/hamilton/home/PriorityAlertsCard.tsx
    - src/components/hamilton/home/RecommendedActionCard.tsx
    - src/components/hamilton/home/MonitorFeedPreview.tsx
  modified:
    - src/lib/hamilton/home-data.ts
    - src/app/pro/(hamilton)/hamilton/page.tsx
decisions:
  - "BriefingSignals async server component wraps signal cards with unstable_noStore() so they opt out of the page-level 86400s ISR cache while thesis/positioning remain cached"
  - "fetchHomeBriefingSignals calls fetchRecentSignals(5) and fetchRecentSignals(3) as separate calls (not a slice) to keep query intent explicit"
  - "recommendedCategory derived by scanning core_thesis + tension implications for spotlight category names; falls back to 'overdraft'"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-08"
  tasks_completed: 3
  files_changed: 6
---

# Phase 42 Plan 02: Executive Briefing Signal Modules Summary

Signal-driven modules completing the Hamilton Executive Briefing: WhatChanged, PriorityAlerts, RecommendedAction CTA, and MonitorFeed preview with ISR/fresh data Suspense split.

## What Was Built

### Task 1: Signal/Alert Data Layer + Four Card Components

Extended `src/lib/hamilton/home-data.ts` with:
- `SignalEntry` and `AlertEntry` interfaces
- `HomeBriefingSignals` aggregate interface
- `fetchRecentSignals(limit)` — queries `hamilton_signals` ordered by `created_at DESC`
- `fetchPriorityAlerts(userId, limit)` — joins `hamilton_priority_alerts` + `hamilton_signals`, filters `status = 'active'`, orders by severity rank then `created_at DESC`
- `fetchHomeBriefingSignals(userId)` — parallel `Promise.all` for whatChanged (5), priorityAlerts (3), monitorFeed (3)
- `recommendedCategory: string | null` added to `HomeBriefingData` — heuristic scan of thesis text for spotlight category names, fallback `"overdraft"`

Four new server components (no `"use client"`):

**WhatChangedCard** — severity dots (red/amber/blue), title + body truncated to 1 line, `timeAgo()` timestamps. Empty state guides user with continuous monitoring message.

**PriorityAlertsCard** — severity badge pills with color coding (high=red, medium=amber, low=blue), title + body, "Review" text link. Empty state confirms monitoring is active.

**RecommendedActionCard** — when thesis exists: serif sentence + "Simulate Change" gradient CTA linking to `/pro/simulate?category={category}`. When no thesis: redirects to `/pro/settings`. Full-width layout.

**MonitorFeedPreview** — left accent border timeline layout, signal type label, title, timestamp. "View all signals →" link at bottom to `/pro/monitor`. Empty state explains signal discovery.

### Task 2: Complete Page Wiring

Updated `src/app/pro/(hamilton)/hamilton/page.tsx`:
- `export const revalidate = 86400` preserved for ISR on thesis/positioning
- `BriefingSignals` inline async server component calls `unstable_noStore()` then `getCurrentUser()` then `fetchHomeBriefingSignals()`
- `<Suspense fallback={<SignalsSkeleton />}>` wraps `BriefingSignals` for streaming
- `SignalsSkeleton` shows 4 pulsing `.hamilton-card.skeleton` placeholders
- Layout: HamiltonViewCard → PositioningEvidence → (Suspense: WhatChanged+PriorityAlerts 2-col → RecommendedAction → MonitorFeed)
- All Plan 02 placeholder comments removed

### Task 3: Visual Verification

Auto-approved (--auto mode). TypeScript compiles clean with zero production errors. All 6 modules wired.

## Decisions Made

1. **ISR/fresh split via unstable_noStore()**: The page-level `revalidate = 86400` caches thesis generation. `BriefingSignals` component calls `unstable_noStore()` to opt its subtree out of that cache — signals stay fresh every load without a separate route segment.

2. **Parallel fetches**: `fetchHomeBriefingSignals` uses `Promise.all` for all three queries simultaneously. The 5-signal and 3-signal queries are separate calls (not a slice) for query clarity.

3. **User-scoped alerts**: `getCurrentUser()` called inside `BriefingSignals` (the fresh component, not the page). This is safe because the layout already gates premium access.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All four cards render real data from `hamilton_signals` and `hamilton_priority_alerts` tables. Empty states are guided (not blank) when tables have no data.

## Threat Flags

No new threat surface beyond what was in the plan's threat model. All mitigations applied:
- T-42-04: `fetchPriorityAlerts` scopes by `user_id` in WHERE clause
- T-42-06: LIMIT 5 (What Changed), LIMIT 3 (Monitor Feed), LIMIT 3 (alerts) — no unbounded queries
- T-42-07: `getCurrentUser()` called inside `BriefingSignals` for fresh-data auth scoping

## Self-Check: PASSED
