---
phase: 58-ffiec-pipeline-institution-data
plan: 02
subsystem: admin-institution-ui
tags: [hero-cards, sparklines, peer-ranking, financial-profile]
dependency_graph:
  requires: [institution_financials table, getFinancialsByInstitution, getInstitutionPeerRanking]
  provides: [HeroCards component, institution financial profile UI]
  affects: [/admin/institution/[id] page]
tech_stack:
  added: []
  patterns: [server-component hero cards, sparkline integration, peer percentile badges]
key_files:
  created:
    - src/app/admin/institution/[id]/hero-cards.tsx
  modified:
    - src/app/admin/institution/[id]/page.tsx
decisions:
  - Used formatAssets for asset/deposit values and formatAmount for income values to match existing conventions
  - Placed staleness badge above the card grid rather than on individual cards for cleaner layout
  - Efficiency ratio uses inverted color coding (decrease = emerald) since lower is better
  - Fee/Deposit Ratio card shows peer median comparison when available, falls back to QoQ delta
metrics:
  duration: 201s
  completed: 2026-04-10T20:37:23Z
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
---

# Phase 58 Plan 02: Institution Hero Cards with Sparklines Summary

Consulting-grade hero stat cards with sparklines and peer context badges replacing the plain Financial Context section on institution admin pages.

## What Was Done

### Task 1: Create HeroCards component (1efe929)
Created `src/app/admin/institution/[id]/hero-cards.tsx` as a server component with 6 hero stat cards:
1. **Total Assets** -- formatAssets value, sparkline, QoQ delta
2. **Total Deposits** -- formatAssets value, sparkline, QoQ delta
3. **SC Income** -- formatAmount value, sparkline, peer percentile badge (P{n} among {tier} peers)
4. **Net Income** -- formatAmount value, sparkline, YoY delta
5. **Efficiency Ratio** -- percentage with inverted color coding (lower = better = emerald)
6. **Fee/Deposit Ratio** -- percentage, peer median comparison from PeerRanking

Key implementation details:
- Data arrives newest-first; reversed for sparklines (oldest-left, newest-right)
- Sparkline component reused from `src/components/sparkline.tsx` with blue color (#3b82f6)
- Staleness badge (amber) when financial data > 95 days old
- Empty state returns null (no hero section rendered)
- DeltaIndicator sub-component handles color-coded percentage changes

### Task 2: Wire HeroCards into institution page (877bf02)
Updated `src/app/admin/institution/[id]/page.tsx`:
- Added `getFinancialsByInstitution` to parallel Promise.all (7th query)
- Replaced entire Financial Context section (peer ranking cards + revenue trend table) with `<HeroCards>`
- Removed unused `getInstitutionRevenueTrend` import and query (no longer needed)
- Removed unused `formatAmount` import from page

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Removed revenueTrend query entirely | No remaining references on page after Financial Context removal |
| Staleness badge placed above card grid | Cleaner than per-card badges; single indicator for all financial data |
| Used existing formatAssets/formatAmount without modification | Matches established conventions in the codebase |

## Verification

- TypeScript compiles cleanly (no errors in hero-cards.tsx or page.tsx)
- All acceptance criteria pass: Sparkline, admin-card, peerRanking, stale, reverse, text-2xl, grid, no "use client"
- Old Financial Context section fully removed (grep confirms 0 matches)
- HeroCards returns null for empty financials array

## Self-Check: PASSED

- hero-cards.tsx: FOUND
- page.tsx: FOUND
- Commit 1efe929: FOUND
- Commit 877bf02: FOUND
