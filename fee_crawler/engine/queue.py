"""Job queue — the spine of the ingestion engine.

Every unit of work is a row in the existing `jobs` table; the `queue` column
names the capability (`resolve | fetch | read | extract | verify | rollup |
report`). Workers claim jobs of one type with `FOR UPDATE SKIP LOCKED`, so
many workers can drain a queue concurrently without ever double-processing.

Guarantees (plan §3, §6.1):
  - claim_job is safe under concurrency (SKIP LOCKED).
  - Workers heartbeat while processing; a reaper resets jobs whose worker died.
  - A failed job with attempts left is retried with exponential backoff; once
    attempts are exhausted it becomes `dead` and is never silently dropped.

All functions take an asyncpg connection or pool so the caller controls
transaction scope. Pass a pool for autonomous ops (claim/heartbeat/reap); pass
a connection when the work must share the caller's transaction.
"""

from __future__ import annotations

import json
from typing import Any, Optional

import asyncpg

# Terminal + non-terminal job states.
PENDING = "pending"
RUNNING = "running"
SUCCEEDED = "succeeded"
FAILED = "failed"
DEAD = "dead"

VALID_QUEUES = frozenset(
    {"resolve", "fetch", "read", "extract", "verify", "rollup", "report"}
)


async def enqueue(
    conn: asyncpg.Connection,
    queue: str,
    entity_id: str,
    *,
    payload: Optional[dict[str, Any]] = None,
    state_code: Optional[str] = None,
    run_id: Optional[int] = None,
    parent_job_id: Optional[int] = None,
    priority: int = 0,
    max_attempts: int = 3,
    run_at_sql: str = "NOW()",
) -> int:
    """Insert one job and NOTIFY the queue's channel. Returns the job id.

    `run_at_sql` is a raw SQL expression (default NOW()) so callers can schedule
    a delayed job without importing datetime. Only ever pass trusted constants.
    """
    if queue not in VALID_QUEUES:
        raise ValueError(f"unknown queue {queue!r}; valid: {sorted(VALID_QUEUES)}")

    job_id = await conn.fetchval(
        f"""
        INSERT INTO jobs (
            queue, entity_id, payload, status, priority, attempts, max_attempts,
            run_at, state_code, run_id, parent_job_id
        )
        VALUES ($1, $2, $3::jsonb, 'pending', $4, 0, $5, {run_at_sql}, $6, $7, $8)
        RETURNING id
        """,
        queue,
        entity_id,
        json.dumps(payload or {}),
        priority,
        max_attempts,
        state_code,
        run_id,
        parent_job_id,
    )
    # Wake any listener on this queue. Channel names must be valid identifiers;
    # queue values are validated against VALID_QUEUES above.
    await conn.execute(f"NOTIFY jobs_{queue}")
    return int(job_id)


async def claim_job(
    pool: asyncpg.Pool, queue: str, worker_id: str
) -> Optional[asyncpg.Record]:
    """Atomically claim the next runnable job for `queue`.

    Uses FOR UPDATE SKIP LOCKED so concurrent workers never claim the same row.
    Sets status=running, locked_by, locked_at, heartbeat_at. Returns the claimed
    job record, or None if the queue is empty.
    """
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            """
            UPDATE jobs
               SET status='running',
                   locked_by=$2,
                   locked_at=NOW(),
                   heartbeat_at=NOW(),
                   attempts=attempts + 1
             WHERE id = (
                 SELECT id FROM jobs
                  WHERE queue=$1 AND status='pending' AND run_at <= NOW()
                  ORDER BY priority DESC, run_at ASC
                  FOR UPDATE SKIP LOCKED
                  LIMIT 1
             )
            RETURNING *
            """,
            queue,
            worker_id,
        )


async def heartbeat(pool: asyncpg.Pool, job_id: int) -> None:
    """Mark a running job alive. Call every ~30s while processing."""
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE jobs SET heartbeat_at=NOW() WHERE id=$1 AND status='running'",
            job_id,
        )


async def complete_job(
    conn: asyncpg.Connection, job_id: int, *, result: Optional[dict[str, Any]] = None
) -> None:
    """Mark a job succeeded. Pass the same connection used to write the job's
    output so success and output commit atomically."""
    await conn.execute(
        """
        UPDATE jobs
           SET status='succeeded', completed_at=NOW(),
               error=NULL,
               payload = payload || $2::jsonb
         WHERE id=$1
        """,
        job_id,
        json.dumps({"result": result} if result is not None else {}),
    )


async def fail_job(
    pool: asyncpg.Pool,
    job_id: int,
    error: str,
    *,
    retryable: bool = True,
) -> str:
    """Fail a job. If retryable and attempts remain, reschedule with backoff
    (2^attempts minutes); otherwise mark it `dead`. Returns the resulting status.

    `attempts` was already incremented at claim time, so remaining = max_attempts
    - attempts.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT attempts, max_attempts FROM jobs WHERE id=$1", job_id
        )
        if row is None:
            return DEAD
        exhausted = (not retryable) or row["attempts"] >= row["max_attempts"]
        if exhausted:
            await conn.execute(
                "UPDATE jobs SET status='dead', error=$2, completed_at=NOW() WHERE id=$1",
                job_id,
                error[:2000],
            )
            return DEAD
        # Exponential backoff: 2^attempts minutes.
        await conn.execute(
            """
            UPDATE jobs
               SET status='pending',
                   locked_by=NULL, locked_at=NULL, heartbeat_at=NULL,
                   error=$2,
                   run_at = NOW() + (POWER(2, attempts) * INTERVAL '1 minute')
             WHERE id=$1
            """,
            job_id,
            error[:2000],
        )
        return PENDING


async def reap_stale_jobs(pool: asyncpg.Pool, timeout_seconds: int = 300) -> int:
    """Reset jobs whose worker died mid-flight (no heartbeat past timeout).

    Retryable ones go back to `pending`; those already at max_attempts go `dead`.
    This is the structural fix for orphaned `running` rows (audit finding).
    Returns the number of rows reaped. Run on a cheap cron.
    """
    async with pool.acquire() as conn:
        # Dead: exhausted attempts, stale heartbeat.
        dead = await conn.fetchval(
            """
            WITH stale AS (
                UPDATE jobs
                   SET status='dead',
                       error=COALESCE(error,'') || ' [reaped: worker died, attempts exhausted]',
                       completed_at=NOW()
                 WHERE status='running'
                   AND heartbeat_at < NOW() - ($1 * INTERVAL '1 second')
                   AND attempts >= max_attempts
                RETURNING 1
            )
            SELECT count(*) FROM stale
            """,
            timeout_seconds,
        )
        # Retry: attempts remain, stale heartbeat -> back to pending immediately.
        requeued = await conn.fetchval(
            """
            WITH stale AS (
                UPDATE jobs
                   SET status='pending',
                       locked_by=NULL, locked_at=NULL, heartbeat_at=NULL,
                       error=COALESCE(error,'') || ' [reaped: worker died, retrying]'
                 WHERE status='running'
                   AND heartbeat_at < NOW() - ($1 * INTERVAL '1 second')
                   AND attempts < max_attempts
                RETURNING 1
            )
            SELECT count(*) FROM stale
            """,
            timeout_seconds,
        )
        return int(dead) + int(requeued)


async def queue_depth(pool: asyncpg.Pool, queue: str) -> int:
    """Pending, runnable job count for a queue — the autoscaling signal."""
    async with pool.acquire() as conn:
        return int(
            await conn.fetchval(
                "SELECT count(*) FROM jobs "
                "WHERE queue=$1 AND status='pending' AND run_at <= NOW()",
                queue,
            )
        )
