---
phase: 23-call-report-fred-foundation
plan: 05
subsystem: call-reports-institution-pages
tags: [call-reports, institution-pages, peer-ranking, revenue-trend, financial-context]
dependency_graph:
  requires: [23-01, 23-03]
  provides: [institution-financial-context, peer-ranking-queries]
  affects: [public-institution-pages, admin-institution-pages]
tech_stack:
  added: []
  patterns: [parallel-data-fetch, tdd-red-green, peer-tier-classification]
key_files:
  created: []
  modified:
    - src/lib/crawler-db/call-reports.ts
    - src/lib/crawler-db/call-reports.test.ts
    - src/app/(public)/institution/[id]/page.tsx
    - src/app/admin/institution/[id]/page.tsx
decisions:
  - "YoY color semantics: rising SC income = red (higher fees charged), falling = emerald — consistent with DeltaPill convention"
  - "Peer tier classification uses 5 FDIC tiers: micro/community/midsize/regional/mega from total_assets"
  - "Financial Context section only renders when data exists — graceful degradation for institutions without Call Report data"
  - "Admin page uses admin-card + gray-50/80 table headers; public page uses newsreader font headings + warm border palette"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-08T05:35:51Z"
  tasks: 2
  files_modified: 4
---

# Phase 23 Plan 05: Institution Financial Context Summary

Per-institution Call Report financial data wired into slug pages — SC income trend, fee dependency ratio, and FDIC-tier peer ranking.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add getInstitutionRevenueTrend and getInstitutionPeerRanking to call-reports.ts | de477c2 | call-reports.ts, call-reports.test.ts |
| 2 | Wire financial context into institution slug pages | 3d9d794 | (public)/institution/[id]/page.tsx, admin/institution/[id]/page.tsx |

## What Was Built

**getInstitutionRevenueTrend(targetId, quarterCount=8)**
Returns quarterly service charge income history for a specific institution. Each quarter includes SC income, fee income ratio, and YoY change computed by matching same-quarter suffix from prior year rows.

**getInstitutionPeerRanking(targetId)**
Returns peer group ranking within the institution's FDIC asset tier. Tier determined dynamically from `total_assets`: micro (<$100M), community (<$1B), midsize (<$10B), regional (<$250B), mega (≥$250B). Returns rank, peer count, peer median SC, peer median fee ratio.

**Financial Context section on both institution pages**
- Peer ranking cards: SC Income, Rank in [tier] Peers, Peer Median SC, Fee Dependency ratio vs peer median
- Quarterly revenue trend table: Quarter, SC Income, Fee Ratio, YoY change
- Only renders when data exists (graceful degradation)
- Public page: warm palette (newsreader headings, #E8DFD1 borders, emerald/red YoY)
- Admin page: admin design system (admin-card, gray-50/80 headers, dark mode variants)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing string|undefined TS error in getDistrictFeeRevenue**
- **Found during:** Task 2 (TypeScript compile check)
- **Issue:** `let date = reportDate` kept type as `string | undefined` through the conditional branch, making `sql.unsafe([date, district])` fail strict TS check
- **Fix:** Changed to `let date: string` with explicit if/else branches and `String(row.latest_date)` cast
- **Files modified:** src/lib/crawler-db/call-reports.ts
- **Commit:** 3d9d794 (included in Task 2 commit)

## Test Results

- 36 tests pass in call-reports.test.ts (25 pre-existing + 11 new)
- 11 new tests cover: InstitutionRevenueQuarter type, PeerRanking type, getInstitutionRevenueTrend (6 cases), getInstitutionPeerRanking (5 cases)
- TypeScript: zero errors in production source files (pre-existing mock-type issues in *.test.ts files are out of scope)

## Known Stubs

None — both functions query live `institution_financials` table. Sections gracefully hide when no data exists.

## Threat Flags

None — threat model T-23-16 (parameterized SQL for URL [id]) was already in place; new queries follow the same parameterized pattern.

## Self-Check: PASSED

- src/lib/crawler-db/call-reports.ts — exports getInstitutionRevenueTrend and getInstitutionPeerRanking: confirmed
- src/app/(public)/institution/[id]/page.tsx — imports and renders Financial Context: confirmed
- src/app/admin/institution/[id]/page.tsx — imports and renders Financial Context: confirmed
- Commits de477c2 and 3d9d794: confirmed present
