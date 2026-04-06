---
phase: 14-recurring-reports
plan: "02"
subsystem: report-assemblers, report-templates
tags: [state-fee-index, delta-analysis, hamilton, report-template, data-assembler]
dependency_graph:
  requires:
    - src/lib/crawler-db/fee-index.ts
    - src/lib/crawler-db/fed.ts
    - src/lib/fed-districts.ts
    - src/lib/fee-taxonomy.ts
    - src/lib/report-engine/types.ts
    - src/lib/report-templates/base/components.ts
    - src/lib/report-templates/base/layout.ts
  provides:
    - src/lib/report-assemblers/state-fee-index.ts
    - src/lib/report-templates/templates/state-fee-index.ts
  affects:
    - src/lib/report-templates/index.ts
tech_stack:
  added: []
  patterns:
    - assembler/template separation (D-11)
    - signed delta_pct with DeltaPill-style inline color spans
    - custom renderDeltaTable bypassing escapeHtml for colored delta cells
    - DataManifest with 4 named query slots for audit trail
key_files:
  created:
    - src/lib/report-assemblers/state-fee-index.ts
    - src/lib/report-templates/templates/state-fee-index.ts
    - src/lib/report-engine/types.ts
  modified:
    - src/lib/report-templates/index.ts
decisions:
  - "renderDeltaTable() is a custom HTML builder (not dataTable()) because dataTable escapes all string values via escapeHtml, which would strip the inline <span> color tags needed for DeltaPill-style delta display"
  - "report-engine/types.ts scaffolded in worktree to satisfy DataManifest import (Rule 3 - missing dependency in worktree branch)"
  - "GenerateSectionOutput defined as local type alias in template since hamilton/types.ts in worktree does not export it yet"
  - "district_indicators deduplicated to latest per series_id before capping at 10 — prevents stale readings inflating the count"
metrics:
  duration: "~18 minutes"
  completed: "2026-04-06"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
---

# Phase 14 Plan 02: State Fee Index Assembler + Template Summary

State Fee Index pipeline: assembler queries state + national fee data, computes signed delta_pct per category (positive=above national cost disadvantage, negative=below cost advantage), and template renders delta comparison table with inline-colored DeltaPill-style cells and conditional Fed district context.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | SFI data assembler — assembleStateFeeIndex() | 0f6369a | src/lib/report-assemblers/state-fee-index.ts, src/lib/report-engine/types.ts |
| 2 | SFI template — renderStateFeeIndexReport() | 0f6369a | src/lib/report-templates/templates/state-fee-index.ts, src/lib/report-templates/index.ts |

## What Was Built

### assembleStateFeeIndex(stateCode: string)

- Normalizes state code via `.toUpperCase()` and validates against 50-state allowlist (throws on unknown)
- Calls `getPeerIndex({ state_code })` + `getNationalIndex()` in sequence
- Merges results: `delta_pct = ((state_median - national_median) / national_median) * 100`, rounded to 1dp
- Categories sorted by `abs(delta_pct)` descending — most divergent shown first
- Conditionally fetches `getBeigeBookHeadline(district)` + `getDistrictIndicators(district)` when Fed district is known
- `district_indicators` deduplicated to latest-per-series, capped at 10
- DataManifest captures all 4 query slots with row counts + timestamps

### renderStateFeeIndexReport(input)

- Pure synchronous function returning complete HTML string
- `renderDeltaTable()` helper builds `<table>` HTML directly to allow inline `<span style="color:#dc2626">` (red) and `<span style="color:#059669">` (emerald) delta cells — bypassing `dataTable()`'s `escapeHtml` on string values
- All display_name / maturity_tier strings individually escaped in renderDeltaTable
- District context section absent when `district_headline === null` or `narratives.district_context` is missing
- Exported from `src/lib/report-templates/index.ts` barrel

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Scaffolded report-engine/types.ts in worktree**
- **Found during:** Task 1
- **Issue:** Worktree branch lacks `src/lib/report-engine/` directory; `DataManifest` import would fail TypeScript compilation
- **Fix:** Copied `report-engine/types.ts` from main repo into worktree (identical content)
- **Files modified:** `src/lib/report-engine/types.ts`
- **Commit:** 0f6369a

**2. [Rule 3 - Blocking] Local GenerateSectionOutput alias in template**
- **Found during:** Task 2
- **Issue:** Worktree's `src/lib/hamilton/types.ts` does not export `GenerateSectionOutput` (only in main repo); TS error TS2305
- **Fix:** Defined `type GenerateSectionOutput = SectionOutput & { section_type: SectionType; generated_at: string }` as local alias in template file — matches the main repo contract exactly
- **Files modified:** `src/lib/report-templates/templates/state-fee-index.ts`
- **Commit:** 0f6369a

**3. [Rule 1 - Bug] Fixed ReportMetadata `description` property**
- **Found during:** Task 2
- **Issue:** TS error TS2353 — worktree's `ReportMetadata` interface has `date` field, not `description`
- **Fix:** Changed `description:` to `date: data.report_date` in `wrapReport()` call
- **Files modified:** `src/lib/report-templates/templates/state-fee-index.ts`
- **Commit:** 0f6369a

## Verification

- TypeScript: `npx tsc --noEmit` — zero errors in new files
- Assembler exports: `assembleStateFeeIndex`, `StateFeeIndexPayload`, `StateFeeIndexCategory` all present
- Template barrel: `renderStateFeeIndexReport` exported from `src/lib/report-templates/index.ts`
- Delta formula: `((state_median - national_median) / national_median) * 1000) / 10` in assembler
- DeltaPill colors: `#dc2626` (red/above) and `#059669` (emerald/below) both present in template
- Security: `stateCode.toUpperCase()` + allowlist check present, throws `Unknown state code: ${stateCode}`
- File sizes: assembler 225 lines, template 224 lines — both under 300 line limit

## Known Stubs

None — all data is wired through live DB queries.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- `src/lib/report-assemblers/state-fee-index.ts` — FOUND
- `src/lib/report-templates/templates/state-fee-index.ts` — FOUND
- `src/lib/report-engine/types.ts` — FOUND
- Commit `0f6369a` — FOUND (verified via `git rev-parse --short HEAD`)
