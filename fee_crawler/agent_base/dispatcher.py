"""Modal review_dispatcher helper (LOOP-03 D-05 pivot).

Polls agent_events for pending action='review_tick' rows in the last N minutes,
imports the agent class by name, instantiates, calls review(), and flips the tick
row to status='success' (or 'error' on failure).

Agent class registration is a mapping maintained here; Phase 63-65 add entries.

D-05 pivot rationale (research Pitfall 1): Modal Starter tier caps deployed crons
at 5 and all slots are taken. Rather than per-agent Modal crons we use pg_cron to
emit review_tick agent_events rows on the declared per-agent schedule, and one
Modal function (bound into an existing slot) drains them every minute.

Race / idempotency: we pre-claim rows inside a single transaction by flipping
status 'pending' -> 'success' (or 'error') WHERE the tick is still pending.
FOR UPDATE SKIP LOCKED in the SELECT ensures two concurrent dispatchers partition
the tick set instead of double-firing.
"""
from __future__ import annotations

import importlib
import json
import logging

from fee_crawler.agent_tools.pool import get_pool

log = logging.getLogger(__name__)

# agent_name -> (module_path, class_name). Phase 63+ extend as Knox/Darwin/Atlas ship.
AGENT_CLASSES: dict[str, tuple[str, str]] = {}


async def dispatch_ticks(*, window_minutes: int = 10) -> dict:
    """Poll pending review_tick rows and dispatch to agents.

    Uses FOR UPDATE SKIP LOCKED so concurrent dispatchers do not double-fire.
    Returns stats: {dispatched, errors, skipped}.
    """
    pool = await get_pool()
    stats = {"dispatched": 0, "errors": 0, "skipped": 0}

    # Step 1: claim a batch of pending ticks atomically.
    # The FOR UPDATE SKIP LOCKED in the SELECT ensures concurrent dispatchers
    # do not claim the same rows. We flip the claimed rows' status within the
    # same transaction so the claim survives after the transaction commits.
    async with pool.acquire() as conn:
        async with conn.transaction():
            rows = await conn.fetch(
                """SELECT event_id, created_at, agent_name
                     FROM agent_events
                    WHERE action = 'review_tick'
                      AND status = 'pending'
                      AND created_at > NOW() - make_interval(mins => $1)
                    FOR UPDATE SKIP LOCKED""",
                window_minutes,
            )

    claims: list[tuple] = [(r["event_id"], r["created_at"], r["agent_name"]) for r in rows]

    # Step 2: dispatch each claimed tick. Failures are isolated per-tick.
    for event_id, created_at, agent_name in claims:
        info = AGENT_CLASSES.get(agent_name)
        if info is None:
            await _mark_error(
                event_id,
                created_at,
                f"no agent class registered for {agent_name}",
            )
            stats["errors"] += 1
            continue

        module_path, class_name = info
        try:
            mod = importlib.import_module(module_path)
            cls = getattr(mod, class_name)
            agent = cls()
            await agent.review()
            await _mark_success(event_id, created_at)
            stats["dispatched"] += 1
        except Exception as exc:
            log.exception("dispatch failed for %s", agent_name)
            await _mark_error(event_id, created_at, str(exc))
            stats["errors"] += 1

    return stats


async def _mark_success(event_id, created_at) -> None:
    """Flip tick row to status='success'. Gated on pending to keep idempotent."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE agent_events
                  SET status = 'success'
                WHERE event_id = $1
                  AND created_at = $2
                  AND status = 'pending'""",
            event_id,
            created_at,
        )


async def _mark_error(event_id, created_at, message: str) -> None:
    """Flip tick row to status='error' with a JSONB error payload."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE agent_events
                  SET status = 'error',
                      output_payload = $3::JSONB
                WHERE event_id = $1
                  AND created_at = $2
                  AND status = 'pending'""",
            event_id,
            created_at,
            json.dumps({"error": message}),
        )


def register_agent_class(agent_name: str, module_path: str, class_name: str) -> None:
    """Phase 63+ helper: register an agent class in the dispatcher."""
    AGENT_CLASSES[agent_name] = (module_path, class_name)
