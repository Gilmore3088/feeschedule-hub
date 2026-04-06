---
phase: 13-report-engine-core
plan: "01"
subsystem: report-engine
tags: [report-engine, supabase, freshness-gate, types, migration]
dependency_graph:
  requires: []
  provides:
    - report_jobs Supabase table
    - published_reports Supabase table
    - ReportType, ReportJobStatus, DataManifest, ReportJob, PublishedReport types
    - checkFreshness() freshness gate
  affects:
    - Phase 13-02 (Modal render worker uses report_jobs)
    - Phase 13-03 (API routes use report_jobs + checkFreshness)
    - Phase 14+ (all report templates depend on this job infrastructure)
tech_stack:
  added: []
  patterns:
    - PERCENTILE_CONT(0.5) WITHIN GROUP for Postgres median (not non-standard MEDIAN)
    - Fail-safe null handling (missing DB data → age=999, always stale)
    - Re-export barrel pattern (index.ts surfaces types + checkFreshness)
key_files:
  created:
    - supabase/migrations/20260406_report_jobs.sql
    - src/lib/report-engine/types.ts
    - src/lib/report-engine/freshness.ts
    - src/lib/report-engine/freshness.test.ts
    - src/lib/report-engine/index.ts
  modified: []
decisions:
  - "PERCENTILE_CONT(0.5) WITHIN GROUP used instead of MEDIAN — MEDIAN is not a Postgres built-in aggregate"
  - "FreshnessResult kept in freshness.ts (not types.ts) to avoid circular imports"
  - "Null DB result treated as 999 days — fail-safe matches D-10 intent (never publish stale data)"
metrics:
  duration_minutes: 12
  completed_at: "2026-04-06T22:24:57Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 0
---

# Phase 13 Plan 01: Supabase Schema + Freshness Gate Summary

**One-liner:** report_jobs/published_reports Supabase migration with PERCENTILE_CONT(0.5) freshness gate enforcing 120-day national and 90-day state staleness thresholds.

## Tables Created

### report_jobs
9 columns: `id` (uuid PK), `report_type` (text, CHECK constraint), `status` (text, CHECK constraint + default 'pending'), `params` (jsonb), `data_manifest` (jsonb — audit trail per D-13), `artifact_key` (text), `error` (text), `created_at` (timestamptz), `completed_at` (timestamptz), `user_id` (uuid nullable).

Status CHECK: `('pending','assembling','rendering','complete','failed')`
Report type CHECK: `('national_index','state_index','peer_brief','monthly_pulse')`

Indexes: `report_jobs_status_created_at_idx` (status, created_at) and `report_jobs_user_id_idx` (user_id).

### published_reports
7 columns: `id` (uuid PK), `job_id` (uuid FK → report_jobs.id), `report_type` (text), `slug` (text UNIQUE), `title` (text), `published_at` (timestamptz), `is_public` (boolean default false).

## Types Exported (src/lib/report-engine/types.ts)

| Export | Kind | Description |
|--------|------|-------------|
| `ReportType` | type union | 4 report type values matching SQL CHECK |
| `ReportJobStatus` | type union | 5 status values matching SQL CHECK |
| `DataManifest` | interface | queries array + data_hash + pipeline_commit (D-13) |
| `ReportJob` | interface | All 10 report_jobs columns with typed fields |
| `PublishedReport` | interface | All 7 published_reports columns |

## Freshness Thresholds (src/lib/report-engine/freshness.ts)

| Scope | Threshold | Postgres Aggregate |
|-------|-----------|-------------------|
| national | 120 days | PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY age_days) |
| state | 90 days | same + AND state_abbr = $stateCode |
| peer | 120 days | same as national (fallback per D-10) |

Null result from DB → age treated as 999 days → always returns `fresh: false`.

## Test Results

4 vitest tests, all passing:
- national stale: medianAge=130 > 120 → `fresh: false`
- national fresh: medianAge=100 <= 120 → `fresh: true`
- state stale: medianAge=95 > 90 → `fresh: false`
- null fail-safe: null DB result → age=999 → `fresh: false`

## Commits

| Hash | Description |
|------|-------------|
| 4161e51 | feat(13-01): add report_jobs migration + types |
| be73d22 | feat(13-01): add checkFreshness() + 4 vitest tests |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All exports are fully implemented. The `index.ts` re-exports are complete.

## Threat Flags

No new security-relevant surface introduced beyond what the plan's threat model covers. report_jobs status transitions rely on CHECK constraints (T-13-01 mitigated); user_id must be set from verified session in API routes (T-13-04, enforced in Phase 13-03).

## Self-Check: PASSED

- supabase/migrations/20260406_report_jobs.sql: FOUND
- src/lib/report-engine/types.ts: FOUND
- src/lib/report-engine/freshness.ts: FOUND
- src/lib/report-engine/freshness.test.ts: FOUND
- src/lib/report-engine/index.ts: FOUND
- Commit 4161e51: FOUND
- Commit be73d22: FOUND
- vitest 4/4 tests: PASSED
- tsc errors in non-test report-engine files: NONE (pre-existing vitest module resolution error in test files is out of scope — same error exists in 3 other test files)
