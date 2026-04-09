---
phase: 40-hamilton-shell
plan: "01"
subsystem: hamilton-shell
tags: [routing, auth, layout, navigation]
dependency_graph:
  requires: []
  provides: [hamilton-route-group, hamilton-auth-layout, hamilton-stub-pages]
  affects: [src/app/pro, src/lib/hamilton/navigation.ts]
tech_stack:
  added: []
  patterns: [next-route-group, server-component-layout, suspense-boundary, fire-and-forget]
key_files:
  created:
    - src/app/pro/(hamilton)/layout.tsx
    - src/app/pro/(hamilton)/hamilton/page.tsx
    - src/app/pro/(hamilton)/analyze/page.tsx
    - src/app/pro/(hamilton)/simulate/page.tsx
    - src/app/pro/(hamilton)/reports/page.tsx
    - src/app/pro/(hamilton)/monitor/page.tsx
  modified:
    - src/lib/hamilton/navigation.ts
    - src/app/pro/page.tsx
decisions:
  - "D-01: Home screen at /pro/hamilton (not /pro/home) — HAMILTON_NAV corrected"
  - "D-02: Premium users redirected from /pro to /pro/monitor (Monitor is default landing)"
  - "D-09/D-11: Non-subscribers see inline HamiltonUpgradeGate, no redirect from Hamilton layout"
  - "D-12: ProLayout pattern followed exactly — Suspense -> async inner component"
  - "D-13: hamilton-shell CSS class applied for CSS isolation scope"
  - "D-15: ensureHamiltonProTables called fire-and-forget with .catch(() => {})"
metrics:
  duration_minutes: 12
  completed_date: "2026-04-09"
  tasks_completed: 3
  tasks_total: 3
  files_created: 6
  files_modified: 2
---

# Phase 40 Plan 01: Hamilton Shell — Route Group, Auth Layout, and Nav Fix

**One-liner:** Next.js (hamilton) route group with auth-gated server layout, upgrade gate for non-subscribers, 5 stub pages at canonical URLs, and HAMILTON_NAV href correction from /pro/home to /pro/hamilton.

## What Was Built

### Task 1 — HAMILTON_NAV href fix
Changed `HAMILTON_NAV[0].href` from `${HAMILTON_BASE}/home` to `${HAMILTON_BASE}/hamilton` in `src/lib/hamilton/navigation.ts`. This aligns the navigation source of truth with D-01 (Home screen lives at /pro/hamilton). All 19 navigation tests pass.

### Task 2 — (hamilton) route group with auth-gated layout
Created `src/app/pro/(hamilton)/layout.tsx` as a server component following the ProLayout pattern:
- Outer `HamiltonLayout` wraps async inner in `<Suspense fallback={null}>`
- `HamiltonLayoutInner` calls `getCurrentUser()` in try/catch
- Non-premium users (or null user) see `HamiltonUpgradeGate` component (inline, to be extracted in Plan 02)
- `ensureHamiltonProTables().catch(() => {})` fires non-blocking on each render
- Admin/analyst users see the admin mode bar with link back to /admin
- `institutionContext` derived from user profile fields (name, type, assetTier) per D-14/SHELL-05
- CSS isolation via `hamilton-shell` class on root div

Created 5 stub pages with correct screen names and phase markers:
- `/pro/hamilton` — "Executive Briefing" (Phase 42)
- `/pro/analyze` — "Analysis Workspace" (Phase 43)
- `/pro/simulate` — "Scenario Modeling" (Phase 44)
- `/pro/reports` — "Report Builder" (Phase 45)
- `/pro/monitor` — "Institutional Monitor" (Phase 46)

### Task 3 — /pro redirect to /pro/monitor for premium users
Modified `src/app/pro/page.tsx` to `redirect("/pro/monitor")` for premium users. Non-premium users still see the marketing page. Removed now-unused `ProDashboard` import.

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|-----------|
| T-40-01: Direct URL access by unauthenticated user | Parent ProLayout redirects to /login; Hamilton layout renders upgrade gate as double-check |
| T-40-02: Admin bar shown to non-admins | `isAdmin` check gates the bar rendering |
| T-40-03: No session when layout renders | getCurrentUser() in try/catch returns null → upgrade gate shown, no crash |

## Deviations from Plan

None — plan executed exactly as written. Pre-existing TypeScript errors in test mocks (crawler-db test files) are out of scope and not caused by this plan's changes.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `HamiltonUpgradeGate` inline component | layout.tsx | Plan 02 extracts to standalone component |
| `HamiltonTopNav`, `HamiltonContextBar`, `HamiltonLeftRail` | layout.tsx comment | Plan 02 wires the full shell chrome |
| institutionContext passed but unused | layout.tsx | Plan 02 passes to HamiltonShell component |

These stubs do not prevent the plan's goal (route infrastructure + auth gating) from being achieved. Plan 02 resolves all three.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 1861a45 | fix(40-01): update HAMILTON_NAV Home href from /pro/home to /pro/hamilton |
| 2 | bc72042 | feat(40-01): create (hamilton) route group with auth-gated layout and 5 stub pages |
| 3 | d8ae342 | feat(40-01): redirect premium users from /pro to /pro/monitor (D-02) |

## Self-Check: PASSED

- [x] `src/app/pro/(hamilton)/layout.tsx` exists with getCurrentUser, canAccessPremium, ensureHamiltonProTables, hamilton-shell
- [x] All 5 stub pages exist with correct screen names
- [x] `redirect("/pro/monitor")` present in `src/app/pro/page.tsx`
- [x] HAMILTON_NAV[0].href is `/pro/hamilton`
- [x] All 3 commits exist: 1861a45, bc72042, d8ae342
- [x] No TypeScript errors in new Hamilton files (tsc --noEmit clean for hamilton paths)
- [x] 19/19 navigation tests pass
