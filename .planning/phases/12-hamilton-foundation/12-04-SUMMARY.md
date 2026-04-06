---
phase: 12-hamilton-foundation
plan: "04"
subsystem: report-templates
tags: [hamilton, report-templates, peer-competitive, national-overview, pure-functions]
dependency_graph:
  requires:
    - "12-02"  # hamilton/types.ts, SectionOutput
    - "12-03"  # base layout components (wrapReport, coverPage, etc.)
  provides:
    - renderPeerCompetitiveReport
    - renderNationalOverviewReport
    - PeerCompetitiveReportInput
    - NationalOverviewReportInput
    - PeerCompetitiveData
    - NationalOverviewData
    - GenerateSectionOutput
  affects:
    - src/lib/report-templates/index.ts
    - src/lib/hamilton/types.ts
tech_stack:
  added: []
  patterns:
    - Pure function report templates — (data, narratives) => HTML with no side effects
    - Rigid section order per type — brand consistency enforced structurally
    - Pre-computed narrative injection — AI calls separated from template rendering
    - Auth-gated preview route — fixture data for visual verification without DB/Claude
key_files:
  created:
    - src/lib/report-templates/templates/peer-competitive.ts
    - src/lib/report-templates/templates/national-overview.ts
    - src/app/pro/brief/preview/route.ts
  modified:
    - src/lib/hamilton/types.ts
    - src/lib/report-templates/index.ts
decisions:
  - "Templates are pure functions with no AI calls — narratives pre-computed by caller (D-15)"
  - "Rigid section order enforced by template structure, not runtime logic (D-14)"
  - "GenerateSectionOutput defined as SectionOutput & { section_type, generated_at } alias to maintain hamilton/types.ts as single source of truth (D-04)"
  - "Extended fees section in peer-competitive uses data table only — no Hamilton call for efficiency"
  - "Charter analysis section in national-overview is conditional on both data and narrative presence"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-06"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 2
---

# Phase 12 Plan 04: Concrete Report Templates Summary

**One-liner:** Two rigid HTML report templates — peer competitive and national overview — as pure (data, narratives) => HTML functions with fixed section ordering and a preview route for visual verification.

## What Was Built

### Task 1: peer-competitive.ts + type extensions

`renderPeerCompetitiveReport()` is a pure function with a locked 5-section order:
1. Cover page (title, subtitle, series label, date)
2. Executive Summary (Hamilton narrative block, no table)
3. Page break (print-only, PDF-ready)
4. Featured Fees (Hamilton narrative + data table — peer vs national with delta column)
5. Extended Fees (data table only — no Hamilton call, smaller peer samples)
6. Methodology footnote

`src/lib/hamilton/types.ts` was extended with:
- `PeerCompetitiveData` — typed input shape for peer benchmarking report data
- `NationalOverviewData` — typed input shape for national index report data
- `GenerateSectionOutput` — alias for `SectionOutput & { section_type, generated_at }`
- New `SectionType` values: `peer_competitive`, `national_index`, `charter_analysis`

### Task 2: national-overview.ts + preview route + index.ts exports

`renderNationalOverviewReport()` is a pure function with a locked 6-section order:
1. Cover page (49-category count + institution total in subtitle)
2. Executive Summary (Hamilton narrative block)
3. Page break
4. National Index Table (Hamilton narrative + full 49-category data table with maturity column)
5. Charter Analysis (Hamilton narrative — only rendered when charter_split data AND narrative both present)
6. Methodology footnote

`GET /pro/brief/preview` renders the peer competitive template with hardcoded fixture data (57 Midwest community banks, 7 categories). No DB or Claude calls — purely for visual checkpoint. Auth-gated via `canAccessPremium()`.

`src/lib/report-templates/index.ts` now exports both template functions and their input types.

## Commits

| Hash | Description |
|------|-------------|
| 55722c9 | feat(12-04): add PeerCompetitiveData/NationalOverviewData types + peer-competitive template |
| 898db9b | feat(12-04): add national-overview template + preview route + index.ts exports |

## Deviations from Plan

**1. [Rule 1 - Type Adaptation] SectionOutput vs GenerateSectionOutput**

- **Found during:** Task 1
- **Issue:** Plan specified `GenerateSectionOutput` with `prose`, `word_count`, `numbers_used`, `section_type`, `generated_at` fields. Actual `SectionOutput` in `types.ts` (from Plan 02) uses `narrative`, `wordCount`, `model`, `usage` fields.
- **Fix:** Templates use `narrative` (not `prose`), `wordCount` (not `word_count`). `GenerateSectionOutput` defined as `SectionOutput & { section_type: SectionType; generated_at: string }` — extends rather than replaces. Preview route fixture updated to match actual field names.
- **Files modified:** `src/lib/hamilton/types.ts`, `src/app/pro/brief/preview/route.ts`
- **Commit:** 55722c9

## Known Stubs

None — templates are complete. Preview route uses hardcoded fixture data intentionally (visual verification only; real data comes from pipeline in Phase 13+).

## Verification Results

- `npx tsc --noEmit` — zero errors on new files (3 pre-existing vitest test file errors unrelated to this plan)
- No AI calls in either template: `grep "generateSection|Anthropic|claude-"` returns zero matches
- `hamiltonNarrativeBlock`, `dataTable`, `sectionHeader` called 6+ times across peer-competitive template
- index.ts exports both `renderPeerCompetitiveReport` and `renderNationalOverviewReport`
- Preview route auth-gated via `getCurrentUser()` + `canAccessPremium()` (T-12-12 mitigated)

## Self-Check: PASSED

- [x] `src/lib/report-templates/templates/peer-competitive.ts` — exists, compiles
- [x] `src/lib/report-templates/templates/national-overview.ts` — exists, compiles
- [x] `src/app/pro/brief/preview/route.ts` — exists, compiles
- [x] `src/lib/hamilton/types.ts` — extended with PeerCompetitiveData, NationalOverviewData, GenerateSectionOutput
- [x] `src/lib/report-templates/index.ts` — exports both template functions
- [x] Commits 55722c9 and 898db9b verified in git log
