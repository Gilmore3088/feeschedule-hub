---
phase: 40-hamilton-shell
plan: "02"
subsystem: hamilton-shell
tags: [shell, navigation, layout, left-rail, auth-gate, design-tokens]
dependency_graph:
  requires: [40-01]
  provides: [hamilton-shell-components, hamilton-top-nav, hamilton-context-bar, hamilton-left-rail, hamilton-upgrade-gate]
  affects: [src/app/pro/(hamilton)/layout.tsx, src/components/hamilton/layout/]
tech_stack:
  added: []
  patterns: [server-component, client-component, css-isolation, server-rendered-active-state, parameterized-sql]
key_files:
  created:
    - src/components/hamilton/layout/HamiltonUpgradeGate.tsx
    - src/components/hamilton/layout/HamiltonContextBar.tsx
    - src/components/hamilton/layout/HamiltonShell.tsx
    - src/components/hamilton/layout/HamiltonTopNav.tsx
    - src/components/hamilton/layout/HamiltonLeftRail.tsx
  modified:
    - src/app/pro/(hamilton)/layout.tsx
decisions:
  - "D-01: HamiltonUpgradeGate extracted as standalone server component — cleaner separation from layout auth logic"
  - "D-02: activeHref derived from x-invoke-path / x-next-url / x-pathname headers with /pro/monitor fallback"
  - "D-03: HamiltonShell is 'use client' to own left rail collapse state even though it passes server data as props"
  - "D-04: Hamilton CSS tokens restored from Phase 38 commit — were absent from worktree base"
metrics:
  duration_minutes: 20
  completed_date: "2026-04-09"
  tasks_completed: 4
  tasks_total: 4
  files_created: 5
  files_modified: 1
---

# Phase 40 Plan 02: Hamilton Shell Components — Summary

**One-liner:** Five Hamilton shell components (UpgradeGate, ContextBar, Shell, TopNav, LeftRail) built and wired into the Hamilton route group layout with server-side DB queries and server-rendered active nav state.

## What Was Built

### Task 1 — HamiltonUpgradeGate and HamiltonContextBar (server components)

**HamiltonUpgradeGate** (`src/components/hamilton/layout/HamiltonUpgradeGate.tsx`):
- Hamilton-branded upgrade page with feature bullet list, pricing ($500/mo or $5,000/yr), and gradient CTA
- Root div applies `.hamilton-shell` class for correct CSS token inheritance — renders within editorial aesthetic
- Links to `/subscribe?plan=hamilton`
- All colors via `var(--hamilton-*)` tokens (no hardcoded values)

**HamiltonContextBar** (`src/components/hamilton/layout/HamiltonContextBar.tsx`):
- Institution context display bar (~40px height) with `var(--hamilton-surface-elevated)` background
- When institution configured: name (serif bold), pipe separator, type, asset tier badge
- When not configured: "Configure your institution in Settings" link to `/pro/settings`
- Right side: static "LTM" horizon indicator
- Subtle bottom border with `var(--hamilton-border)`

### Task 2 — HamiltonShell, HamiltonTopNav, HamiltonLeftRail (client components)

**HamiltonTopNav** (`src/components/hamilton/layout/HamiltonTopNav.tsx`):
- Sticky `top-0 z-40` header with Hamilton wordmark (serif, terracotta accent) and 6 nav items
- Maps over `HAMILTON_NAV` from `@/lib/hamilton/navigation` — single source of truth per D-16
- Admin link conditionally rendered only when `isAdmin=true` (T-40-05 mitigation)
- Active state: receives `activeHref` prop (server-rendered value) and uses `usePathname()` for live client-side updates
- Active item: `var(--hamilton-accent)` 2px bottom border + primary text color

**HamiltonLeftRail** (`src/components/hamilton/layout/HamiltonLeftRail.tsx`):
- Collapsible sidebar: `w-64` expanded → `w-12` collapsed with `transition-all duration-200`
- Uses `useState(false)` for `isCollapsed`, chevron toggle button
- Derives current screen from `usePathname()` mapped to `HamiltonScreen` label via `HAMILTON_NAV`
- Screen-specific sections from `LEFT_RAIL_CONFIG[currentScreen].sections`
- "Saved Analyses": renders clickable list with title, analysis_focus badge, relative time — or "Run your first analysis" empty state
- "Scenarios": renders clickable list with fee_category, relative time — or "Create a scenario in Simulate" empty state
- All other sections: section-specific onboarding empty states from `SECTION_EMPTY_STATES` map
- Primary CTA button at bottom using `var(--hamilton-gradient-cta)` — hidden when Admin screen (empty primaryAction)
- Hidden below `lg` breakpoint (`hidden lg:flex`)

**HamiltonShell** (`src/components/hamilton/layout/HamiltonShell.tsx`):
- Root div: `.hamilton-shell min-h-screen` with `var(--hamilton-surface)` background
- Admin mode bar: dark `bg-gray-900`, "Admin Mode — viewing Hamilton Pro" + "Back to Admin" link
- Composes: HamiltonTopNav + HamiltonContextBar + two-column layout (HamiltonLeftRail + main)

### Task 3 — Layout wiring with DB queries

Updated `src/app/pro/(hamilton)/layout.tsx`:
- Replaced inline wrapper and inline HamiltonUpgradeGate with proper component imports
- Added `headers()` call to derive `activeHref` from `x-invoke-path` / `x-next-url` / `x-pathname` request headers
- Added `hamilton_saved_analyses` query (user-scoped with `WHERE user_id = ${user.id}`, wrapped in try/catch)
- Added `hamilton_scenarios` query (user-scoped with `WHERE user_id = ${user.id}`, wrapped in try/catch)
- Passes all data to `<HamiltonShell>` as props
- Preserved: Suspense boundary, `ensureHamiltonProTables().catch(() => {})`, `getCurrentUser()` auth check

### Task 4 — Visual verification (auto-approved in --auto mode)

Auto-approved. All TypeScript compilation checks pass. All done criteria verified programmatically.

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|-----------|
| T-40-04: Left rail showing other users' data | All DB queries filter `WHERE user_id = ${user.id}` from authenticated session |
| T-40-05: Admin nav link visible to non-admins | HamiltonTopNav receives `isAdmin` prop; Admin link conditionally rendered only when true |
| T-40-06: Upgrade gate bypass | Gate renders in server layout before children; client cannot bypass server-side auth check |
| T-40-07: Institution context leaking between users | institutionContext derived from authenticated user's own profile fields |
| T-40-08: SQL injection via user_id | Parameterized sql template literals — postgres library auto-parameterizes |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hamilton CSS tokens missing from worktree globals.css**
- **Found during:** Task 1 setup
- **Issue:** The worktree base commit predated Phase 38 Hamilton CSS work. `var(--hamilton-*)` tokens were absent from globals.css, meaning all components would render without the editorial aesthetic.
- **Fix:** Restored globals.css from the c716067 commit (which contained Phase 38 token work).
- **Files modified:** src/app/globals.css
- **Commit:** 39ca479

**2. [Rule 1 - Bug] modes.ts and pro-tables.ts missing from worktree**
- **Found during:** Task 2 setup
- **Issue:** Same worktree reset issue — Phase 38/39 files (modes.ts, pro-tables.ts) were not present in the working tree.
- **Fix:** Restored from c716067 commit using `git checkout c716067 -- <files>`.
- **Files modified:** src/lib/hamilton/modes.ts, src/lib/hamilton/pro-tables.ts
- **Commit:** 39ca479

## Known Stubs

None — all Hamilton shell components render their actual intended UI. Left rail sections show onboarding empty states which are intentional (not stubs), per the plan spec.

## Threat Flags

None. No new security-relevant surfaces beyond those in the plan's threat model.

## Self-Check: PASSED

Files verified:
- FOUND: src/components/hamilton/layout/HamiltonUpgradeGate.tsx
- FOUND: src/components/hamilton/layout/HamiltonContextBar.tsx
- FOUND: src/components/hamilton/layout/HamiltonShell.tsx
- FOUND: src/components/hamilton/layout/HamiltonTopNav.tsx
- FOUND: src/components/hamilton/layout/HamiltonLeftRail.tsx
- FOUND: src/app/pro/(hamilton)/layout.tsx (updated)

Commits verified:
- 159590d: feat(40-02): add HamiltonUpgradeGate and HamiltonContextBar server components
- 39ca479: feat(40-02): add HamiltonShell, HamiltonTopNav, HamiltonLeftRail client components
- 162bfc6: feat(40-02): wire HamiltonShell and DB queries into Hamilton layout
