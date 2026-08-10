"""State supervisor — one stateful agent per state.

Owns its work-list, dispatches jobs to the (stateless) capability workers, and
accumulates per-state knowledge. This is where the intelligence lives; the
workers are dumb muscle.

Cycle (plan §6.2):
    read hints -> select_work -> enqueue -> (workers drain) -> learn -> notes

`select_work` uses hints to route: a target with a known fee URL goes straight
to `fetch`; one without goes to `resolve` first. Failing targets over the cap
are skipped this cycle. The whole cycle runs inside a engine_runs scope so it
always closes terminal (completed/failed), never silently stuck.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import asyncpg

from . import knowledge as kn
from . import queue as q
from .runs import run_scope

FAIL_CAP = 5  # skip targets that have failed this many cycles in a row


@dataclass
class WorkItem:
    target_id: int
    queue: str          # "fetch" (have URL) | "resolve" (need discovery)
    url: Optional[str]
    priority: int


async def select_work(pool: asyncpg.Pool, state_code: str) -> list[WorkItem]:
    """Decide what to enqueue this cycle for a state.

    Every active target under the failure cap is fetched (the change-gate makes
    re-fetching unchanged docs cheap). Targets with no known URL are resolved
    first. Never-crawled and recently-failing targets are prioritized.
    """
    hints = await kn.load_hints(pool, state_code)
    async with pool.acquire() as conn:
        targets = await conn.fetch(
            """
            SELECT id, fee_schedule_url, last_crawl_at, consecutive_failures
              FROM crawl_targets
             WHERE state_code=$1 AND status='active'
            """,
            state_code,
        )
    work: list[WorkItem] = []
    for t in targets:
        tid = t["id"]
        h = hints.get(tid)
        if t["consecutive_failures"] >= FAIL_CAP:
            continue  # give it a rest; triage handles chronic failures
        url = (h.known_fee_url if h else None) or t["fee_schedule_url"]
        queue = "fetch" if url else "resolve"
        # never crawled -> highest; failing -> high; steady-state -> normal
        if t["last_crawl_at"] is None:
            priority = 10
        elif t["consecutive_failures"] > 0:
            priority = 5
        else:
            priority = 0
        work.append(WorkItem(tid, queue, url, priority))
    return work


async def dispatch(pool: asyncpg.Pool, state_code: str, work: list[WorkItem], run_id: int) -> int:
    """Enqueue the selected work under this cycle's run_id. Returns count."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            for item in work:
                payload = {"url": item.url} if item.url else {}
                await q.enqueue(
                    conn,
                    item.queue,
                    f"target:{item.target_id}",
                    payload=payload,
                    state_code=state_code,
                    run_id=run_id,
                    priority=item.priority,
                )
    return len(work)


async def learn(pool: asyncpg.Pool, state_code: str, run_id: int) -> dict[str, int]:
    """Write back what this cycle learned into institution_hints, and record a
    state_run_note. Reads the documents/fees produced under this run_id.

    - render_mode/doc_type of each fetched document -> hint (skip escalation next)
    - reset fail_streak for targets that produced a document this cycle
    """
    async with pool.acquire() as conn:
        # Per-target learned shape from documents captured this cycle.
        docs = await conn.fetch(
            """
            SELECT DISTINCT ON (crawl_target_id)
                   crawl_target_id, render_mode, doc_type, source_url
              FROM documents WHERE run_id=$1 AND state_code=$2
             ORDER BY crawl_target_id, fetched_at DESC
            """,
            run_id, state_code,
        )
        extracted = await conn.fetchval(
            """
            SELECT count(*) FROM fees_raw fr
              JOIN documents d ON d.id = fr.document_id
             WHERE d.run_id=$1 AND d.state_code=$2
            """,
            run_id, state_code,
        )
        failed = await conn.fetchval(
            "SELECT count(*) FROM jobs WHERE run_id=$1 AND state_code=$2 AND status='dead'",
            run_id, state_code,
        )

    for d in docs:
        await kn.upsert_hint(
            pool, d["crawl_target_id"], state_code,
            known_fee_url=d["source_url"],
            render_mode=d["render_mode"],
            doc_type=d["doc_type"],
            last_good_run_id=run_id,
            fail_streak=0,
        )

    stats = {"discovered": len(docs), "extracted": int(extracted or 0), "failed": int(failed or 0)}
    await kn.write_run_note(
        pool, state_code, run_id,
        discovered=stats["discovered"], extracted=stats["extracted"], failed=stats["failed"],
    )
    return stats


async def run_cycle(pool: asyncpg.Pool, state_code: str, *, cycle: Optional[int] = None) -> dict:
    """Plan + dispatch one cycle for a state inside a run scope. Returns a summary.

    The actual draining is done by the worker fleet asynchronously; this returns
    once work is enqueued. `learn` is called by finalize_cycle after the fleet
    drains (or on the next supervisor pass), keyed by run_id.
    """
    async with run_scope(pool, "state", state_code=state_code, cycle=cycle) as run:
        work = await select_work(pool, state_code)
        count = await dispatch(pool, state_code, work, run.run_id)
        run.add_stats(dispatched=count)
        return {"run_id": run.run_id, "dispatched": count}


async def finalize_cycle(pool: asyncpg.Pool, state_code: str, run_id: int) -> dict:
    """After the fleet drains a cycle's jobs, write learnings + the run note."""
    return await learn(pool, state_code, run_id)
