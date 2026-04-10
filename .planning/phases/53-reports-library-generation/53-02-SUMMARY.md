---
phase: 53-reports-library-generation
plan: "02"
subsystem: hamilton-pro-reports
tags: [hamilton, reports, client-context, scenario-linking, pdf-export]
dependency_graph:
  requires: [53-01]
  provides: [client-oriented-report-generation, scenario-pre-fill, fee-relevant-config]
  affects: [pro-reports-page, hamilton-reports-actions, report-workspace]
tech_stack:
  added: []
  patterns:
    - Template-dispatch pattern for per-type LLM context strings in generateSection()
    - useEffect scenario pre-fill with cancellation flag for async safety
    - Readonly display fields replacing editable dropdowns for profile-sourced data
key_files:
  created: []
  modified:
    - src/app/pro/(hamilton)/reports/actions.ts
    - src/components/hamilton/reports/ConfigSidebar.tsx
    - src/components/hamilton/reports/ReportWorkspace.tsx
decisions:
  - "ReportTemplateType replaced with 4 client-oriented types: peer_benchmarking, regional_landscape, category_deep_dive, competitive_positioning"
  - "generateReport() dispatches template-specific context strings to generateSection() instead of generic strings"
  - "ConfigSidebar institution/peer set are readonly display fields (not dropdowns) — data comes from user profile Settings"
  - "Scenario pre-fill uses async useEffect with cancellation flag to prevent stale updates"
  - "focusCategory passed to generateReport only for category_deep_dive template"
metrics:
  duration: "~12 minutes"
  completed: "2026-04-10"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 53 Plan 02: Client Context Reframe + Scenario Wiring Summary

Client-oriented report templates replacing admin-flavored placeholders, with scenario-linked arrival auto-selecting Category Deep Dive and pre-filling fee category from Simulate.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Reframe templates for client context and update generateReport with peer data | 9aa76a3 | actions.ts, ConfigSidebar.tsx |
| 2 | Wire scenario-linked arrival and template pre-fill | 6405e4d | ReportWorkspace.tsx |

## What Was Built

### Task 1: actions.ts + ConfigSidebar.tsx

**`src/app/pro/(hamilton)/reports/actions.ts`**

- `ReportTemplateType` union replaced: `quarterly_strategy | peer_brief | monthly_pulse | state_index` → `peer_benchmarking | regional_landscape | category_deep_dive | competitive_positioning`
- `TEMPLATE_TITLES` map updated with display labels for all 4 new types
- `GenerateReportParams` extended with `focusCategory?: string` for category-specific analysis
- `generateReport()` now dispatches per-template context strings via three builder functions (`buildExecutiveSummaryContext`, `buildStrategicContext`, `buildRecommendationContext`) — each template produces meaningfully different LLM context
- Strategic section type dispatches to the correct `SectionType` per template: `peer_comparison` / `regional_analysis` / `trend_analysis` / `peer_competitive`
- Category deep dive filters index data to the focus category first, then pads with up to 9 others for context
- `loadScenarioById()` server action added — calls `getHamiltonScenarioById(scenarioId, userId)` to prevent IDOR (T-53-04)

**`src/components/hamilton/reports/ConfigSidebar.tsx`**

- `FOCUS_AREAS` array replaced: `Capital Allocation / Risk Mitigation / Yield Optimization / Sustainable Growth` → `Fee Benchmarking / Competitive Positioning / Revenue Optimization / Regulatory Compliance`
- Institution field: was an editable `<select>` with hardcoded fake firms (Hamilton Global Partners, Standard Meridian, Axiom Wealth) → now a readonly `<div>` display with "Configure in Settings" link
- Peer set field: was hardcoded chips (Tier 1 Banks, EMEA Private) → now a readonly `<div>` display with "Manage peer sets" link
- Props `onInstitutionChange` and `onPeerSetChange` removed (institution/peer set sourced from user profile, not editable in report config)
- New props: `institutionName: string` and `peerSetLabel: string`

### Task 2: ReportWorkspace.tsx

- `TEMPLATES` array fully replaced with 4 client-oriented entries: Peer Benchmarking Report, Regional Fee Landscape, Category Deep Dive, Competitive Positioning
- `loadScenarioById` imported from actions; scenario pre-fill `useEffect` added with cancellation flag
- Scenario arrival flow: `?scenario_id=X` → `loadScenarioById(X)` → auto-select `category_deep_dive` → set `focusArea` to `scenario.fee_category.replace(/_/g, " ")`
- `handleGenerate()` passes `focusCategory` (for `category_deep_dive`) and `scenarioId` to `generateReport()`
- Static placeholder text replaced: removed "inflationary headwinds", "Hamilton Private pool", "Nordic region", "12% alpha buffer" → replaced with fee-intelligence content ("Every fee adjustment tells a story…")
- ConfigSidebar call updated: passes `institutionName="Your Institution"` and `peerSetLabel="National Index"`, removes old `institution`/`peerSet` state vars and their setters

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `institutionName` in ReportWorkspace is hardcoded to `"Your Institution"` — the plan specified this as intentional ("use 'Your Institution' as the default") pending user profile wiring in a future plan
- `peerSetLabel` is hardcoded to `"National Index"` — peer set selection from saved profile sets deferred to a future plan

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. `loadScenarioById` server action applies existing `getHamiltonScenarioById(scenarioId, userId)` IDOR protection (T-53-04 mitigated).

## Self-Check

### Created files exist:
- N/A (no new files created)

### Modified files exist:
- `src/app/pro/(hamilton)/reports/actions.ts` — FOUND
- `src/components/hamilton/reports/ConfigSidebar.tsx` — FOUND
- `src/components/hamilton/reports/ReportWorkspace.tsx` — FOUND

### Commits exist:
- `9aa76a3` — Task 1 commit: FOUND
- `6405e4d` — Task 2 commit: FOUND

### TypeScript: No errors in plan files (pre-existing errors in test files and FloatingChatOverlay are out of scope)

## Self-Check: PASSED
