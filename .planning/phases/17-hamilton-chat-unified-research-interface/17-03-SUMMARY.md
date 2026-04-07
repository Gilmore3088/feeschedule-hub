---
phase: 17-hamilton-chat-unified-research-interface
plan: "03"
subsystem: hamilton-nav
tags: [navigation, routing, redirects, layout]
dependency_graph:
  requires: [17-01, 17-02]
  provides: [hamilton-unified-entry-point, tab-layout, nav-consolidation]
  affects: [admin-nav, research-hub, scout, hamilton-reports]
tech_stack:
  added: []
  patterns: [next-permanent-redirect, url-based-tab-state, server-client-layout]
key_files:
  created:
    - src/app/admin/hamilton/layout.tsx
    - src/app/admin/hamilton/reports/page.tsx
  modified:
    - src/app/admin/hamilton/page.tsx
    - src/app/admin/admin-nav.tsx
    - src/app/admin/research/page.tsx
    - src/app/admin/research/[agentId]/page.tsx
    - src/app/admin/scout/page.tsx
decisions:
  - layout-as-client-component: HamiltonLayout marked use client so it can use usePathname for tab active state — avoids a separate client sub-component file
  - reports-path-updated: Clear filter link in reports page updated from /admin/hamilton to /admin/hamilton/reports
  - nav-single-entry: All four Hamilton sub-nav items (Reports/Research/Scout/Methodology) collapsed to one Hamilton entry; sub-navigation now handled by the tab strip inside the layout
metrics:
  duration: "~8 minutes"
  completed: "2026-04-06"
  tasks_completed: 2
  files_changed: 7
---

# Phase 17 Plan 03: Hamilton Nav Consolidation and Tab Layout Summary

Two-tab Chat/Reports layout at `/admin/hamilton` with URL-based tab state, reports content moved to sub-route, and nav consolidated to a single Hamilton entry with Research Hub and Scout permanently redirected.

## What Was Built

### Task 1: Tab Layout + Reports Sub-Route + Page Redirect

**`src/app/admin/hamilton/layout.tsx`** — New layout wrapping all `/admin/hamilton/*` routes. Marked `"use client"` to use `usePathname` directly. Renders a two-tab strip (Chat → `/admin/hamilton/chat`, Reports → `/admin/hamilton/reports`) with active tab highlighted via `border-b-2 border-gray-900`, inactive tabs in `text-gray-400`. Tab strip sits above `{children}` with a `border-b border-gray-100` separator.

**`src/app/admin/hamilton/page.tsx`** — Replaced entire content with `permanentRedirect("/admin/hamilton/chat")`. Visiting `/admin/hamilton` now 308-redirects to the Chat tab per D-02.

**`src/app/admin/hamilton/reports/page.tsx`** — Full report management UI moved verbatim from the original `page.tsx`. Imports updated to use `../report-controls` and `../actions` (relative paths one level up, which correctly resolve since this file is now in the `reports/` subdirectory). Metadata title updated to `"Hamilton — Reports — Bank Fee Index Admin"`. The "Clear" filter link updated from `/admin/hamilton` to `/admin/hamilton/reports`.

### Task 2: Nav Consolidation + Research/Scout Redirects

**`src/app/admin/admin-nav.tsx`** — Hamilton nav group collapsed from four items (Reports, Research, Scout, Methodology) to a single "Hamilton" item pointing to `/admin/hamilton`. No `exact` flag — active check uses `pathname.startsWith(item.href)` which correctly highlights the Hamilton entry when on any `/admin/hamilton/*` sub-route (chat, reports, research/articles, etc.).

**`src/app/admin/research/page.tsx`** — Replaced Research Hub listing page with `permanentRedirect("/admin/hamilton")`.

**`src/app/admin/research/[agentId]/page.tsx`** — Replaced agent chat page with `permanentRedirect("/admin/hamilton")`. Underlying research API routes and all `src/lib/research/` modules remain intact for Hamilton's tool layer reuse.

**`src/app/admin/scout/page.tsx`** — Replaced FeeScout page with `permanentRedirect("/admin/hamilton")`.

## Implementation Approach

Tab active state is detected client-side via `usePathname()`. Making the layout itself a client component (`"use client"`) was the simplest approach — it avoids an extra file for a `HamiltonTabs` sub-component while keeping the layout small. The layout renders no async data so the client boundary has no meaningful cost.

Redirect pages use Next.js `permanentRedirect()` (308) from `next/navigation`. These are server components with no data dependencies — instantaneous redirects with no client bundle contribution.

## Deviations from Plan

None — plan executed exactly as written.

The plan suggested either making the full layout a client component or extracting a `HamiltonTabs` client sub-component. The layout-as-client-component approach was chosen as the simpler option (one less file, same outcome).

## TypeScript Status

6 pre-existing errors in test files (`Cannot find module 'vitest'`) — present before this plan, unchanged. Zero errors introduced by Plan 17-03.

## Known Stubs

None. The Reports tab renders live DB data (report_jobs, published_reports tables). The Chat tab renders the component from Plan 17-02. No placeholder data or hardcoded stubs.

## Threat Flags

None. Changes are pure routing/navigation — no new network endpoints, auth paths, or trust boundaries introduced.

## Self-Check

### Files Created
- `src/app/admin/hamilton/layout.tsx` — FOUND
- `src/app/admin/hamilton/reports/page.tsx` — FOUND

### Files Modified
- `src/app/admin/hamilton/page.tsx` — FOUND (contains permanentRedirect)
- `src/app/admin/admin-nav.tsx` — FOUND (single Hamilton entry)
- `src/app/admin/research/page.tsx` — FOUND (contains permanentRedirect)
- `src/app/admin/research/[agentId]/page.tsx` — FOUND (contains permanentRedirect)
- `src/app/admin/scout/page.tsx` — FOUND (contains permanentRedirect)

### Commits
- `f464b7e`: feat(17-03): add Hamilton tab layout, reports sub-route, and page redirect
- `09410bd`: feat(17-03): consolidate nav to single Hamilton entry + redirect Research/Scout pages

## Self-Check: PASSED
