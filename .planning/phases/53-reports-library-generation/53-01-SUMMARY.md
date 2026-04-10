---
phase: 53-reports-library-generation
plan: "01"
subsystem: hamilton-pro-reports
tags: [reports, library, published-reports, db-migration, ui-component]
dependency_graph:
  requires: []
  provides: [published-reports-library, status-column-migration, getPublishedReports, getHamiltonScenarioById, ReportLibrary-component]
  affects: [src/app/pro/(hamilton)/reports, src/components/hamilton/reports, src/lib/hamilton/pro-tables]
tech_stack:
  added: []
  patterns: [sentinel-user-id-for-shared-content, ALTER-TABLE-migration-guard, server-side-published-reports-load, Next.js-16-searchParams-await]
key_files:
  created:
    - src/components/hamilton/reports/ReportLibrary.tsx
  modified:
    - src/lib/hamilton/pro-tables.ts
    - src/components/hamilton/reports/ReportWorkspace.tsx
    - src/app/pro/(hamilton)/reports/page.tsx
    - src/app/pro/(hamilton)/reports/actions.ts
decisions:
  - "Sentinel user_id=0 for BFI-authored published reports (visible to all pro users, no per-user filter)"
  - "ALTER TABLE migration guard ensures status column added to existing production tables without data loss"
  - "seedPublishedReports() uses deterministic UUIDs with ON CONFLICT DO NOTHING for idempotent seeding"
  - "handleViewPublishedReport sets generatedReport state directly — reuses ReportOutput without triggering generation"
  - "initialScenarioId prop accepted in ReportWorkspace but not wired — Plan 02 owns scenario pre-fill"
metrics:
  duration_minutes: 25
  completed: "2026-04-09"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 5
requirements: [RPT-01, RPT-02]
---

# Phase 53 Plan 01: Reports Library + Published Reports Data Layer Summary

Published report library added to Hamilton Pro Reports screen — 4 BFI-authored reports seeded into `hamilton_reports` with `status='published'`, displayed at top of `/pro/reports` with inline viewing and PDF download via existing route.

## What Was Built

### Task 1: Data Layer (pro-tables.ts)

Added `status` column to `hamilton_reports` with both a CREATE TABLE DDL update (cold start) and an `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration guard (existing production tables). The column defaults to `'generated'` for all user-created reports.

New exports:
- `getPublishedReports()` — queries `WHERE status = 'published' ORDER BY created_at DESC LIMIT 20`, returns full `report_json` for inline viewing
- `getHamiltonScenarioById(scenarioId, userId)` — IDOR-safe single-scenario fetch, filters by authenticated `user_id`
- `seedPublishedReports()` — inserts 4 BFI-authored reports with sentinel `user_id = 0`, deterministic UUIDs, and `ON CONFLICT DO NOTHING` for idempotency

The 4 seeded reports are fully populated `ReportSummaryResponse` objects matching all 8 required fields:
1. Q1 2026 National Fee Landscape (`quarterly_strategy`)
2. Monthly Pulse: March 2026 (`monthly_pulse`)
3. Fed District Fee Comparison (`state_index`)
4. Peer Benchmarking: Community Banks Tier D/E (`peer_brief`)

`saveHamiltonReport()` INSERT updated to explicitly include `status = 'generated'`.

### Task 2: UI Layer (ReportLibrary, ReportWorkspace, page.tsx, actions.ts)

**ReportLibrary.tsx** (new component, `"use client"`):
- Grid of published report cards (1 col mobile, 2 col desktop)
- Each card: type badge, headline italic title, formatted date, Read and Download PDF buttons
- Read button calls `onViewReport(report.report_json, report.report_type)` — shows inline via ReportOutput
- Download PDF button triggers `/api/pro/report-pdf` fetch + blob download (reuses existing route)
- Empty state handled gracefully

**ReportWorkspace.tsx** restructured:
- Extended `ReportWorkspaceProps` with `publishedReports` and `initialScenarioId`
- `ReportLibrary` rendered at TOP of page before any template content (D-01)
- Visual separator (`border-top`) between library and generator sections
- `handleViewPublishedReport` function sets `generatedReport` + `generatedReportType` state from published report data, scrolls preview into view
- "Strategic Frameworks" heading renamed to "Generate New Report" (D-02)
- `initialScenarioId` prop accepted (Plan 02 wires the scenario pre-fill)

**page.tsx** updated:
- Accepts `searchParams: Promise<{ scenario_id?: string }>` (Next.js 16 pattern — must await)
- Calls `getPublishedReports()` server-side
- Passes `publishedReports` and `initialScenarioId` to `ReportWorkspace`

**actions.ts** updated:
- Added `loadPublishedReport(reportId)` server action — queries by ID + `status = 'published'`, requires auth
- Added `sql` import from `@/lib/crawler-db/connection`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all published report content is fully populated static seed data. The `initialScenarioId` prop is intentionally a stub (wiring deferred to Plan 02 per the plan spec).

## Threat Flags

No new security surface introduced beyond what the threat model anticipated:
- T-53-01 (scenario_id IDOR): `getHamiltonScenarioById` filters by `user_id` — mitigated
- T-53-02 (published report disclosure): sentinel `user_id = 0`, intentionally public to all pro users — accepted
- T-53-03 (loadPublishedReport auth): `getCurrentUser()` check before any DB query — mitigated

## Self-Check

- [x] `src/components/hamilton/reports/ReportLibrary.tsx` — created
- [x] `src/lib/hamilton/pro-tables.ts` — modified with all 7 acceptance criteria passing
- [x] `src/components/hamilton/reports/ReportWorkspace.tsx` — modified with all 4 acceptance criteria passing
- [x] `src/app/pro/(hamilton)/reports/page.tsx` — modified with all 3 acceptance criteria passing
- [x] `src/app/pro/(hamilton)/reports/actions.ts` — modified with loadPublishedReport added
- [x] Commit `0827449` — Task 1 (pro-tables.ts)
- [x] Commit `ff58897` — Task 2 (ReportLibrary, ReportWorkspace, page.tsx, actions.ts)
- [x] TypeScript: no errors in modified files

## Self-Check: PASSED
