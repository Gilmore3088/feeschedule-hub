---
phase: 26-national-data-admin-portal
plan: "01"
subsystem: admin-portal
tags: [admin, national-data, tab-nav, overview, freshness-badges]
dependency_graph:
  requires: []
  provides:
    - /admin/national page shell with 4-tab navigation
    - NationalEconomicSummary data layer (getRichIndicator, getCpiYoyRichIndicator, getNationalEconomicSummary)
    - IndustryHealthMetrics data layer (getIndustryHealthMetrics)
    - FreshnessBadge component (inline, green/amber/red thresholds)
  affects:
    - src/app/admin/admin-nav.tsx
    - src/lib/crawler-db/fed.ts
tech_stack:
  added:
    - src/lib/crawler-db/health.ts (new module)
  patterns:
    - Async server component with Promise.all data fetching
    - Tab routing via URL searchParams with whitelist validation
    - startTransition for client-side router.push (React 19 pattern)
    - RichIndicator pattern (current + history + trend + asOf)
key_files:
  created:
    - src/app/admin/national/page.tsx
    - src/app/admin/national/tab-nav.tsx
    - src/app/admin/national/overview-panel.tsx
    - src/lib/crawler-db/health.ts
  modified:
    - src/app/admin/admin-nav.tsx
    - src/lib/crawler-db/fed.ts
decisions:
  - Used RichIndicator pattern for economic and health metrics (current + history + trend + asOf) to support sparklines and freshness badges uniformly
  - getIndustryHealthMetrics queries institution_financials directly, filtering outliers with BETWEEN -10 AND 10 guard on ROA/ROE
  - CPI YoY computed as rolling calculation over 13 months of CPIAUCSL data rather than storing a derived series
  - Tab content for non-overview tabs renders a placeholder div; Plan 02 will replace with real panels
metrics:
  duration_minutes: 25
  completed_date: "2026-04-07"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 2
---

# Phase 26 Plan 01: National Data Portal Shell Summary

**One-liner:** `/admin/national` tab-shell with 4-tab navigation, freshness-badged overview cards for Call Reports, FRED, Beige Book, and Industry Health, backed by new `RichIndicator` data layer in `fed.ts` and new `health.ts` module.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Page shell with tab navigation and admin nav entry | ca2d833 | page.tsx, tab-nav.tsx, admin-nav.tsx |
| 2 | Overview panel with data source summary cards and freshness badges | 1bc4e57 | overview-panel.tsx, health.ts, fed.ts |

## What Was Built

### /admin/national page
- Server component at `src/app/admin/national/page.tsx` with `requireAuth("view")` auth gate
- `searchParams.tab` validated against `TABS = ["overview", "call-reports", "economic", "health"]`; unknown values default to `"overview"` (T-26-02 mitigation)
- `<Suspense fallback={<SkeletonCards count={4} />}>` wraps content below `TabNav` so the tab bar stays visible during async loading
- Other tabs render a `"Coming in Plan 02"` placeholder

### TabNav client component
- `"use client"` component using `useRouter` + `useSearchParams`
- `router.push()` wrapped in `startTransition` per React 19 pattern
- Active tab: `border-b-2 border-gray-900 text-gray-900 dark:border-gray-100 dark:text-gray-100`
- Sticky at `top-[57px] z-30` to match market page segment control bar

### Admin nav entry
- "Data Hub" added to Benchmarks group in `admin-nav.tsx` after "Districts"
- Database-layers SVG icon (3-ellipse stack pattern)

### Overview panel
- Async server component (no `"use client"`) with concurrent `Promise.all` fetching
- 4 data source cards in `grid-cols-1 md:grid-cols-2 gap-4` layout
- **Card 1 (Call Reports):** latest quarter total service charges, institution count, YoY%, bank vs CU split
- **Card 2 (FRED Economic):** 4 indicator rows (Fed Funds, Unemployment, CPI YoY, Consumer Sentiment) with sparklines
- **Card 3 (Beige Book):** district summary count, static "Updated quarterly" badge
- **Card 4 (Industry Health):** ROA, ROE, efficiency ratio with trend arrows and sparklines
- `FreshnessBadge`: green (<7d), amber (7–30d), red (≥30d) with `"Xd ago"` / `"Xd — stale"` labels

### New data layer

**`src/lib/crawler-db/health.ts`** (new):
- `RichIndicator` interface: `{ current, history, trend, asOf }`
- `IndustryHealthMetrics`: ROA, ROE, efficiency_ratio as `RichIndicator | null`
- `getIndustryHealthMetrics()`: queries `institution_financials`, aggregates by quarter, filters outliers with `BETWEEN -10 AND 10`

**`src/lib/crawler-db/fed.ts`** (extended):
- `RichIndicator`, `NationalEconomicSummary` interfaces added
- `getRichIndicator(seriesId, limit)`: fetches history for any FRED series
- `getCpiYoyRichIndicator()`: builds YoY series from 13 months of CPIAUCSL
- `getNationalEconomicSummary()`: concurrent fetch of all 4 macro indicators

## Deviations from Plan

### Auto-added: health.ts module (Rule 2 - Missing critical functionality)
- **Found during:** Task 2 — `health.ts` referenced in plan interfaces did not exist
- **Fix:** Created `src/lib/crawler-db/health.ts` with `getIndustryHealthMetrics()` querying `institution_financials`
- **Files modified:** `src/lib/crawler-db/health.ts` (new)
- **Commit:** 1bc4e57

### Auto-added: getNationalEconomicSummary + RichIndicator to fed.ts (Rule 2 - Missing critical functionality)
- **Found during:** Task 2 — plan interfaces referenced `getNationalEconomicSummary()` and `RichIndicator` not present in `fed.ts`
- **Fix:** Added both interfaces and the function (including `getCpiYoyRichIndicator()` helper) to `fed.ts`
- **Files modified:** `src/lib/crawler-db/fed.ts`
- **Commit:** 1bc4e57

### Auto-fixed: TypeScript instanceof narrowing errors (Rule 1 - Bug)
- **Found during:** Task 1/2 verification — `instanceof Date` guard on `string | Date` type caused TS2358/TS2551
- **Fix:** Cast through `unknown` before instanceof check (`(val as unknown) instanceof Date`)
- **Files modified:** `src/lib/crawler-db/fed.ts`, `src/lib/crawler-db/health.ts`
- **Commit:** 1bc4e57

## Known Stubs

- **`src/app/admin/national/page.tsx`** — tabs `call-reports`, `economic`, `health` render `<div>Coming in Plan 02</div>`. These are intentional placeholders; Plan 02 will replace them with real data panels.

## Threat Flags

None. All threat mitigations from T-26-01 and T-26-02 are implemented:
- `requireAuth("view")` at page entry (T-26-01)
- Tab param validated against whitelist array (T-26-02)
- Beige Book text rendered as JSX text content, no `dangerouslySetInnerHTML` (T-26-03)

## Self-Check: PASSED

- `src/app/admin/national/page.tsx` — FOUND
- `src/app/admin/national/tab-nav.tsx` — FOUND
- `src/app/admin/national/overview-panel.tsx` — FOUND
- `src/lib/crawler-db/health.ts` — FOUND
- `src/app/admin/admin-nav.tsx` — FOUND (modified)
- `src/lib/crawler-db/fed.ts` — FOUND (modified)
- Commit ca2d833 — FOUND
- Commit 1bc4e57 — FOUND
- TypeScript: no errors in source files (pre-existing test file errors excluded)
