---
created: 2026-04-19T18:00:00.000Z
title: daily_pipeline cron has no catch-up path when 06:00 UTC window is missed
area: infrastructure
files:
  - fee_crawler/modal_app.py
---

## Problem

`daily_pipeline` (the 06:00 UTC post-processing job that runs
integrity checks, re-computes the fee index, and gates revalidation)
silently did not run on 2026-04-19. No `workers_last_run` row exists
for today — the job was entirely skipped. The other 4 markers that
piggyback on the same every-minute dispatcher (magellan_rescue,
darwin_drain, knox_review, ingest_data) all ran normally, which
rules out a dispatcher outage.

Root cause in `fee_crawler/modal_app.py` around lines 222–249:

```python
today_0600 = now.replace(hour=6, minute=0, second=0, microsecond=0)
if now < today_0600 or now >= today_0600 + timedelta(minutes=10):
    return  # window closed — DO NOT run, DO NOT catch up
```

The 10-minute window (06:00–06:09 UTC) is the only opportunity for
the pipeline to fire. If Modal's every-minute dispatcher has even a
brief outage during those nine minutes — a cold start, a deploy, a
transient error — the job is silently skipped for the entire day,
with no retry path and no alert. We only notice when someone checks
the freshness dashboard.

The gate was added to prevent double-runs (the marker read below it
checks "did we already run today?"), but the gate is too strict. The
catch-up version of the same logic would be:

```python
# Allow the window 06:00 → end-of-day, rely solely on the
# workers_last_run marker to enforce once-per-day semantics.
if now < today_0600:
    return
```

That way: missed the 06:00 slot? The 06:01, 06:02, … 23:59 ticks
pick it up as long as the marker hasn't been written yet. Marker
writes are idempotent (ON CONFLICT DO UPDATE), so concurrent
catch-up attempts converge on one row.

## Solution

1. Widen the gate in `run_post_processing` — replace the
   `now >= today_0600 + timedelta(minutes=10)` abort with a pass
   through to the marker check. Let the existing
   `last_completed >= today_0600: return` line handle dedup.
2. Apply the same widening to the 05:00 block (`_run_0500_jobs`)
   for magellan_rescue / darwin_drain / knox_review and the 10:00
   block (ingest_data) — all have the same 10-minute window shape
   and the same silent-miss bug, even though they happened to run
   today.
3. Add a `catch_up_executions_total` metric: bump when the job
   runs outside its primary window. This tells us how often the
   primary slot actually misses without us hand-auditing markers.
4. As a secondary safety net, consider a second cron entry at
   say 12:00 UTC that runs *only* if the 06:00 marker is absent.
   Belt-and-suspenders; doesn't replace the widened gate.
5. Backfill today: manually trigger the missed 2026-04-19
   daily_pipeline via `modal run fee_crawler.modal_app::post_processing`
   once the fix is deployed so today's index + integrity run isn't
   lost.

## Context

- 2026-04-19 session uncovered this along with 18 stuck `crawl_runs`
  rows going back to 2026-03-17 (see sibling todo
  `2026-04-19-modal-scrape-crons-leak-running-rows-on-crash.md`).
  The two issues are separate — marker logic here, exception
  handling there — but both trace to the same reliability push
  that landed in commit `66e7f94`.
- Markers that did land today confirm the dispatcher itself ran
  normally; this is specifically a narrow-window issue in
  `run_post_processing`.
