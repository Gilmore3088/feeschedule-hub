"""Hamilton digest runner unit tests (C-02).

Tests the scheduling primitives + the per-subscription flow with
mocked DB + HTTP. No real Hamilton call, no real DB.
"""

import asyncio
from datetime import timedelta
from unittest.mock import AsyncMock, patch

from fee_crawler.agents.hamilton.digest import (
    AGENT_NAME,
    DigestRunResult,
    INLINE_RESPONSE_LIMIT_BYTES,
    cadence_to_interval,
    process_due_digests,
)


def test_agent_name_is_stable():
    assert AGENT_NAME == "hamilton"


def test_inline_limit_is_64k():
    """Bound matches the gateway convention so any future R2 spillover
    code can share the threshold."""
    assert INLINE_RESPONSE_LIMIT_BYTES == 64_000


def test_cadence_to_interval():
    assert cadence_to_interval("daily") == timedelta(days=1)
    assert cadence_to_interval("weekly") == timedelta(days=7)
    assert cadence_to_interval("monthly") == timedelta(days=30)
    # Unknown cadence falls back to weekly (safe default; constraint
    # catches bad data on insert anyway)
    assert cadence_to_interval("hourly") == timedelta(days=7)
    assert cadence_to_interval("") == timedelta(days=7)


def test_process_due_digests_empty_returns_no_results():
    """No subscriptions due → no work, no error, empty list."""
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=[])

    async def run():
        return await process_due_digests(conn, max_runs=5)

    out = asyncio.run(run())
    assert out == []
    # Only the fetch_due call happened
    assert conn.fetch.await_count == 1


def test_process_due_digests_records_success_and_bumps_due():
    """One due subscription → pending record → Hamilton call → success
    record + next_due_at bumped per cadence."""
    sub = {
        "subscription_id": 42,
        "user_id": 7,
        "label": "Weekly OD comparison",
        "prompt": "compare my OD to peers",
        "cadence": "weekly",
        "delivery": "inbox",
        "delivery_address": None,
        "last_run_at": None,
        "next_due_at": None,
    }
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=[sub])
    conn.fetchval = AsyncMock(return_value=999)   # pending run_id
    conn.execute = AsyncMock()

    async def fake_hamilton(_prompt, timeout_s=60.0):
        return {"text": "Hamilton says: you're below average.", "cost_cents": 18}

    async def run():
        with patch(
            "fee_crawler.agents.hamilton.digest._call_hamilton",
            new=fake_hamilton,
        ):
            return await process_due_digests(conn, max_runs=5)

    out = asyncio.run(run())
    assert len(out) == 1
    r = out[0]
    assert isinstance(r, DigestRunResult)
    assert r.subscription_id == 42
    assert r.run_id == 999
    assert r.status == "success"
    assert r.cost_cents == 18

    # Three execute calls: success-completion update + bump-due update
    # (fetchval was the pending insert RETURNING)
    assert conn.execute.await_count == 2


def test_process_due_digests_records_failure_when_hamilton_throws():
    """Hamilton call fails → run row marked 'failed', next_due_at NOT
    bumped so the next tick retries (idempotent at the queue layer)."""
    sub = {
        "subscription_id": 7,
        "user_id": 1,
        "label": "Daily peer monitor",
        "prompt": "?",
        "cadence": "daily",
        "delivery": "inbox",
        "delivery_address": None,
        "last_run_at": None,
        "next_due_at": None,
    }
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=[sub])
    conn.fetchval = AsyncMock(return_value=1234)
    conn.execute = AsyncMock()

    async def boom(_prompt, timeout_s=60.0):
        raise RuntimeError("Hamilton 500")

    async def run():
        with patch(
            "fee_crawler.agents.hamilton.digest._call_hamilton",
            new=boom,
        ):
            return await process_due_digests(conn, max_runs=5)

    out = asyncio.run(run())
    assert len(out) == 1
    r = out[0]
    assert r.status == "failed"
    assert r.error is not None
    assert "Hamilton 500" in r.error
    # Exactly one execute call: marking the run failed. NO bump-due
    # update so the subscription is picked up again on the next tick.
    assert conn.execute.await_count == 1


def test_one_failure_does_not_block_others():
    """If sub A fails and sub B succeeds, the batch returns both
    results and processes them independently."""
    subs = [
        {
            "subscription_id": 1, "user_id": 1, "label": "A",
            "prompt": "?", "cadence": "weekly",
            "delivery": "inbox", "delivery_address": None,
            "last_run_at": None, "next_due_at": None,
        },
        {
            "subscription_id": 2, "user_id": 1, "label": "B",
            "prompt": "?", "cadence": "weekly",
            "delivery": "inbox", "delivery_address": None,
            "last_run_at": None, "next_due_at": None,
        },
    ]
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=subs)
    # Each sub gets its own pending run_id (fetchval) — return a sequence
    run_ids = iter([100, 200])
    conn.fetchval = AsyncMock(side_effect=lambda *a, **k: next(run_ids))
    conn.execute = AsyncMock()

    call_count = {"i": 0}

    async def maybe_throw(_prompt, timeout_s=60.0):
        call_count["i"] += 1
        if call_count["i"] == 1:
            raise RuntimeError("first one fails")
        return {"text": "ok", "cost_cents": 5}

    async def run():
        with patch(
            "fee_crawler.agents.hamilton.digest._call_hamilton",
            new=maybe_throw,
        ):
            return await process_due_digests(conn, max_runs=5)

    out = asyncio.run(run())
    assert len(out) == 2
    assert out[0].status == "failed"
    assert out[1].status == "success"
    assert out[1].cost_cents == 5
