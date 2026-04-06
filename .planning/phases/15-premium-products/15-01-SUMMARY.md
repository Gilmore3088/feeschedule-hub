---
phase: 15-premium-products
plan: "01"
subsystem: pro-portal
tags: [ui, api, polling, premium, peer-filters]
requires: []
provides: [peer-brief-confirm-endpoint, pro-reports-new-page, peer-group-selector, brief-status-poller]
affects: [pro-portal, report-engine]
tech-stack:
  added: [report-engine/types]
  patterns: [debounced-fetch, interval-polling, consumer-brand-palette, auth-gate-server-component]
key-files:
  created:
    - src/lib/report-engine/types.ts
    - src/app/api/reports/peer-brief/confirm/route.ts
    - src/app/pro/reports/new/page.tsx
    - src/components/pro/peer-group-selector.tsx
    - src/components/pro/brief-status-poller.tsx
  modified: []
decisions:
  - "Report engine types defined in src/lib/report-engine/types.ts to unblock TypeScript in Phase 15 without Phase 13 merge"
  - "Confirm endpoint derives institution_count from max() across index entries, matching peers/page.tsx pattern"
  - "Debounce 400ms on filter change, interval 3000ms for status polling — matches plan spec exactly"
  - "Thin warning shows when institution_count < 5; Generate button always enabled per D-03"
metrics:
  duration: "18 minutes"
  completed: "2026-04-06"
  tasks_completed: 2
  files_created: 5
  files_modified: 0
---

# Phase 15 Plan 01: Peer Group Confirmation UI and Live Polling Summary

Peer group filter UI with debounced confirm preview, report generation trigger, and live 4-step status poller — delivering D-02, D-03, D-07, D-09 from phase context.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Peer group confirm endpoint + /pro/reports/new page shell | 4d208a8 | src/lib/report-engine/types.ts, src/app/api/reports/peer-brief/confirm/route.ts, src/app/pro/reports/new/page.tsx |
| 2 | PeerGroupSelector + BriefStatusPoller client components | fb365e8 | src/components/pro/peer-group-selector.tsx, src/components/pro/brief-status-poller.tsx |

## What Was Built

### `/api/reports/peer-brief/confirm` (GET)
Lightweight preview endpoint for peer group size. Accepts `charter`, `tier`, `district` query params (same shape as peers/page.tsx). Returns `{ institution_count, observation_count, category_count, thin }`. Guarded by `getCurrentUser()` + `canAccessPremium()` (T-15-01, T-15-02). District values clamped to 1-12, charter validated against allowlist (T-15-03).

### `/pro/reports/new` (Server Component)
Auth-gated shell redirecting to `/login?from=/pro/reports/new` for unauthenticated users and `/subscribe` for non-premium. Consumer brand palette: `bg-[#FDFBF7]` page, `bg-[#FFFDF9] border-b border-[#E8DFD1]` header. Newsreader serif h1, `text-[#C44B2E]` eyebrow. Mounts `<PeerGroupSelector />`.

### `PeerGroupSelector` (Client Component)
Charter single-select, asset tier multi-select, fed district multi-select — exact chip classes from peers/page.tsx. Debounced 400ms confirm fetch updates a preview card showing institution count (emerald if >= 5, amber if < 5), observation count, and fee categories. Amber warning banners for thin groups (< 5) and large groups (> 200). Generate button POSTs to `/api/reports/generate`; on 202 mounts `<BriefStatusPoller />`.

### `BriefStatusPoller` (Client Component)
Polls `/api/reports/{id}/status` every 3s with `setInterval` cleared on `complete` or `failed`. 4-step horizontal stepper: Pending / Assembling / Rendering / Complete. Progress bar fills to 10/35/75/100% with 500ms CSS transition. Failed state shows red error banner. Complete state shows emerald "Generated successfully" + Download button linking to presigned URL.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created src/lib/report-engine/types.ts**
- **Found during:** Task 1 setup
- **Issue:** This worktree only contains Phase 12 and earlier. `src/lib/report-engine/types.ts` (Phase 13) did not exist, making `BriefStatusPoller`'s import of `ReportJobStatus` fail TypeScript compilation.
- **Fix:** Created the types file with identical content to the main project's Phase 13 implementation (`ReportJob`, `ReportJobStatus`, `DataManifest`, `PublishedReport`, `ReportType`).
- **Files modified:** src/lib/report-engine/types.ts (created)
- **Commit:** 4d208a8

## Known Stubs

None. The components correctly wire to real API endpoints:
- `PeerGroupSelector` → `/api/reports/peer-brief/confirm` (real DB query via `getPeerIndex`)
- `PeerGroupSelector` → `/api/reports/generate` (exists in main project, Phase 13)
- `BriefStatusPoller` → `/api/reports/{id}/status` (exists in main project, Phase 13)

The generate and status routes exist in the main project (Phase 13) but not this worktree — they will be present at runtime after branch merge.

## Threat Coverage

All T-15-xx mitigations from the threat register are implemented:
- T-15-01: `getCurrentUser()` before any DB access in confirm route
- T-15-02: `canAccessPremium()` check, 403 for non-premium
- T-15-03: charter validated against `Set(['bank', 'credit_union', ''])`; districts filtered to `d >= 1 && d <= 12`; asset_tiers passed to parameterized `getPeerIndex()`

## Self-Check: PASSED

Files verified present:
- src/lib/report-engine/types.ts: FOUND
- src/app/api/reports/peer-brief/confirm/route.ts: FOUND
- src/app/pro/reports/new/page.tsx: FOUND
- src/components/pro/peer-group-selector.tsx: FOUND
- src/components/pro/brief-status-poller.tsx: FOUND

Commits verified:
- 4d208a8 (Task 1): FOUND
- fb365e8 (Task 2): FOUND

TypeScript errors in new files: 0
Pre-existing test file errors (vitest module): out of scope, not introduced by this plan.
