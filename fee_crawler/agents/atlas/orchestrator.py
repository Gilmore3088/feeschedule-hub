"""Atlas orchestrator: dispatch state agents based on pending work.

Selection policy (oldest-first with starvation guard):
  For each state, compute "staleness" = MAX(time since the newest fees_raw
  row for that state's institutions). States with no fees_raw rows are
  treated as infinitely stale and float to the top.

Atlas picks the top-K stalest states each invocation and runs each via
run_state_agent. Each state's run gets its own gateway-audited session
under that state's agent identity.

Designed to be called from the per-minute Modal dispatcher so progress
is incremental — one or two states per minute — without burning a cron
slot. Idempotent via `workers_last_run('atlas_dispatch_<state>')` markers
that gate same-day re-runs.
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

import asyncpg

from fee_crawler.agents.state import (
    StateAgentResult,
    list_state_codes,
    run_state_agent,
    state_agent_name,
)

log = logging.getLogger(__name__)

AGENT_NAME = "atlas"


@dataclass
class DispatchPlan:
    """One element of the dispatch decision: which state, why."""
    state_code: str
    reason: str           # 'never_run' | 'stale' | 'forced'
    last_extracted_at: Optional[datetime] = None
    pending_institution_count: int = 0


@dataclass
class DispatchResult:
    """Per-Atlas-tick result."""
    plans: list[DispatchPlan] = field(default_factory=list)
    runs: list[StateAgentResult] = field(default_factory=list)
    skipped_recent: list[str] = field(default_factory=list)
    duration_s: float = 0.0

    def to_dict(self) -> dict:
        return {
            "plans": [asdict(p) for p in self.plans],
            "runs": [r.to_dict() for r in self.runs],
            "skipped_recent": self.skipped_recent,
            "duration_s": round(self.duration_s, 2),
        }


async def select_next_states(
    conn: asyncpg.Connection,
    limit: int = 2,
    *,
    only_states: Optional[Iterable[str]] = None,
) -> list[DispatchPlan]:
    """Pick the K stalest states with pending work.

    Staleness ranking (most stale → least stale):
      1. States with crawl_targets but no fees_raw yet (never_run)
      2. States whose newest fees_raw is oldest (stale)
      3. States with no pending institutions are skipped entirely.

    Args:
        conn: asyncpg connection.
        limit: number of states to return.
        only_states: restrict candidate pool (for tests / focused runs).

    Returns:
        List of DispatchPlan, most-stale first.
    """
    all_states = list(list_state_codes())
    candidates = [s for s in all_states if (not only_states or s in only_states)]

    rows = await conn.fetch(
        """
        SELECT ct.state_code,
               COUNT(*) FILTER (WHERE ct.fee_schedule_url IS NOT NULL
                                 AND ct.fee_schedule_url <> '')             AS pending_count,
               MAX(fr.created_at)                                            AS last_extracted_at
          FROM crawl_targets ct
          LEFT JOIN fees_raw fr ON fr.institution_id = ct.id
         WHERE ct.state_code = ANY($1::TEXT[])
         GROUP BY ct.state_code
        """,
        candidates,
    )

    plans: list[DispatchPlan] = []
    for r in rows:
        pending = int(r["pending_count"] or 0)
        if pending == 0:
            continue
        plans.append(DispatchPlan(
            state_code=r["state_code"],
            reason="never_run" if r["last_extracted_at"] is None else "stale",
            last_extracted_at=r["last_extracted_at"],
            pending_institution_count=pending,
        ))

    # Sort: never_run before stale; within each, oldest first.
    def _rank(p: DispatchPlan) -> tuple[int, datetime]:
        bucket = 0 if p.reason == "never_run" else 1
        ts = p.last_extracted_at or datetime.min.replace(tzinfo=timezone.utc)
        return (bucket, ts)

    plans.sort(key=_rank)
    return plans[:limit]


async def _was_run_today(conn: asyncpg.Connection, marker: str) -> bool:
    """workers_last_run-style guard: state was dispatched today already."""
    row = await conn.fetchrow(
        "SELECT completed_at FROM workers_last_run WHERE job_name = $1",
        marker,
    )
    if not row or not row["completed_at"]:
        return False
    cutoff = datetime.now(timezone.utc) - timedelta(hours=23)
    return row["completed_at"] >= cutoff


async def _mark_run(conn: asyncpg.Connection, marker: str, status: str) -> None:
    """Idempotent marker write so subsequent Atlas ticks skip same-day."""
    await conn.execute(
        """INSERT INTO workers_last_run (job_name, completed_at, status)
           VALUES ($1, NOW(), $2)
           ON CONFLICT (job_name) DO UPDATE
             SET completed_at = EXCLUDED.completed_at,
                 status       = EXCLUDED.status""",
        marker, status,
    )


async def dispatch_state_fleet(
    conn: asyncpg.Connection,
    *,
    states_per_tick: int = 2,
    size_per_state: int = 100,
    only_states: Optional[Iterable[str]] = None,
    force: bool = False,
) -> DispatchResult:
    """One Atlas tick: pick K states, run each through its state agent.

    Args:
        conn: asyncpg connection.
        states_per_tick: how many states to dispatch this invocation.
        size_per_state: extraction batch size per state.
        only_states: restrict to a subset (for tests / surgical runs).
        force: bypass the once-per-day marker (for manual reruns).

    Returns:
        DispatchResult describing the plan, the runs, and any skips.
    """
    import time
    t0 = time.time()

    plans = await select_next_states(conn, states_per_tick, only_states=only_states)
    result = DispatchResult(plans=plans)

    for plan in plans:
        marker = f"atlas_dispatch_{plan.state_code.lower()}"
        if not force and await _was_run_today(conn, marker):
            result.skipped_recent.append(plan.state_code)
            continue

        try:
            run = await run_state_agent(
                conn, plan.state_code, size=size_per_state,
            )
            result.runs.append(run)
            await _mark_run(conn, marker, "ok")
            log.info(
                "atlas dispatched %s (extracted=%d, fees=%d, cost=$%.4f)",
                run.agent_name, run.extracted, run.fees_written, run.cost_usd,
            )
        except Exception as exc:
            log.error("atlas dispatch failed for %s: %r", plan.state_code, exc)
            await _mark_run(conn, marker, "failed")
            # Don't re-raise — one bad state shouldn't kill the dispatcher.

    result.duration_s = time.time() - t0
    return result
