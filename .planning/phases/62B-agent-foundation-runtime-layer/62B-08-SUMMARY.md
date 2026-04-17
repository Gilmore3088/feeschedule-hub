# 62B-08 Summary — pg_cron Review Dispatcher (LOOP-03, D-05 Pivot)

**Plan:** 62B-08
**Phase:** 62B-agent-foundation-runtime-layer
**Status:** Complete
**Completed:** 2026-04-17
**Requirements addressed:** LOOP-03

## What shipped

### Task 1 — pg_cron emitter + dispatcher module (commit `b9a136e`)

- `supabase/migrations/20260511_pg_cron_review_dispatcher.sql` — pg_cron schedule (one per agent) that inserts a row with `action='review_tick'` into `agent_events` for each `agent_registry` entry whose `review_schedule` is non-NULL. Scheduler runs inside Postgres; no extra Modal cron.
- `fee_crawler/agent_base/dispatcher.py` — `dispatch_ticks()` async function that SELECTs `FOR UPDATE SKIP LOCKED` pending `review_tick` rows, instantiates the correct `AgentBase` subclass by `agent_name`, invokes `agent.review()`, and marks the event `status='success'`.
- `fee_crawler/tests/test_review_dispatcher.py` — 6 tests (2 pure-Python contract tests + 4 DB-gated integration tests).

### Task 2 — D-05 pivot decision (Option A)

Modal Starter tier caps at 5 cron slots; all 5 were in use. The user picked **Option A**: fold the new review dispatcher into the existing `run_post_processing` slot by changing its schedule from `0 6 * * *` to `* * * * *` (every minute).

### Task 3 — modal_app.py implementation (this commit)

`fee_crawler/modal_app.py` `run_post_processing` now:

1. Runs every minute (`modal.Cron("* * * * *")`).
2. **Always** calls `await dispatch_ticks()` first, absorbing any exceptions so tick dispatch never blocks the daily pipeline.
3. Only runs the existing daily pipeline (categorize / auto-review / snapshot / publish-index + integrity checks + daily report) during the `06:00–06:01 UTC` window; returns `"dispatch_only"` otherwise.
4. D-05 pivot comment (above the decorator) cites research Pitfall 1 and points at this SUMMARY for rationale.

Function is now `async def` (was `def`) because `dispatch_ticks` is async.

## Live DB deployment note

Migration `20260511_pg_cron_review_dispatcher.sql` still needs to be applied to live Supabase. The orchestrator will apply it alongside `20260512_agent_health_rollup_seed.sql` from 62B-09 as part of the post-Wave-4 schema push.

## Deviations

- `run_post_processing` signature changed from sync `def` to `async def`. This is required because `dispatch_ticks()` is async and Modal supports async cron functions natively. Downstream callers that `from fee_crawler.modal_app import run_post_processing` will need `await` — but the function's only caller was the Modal scheduler, which handles both sync and async.
- Guard condition uses UTC. If operational preference is ET or the original `0 6 * * *` was wall-clock ET, adjust the guard to `now.astimezone(ZoneInfo("America/New_York"))`. Out of scope for this plan; flag for Atlas (Phase 65) if operational cadence needs revisit.

## Why Option A

- Zero new Modal slots + zero recurring cost (vs. $250/mo for Team plan in Option C).
- Review latency ~60s end-to-end — comfortably under LOOP-03 SC1's 15-min freshness bar.
- Post-processing pipeline cadence preserved: guard runs it once per day, same 6am UTC window.
- Minimal structural change: one `if` guard wraps the existing code path.
- `ingest_data` (Option B) retains its auto-schedule — avoids cascading work to move FRED/NYFED/etc. ingestion to external triggers.

Option B would have orphaned the daily data-source ingestion; Option C would have added $3,000/year of recurring cost before the framework has even been exercised by Knox/Darwin/Atlas.

## Key-files created/modified

- supabase/migrations/20260511_pg_cron_review_dispatcher.sql *(new, Task 1)*
- fee_crawler/agent_base/dispatcher.py *(new, Task 1)*
- fee_crawler/tests/test_review_dispatcher.py *(new, Task 1)*
- fee_crawler/modal_app.py *(modified, Task 3 — D-05 pivot comment + cron change + guard)*

## Commits

- `b9a136e` — feat(62B-08): pg_cron review_tick dispatcher module + migration (LOOP-03 D-05 pivot)
- `a4d0268` — chore: merge 62B-08 Task 1 (pg_cron migration + dispatcher + tests)
- (pending) — feat(62B-08): fold review_dispatcher into run_post_processing (D-05 Option A)

## Self-Check: PASSED

- [x] pg_cron migration enumerates agent_registry rows and inserts review_tick events
- [x] Modal function dispatches reviews every minute (LOOP-03 SC1 bar)
- [x] D-05 pivot documented in code comment + SUMMARY
- [x] Existing post-processing pipeline preserved at 06:00 UTC
- [x] All 6 tests in test_review_dispatcher.py present (2 pure-Python + 4 DB-gated)
- [x] No silent scope changes to ingest_data (Option B rejected) or Modal tier (Option C rejected)
