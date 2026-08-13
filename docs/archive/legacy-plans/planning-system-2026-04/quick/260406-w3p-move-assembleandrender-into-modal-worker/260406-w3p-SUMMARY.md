---
phase: quick
plan: 260406-w3p
subsystem: report-engine
tags: [modal, vercel, report-generation, pdf, infrastructure]
dependency_graph:
  requires: [report-engine, modal-workers]
  provides: [reliable-report-pipeline]
  affects: [/api/reports/generate, /api/reports/[id]/assemble, modal_app.py]
tech_stack:
  patterns: [server-to-server-callback, shared-secret-auth, fire-and-forget-trigger]
key_files:
  created:
    - src/app/api/reports/[id]/assemble/route.ts
  modified:
    - src/app/api/reports/generate/route.ts
    - fee_crawler/modal_app.py
decisions:
  - "Use BFI_APP_URL (not NEXT_PUBLIC_APP_URL) for Modal callback URL"
  - "Use urllib.request for HTTP call in Modal (no new deps)"
  - "Shared secret via REPORT_INTERNAL_SECRET env var for server-to-server auth"
metrics:
  duration: 134s
  completed: "2026-04-06"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 2
---

# Quick Task 260406-w3p: Move assembleAndRender into Modal Worker Summary

Moved report assembly pipeline from Vercel fire-and-forget (killed on function reclaim) to Modal worker with callback pattern, using shared secret auth and 600s timeout budget.

## What Changed

### Task 1: Create internal /api/reports/[id]/assemble endpoint
**Commit:** `7dfc80b`

New POST endpoint at `/api/reports/[id]/assemble` that Modal calls server-to-server. Auth via `X-Internal-Secret` header checked against `REPORT_INTERNAL_SECRET` env var with empty-string guard. Loads the pending job row, runs `assembleAndRender()`, returns HTML as JSON. Uses `maxDuration=300` for Vercel Pro plan timeout extension.

### Task 2: Slim down generate route to trigger-only
**Commit:** `f93f259`

Removed `assembleAndRender` import and the async IIFE that ran assembly in Vercel's function lifecycle. The route now only does: auth, validate, freshness gate, DB insert, and a lightweight `fetch()` POST to Modal with `{job_id, report_type, params}`. No HTML in the Modal payload. The fetch is still fire-and-forget (`.catch()` logs errors, job stays pending if Modal unreachable).

### Task 3: Update Modal generate_report to call assemble endpoint
**Commit:** `4881546`

Rewrote `generate_report` to orchestrate the full pipeline:
1. Call `/api/reports/{job_id}/assemble` with `X-Internal-Secret` header to get HTML
2. Render HTML to PDF via Playwright
3. Upload PDF to R2
4. Update job status to complete

Uses `urllib.request` (already used by `run_monthly_pulse`), `BFI_APP_URL` env var for the callback URL, and timeout increased from 300s to 600s.

## Deviations from Plan

None - plan executed exactly as written.

## Environment Variables Required

| Variable | Where | Purpose |
|----------|-------|---------|
| `REPORT_INTERNAL_SECRET` | Vercel + Modal | Shared secret for server-to-server auth on assemble endpoint |
| `BFI_APP_URL` | Modal | Base URL for callback to Next.js (defaults to `https://bankfeeindex.com`) |
| `MODAL_REPORT_URL` | Vercel | URL of Modal's generate_report FastAPI endpoint |

## Architecture After Change

```
Browser/Cron -> POST /api/reports/generate (Vercel, <1s)
                  |
                  v
              POST to Modal (fire-and-forget)
                  |
                  v
         Modal generate_report (600s budget)
                  |
                  v
         POST /api/reports/{id}/assemble (Vercel, 300s budget)
              assembleAndRender() -> HTML
                  |
                  v
         render_and_store(html) -> PDF -> R2
                  |
                  v
         update_job_status("complete")
```

## Self-Check: PASSED

- [x] `src/app/api/reports/[id]/assemble/route.ts` exists
- [x] Commit `7dfc80b` exists
- [x] Commit `f93f259` exists
- [x] Commit `4881546` exists
- [x] TypeScript compiles without source errors
- [x] Python syntax valid
