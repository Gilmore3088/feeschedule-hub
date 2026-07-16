"""Phase 0 — job queue behavior (claim/heartbeat/fail/reap)."""

from __future__ import annotations

import asyncio

import pytest

from fee_crawler.engine import queue as q

pytestmark = pytest.mark.asyncio


async def test_enqueue_and_claim(pool):
    async with pool.acquire() as conn:
        job_id = await q.enqueue(conn, "fetch", "target:1", payload={"url": "x"}, state_code="IA")
    claimed = await q.claim_job(pool, "fetch", "worker-a")
    assert claimed is not None
    assert claimed["id"] == job_id
    assert claimed["status"] == "running"
    assert claimed["locked_by"] == "worker-a"
    assert claimed["attempts"] == 1
    # queue empty now
    assert await q.claim_job(pool, "fetch", "worker-a") is None


async def test_claim_is_exclusive_under_concurrency(pool):
    # Enqueue 20 jobs; 8 workers race to claim. Each job claimed exactly once.
    async with pool.acquire() as conn:
        for i in range(20):
            await q.enqueue(conn, "read", f"doc:{i}")

    claimed_ids: list[int] = []
    lock = asyncio.Lock()

    async def worker(name: str):
        while True:
            job = await q.claim_job(pool, "read", name)
            if job is None:
                return
            async with lock:
                claimed_ids.append(job["id"])
            await asyncio.sleep(0)  # yield to interleave

    await asyncio.gather(*(worker(f"w{i}") for i in range(8)))
    assert len(claimed_ids) == 20
    assert len(set(claimed_ids)) == 20  # no double-claim


async def test_wrong_queue_not_claimed(pool):
    async with pool.acquire() as conn:
        await q.enqueue(conn, "fetch", "t:1")
    assert await q.claim_job(pool, "extract", "w") is None


async def test_fail_retries_with_backoff_then_dead(pool):
    async with pool.acquire() as conn:
        job_id = await q.enqueue(conn, "extract", "t:1", max_attempts=2)

    # attempt 1
    await q.claim_job(pool, "extract", "w")
    status = await q.fail_job(pool, job_id, "boom")
    assert status == q.PENDING
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT status, run_at, run_at > NOW() AS delayed FROM jobs WHERE id=$1", job_id)
    assert row["status"] == "pending"
    assert row["delayed"] is True  # backoff pushed run_at into the future

    # force it runnable, attempt 2 -> exhausts max_attempts -> dead
    async with pool.acquire() as conn:
        await conn.execute("UPDATE jobs SET run_at=NOW() WHERE id=$1", job_id)
    await q.claim_job(pool, "extract", "w")
    status = await q.fail_job(pool, job_id, "boom again")
    assert status == q.DEAD


async def test_non_retryable_goes_dead_immediately(pool):
    async with pool.acquire() as conn:
        job_id = await q.enqueue(conn, "verify", "t:1", max_attempts=5)
    await q.claim_job(pool, "verify", "w")
    status = await q.fail_job(pool, job_id, "permanent", retryable=False)
    assert status == q.DEAD


async def test_reaper_requeues_dead_worker_job(pool):
    async with pool.acquire() as conn:
        job_id = await q.enqueue(conn, "fetch", "t:1", max_attempts=3)
    await q.claim_job(pool, "fetch", "w")  # attempts=1, running
    # simulate a dead worker: heartbeat far in the past
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE jobs SET heartbeat_at = NOW() - INTERVAL '10 minutes' WHERE id=$1",
            job_id,
        )
    reaped = await q.reap_stale_jobs(pool, timeout_seconds=300)
    assert reaped == 1
    async with pool.acquire() as conn:
        status = await conn.fetchval("SELECT status FROM jobs WHERE id=$1", job_id)
    assert status == "pending"  # retryable -> back to pending
    # claimable again
    assert await q.claim_job(pool, "fetch", "w2") is not None


async def test_reaper_kills_exhausted_job(pool):
    async with pool.acquire() as conn:
        job_id = await q.enqueue(conn, "fetch", "t:1", max_attempts=1)
    await q.claim_job(pool, "fetch", "w")  # attempts=1 == max
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE jobs SET heartbeat_at = NOW() - INTERVAL '10 minutes' WHERE id=$1",
            job_id,
        )
    await q.reap_stale_jobs(pool, timeout_seconds=300)
    async with pool.acquire() as conn:
        status = await conn.fetchval("SELECT status FROM jobs WHERE id=$1", job_id)
    assert status == "dead"


async def test_complete_and_depth(pool):
    async with pool.acquire() as conn:
        j1 = await q.enqueue(conn, "fetch", "t:1")
        await q.enqueue(conn, "fetch", "t:2")
    assert await q.queue_depth(pool, "fetch") == 2
    job = await q.claim_job(pool, "fetch", "w")
    async with pool.acquire() as conn:
        await q.complete_job(conn, job["id"], result={"ok": True})
        payload = await conn.fetchval("SELECT payload FROM jobs WHERE id=$1", j1)
    assert '"ok": true' in payload
    assert await q.queue_depth(pool, "fetch") == 1  # one still pending


async def test_enqueue_rejects_unknown_queue(pool):
    async with pool.acquire() as conn:
        with pytest.raises(ValueError):
            await q.enqueue(conn, "not-a-queue", "t:1")
