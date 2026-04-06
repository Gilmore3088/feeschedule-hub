---
phase: 14-recurring-reports
plan: 03
subsystem: reporting
tags: [hamilton, report-templates, report-assemblers, monthly-pulse, modal, cron, typescript, python]

# Dependency graph
requires:
  - phase: 12-hamilton-foundation
    provides: hamilton/types.ts (GenerateSectionOutput), report-templates/base (components, layout)
  - phase: 13-report-engine-core
    provides: DataManifest, ReportType, report-engine/types.ts, /api/reports/generate route pattern
  - plan: 14-01
    provides: report-assemblers/ directory pattern, assemble-then-render split
provides:
  - assembleMonthlyPulse() — 5% threshold movement detection vs cached snapshot
  - MonthlyPulsePayload, PulseMover types for downstream consumers
  - renderMonthlyPulseReport() — pure (payload, narratives) => HTML with conditional movers tables
  - MonthlyPulseReportInput type for report engine integration
  - run_monthly_pulse Modal cron function (1st of each month 08:00 UTC)
  - X-Cron-Secret auth on /api/reports/generate for machine-to-machine cron use
affects:
  - report-engine trigger layer (consumes MonthlyPulsePayload on monthly schedule)
  - fee_crawler/modal_app.py (new scheduled function, no new image/worker)
  - /api/reports/generate (new auth path for cron)

# Tech tracking
tech-stack:
  added: [Node crypto (sha256 for data_hash), urllib.request (Python stdlib for HTTP POST)]
  patterns:
    - Assemble-then-render split (same as 14-01, 14-02): assembler queries DB async, template pure sync
    - Movement detection: live getNationalIndex() vs getNationalIndexCached() with 5% signal threshold
    - Dual-auth API: session cookie OR X-Cron-Secret header (T-14-07 guard: length > 0)
    - Modal cron without new image: run_monthly_pulse reuses default app image, no new worker
    - Fire-and-forget cron: run_monthly_pulse POSTs to /api/reports/generate, returns 202 jobId immediately

# Key files
key-files:
  created:
    - src/lib/report-assemblers/monthly-pulse.ts
    - src/lib/report-templates/templates/monthly-pulse.ts
    - src/app/api/reports/generate/route.ts
    - src/lib/report-engine/types.ts (worktree — from Phase 13 base)
    - src/lib/report-engine/freshness.ts (worktree — from Phase 13 base)
  modified:
    - src/lib/report-templates/index.ts (added pulse barrel exports)
    - src/lib/hamilton/types.ts (added GenerateSectionOutput alias — was missing in worktree branch)
    - fee_crawler/modal_app.py (appended run_monthly_pulse function)

# Decisions
decisions:
  - Movement threshold set at 5% absolute change_pct — categories below this are noise, not signal (D-08)
  - Prior period is fee_index_cache (materialized by publish-index) not a timestamped snapshot — avoids needing a new table
  - Stable-market notice renders when both movers_up and movers_down are empty — correct behavior when cache and live data are identical
  - run_monthly_pulse uses urllib.request (Python stdlib) not requests/httpx — zero new Python dependencies
  - user_id=null for cron jobs is the designed behavior per ReportJob type spec (T-14-08 accept)
  - X-Cron-Secret header check guards length > 0 to prevent empty-string bypass (T-14-07 mitigate)

# Metrics
metrics:
  duration: ~25 minutes
  completed: 2026-04-06
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 3
---

# Phase 14 Plan 03: Monthly Pulse Report Summary

**One-liner:** Monthly fee movement detector with 5% threshold assembler, movers-table template, and Modal cron auto-publishing on the 1st of each month via X-Cron-Secret authenticated API.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Monthly Pulse assembler + template | `bce882b` | monthly-pulse.ts (assembler + template), index.ts, types.ts |
| 2 | Modal cron + cron secret auth | `0e506c8` | modal_app.py, generate/route.ts, freshness.ts |

## What Was Built

### Task 1: Assembler (`src/lib/report-assemblers/monthly-pulse.ts`)

`assembleMonthlyPulse()` detects month-over-month fee movement by comparing:
- **Current period:** `getNationalIndex()` — live computed from all non-rejected fees
- **Prior period:** `getNationalIndexCached()` — pre-computed from `fee_index_cache` table (populated by `publish-index`)

Movement classification:
- `change_pct > 1.0%` → direction "up"
- `change_pct < -1.0%` → direction "down"
- Only included as a mover if `Math.abs(change_pct) > 5.0` (signal threshold)

`movers_up` sorted by change_pct descending; `movers_down` sorted by absolute change_pct descending.

### Task 1: Template (`src/lib/report-templates/templates/monthly-pulse.ts`)

`renderMonthlyPulseReport()` produces a complete HTML string with:
1. Cover page — "Monthly Fee Pulse" / "Market movement — {period}"
2. Pulse Overview — Hamilton narrative (1-2 paragraphs, 250-word max per D-09)
3. Page break — only when both movers_up and movers_down are non-empty
4. Movers Up table — conditional, 5-column with format: "percent" for change_pct
5. Movers Down table — conditional
6. Stable-market notice — when both lists empty: "No fee categories exceeded the 5% movement threshold this period."
7. Methodology footnote

### Task 2: Modal Cron (`fee_crawler/modal_app.py`)

`run_monthly_pulse` fires on `Cron("0 8 1 * *")` — 1st of each month at 08:00 UTC. No conflict with existing daily crons (slots: 2, 3, 4, 6, 10). Uses `urllib.request` (stdlib) — zero new Python dependencies.

Returns:
- `{ triggered: True, job_id: "...", period: "April 2026" }` on success
- `{ triggered: False, error: "...", status_code: N }` on HTTP error (does not raise — cron failures log and return, not crash)

### Task 2: Cron Auth (`src/app/api/reports/generate/route.ts`)

Added dual auth to the generate route:
1. Session cookie (`getCurrentUser()`) — normal user-triggered path
2. `X-Cron-Secret` header matching `process.env.REPORT_CRON_SECRET` — cron path, results in `user_id=null` on the job

T-14-07: `cronSecret.length > 0` guard prevents empty-string bypass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added GenerateSectionOutput to worktree hamilton/types.ts**
- **Found during:** Task 1 TypeScript compile
- **Issue:** `GenerateSectionOutput` was added to `hamilton/types.ts` in Phase 12 but the worktree branch (`worktree-agent-a6da4c7b`) predates those changes. The template's `MonthlyPulseReportInput` imports it.
- **Fix:** Added `GenerateSectionOutput = SectionOutput & { section_type: SectionType; generated_at: string }` alias to worktree's `hamilton/types.ts` — matches the definition in the main branch exactly.
- **Files modified:** `src/lib/hamilton/types.ts`
- **Commit:** `bce882b`

**2. [Rule 3 - Blocking] Created report-engine/types.ts and freshness.ts in worktree**
- **Found during:** Task 1 and Task 2 — the worktree branch predates Phase 13 and lacks `src/lib/report-engine/`
- **Fix:** Created `types.ts` (clean, conflict-free version from Phase 13-01) and `freshness.ts` (copied from Phase 13 base) in the worktree so the generate route and assembler can import from them.
- **Files modified:** `src/lib/report-engine/types.ts`, `src/lib/report-engine/freshness.ts`
- **Commits:** `bce882b`, `0e506c8`

**3. [Rule 3 - Blocking] Created /api/reports/generate/route.ts in worktree**
- **Found during:** Task 2 — the plan calls for updating the generate route but it doesn't exist in the worktree (created in Phase 13, post-branch-point).
- **Fix:** Created the complete generate route in the worktree with the Phase 13-03 baseline plus the Phase 14-03 cron auth addition, so both concerns are present in the final file.
- **Files modified:** `src/app/api/reports/generate/route.ts`
- **Commit:** `0e506c8`

## Threat Surface Scan

No new threat surface beyond what was planned. The X-Cron-Secret auth path was explicitly modeled in the plan's threat register (T-14-07 through T-14-10) and all mitigations are implemented.

## Self-Check: PASSED

Files verified present:
- `src/lib/report-assemblers/monthly-pulse.ts` — FOUND
- `src/lib/report-templates/templates/monthly-pulse.ts` — FOUND
- `src/lib/report-templates/index.ts` — FOUND (modified)
- `fee_crawler/modal_app.py` — FOUND (modified)
- `src/app/api/reports/generate/route.ts` — FOUND

Commits verified:
- `bce882b` — FOUND (Task 1)
- `0e506c8` — FOUND (Task 2)

Verification checks all passed:
1. Python syntax OK
2. Cron schedule `0 8 1 * *` present
3. No daily slot conflict (existing: 2, 3, 4, 6, 10 — pulse is monthly at 8)
4. Zero TypeScript errors in plan files
5. 3 assembler exports confirmed (`PulseMover`, `MonthlyPulsePayload`, `assembleMonthlyPulse`)
6. Barrel exports confirmed (`renderMonthlyPulseReport`, `MonthlyPulseReportInput`)
7. Cron auth guard present (`X-Cron-Secret`, `REPORT_CRON_SECRET`)
8. 5% threshold constant present (`MOVEMENT_THRESHOLD_PCT = 5.0`)
