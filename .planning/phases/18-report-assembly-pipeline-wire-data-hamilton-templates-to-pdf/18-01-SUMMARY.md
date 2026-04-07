---
phase: 18-report-assembly-pipeline
plan: "01"
subsystem: report-engine
tags: [report-generation, hamilton, pdf, modal, orchestrator]
dependency_graph:
  requires:
    - src/lib/report-assemblers/national-quarterly.ts
    - src/lib/report-assemblers/monthly-pulse.ts
    - src/lib/report-assemblers/peer-competitive.ts
    - src/lib/hamilton/generate.ts
    - src/lib/hamilton/validate.ts
    - src/lib/report-templates/templates/national-quarterly.ts
    - src/lib/report-templates/templates/state-fee-index.ts
    - src/lib/report-templates/templates/monthly-pulse.ts
    - src/lib/report-templates/templates/peer-competitive.ts
  provides:
    - src/lib/report-engine/assemble-and-render.ts
  affects:
    - src/app/api/reports/generate/route.ts
tech_stack:
  added: []
  patterns:
    - Promise.allSettled for parallel Hamilton calls with graceful degradation
    - IIFE fire-and-forget background assembly in API route
    - Inline STATE_NAMES map for 50 states + DC
key_files:
  created:
    - src/lib/report-engine/assemble-and-render.ts
  modified:
    - src/app/api/reports/generate/route.ts
decisions:
  - assembleAndRender() runs server-side in the Next.js API route background IIFE, not in Modal
  - Promise.allSettled used for all parallel Hamilton calls so one failure cannot abort the whole pipeline
  - State index uses stub template (no Hamilton calls) — template does not accept narratives
  - Numeric validation warns on invented numbers but does not reject the narrative (D-07)
  - generate route returns 202 before IIFE starts to avoid blocking the client
metrics:
  duration: "~10 minutes"
  completed: "2026-04-07"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
---

# Phase 18 Plan 01: Report Assembly Pipeline — Wire Data + Hamilton + Templates to PDF

**One-liner:** Orchestrates data assembly + Hamilton narrative generation + HTML template rendering into a single `assembleAndRender()` function, then wires it into the generate route so Modal receives real HTML instead of an empty string.

## What Was Built

### `src/lib/report-engine/assemble-and-render.ts` (new)

The central orchestrator. Accepts `(reportType, params, jobId)` and returns a complete HTML string.

Four branches:

- **national_index**: Calls `assembleNationalQuarterly()`, runs 4 Hamilton sections in parallel via `Promise.allSettled()` (executive_summary, trend_analysis, charter_analysis conditional, regional_analysis conditional), validates each with `validateNumerics()`, renders `renderNationalQuarterlyReport()`.
- **state_index**: Extracts `state_code` from params, maps to full state name via inline `STATE_NAMES` record (50 states + DC), calls `renderStateFeeIndexReport()` — no Hamilton calls (template is a stub).
- **monthly_pulse**: Calls `assembleMonthlyPulse()`, runs 1 Hamilton call (overview section), falls back to static text if Hamilton fails, renders `renderMonthlyPulseReport()`.
- **peer_brief**: Calls `assemblePeerCompetitivePayload(filters)`, runs 2 Hamilton calls in parallel (executive_summary, peer_competitive), validates both, renders `renderPeerCompetitiveReport()`.

Status progression: sets job to `assembling` at entry; sets job to `failed` with error message on any unhandled exception before re-throwing.

### `src/app/api/reports/generate/route.ts` (updated)

- Added `import { assembleAndRender } from '@/lib/report-engine/assemble-and-render'`
- Replaced bare `fetch(html: '')` with an async IIFE that:
  1. Calls `assembleAndRender()` (sets status to `assembling` internally)
  2. Updates status to `rendering`
  3. Fires Modal with the real HTML payload
- `return NextResponse.json({ jobId }, { status: 202 })` remains before the IIFE, so the client is not blocked during the 30-90 second assembly process
- The old `html: ''` literal is gone

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | cf7fc43 | feat(18-01): create assembleAndRender() orchestrator |
| 2 | c0fdea9 | feat(18-01): wire assembleAndRender() into generate route |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

The `state_index` branch renders the stub template (`renderStateFeeIndexReport`). The template outputs a placeholder page with "State fee index report template is under development." This is intentional per the plan spec:

> "The state template is a stub — it does NOT take fee data. Just call `renderStateFeeIndexReport(...)`"

The stub is documented — it produces a valid (non-empty) PDF and does not crash for any valid two-letter state code. A future plan will wire real state-level fee data into this branch.

## Threat Surface

No new network endpoints or auth paths introduced. All surfaces match the plan's threat model (T-18-01 through T-18-04).

## Self-Check: PASSED

- `src/lib/report-engine/assemble-and-render.ts` — EXISTS
- `src/app/api/reports/generate/route.ts` — MODIFIED, contains `assembleAndRender`
- Commit cf7fc43 — FOUND
- Commit c0fdea9 — FOUND
- `html: ''` literal — ABSENT from generate route
- TypeScript — zero errors on new/modified files
