---
phase: 23-call-report-fred-foundation
plan: "03"
subsystem: data-layer
tags: [fdic-tiers, asset-tiers, peer-filters, call-reports, migration]
dependency_graph:
  requires: [23-01]
  provides: [FDIC_TIER_LABELS, FDIC_TIER_ORDER, FDIC_TIER_BREAKPOINTS, getTierForAssets, getRevenueByTier]
  affects: [peer-filters, market-index, national-index, institution-pages, pro-pages, report-assemblers]
tech_stack:
  added: []
  patterns:
    - FDIC QBP 5-tier asset classification (micro/community/midsize/regional/mega)
    - OLD_TO_NEW_TIER backward compat mapping in parsePeerFilters()
    - SQL CASE breakpoints matching TypeScript FDIC_TIER_BREAKPOINTS constants
key_files:
  created:
    - scripts/migrations/024-migrate-asset-tier-keys.sql
  modified:
    - src/lib/fed-districts.ts
    - src/lib/crawler-db/call-reports.ts
    - src/lib/crawler-db/call-reports.test.ts
    - src/components/tier-multi-select.tsx
    - src/components/peer-filters-bar.tsx
    - src/components/pro/peer-group-selector.tsx
    - src/app/admin/peers/page.tsx
    - src/app/admin/peers/[id]/page.tsx
    - src/app/admin/peers/explore/page.tsx
    - src/app/admin/market/page.tsx
    - src/app/admin/index/index-filter-bar.tsx
    - src/app/(public)/institutions/page.tsx
    - src/app/(public)/institution/[id]/page.tsx
    - src/app/(public)/fees/[category]/page.tsx
    - src/app/(public)/research/fee-revenue-analysis/page.tsx
    - src/app/pro/data/page.tsx
    - src/app/pro/peers/page.tsx
    - src/app/pro/brief/route.ts
    - src/app/api/reports/institution/[id]/route.ts
    - src/app/account/welcome/welcome-steps.tsx
    - src/app/account/profile-form.tsx
    - src/app/(auth)/register/register-form.tsx
    - src/lib/report-assemblers/peer-competitive.ts
    - src/lib/research/content-templates.ts
    - src/lib/crawler-db/quality.ts
decisions:
  - "FDIC QBP 5-tier system (micro/community/midsize/regional/mega) replaces old 6-tier everywhere"
  - "parsePeerFilters() maps old tier keys via OLD_TO_NEW_TIER for backward compat with bookmarks/saved_peer_sets"
  - "category-coverage.tsx and fees/page.tsx local TIER_LABELS consts left unchanged (fee taxonomy tiers, not asset tiers)"
  - "api/reports/institution/[id]/route.ts updated (not in original plan scope but had TIER_LABELS import)"
metrics:
  duration: "~18 minutes"
  completed: "2026-04-08"
  tasks_completed: 3
  files_changed: 25
---

# Phase 23 Plan 03: FDIC 5-Tier Asset System Migration Summary

FDIC standard 5-tier system (micro/community/midsize/regional/mega) replaces old 6-tier system across 25 files, with backward-compatible parsePeerFilters() mapping and new getRevenueByTier() CALL-06 function.

## What Was Built

**Task 1: Tier Definitions + Migration SQL**
- `src/lib/fed-districts.ts` now exports `FDIC_TIER_LABELS`, `FDIC_TIER_ORDER`, `FDIC_TIER_BREAKPOINTS`, and `getTierForAssets(totalAssets)` using FDIC QBP breakpoints: $100M / $1B / $10B / $250B
- `parsePeerFilters()` maps old 6-tier keys (community_small, community_mid, community_large, large_regional, super_regional) to new FDIC keys via `OLD_TO_NEW_TIER` before filtering — bookmarks and `saved_peer_sets` rows with old tier values continue to resolve correctly
- `scripts/migrations/024-migrate-asset-tier-keys.sql` provides idempotent UPDATEs to migrate `crawl_targets.asset_size_tier` from old to new keys
- Commit: `deed5a9`

**Task 2a: getRevenueByTier()**
- `src/lib/crawler-db/call-reports.ts` exports `TierRevenue` interface and `getRevenueByTier(reportDate?)` function
- SQL CASE breakpoints exactly match `FDIC_TIER_BREAKPOINTS`: `< 100000000` (micro), `< 1000000000` (community), `< 10000000000` (midsize), `< 250000000000` (regional), else mega
- `call-reports.test.ts` has 3 new tests: 5-tier output, empty data, provided reportDate
- All 24 call-reports tests pass
- Commit: `74f969f`

**Task 2b: Mechanical Consumer Migration**
- 23 consumer files updated: TIER_LABELS imports replaced with FDIC_TIER_LABELS, TIER_ORDER with FDIC_TIER_ORDER
- Old tier key strings in select dropdowns and ASSET_TIERS arrays replaced in 8 files (admin/peers/page.tsx, admin/market/page.tsx, account/profile-form.tsx, account/welcome/welcome-steps.tsx, (auth)/register/register-form.tsx, crawler-db/quality.ts, content-templates.ts, peers/[id]/page.tsx)
- quality.ts SQL CASE ORDER BY updated to use new tier keys
- Deprecated `TIER_LABELS` and `TIER_ORDER` aliases removed from fed-districts.ts
- Commit: `774d56a`

## Commits

| Hash | Type | Description |
|------|------|-------------|
| deed5a9 | feat | Replace 6-tier system with FDIC 5-tier definitions in fed-districts.ts |
| 74f969f | feat | Add getRevenueByTier() with FDIC tier breakpoints and tests |
| 774d56a | feat | Migrate all consumers to FDIC_TIER_LABELS/FDIC_TIER_ORDER, remove deprecated aliases |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Coverage] api/reports/institution/[id]/route.ts not in plan but had TIER_LABELS import**
- **Found during:** Task 2b grep scan
- **Issue:** The file `src/app/api/reports/institution/[id]/route.ts` imported `TIER_LABELS` from fed-districts but was not in the plan's files list
- **Fix:** Added to migration — import replaced with `FDIC_TIER_LABELS`, usage updated at line 220
- **Files modified:** `src/app/api/reports/institution/[id]/route.ts`
- **Commit:** `774d56a`

**2. [Rule 1 - Scope] category-coverage.tsx and fees/page.tsx local TIER_LABELS not asset tier**
- Both files define local `TIER_LABELS` consts for fee taxonomy tiers (spotlight/core/extended/comprehensive), not asset tiers
- These are NOT imported from fed-districts and should not be renamed — left unchanged intentionally

## Known Stubs

None — all tier references are now wired to FDIC_TIER_LABELS constants.

## Threat Flags

No new network endpoints or auth paths introduced. SQL CASE in getRevenueByTier() uses hardcoded breakpoints (no user input), so no injection surface.

## Self-Check: PASSED

- `src/lib/fed-districts.ts` exports `FDIC_TIER_LABELS`: FOUND
- `src/lib/crawler-db/call-reports.ts` exports `getRevenueByTier`: FOUND
- `scripts/migrations/024-migrate-asset-tier-keys.sql`: FOUND
- Commits deed5a9, 74f969f, 774d56a: all present in git log
- Zero stale `TIER_LABELS`/`TIER_ORDER` imports from fed-districts in src/
- Old tier key strings only in `OLD_TO_NEW_TIER` backward compat mapping
- 24/24 call-reports tests pass
