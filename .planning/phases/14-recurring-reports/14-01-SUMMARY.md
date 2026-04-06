---
phase: 14-recurring-reports
plan: 01
subsystem: reporting
tags: [hamilton, report-templates, report-assemblers, national-quarterly, fee-index, beige-book, typescript]

# Dependency graph
requires:
  - phase: 12-hamilton-foundation
    provides: hamilton/types.ts (SectionType, GenerateSectionOutput), report-templates/base (components, layout, wrapReport)
  - phase: 13-report-engine-core
    provides: DataManifest type for audit trail, report-engine/types.ts contracts
provides:
  - assembleNationalQuarterly() — queries national index + charter splits + Beige Book, returns NationalQuarterlyPayload with 4-entry DataManifest
  - renderNationalQuarterlyReport() — pure (payload, narratives) => HTML with conditional charter and district sections
  - NationalQuarterlyPayload, NationalQuarterlySection types for downstream consumers
affects:
  - 14-02-state-fee-index (assembler + template pattern to follow)
  - 14-03-monthly-pulse (same assemble/render split)
  - report-engine trigger layer (consumes NationalQuarterlyPayload)

# Tech tracking
tech-stack:
  added: [Node crypto (sha256 data_hash), report-assemblers/ directory]
  patterns:
    - Assemble-then-render split: assembler queries DB (async), template renders HTML (pure sync)
    - 4-entry DataManifest: getNationalIndex, getPeerIndex(bank), getPeerIndex(cu), getBeigeBookHeadlines
    - Conditional sections: hasCharterData guard + optional narrative guard before rendering
    - Charter lookup via Map<fee_category, IndexEntry> for O(1) per-category charter median

key-files:
  created:
    - src/lib/report-assemblers/national-quarterly.ts
    - src/lib/report-templates/templates/national-quarterly.ts
    - src/lib/report-engine/types.ts
  modified:
    - src/lib/hamilton/types.ts
    - src/lib/report-templates/index.ts

key-decisions:
  - "Assembler uses max institution_count across categories as total_institutions proxy (broadest coverage)"
  - "district_headlines trimmed to 500 chars in assembler per threat T-14-01 (XSS surface reduction)"
  - "Charter comparison table only includes categories where both bank_count > 0 AND cu_count > 0"
  - "data_hash computed over {categories, district_headlines} serialized as JSON via sha256"

patterns-established:
  - "Assemble/render split: assembler is async (DB queries), template is pure sync (no IO)"
  - "DataManifest query entries use function name as sql field (not raw SQL — TypeScript wrappers)"
  - "Conditional sections: check data condition AND narrative existence before including section HTML"

requirements-completed: [NQR-01, NQR-02, NQR-03, NQR-04]

# Metrics
duration: 22min
completed: 2026-04-06
---

# Phase 14 Plan 01: National Quarterly Report Summary

**National Quarterly Report assembler + template: assembleNationalQuarterly() queries 49-category fee index with bank/CU charter splits and Beige Book district headlines; renderNationalQuarterlyReport() renders pure HTML with conditional charter and district sections**

## Performance

- **Duration:** 22 min
- **Started:** 2026-04-06T00:00:00Z
- **Completed:** 2026-04-06T00:22:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `assembleNationalQuarterly()` — async function that runs 4 queries (national index, bank peer index, CU peer index, Beige Book headlines) and packages results into a typed `NationalQuarterlyPayload` with charter breakdowns per category and a `DataManifest` for audit trail
- Created `renderNationalQuarterlyReport()` — pure synchronous template function producing a complete HTML document with cover page, executive summary, 49-category data table, conditional charter breakdown table, conditional district economic context, and methodology footnote
- Brought forward missing Phase 12-04 and Phase 13-01 types (`GenerateSectionOutput`, `NationalOverviewData`, `PeerCompetitiveData`, `DataManifest`, `ReportJob`) into the worktree via Rule 3 auto-fixes

## Task Commits

Each task was committed atomically:

1. **Task 1: NQR data assembler** - `fc13d4a` (feat)
2. **Task 2: NQR template + index.ts update** - `09428ae` (feat)

## Files Created/Modified

- `src/lib/report-assemblers/national-quarterly.ts` — assembleNationalQuarterly() with NationalQuarterlyPayload, NationalQuarterlySection types
- `src/lib/report-templates/templates/national-quarterly.ts` — renderNationalQuarterlyReport() pure HTML renderer
- `src/lib/report-templates/index.ts` — added re-exports for new template function and type
- `src/lib/report-engine/types.ts` — DataManifest, ReportJob, PublishedReport (brought forward from main repo)
- `src/lib/hamilton/types.ts` — added peer_competitive, national_index, charter_analysis, district_context SectionTypes + GenerateSectionOutput, NationalOverviewData, PeerCompetitiveData

## Decisions Made

- Used max institution_count across all national index categories as `total_institutions` (broadest coverage proxy — the category with the most observations represents the widest coverage footprint)
- Trimmed Beige Book headline text to 500 chars in the assembler layer rather than the template layer (per threat T-14-01 — defense in depth)
- Charter comparison table rows filtered to categories where both bank_count > 0 AND cu_count > 0 (partial charter data excluded per spec)
- `data_hash` computed over `{ categories, district_headlines }` JSON serialization via Node crypto sha256

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added report-engine/types.ts to worktree**
- **Found during:** Task 1 (assembler creation)
- **Issue:** `DataManifest` import from `@/lib/report-engine/types` required by assembler; file absent in worktree (worktree based on commit c0287b1, before Phase 13-01 work)
- **Fix:** Created `src/lib/report-engine/types.ts` with `DataManifest`, `ReportJob`, `PublishedReport` from main repo Phase 13-01
- **Files modified:** src/lib/report-engine/types.ts (created)
- **Verification:** tsc --noEmit passes with no errors in new files
- **Committed in:** fc13d4a (Task 1 commit)

**2. [Rule 3 - Blocking] Updated hamilton/types.ts with missing SectionTypes and GenerateSectionOutput**
- **Found during:** Task 1 (template type imports)
- **Issue:** Worktree's hamilton/types.ts missing `"national_index"`, `"charter_analysis"`, `"peer_competitive"` in SectionType union; missing `GenerateSectionOutput`, `NationalOverviewData`, `PeerCompetitiveData` types added by Phase 12-04 on main repo
- **Fix:** Updated `src/lib/hamilton/types.ts` to add all missing types from main repo; also added `"district_context"` to SectionType (required by plan's NationalQuarterlyReportInput)
- **Files modified:** src/lib/hamilton/types.ts (modified)
- **Verification:** tsc --noEmit passes; template imports resolve cleanly
- **Committed in:** fc13d4a (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking import issues)
**Impact on plan:** Both fixes required to make the new files importable. No scope creep — identical to code already in main repo.

## Issues Encountered

Worktree was created from commit c0287b1 (before Phase 12-04 and Phase 13) while the plan was written against the main repo at c55e6b7. The missing types were identified at compilation time and brought forward from the main repo without modification.

## Known Stubs

None — all data flows through live pipeline queries (getNationalIndex, getPeerIndex, getBeigeBookHeadlines). No hardcoded placeholders.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary crossings introduced. Threat T-14-01 mitigated: district_headlines trimmed to 500 chars in assembler; template uses hamiltonNarrativeBlock which calls escapeHtml.

## Self-Check: PASSED

- FOUND: src/lib/report-assemblers/national-quarterly.ts
- FOUND: src/lib/report-templates/templates/national-quarterly.ts
- FOUND: src/lib/report-engine/types.ts
- FOUND: .planning/phases/14-recurring-reports/14-01-SUMMARY.md
- FOUND commit: fc13d4a
- FOUND commit: 09428ae
- TypeScript: zero errors in new files (only pre-existing test vitest import errors unrelated to this plan)

## Next Phase Readiness

- `assembleNationalQuarterly()` and `renderNationalQuarterlyReport()` are ready for Plan 02 (State Fee Index) to follow the same assemble/render pattern
- Both functions are importable from their canonical paths with zero TypeScript errors
- The `NationalQuarterlyPayload` type is available for the report-engine trigger layer (Phase 13-03 generate route) to consume when scheduling NQR jobs

---
*Phase: 14-recurring-reports*
*Completed: 2026-04-06*
