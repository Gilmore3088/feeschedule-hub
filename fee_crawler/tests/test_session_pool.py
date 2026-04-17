"""Tests for session-mode asyncpg pool helper (Plan 62B-02).

The session pool is distinct from the transaction-mode pool used by most writes.
It is required for LISTEN/NOTIFY (research §Mechanics 2, §Pitfall 2) because
Supavisor transaction mode (port 6543) multiplexes connections between
transactions -- LISTEN registrations do not persist.

These tests cover:
  * Unconditional failure path: `get_session_pool()` raises when env var missing.
    This MUST pass in any environment (no DB required).
  * DB-integration path: actual LISTEN/NOTIFY roundtrip, singleton semantics,
    jsonb codec. Skipped cleanly when DATABASE_URL_SESSION[_TEST] is unset.
    CI contract (documented in CLAUDE.md) requires DATABASE_URL_SESSION_TEST to
    be set so these tests do not silently skip.
"""

from __future__ import annotations

import asyncio
import os
import uuid

import pytest

from fee_crawler.agent_tools.pool import (
    close_pool,
    close_session_pool,
    get_pool,
    get_session_pool,
)


@pytest.fixture
def session_pool_available():
    """Skip the test when DATABASE_URL_SESSION[_TEST] is not set.

    Scoped to this file so it does not pollute the broader conftest.
    """
    if not (
        os.environ.get("DATABASE_URL_SESSION")
        or os.environ.get("DATABASE_URL_SESSION_TEST")
    ):
        pytest.skip(
            "DATABASE_URL_SESSION[_TEST] not set; session pool integration "
            "tests skipped. CI MUST set DATABASE_URL_SESSION_TEST so this "
            "never silently passes."
        )


@pytest.mark.asyncio
async def test_missing_env_raises():
    """Unconditional: no DB required. Guards against silent mis-config."""
    await close_session_pool()
    orig_live = os.environ.pop("DATABASE_URL_SESSION", None)
    orig_test = os.environ.pop("DATABASE_URL_SESSION_TEST", None)
    try:
        with pytest.raises(RuntimeError, match="DATABASE_URL_SESSION"):
            await get_session_pool()
    finally:
        if orig_live is not None:
            os.environ["DATABASE_URL_SESSION"] = orig_live
        if orig_test is not None:
            os.environ["DATABASE_URL_SESSION_TEST"] = orig_test


@pytest.mark.asyncio
async def test_session_pool_singleton(session_pool_available):
    """Module-level caching: two calls return the same pool object."""
    await close_session_pool()
    try:
        p1 = await get_session_pool()
        p2 = await get_session_pool()
        assert p1 is p2
    finally:
        await close_session_pool()


@pytest.mark.asyncio
async def test_listen_notify_roundtrip(session_pool_available):
    """Core proof that session mode supports LISTEN/NOTIFY end-to-end."""
    await close_session_pool()
    try:
        pool = await get_session_pool()
        channel = f"pool_smoke_{uuid.uuid4().hex[:8]}"
        received = asyncio.Event()
        captured: dict[str, str] = {}

        async def cb(conn, pid, ch, payload):
            captured["payload"] = payload
            received.set()

        async with pool.acquire() as listener_conn:
            await listener_conn.add_listener(channel, cb)
            try:
                async with pool.acquire() as sender:
                    await sender.execute(
                        "SELECT pg_notify($1, $2)", channel, "hello"
                    )
                await asyncio.wait_for(received.wait(), timeout=5)
            finally:
                await listener_conn.remove_listener(channel, cb)

        assert captured.get("payload") == "hello"
    finally:
        await close_session_pool()


@pytest.mark.asyncio
async def test_pools_independent(session_pool_available):
    """Closing session pool must not close the transaction pool, and vice versa."""
    await close_session_pool()
    await close_pool()
    try:
        session = await get_session_pool()
        assert session is not None

        # Transaction pool only instantiable when a DATABASE_URL[_TEST] is set.
        txn_dsn = os.environ.get("DATABASE_URL") or os.environ.get(
            "DATABASE_URL_TEST"
        )
        if txn_dsn:
            txn = await get_pool()
            assert txn is not None
            # Closing txn must not close session.
            await close_pool()
            # Session still usable after txn pool closure.
            async with session.acquire() as conn:
                val = await conn.fetchval("SELECT 1")
                assert val == 1
    finally:
        await close_session_pool()
        await close_pool()


@pytest.mark.asyncio
async def test_jsonb_codec_registered(session_pool_available):
    """Session pool connections must round-trip JSONB as a Python dict."""
    await close_session_pool()
    try:
        pool = await get_session_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchval("SELECT jsonb_build_object('k','v')")
        assert isinstance(row, dict)
        assert row == {"k": "v"}
    finally:
        await close_session_pool()
