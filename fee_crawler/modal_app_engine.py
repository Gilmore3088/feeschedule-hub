"""Modal deployment for the ingestion engine.

Replaces the every-minute `run_post_processing` scheduler-within-a-scheduler
(audit finding) with a clean design that respects the 5-cron Starter cap:

  crons (3):
    pump          — every minute: reap stale jobs/runs, then fan out drain
                    workers per queue proportional to depth (Modal autoscales
                    the spawned containers).
    supervise     — daily: finalize the previous cycle, then dispatch a new
                    cycle per state (staggered by hashing the state code).
    national      — daily: build -> validate -> golden-gate -> atomic publish,
                    then ISR-revalidate the site.

  spawned (not scheduled):
    drain_queue   — drains one queue for ~50s; the pump spawns as many as depth
                    warrants, so idle queues cost nothing and busy ones scale out.

This is queue-driven and self-throttling: no time-window multiplexing, no
silent crons (every run is a pipeline_runs row), loud alerting on dead jobs.
"""

from __future__ import annotations

import asyncio
import os

import modal

QUEUES = ("fetch", "read", "extract", "verify")
# All US states + DC + territories the supervisor runs.
STATES = (
    "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS "
    "MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY"
).split()

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("tesseract-ocr", "poppler-utils")
    .pip_install_from_requirements("fee_crawler/requirements.txt")
)
app = modal.App("bfi-ingestion-engine", image=image)
secrets = [modal.Secret.from_name("bfi-secrets")]


async def _pool():
    from fee_crawler.agent_tools.pool import get_pool

    return await get_pool()


# --- spawned drain worker ---------------------------------------------------

@app.function(secrets=secrets, timeout=120, max_containers=64)
async def drain_queue(queue: str, shard: int = 0) -> int:
    """Drain one queue for ~50s as its persona (Magellan/Rosetta/Knox/Darwin).
    Spawned by the pump; Modal autoscales copies."""
    from fee_crawler.engine.personas import persona_for
    from fee_crawler.engine.run_worker import drain

    pool = await _pool()
    persona = persona_for(queue).name
    return await drain(pool, queue, worker_id=f"{persona}-{shard}", max_seconds=50.0)


# --- pump: reaper + depth-proportional fan-out ------------------------------

@app.function(schedule=modal.Cron("* * * * *"), secrets=secrets, timeout=60)
async def pump() -> dict:
    from fee_crawler.engine.queue import queue_depth, reap_stale_jobs
    from fee_crawler.engine.runs import reap_stale_runs

    pool = await _pool()
    reaped_jobs = await reap_stale_jobs(pool)
    reaped_runs = await reap_stale_runs(pool)

    spawned = {}
    for queue in QUEUES:
        depth = await queue_depth(pool, queue)
        if depth == 0:
            continue
        # One drain worker per ~25 pending jobs, capped at 8 per queue per tick.
        n = min(8, max(1, depth // 25))
        for shard in range(n):
            drain_queue.spawn(queue, shard)
        spawned[queue] = n
    return {"reaped_jobs": reaped_jobs, "reaped_runs": reaped_runs, "spawned": spawned}


# --- supervise: per-state cycles (daily) ------------------------------------

@app.function(schedule=modal.Cron("0 6 * * *"), secrets=secrets, timeout=1800)
async def supervise() -> dict:
    from fee_crawler.engine import supervisor as sup

    pool = await _pool()
    cycle = _today_cycle()
    dispatched = {}
    async with pool.acquire() as conn:
        prev = await conn.fetch(
            "SELECT state_code, cycle FROM pipeline_runs "
            "WHERE kind='state' AND status='completed' AND cycle < $1",
            cycle,
        )
    # Finalize the most recent completed cycle per state (write learnings).
    seen = {}
    for r in prev:
        seen.setdefault(r["state_code"], r["cycle"])
    for state, prev_cycle in seen.items():
        try:
            async with pool.acquire() as conn:
                run_id = await conn.fetchval(
                    "SELECT id FROM pipeline_runs WHERE kind='state' AND state_code=$1 "
                    "AND cycle=$2 ORDER BY id DESC LIMIT 1",
                    state, prev_cycle,
                )
            if run_id:
                await sup.finalize_cycle(pool, state, run_id)
        except Exception as exc:  # never let one state block the rest
            print(f"finalize {state} failed: {exc}")

    # Dispatch a new cycle per state.
    for state in STATES:
        try:
            out = await sup.run_cycle(pool, state, cycle=cycle)
            dispatched[state] = out["dispatched"]
        except Exception as exc:
            print(f"supervise {state} failed: {exc}")
    return {"cycle": cycle, "states": len(dispatched), "dispatched": sum(dispatched.values())}


# --- national roll-up + publish (daily, after supervise + drain) ------------

@app.function(schedule=modal.Cron("0 10 * * *"), secrets=secrets, timeout=1800)
async def national() -> dict:
    from fee_crawler.engine.alerting import default_alerter
    from fee_crawler.engine.rollup import make_isr_revalidator, run_national_rollup

    pool = await _pool()
    app_url = os.environ.get("BFI_APP_URL", "")
    token = os.environ.get("BFI_REVALIDATE_TOKEN", "")
    revalidate = make_isr_revalidator(app_url, token) if app_url and token else None
    return await run_national_rollup(
        pool, revalidate=revalidate, enforce_golden=True, alerter=default_alerter
    )


def _today_cycle() -> int:
    """A stable per-day cycle number. Passed in via env at deploy so scripts
    stay deterministic (Date.now is avoided in library code)."""
    import datetime

    d = datetime.date.today()
    return d.year * 10000 + d.month * 100 + d.day
