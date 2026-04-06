---
phase: 13-report-engine-core
plan: 03
subsystem: api
tags: [r2, presigned-url, aws-sdk-v3, report-jobs, supabase, next-api-routes, auth, modal]

# Dependency graph
requires:
  - phase: 13-01
    provides: report_jobs table schema, ReportJob types, FreshnessResult, checkFreshness()
  - phase: 13-02
    provides: Modal render worker, runEditorReview()
provides:
  - POST /api/reports/generate — freshness gate + DB insert + Modal fire-and-forget
  - GET /api/reports/[id]/status — poll job state + presigned_url on complete
  - GET /api/reports/[id]/download — 302 redirect to R2 presigned URL (auth required)
  - src/lib/report-engine/presign.ts — generatePresignedUrl(key, ttlSeconds) using AWS SDK v3
affects:
  - phase-14-recurring-triggers
  - phase-15-pro-portal
  - phase-16-report-catalog

# Tech tracking
tech-stack:
  added:
    - "@aws-sdk/s3-request-presigner ^3.1025.0 (moved @aws-sdk/client-s3 to runtime deps)"
  patterns:
    - "Fire-and-forget Modal trigger: fetch() with .catch() handler, intentionally not awaited"
    - "Presigned URLs generated fresh on every poll/download call — never stored in DB (D-04)"
    - "Next.js 15 dynamic params: await params before reading id"
    - "Ownership guard pattern: isOwner || isAdminViewingCronJob"

key-files:
  created:
    - src/lib/report-engine/presign.ts
    - src/app/api/reports/generate/route.ts
    - src/app/api/reports/[id]/status/route.ts
    - src/app/api/reports/[id]/download/route.ts
  modified:
    - src/lib/report-engine/index.ts (added generatePresignedUrl export)
    - package.json (added @aws-sdk/s3-request-presigner, moved client-s3 to runtime deps)

key-decisions:
  - "User.id is number in users table; stored as string in report_jobs.user_id — comparison uses String(user.id)"
  - "forcePathStyle: true required for Cloudflare R2 S3-compatible endpoint"
  - "MODAL_REPORT_URL is optional at this stage — route warns and continues if unset"
  - "409 (not 404) returned when job exists but is not complete on download route"

patterns-established:
  - "Report route auth pattern: getCurrentUser() → 401 if null, check ownership before returning data"
  - "Presign pattern: generate fresh on each request, 3600s TTL per D-04"
  - "Freshness scope mapping: state_index→state, peer_brief→peer, others→national"

requirements-completed: [ENG-05]

# Metrics
duration: 25min
completed: 2026-04-06
---

# Phase 13 Plan 03: Report API Routes Summary

**Three Next.js API routes + R2 presign utility wiring the trigger-poll-download cycle for report_jobs**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-06T22:13:00Z
- **Completed:** 2026-04-06T22:38:07Z
- **Tasks:** 2 of 2 auto tasks (Task 3 is human-verify checkpoint)
- **Files modified:** 6

## Accomplishments

- POST /api/reports/generate: auth + allowlist validation + freshness gate (D-10) + DB insert + fire-and-forget Modal trigger returning 202 {jobId}
- GET /api/reports/[id]/status: ownership-checked polling with presigned_url included only when status='complete'
- GET /api/reports/[id]/download: 302 redirect to R2 presigned URL, 409 when not ready
- generatePresignedUrl() in presign.ts using @aws-sdk/s3-request-presigner v3 with R2_ENDPOINT, 1h TTL (D-04)

## Task Commits

1. **Task 1: Generate route + presign utility** - `70b0039` (feat)
2. **Task 2: Status + download routes** - `21889dc` (feat)

## Files Created/Modified

- `src/lib/report-engine/presign.ts` - generatePresignedUrl(key, ttlSeconds) using AWS SDK v3 S3Client + getSignedUrl, forcePathStyle for R2 compatibility
- `src/app/api/reports/generate/route.ts` - POST handler: auth, report_type allowlist validation, freshness gate (checkFreshness), INSERT report_jobs, fire-and-forget Modal fetch
- `src/app/api/reports/[id]/status/route.ts` - GET handler: auth, ownership guard, SELECT report_jobs, presigned_url only when complete
- `src/app/api/reports/[id]/download/route.ts` - GET handler: auth, ownership guard, 409 not-ready, 302 redirect to presigned URL
- `src/lib/report-engine/index.ts` - Added generatePresignedUrl export
- `package.json` - Added @aws-sdk/s3-request-presigner to dependencies; moved @aws-sdk/client-s3 from devDependencies to dependencies

## Decisions Made

- **User.id type mismatch:** `User.id` in auth.ts is `number` but plan interface docs showed `string`. Ownership comparison uses `String(user.id)` to compare against `job.user_id` (string column). This is a safe coercion.
- **MODAL_REPORT_URL optional:** Route logs a warning and returns jobId anyway if MODAL_REPORT_URL is not set. Modal can be triggered manually for Phase 14 wiring.
- **forcePathStyle:** Added to S3Client for Cloudflare R2 compatibility (virtual-hosted-style URLs don't work with R2).
- **@aws-sdk/client-s3 moved to runtime deps:** Was in devDependencies, but presign.ts uses it at runtime in production.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed User.id type mismatch in ownership comparison**
- **Found during:** Task 2 (status + download routes)
- **Issue:** Plan interface docs declared `User.id: string` but actual `src/lib/auth.ts` has `id: number`. Direct comparison `job.user_id === user.id` caused TS2367 error ("types string | null and number have no overlap")
- **Fix:** Changed comparison to `job.user_id === String(user.id)` in both routes
- **Files modified:** `src/app/api/reports/[id]/status/route.ts`, `src/app/api/reports/[id]/download/route.ts`
- **Verification:** `npx tsc --noEmit` shows no errors in reports routes
- **Committed in:** `21889dc`

**2. [Rule 3 - Blocking] Added @aws-sdk/s3-request-presigner and moved client-s3 to runtime deps**
- **Found during:** Task 1 (presign utility)
- **Issue:** `@aws-sdk/s3-request-presigner` was missing from package.json entirely; `@aws-sdk/client-s3` was in devDependencies (not shipped to production)
- **Fix:** `npm install @aws-sdk/s3-request-presigner --save`; moved client-s3 from devDependencies to dependencies
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** `npx tsc --noEmit` passes cleanly for all report-engine files
- **Committed in:** `70b0039`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes required for correctness. No scope creep.

## Issues Encountered

- Pre-existing vitest type declaration errors in `editor.test.ts` and `freshness.test.ts` (from Plans 01/02) — vitest is not installed in this worktree. Out of scope for Plan 03. Tracked in deferred items.

## Known Stubs

None — routes are fully wired. presignedUrl is conditional on real `artifact_key` being present (set by Modal render worker in Plan 02).

## Threat Surface Scan

No new network endpoints beyond those specified in the plan's threat model. Routes T-13-10 through T-13-14 are implemented as designed.

## Next Phase Readiness

- Phase 14 (recurring report triggers) can call POST /api/reports/generate with cron credentials
- Phase 15 (pro portal) can poll /api/reports/[id]/status and use presigned_url to display download button
- Phase 16 (report catalog) will use the download route for published report delivery
- Blocker: `supabase db push` must be run to apply `20260406_report_jobs.sql` migration before routes go live

## Checkpoint: Human Verify

The human verify checkpoint (Task 3) requires:
1. Apply migration: `supabase db push` (or run SQL in Supabase editor)
2. Test unauthenticated generate: expect 401
3. Test authenticated generate: expect 202 {jobId} or 422 if data is stale
4. Poll status: expect {status: "pending", presigned_url: null}
5. Check report_jobs row in Supabase
6. Test unauthenticated download: expect 401

---
*Phase: 13-report-engine-core*
*Completed: 2026-04-06*
