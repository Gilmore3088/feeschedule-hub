---
created: 2026-04-19T17:52:00.000Z
title: Modal scrape crons leak status=running crawl_runs rows on crash
area: infrastructure
files:
  - fee_crawler/modal_app.py
  - src/lib/admin-queries.ts
---

## Problem

When cleaning up after today's failed daily_pipeline, `crawl_runs` had 18
rows sitting in `status='running'` going back to **2026-03-17** — over a
month of leaked rows. Pattern is consistent: rows started at 03:00 / 04:00
UTC (the `run_discovery` / `run_pdf_extraction` / `run_browser_extraction`
crons), never reached `completed_at`, and never flipped to `status='error'`.

Root cause: the Modal scrape entry points create a `crawl_runs` row with
`status='running'` at the top, but only write `completed_at` + flip status
on the success path. There is no `try/finally` around the pipeline body,
so any exception (OOM, network error, target-loop hang, Playwright crash)
leaves the row orphaned forever.

Operational impact:
1. `/admin/pipeline` JOB_INVENTORY trusts the `crawl_runs` source for
   freshness of `run_discovery`, `run_pdf_extraction`,
   `run_browser_extraction`. A stuck `running` row presents as fresh
   activity and suppresses the stale-job banner, so silent failures stay
   silent for weeks.
2. Any dashboard that counts in-flight runs shows inflated numbers.
3. Restart/retry logic that gates on "no run currently in progress"
   refuses to fire.

Today's batch was closed manually:
```sql
UPDATE crawl_runs
   SET status='error', completed_at=NOW()
 WHERE status='running'
   AND started_at < NOW() - interval '6 hours';
-- 18 rows
```
That's a band-aid; the leak keeps happening.

## Solution

1. Wrap each Modal scrape entry point in `fee_crawler/modal_app.py`
   (`run_discovery`, `run_pdf_extraction`, `run_browser_extraction`) with
   a `try/finally` that always writes a terminal status. Shape:
   ```python
   run_id = _start_crawl_run(trigger_type='cron')
   try:
       _do_work()
       _finish_crawl_run(run_id, status='ok', fees_extracted=n)
   except Exception as exc:
       _finish_crawl_run(run_id, status='error', error_msg=str(exc)[:500])
       raise
   ```
   A helper `_finish_crawl_run` that stamps `status` + `completed_at`
   atomically is the right shape — both branches call it.

2. Add a **reaper** to the every-minute dispatcher: any row with
   `status='running' AND started_at < NOW() - interval '2 hours'` flips to
   `status='timeout'`. That bounds the blast radius if a worker is killed
   by Modal before the except branch runs.

3. Add an `error_message` column to `crawl_runs` so we keep forensic
   trail next time this happens. Migration + model update.

4. Update `src/lib/admin-queries.ts` freshness check to treat a stale
   `running` row (started_at > expected_within_hours ago) as a **red**
   indicator, not a green one. Current logic just looks at `started_at`
   and assumes running=healthy.

5. Audit the other three marker-writers (`magellan_rescue`, `knox_review`,
   `darwin_drain`) for the same shape — likely fine since they use
   `workers_last_run` upsert at the end, but worth confirming they don't
   have a silent skip-on-exception path.

### Context

- Today's stuck rows covered IDs 36, 44, 58, 60, 61, 63, 65, 67, 69, 71,
  72, 74, 75, 76, 77, 79, 80, 81 — dates 2026-03-17 through 2026-04-19.
- The Reliability Wave commit `66e7f94` added `workers_last_run` markers
  for 4 previously-silent crons but did not touch the `crawl_runs`
  producers, so the leak continued for those three.
- Today's separate issue — `daily_pipeline` with no marker for 2026-04-19
  — is a different bug (the 06:00-06:09 UTC trigger window has no
  catch-up path). Track separately.
