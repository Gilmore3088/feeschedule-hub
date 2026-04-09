---
phase: 32-scoped-report-generation
plan: "01"
subsystem: pro-ui
tags: [report-generation, pro-ui, daily-limits, peer-filters]
dependency_graph:
  requires:
    - report engine backend (src/lib/report-engine/)
    - /api/reports/generate route
    - /api/reports/[id]/status route
    - /api/reports/peer-brief/confirm route
    - BriefStatusPoller component
    - PeerGroupSelector patterns
  provides:
    - ReportTypeSelector component
    - ReportGenerationForm component
    - checkReportDailyLimit server utility
    - refactored /pro/reports/new page
  affects:
    - /pro/reports/new (full rewrite)
tech_stack:
  added: []
  patterns:
    - card-based type selector with warm palette
    - server-side daily limit check passed as props to client form
    - debounced peer preview fetch (400ms)
    - report_type aliasing (competitive_snapshot -> peer_brief, district_outlook -> state_index)
key_files:
  created:
    - src/lib/report-limits.ts
    - src/components/pro/report-type-selector.tsx
    - src/components/pro/report-generation-form.tsx
  modified:
    - src/app/pro/reports/new/page.tsx
decisions:
  - competitive_snapshot aliases to peer_brief backend type; district_outlook aliases to state_index
  - daily limit enforced server-side via checkReportDailyLimit; result passed as props to avoid client-side spoofing
  - force-add required for page.tsx due to Reports/ gitignore pattern (case-insensitive match on macOS)
  - district_outlook requires exactly one district selection before generate is enabled
metrics:
  duration: ~15 minutes
  completed: "2026-04-09T15:03:57Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 1
---

# Phase 32 Plan 01: Scoped Report Generation UI Summary

**One-liner:** Card-based report type selector and scoped generation form at `/pro/reports/new` with server-side daily limits (5/day pro, 200/day admin) using the warm consulting-grade palette.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Report type selector, generation form, daily limit checker | e0bd11f | report-limits.ts, report-type-selector.tsx, report-generation-form.tsx |
| 2 | Refactor /pro/reports/new page with limit check | 2d7234c | src/app/pro/reports/new/page.tsx |

## What Was Built

### ReportTypeSelector (`src/components/pro/report-type-selector.tsx`)
Three clickable card-based report types using the warm palette (#FFFDF9 bg, #E8DFD1 border, #C44B2E accent). Selected card gets a red ring. Cards: Peer Competitive Brief (bar chart icon), Competitive Snapshot (arrow icon), District Economic Outlook (map pin icon). Props: `onSelect`, `selected`.

### ReportGenerationForm (`src/components/pro/report-generation-form.tsx`)
Three-step client component managing the full generation flow:
- Step 1 (no type): renders ReportTypeSelector with optional daily limit banner
- Step 2 (type selected, no jobId): renders scope form per type — peer_brief/competitive_snapshot get charter/tier/district chip filters with debounced peer preview; district_outlook gets a single-select district picker
- Step 3 (jobId): renders BriefStatusPoller for polling and download

Report type backend aliasing: `competitive_snapshot` → `peer_brief`, `district_outlook` → `state_index`. On 429 response, shows limit message. Generate button disabled when limit reached or district not selected (district_outlook).

### report-limits.ts (`src/lib/report-limits.ts`)
Server-side daily limit query using `getSql()` template literal pattern. Queries `COUNT(*) FROM report_jobs WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'`. Returns `{ allowed, used, limit }`. Limits: admin=200, analyst=200, premium=5 (default 5 for unknown roles).

### /pro/reports/new Page (`src/app/pro/reports/new/page.tsx`)
Full rewrite. Server component with `force-dynamic`. Auth gate (getCurrentUser + canAccessPremium). Calls `checkReportDailyLimit` server-side. Renders warm palette header with newsreader font, "Reports" tag line, "Generate Report" title. Passes `limitReached` and `limitInfo` as props to `ReportGenerationForm`. Old direct `PeerGroupSelector` usage removed.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notes

**gitignore collision (Rule 3 - Blocking Issue):** `src/app/pro/reports/new/page.tsx` was blocked by `.gitignore` entry `Reports/` which case-insensitively matches `reports/` on macOS. Used `git add -f` for the source file. This is a pre-existing gitignore issue affecting all source files under `src/app/pro/reports/`. Logged in deferred items — the gitignore should use a more specific path (`/reports/` at root or `*.pdf`) to avoid catching source files.

## Known Stubs

None. The generation form wires directly to `/api/reports/generate` (existing backend). Peer preview calls `/api/reports/peer-brief/confirm` (existing endpoint). Progress polling uses `BriefStatusPoller` which calls `/api/reports/[id]/status` (existing endpoint).

## Threat Flags

No new network endpoints, auth paths, or trust boundaries introduced. All threat model mitigations confirmed present:
- T-32-01: `checkReportDailyLimit` uses `user.id` from server-side session (not client-supplied)
- T-32-02: `report_type` passed to existing generate route which validates against allowlist
- T-32-03: `canAccessPremium()` gate enforced in server component before any rendering
- T-32-04: Daily limits enforced server-side; 429 handled in form

## Self-Check: PASSED

- FOUND: src/lib/report-limits.ts
- FOUND: src/components/pro/report-type-selector.tsx
- FOUND: src/components/pro/report-generation-form.tsx
- FOUND: src/app/pro/reports/new/page.tsx
- FOUND: commit e0bd11f (Task 1)
- FOUND: commit 2d7234c (Task 2)
