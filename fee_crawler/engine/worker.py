"""Worker runtime — the loop every capability worker shares.

A worker claims one job of its queue, runs a heartbeat in the background,
invokes a stateless handler, and on success commits the handler's completion +
follow-up jobs in a single transaction. On failure it classifies the error
(retryable vs permanent) and lets the queue reschedule or kill the job.

Handlers own their own external IO (HTTP, LLM, R2) and their own output writes
(documents, fees_raw); the runtime owns only claim/heartbeat/complete/chain/fail.
This keeps handlers pure-ish and unit-testable with fake adapters, while the
runtime guarantees the queue invariants.
"""

from __future__ import annotations

import asyncio
import contextlib
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional, Protocol

import asyncpg

from . import queue as q


class RetryableError(Exception):
    """Transient failure — the queue should retry with backoff."""


class PermanentError(Exception):
    """Non-recoverable failure — the queue should mark the job dead."""


@dataclass
class EnqueueSpec:
    """A follow-up job to enqueue atomically with the current job's completion."""

    queue: str
    entity_id: str
    payload: dict[str, Any] = field(default_factory=dict)
    state_code: Optional[str] = None
    run_id: Optional[int] = None
    priority: int = 0


@dataclass
class HandlerResult:
    next_jobs: list[EnqueueSpec] = field(default_factory=list)
    result: dict[str, Any] = field(default_factory=dict)


class Handler(Protocol):
    queue: str

    async def handle(self, pool: asyncpg.Pool, job: asyncpg.Record) -> HandlerResult:
        ...


async def _heartbeat_loop(pool: asyncpg.Pool, job_id: int, interval: float = 30.0) -> None:
    try:
        while True:
            await asyncio.sleep(interval)
            await q.heartbeat(pool, job_id)
    except asyncio.CancelledError:  # normal shutdown
        pass


async def run_once(pool: asyncpg.Pool, handler: Handler, worker_id: str) -> bool:
    """Claim and process one job. Returns True if a job was processed, False if
    the queue was empty."""
    job = await q.claim_job(pool, handler.queue, worker_id)
    if job is None:
        return False

    hb = asyncio.create_task(_heartbeat_loop(pool, job["id"]))
    try:
        res = await handler.handle(pool, job)
        # Completion + follow-up enqueues commit together.
        async with pool.acquire() as conn:
            async with conn.transaction():
                await q.complete_job(conn, job["id"], result=res.result)
                for spec in res.next_jobs:
                    await q.enqueue(
                        conn,
                        spec.queue,
                        spec.entity_id,
                        payload=spec.payload,
                        state_code=spec.state_code,
                        run_id=spec.run_id,
                        parent_job_id=job["id"],
                        priority=spec.priority,
                    )
        return True
    except PermanentError as exc:
        await q.fail_job(pool, job["id"], str(exc), retryable=False)
        return True
    except Exception as exc:  # RetryableError and anything unexpected
        await q.fail_job(pool, job["id"], str(exc), retryable=True)
        return True
    finally:
        hb.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await hb


async def run_forever(
    pool: asyncpg.Pool,
    handler: Handler,
    worker_id: str,
    *,
    should_stop: Optional[Callable[[], bool]] = None,
    idle_sleep: float = 2.0,
    wake: Optional[Callable[[], Awaitable[None]]] = None,
) -> None:
    """Drain the queue continuously.

    Between empty polls, sleep `idle_sleep` (or await `wake`, which a LISTEN
    subscriber can trigger on NOTIFY). `should_stop` lets tests/hosts break out.
    Autoscalers run many of these against one queue; SKIP LOCKED keeps them from
    colliding.
    """
    while should_stop is None or not should_stop():
        processed = await run_once(pool, handler, worker_id)
        if not processed:
            if wake is not None:
                try:
                    await asyncio.wait_for(wake(), timeout=idle_sleep)
                except asyncio.TimeoutError:
                    pass
            else:
                await asyncio.sleep(idle_sleep)
