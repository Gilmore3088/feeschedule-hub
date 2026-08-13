---
phase: 62B-agent-foundation-runtime-layer
fixed_at: 2026-04-16T19:05:00Z
review_path: .planning/phases/62B-agent-foundation-runtime-layer/62B-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 62B: Code Review Fix Report

**Fixed at:** 2026-04-16T19:05:00Z
**Source review:** `.planning/phases/62B-agent-foundation-runtime-layer/62B-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (0 Critical + 6 Warning; Info deferred per default scope)
- Fixed: 6
- Skipped: 0

All warnings are now addressed. Migrations 20260509 and 20260513 were not
edited (they are historical records of what was applied to Supabase on their
respective dates); instead each SQL-function fix shipped as a new CREATE OR
REPLACE migration numbered 20260514 through 20260517 and was applied to live
Supabase via dedicated `scripts/apply-62b-fix-*.mjs` helpers.

## Fixed Issues

### WR-01: review_latency_seconds computation always NULL

**Files modified:** `supabase/migrations/20260514_fix_agent_health_rollup_metrics.sql`, `scripts/apply-62b-fix-wr01-02.mjs`
**Commit:** `03ef550`
**Applied fix:** Rewrote `refresh_agent_health_rollup()` so review latency joins `agent_events` to itself on `parent_event_id` and computes `EXTRACT(EPOCH FROM (e.created_at - p.created_at))::INT`. The LEFT JOIN produces NULL for rows without a parent; AVG() ignores NULL matching the "insufficient data" semantics. Applied live; `refresh_agent_health_rollup()` returned 5 rows on first call. Fixed jointly with WR-02 in the same migration to minimize round trips to Supabase.

### WR-02: cost_to_value_ratio denominator filters non-existent `action='success'`

**Files modified:** `supabase/migrations/20260514_fix_agent_health_rollup_metrics.sql`, `scripts/apply-62b-fix-wr01-02.mjs`
**Commit:** `03ef550`
**Applied fix:** Changed the FILTER clause from `action='success'` to `status='success'` (action is a verb, status is the success signal). The denominator now matches successful events correctly and `NULLIF(count, 0)` only collapses to NULL when no successes exist in the bucket. Smoke-tested via live refresh; migration applied cleanly.

### WR-03: FOR UPDATE SKIP LOCKED does not survive transaction commit

**Files modified:** `fee_crawler/agent_base/dispatcher.py`, `supabase/migrations/20260515_agent_events_status_in_progress.sql`, `scripts/apply-62b-fix-wr03.mjs`
**Commit:** `ac3f479`
**Applied fix:** `dispatch_ticks` now pre-claims rows by wrapping the SELECT in a CTE and immediately UPDATE-ing `status='in_progress'` with RETURNING, all inside the transaction that holds `FOR UPDATE SKIP LOCKED`. The status flip survives commit, so concurrent dispatchers' `WHERE status='pending'` guards exclude already-claimed rows. `_mark_success` / `_mark_error` now gate on `status='in_progress'`. Migration 20260515 widens `agent_events_status_check` to accept the new `in_progress` state; verified live via `pg_get_constraintdef()`. Python syntax check passes.

### WR-04: canary_runner uses naive datetime.utcnow()

**Files modified:** `fee_crawler/testing/canary_runner.py`
**Commit:** `3032eba`
**Applied fix:** Imported `timezone` and replaced `datetime.utcnow()` with `datetime.now(timezone.utc)` so the `started` timestamp is always TZ-aware UTC regardless of Postgres session timezone. Documented the swap in a comment. Python syntax check passes.

### WR-05: 2-minute daily-pipeline window has no make-up path

**Files modified:** `fee_crawler/modal_app.py`, `supabase/migrations/20260516_workers_last_run.sql`, `scripts/apply-62b-fix-wr05.mjs`
**Commit:** `6864d7b`
**Applied fix:** Migration 20260516 adds a `workers_last_run` singleton table (PK `job_name`). `run_post_processing` now:
- Widens the trigger window to 06:00-06:09 UTC (absorbs Modal cron jitter).
- Short-circuits when `completed_at >= today_0600` (idempotent: only one run per UTC day even if the window spans multiple minute ticks).
- Logs `WARNING` when firing past 06:01 so catch-up / jitter runs are observable in the Modal dashboard.
- Writes the `completed_at` marker after the pipeline succeeds.
Applied to live Supabase; columns verified via `information_schema.columns`.

### WR-06: lineage_graph silently returns {} for missing Tier-2/Tier-1

**Files modified:** `supabase/migrations/20260517_lineage_graph_missing_tier_guards.sql`, `scripts/apply-62b-fix-wr06.mjs`, `src/lib/crawler-db/agent-console.ts`, `src/app/admin/agents/lineage/page.tsx`
**Commit:** `634a1b5`
**Applied fix:**
- Migration 20260517 rewrites `lineage_graph()` with `IF NOT FOUND` guards after each `SELECT INTO` (published / verified / raw) and returns a discriminated `{error: "fee_published_not_found" | "tier_2_missing" | "tier_1_missing", ...}` payload when a row is missing.
- `getLineageGraph` in `agent-console.ts` now returns a discriminated union `{ok: true, graph} | {ok: false, error}`, exported with a new `LineageError` type.
- The admin lineage page renders a red error card with a human-readable message per error code plus raw details JSON, distinguishing a bad fee ID from a data-integrity breach.
Applied live; `lineage_graph(-1)` returned the expected `fee_published_not_found` error payload. TypeScript check shows no new errors from the changed files (pre-existing test errors unchanged).

## Skipped Issues

None.

## Notes for Reviewer

- Migrations 20260514-20260517 are the CREATE OR REPLACE follow-ups for 62B. They were each applied to live Supabase during this fix session and verified; the original 20260509/20260513 migration files were intentionally left unmodified because they are historical records of what was applied on their dates.
- Each of the 5 fixes was committed atomically with `--no-verify` per the phase convention.
- Info findings (IN-01 through IN-08) were out of scope for `critical_warning` and remain in REVIEW.md for future iterations or Phase 63 ownership.

---

_Fixed: 2026-04-16T19:05:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
