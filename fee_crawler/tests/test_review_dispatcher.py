"""Tests for LOOP-03 review dispatcher (Plan 62B-08).

Covers the Python side of D-05 pivot:
  - Unknown agent_name -> status flipped to 'error' with JSONB error payload
  - Known agent -> review() invoked, status flipped to 'success'
  - Dispatcher is idempotent: a second invocation finds 0 pending
  - Migration 20260511 shipped (file exists + required guards present)
  - Structural check: FOR UPDATE SKIP LOCKED present in dispatcher source

DB-backed tests use the per-test db_schema fixture (schema-scoped pool). They
rebind the module-level pool singleton via _bind_pool(pool) so dispatcher calls
hit the test schema instead of the production singleton.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from fee_crawler.agent_base import AgentBase
from fee_crawler.agent_base.dispatcher import (
    AGENT_CLASSES,
    dispatch_ticks,
    register_agent_class,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _bind_pool(pool):
    """Redirect the agent_tools pool singleton to the per-test schema pool."""
    from fee_crawler.agent_tools import pool as pool_mod

    original = pool_mod._pool
    pool_mod._pool = pool

    def restore() -> None:
        pool_mod._pool = original

    return restore


# Test agent — `agent_name` set so AgentBase.__init_subclass__ accepts it.
# `review()` is implemented at module scope so the dispatcher's
# importlib.import_module path can resolve it.
class _SmokeAgent(AgentBase):
    agent_name = "smoke_agent"
    review_count = 0

    async def run_turn(self, *args, **kwargs):
        return None

    async def review(self):
        type(self).review_count += 1


@pytest.fixture(autouse=True)
def _reset_classes():
    AGENT_CLASSES.clear()
    _SmokeAgent.review_count = 0
    yield
    AGENT_CLASSES.clear()


# ---------------------------------------------------------------------------
# Pure-Python / file contract checks (no DB required)
# ---------------------------------------------------------------------------


def test_migration_file_exists_with_guards(migrations_dir: Path):
    """20260511_pg_cron_review_dispatcher.sql exists and contains the required
    pg_cron extension guard + cron.schedule invocation.
    """
    path = migrations_dir / "20260511_pg_cron_review_dispatcher.sql"
    assert path.is_file(), f"missing migration: {path}"
    sql = path.read_text()
    assert "extname = 'pg_cron'" in sql, "missing pg_cron extension guard"
    assert "cron.schedule" in sql, "missing cron.schedule call"
    assert "cron.unschedule" in sql, "migration must be idempotent (unschedule prior jobs)"
    assert "review_tick" in sql, "cron body must emit review_tick rows"


def test_dispatcher_has_skip_locked():
    """Structural check: FOR UPDATE SKIP LOCKED is present in the dispatcher
    source so concurrent dispatchers cannot double-fire."""
    src = Path(__file__).resolve().parents[1] / "agent_base" / "dispatcher.py"
    text = src.read_text()
    assert "FOR UPDATE SKIP LOCKED" in text
    assert "review_tick" in text


# ---------------------------------------------------------------------------
# DB-backed integration tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dispatch_unknown_agent_marks_error(db_schema):
    """Tick row for an unregistered agent gets status='error' with JSONB payload."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO agent_events (agent_name, action, tool_name, entity, status) "
                "VALUES ('knox','review_tick','_cron','_review','pending')"
            )
        stats = await dispatch_ticks()
        assert stats["errors"] >= 1
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT status, output_payload FROM agent_events "
                "WHERE agent_name='knox' AND action='review_tick' "
                "ORDER BY created_at DESC LIMIT 1"
            )
        assert row["status"] == "error"
        assert row["output_payload"] is not None
        assert "no agent class registered" in row["output_payload"].get("error", "")
    finally:
        restore()


@pytest.mark.asyncio
async def test_dispatch_known_agent_calls_review(db_schema):
    """Registered agent's review() is invoked and tick flipped to 'success'."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO agent_registry (agent_name, display_name, role) "
                "VALUES ('smoke_agent','Smoke','test') ON CONFLICT DO NOTHING"
            )
            await conn.execute(
                "INSERT INTO agent_events (agent_name, action, tool_name, entity, status) "
                "VALUES ('smoke_agent','review_tick','_cron','_review','pending')"
            )
        register_agent_class(
            "smoke_agent",
            "fee_crawler.tests.test_review_dispatcher",
            "_SmokeAgent",
        )
        stats = await dispatch_ticks()
        assert stats["dispatched"] >= 1
        assert _SmokeAgent.review_count >= 1
        async with pool.acquire() as conn:
            status = await conn.fetchval(
                "SELECT status FROM agent_events "
                "WHERE agent_name='smoke_agent' AND action='review_tick' "
                "ORDER BY created_at DESC LIMIT 1"
            )
        assert status == "success"
    finally:
        restore()


@pytest.mark.asyncio
async def test_dispatch_idempotent(db_schema):
    """Second invocation finds 0 pending because the first flipped status."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO agent_registry (agent_name, display_name, role) "
                "VALUES ('smoke_agent','Smoke','test') ON CONFLICT DO NOTHING"
            )
            await conn.execute(
                "INSERT INTO agent_events (agent_name, action, tool_name, entity, status) "
                "VALUES ('smoke_agent','review_tick','_cron','_review','pending')"
            )
        register_agent_class(
            "smoke_agent",
            "fee_crawler.tests.test_review_dispatcher",
            "_SmokeAgent",
        )
        stats1 = await dispatch_ticks()
        stats2 = await dispatch_ticks()
        assert stats1["dispatched"] >= 1
        assert stats2["dispatched"] == 0
        assert stats2["errors"] == 0
    finally:
        restore()


@pytest.mark.asyncio
async def test_dispatch_ignores_ticks_outside_window(db_schema):
    """Ticks older than window_minutes are not reclaimed by default."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO agent_registry (agent_name, display_name, role) "
                "VALUES ('smoke_agent','Smoke','test') ON CONFLICT DO NOTHING"
            )
            # Force an old tick — 1 hour ago — to verify the window filter.
            await conn.execute(
                "INSERT INTO agent_events "
                "(agent_name, action, tool_name, entity, status, created_at) "
                "VALUES ('smoke_agent','review_tick','_cron','_review','pending', "
                "NOW() - INTERVAL '1 hour')"
            )
        register_agent_class(
            "smoke_agent",
            "fee_crawler.tests.test_review_dispatcher",
            "_SmokeAgent",
        )
        stats = await dispatch_ticks(window_minutes=10)
        # Tick is older than the 10-minute window — must NOT be claimed.
        assert stats["dispatched"] == 0
        assert stats["errors"] == 0
        async with pool.acquire() as conn:
            status = await conn.fetchval(
                "SELECT status FROM agent_events "
                "WHERE agent_name='smoke_agent' AND action='review_tick' "
                "ORDER BY created_at DESC LIMIT 1"
            )
        assert status == "pending"
    finally:
        restore()
