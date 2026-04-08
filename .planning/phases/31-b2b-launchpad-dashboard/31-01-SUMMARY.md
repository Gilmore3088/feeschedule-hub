---
phase: 31-b2b-launchpad-dashboard
plan: "01"
subsystem: pro-dashboard
tags: [pro, dashboard, launchpad, peer-snapshot, personalization]

dependency_graph:
  requires:
    - src/lib/personalization.ts (derivePersonalizationContext)
    - src/lib/crawler-db/fee-index.ts (getNationalIndexCached, getPeerIndex)
    - src/lib/fee-taxonomy.ts (getSpotlightCategories, getDisplayName)
    - src/lib/fed-districts.ts (STATE_TO_DISTRICT)
    - src/lib/format.ts (formatAmount)
    - src/lib/auth.ts (User interface)
  provides:
    - ProDashboard component with four-door launchpad + peer snapshot sidebar
  affects:
    - src/app/pro/page.tsx (renders ProDashboard, DashboardProps now expects full User)

tech_stack:
  added: []
  patterns:
    - async server component with parallel data fetching (Promise.all)
    - inline SVG icon paths (no icon library import)
    - sticky sidebar with lg:sticky lg:top-24 self-start pattern
    - conditional peer filter construction from user profile fields

key_files:
  created: []
  modified:
    - src/app/pro/dashboard.tsx

decisions:
  - "DashboardProps expanded from narrow anonymous type to full User interface to enable derivePersonalizationContext call"
  - "Both Task 1 and Task 2 implemented in single commit — they target the same file and are tightly coupled"
  - "Peer filter construction uses hasPeerFilters guard to avoid empty getPeerIndex() call when no user profile data exists"
  - "Hamilton door uses border-l-4 + col-span-2 to span full grid width as specified; border-[#E8DFD1] base still applies on non-left sides"

metrics:
  duration_minutes: 8
  completed_date: "2026-04-08"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 1
---

# Phase 31 Plan 01: Four-Door Launchpad Dashboard Summary

Rebuilt `ProDashboard` with a four-door launchpad grid (Hamilton spanning full top row) and a sticky peer snapshot sidebar showing top 3 spotlight categories with peer vs national medians and delta % indicators in warm pro palette.

## What Was Built

**Four-door launchpad grid (main col-span-8):**
- Welcome header: user initial circle, institution name in Newsreader serif h1, peer group + Fed district sub-line from `derivePersonalizationContext`
- 2x2 grid: Hamilton gets `col-span-2` top row with terracotta left accent (`border-l-4 border-l-[#C44B2E]`), `text-[17px]` title, and arrow suffix on description
- Peer Builder, Reports, and Federal Data fill bottom two slots as standard `1-col` cards
- All doors: `rounded-xl border border-[#E8DFD1] bg-white/80 backdrop-blur-sm`, terracotta hover state, inline SVG icons (Heroicons outline paths)

**Peer snapshot sidebar (col-span-4, sticky):**
- Header reads "Peer Snapshot" when user profile has filters, "National Spotlight" as fallback
- Shows top 3 spotlight categories (from `getSpotlightCategories().slice(0, 3)`)
- Two-column layout per row: "Your Peers" median + "National" median + delta pill
- Delta color coding: `text-emerald-600` for delta < -2% (cost advantage), `text-red-500` for delta > 2%, `text-[#A09788]` neutral for flat
- Footer links to `/pro/market` as "Full Market Explorer"
- Falls back to showing national spotlight medians (no delta column) when user has no profile filters

**Data flow:**
- `derivePersonalizationContext(user)` → peer group label, Fed district label, sub-line
- `STATE_TO_DISTRICT[user.state_code]` → district number for peer filter
- `Promise.all([getNationalIndexCached(), getPeerIndex(peerFilters)])` — peer query skipped when no filters apply
- Old content removed: quick actions bar, usage stats, recent conversations, state comparison, national spotlight table

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Peer filter guard before getPeerIndex call**
- **Found during:** Task 2 implementation
- **Issue:** Calling `getPeerIndex({})` with empty filters would execute a full unfiltered query, returning the same data as `getNationalIndex` and wasting a DB round-trip
- **Fix:** Added `hasPeerFilters` boolean guard; skips `getPeerIndex` call entirely when user has no profile data, resolves with `[]` instead
- **Files modified:** src/app/pro/dashboard.tsx
- **Commit:** 855a019

**2. [Rule 1 - Type widening] DashboardProps uses full User interface**
- **Found during:** Task 1 — `derivePersonalizationContext` requires `User` (needs `institution_type`, `asset_tier`), but old `DashboardProps` only carried `id`, `institution_name`, `state_code`, `email`, `username`, `role`
- **Fix:** Changed `DashboardProps` to `{ user: User }` importing `User` from `@/lib/auth`; `page.tsx` already passes the full `User` object so no caller changes needed
- **Files modified:** src/app/pro/dashboard.tsx
- **Commit:** 855a019

## Known Stubs

None. All data sources are wired:
- `derivePersonalizationContext` returns real values from the user's profile
- `getNationalIndexCached` and `getPeerIndex` return live DB data
- Spotlight categories come from `getSpotlightCategories()` (taxonomy constant)

## Threat Flags

None. No new network endpoints, auth paths, or file access patterns introduced. Component sits behind the existing `ProLayout` auth guard.

## Self-Check: PASSED

- [x] `src/app/pro/dashboard.tsx` exists and was modified (263 insertions, 223 deletions)
- [x] Commit `855a019` exists in git log
- [x] `npx tsc --noEmit` reports zero errors in `src/app/pro/` routes
- [x] Pre-existing test file type errors are unrelated to this plan (MockSql cast issues in `*.test.ts` files)
