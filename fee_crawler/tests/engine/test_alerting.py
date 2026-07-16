"""Phase 5 — dead jobs fire a loud alert."""

from __future__ import annotations

import pytest

from fee_crawler.engine import queue as q
from fee_crawler.engine.worker import HandlerResult, PermanentError, run_once

pytestmark = pytest.mark.asyncio


class _AlwaysDies:
    queue = "extract"

    async def handle(self, pool, job):
        raise PermanentError("boom")


class _NeverDies:
    queue = "extract"

    async def handle(self, pool, job):
        return HandlerResult()


class _FakeAlerter:
    def __init__(self):
        self.alerts = []

    async def alert(self, subject, body="", *, level="error"):
        self.alerts.append((subject, body))


async def test_dead_job_alerts(pool):
    async with pool.acquire() as conn:
        await q.enqueue(conn, "extract", "doc:1", max_attempts=1)
    alerter = _FakeAlerter()
    await run_once(pool, _AlwaysDies(), "w", alerter=alerter)
    assert len(alerter.alerts) == 1
    assert "job dead" in alerter.alerts[0][0]


async def test_success_does_not_alert(pool):
    async with pool.acquire() as conn:
        await q.enqueue(conn, "extract", "doc:1")
    alerter = _FakeAlerter()
    await run_once(pool, _NeverDies(), "w", alerter=alerter)
    assert alerter.alerts == []


async def test_retryable_failure_does_not_alert_until_exhausted(pool):
    async with pool.acquire() as conn:
        await q.enqueue(conn, "extract", "doc:1", max_attempts=2)

    class _Retryable:
        queue = "extract"

        async def handle(self, pool, job):
            raise RuntimeError("transient")

    alerter = _FakeAlerter()
    # attempt 1 -> pending (backoff), no alert
    await run_once(pool, _Retryable(), "w", alerter=alerter)
    assert alerter.alerts == []
    # force runnable, attempt 2 -> dead -> alert
    async with pool.acquire() as conn:
        await conn.execute("UPDATE jobs SET run_at=NOW() WHERE queue='extract'")
    await run_once(pool, _Retryable(), "w", alerter=alerter)
    assert len(alerter.alerts) == 1
