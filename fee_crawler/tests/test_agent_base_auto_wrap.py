"""Phase 62b LOOP-01, 04, 05, 06 contract tests + LOOP-03 latency placeholder.

These tests exercise the ``fee_crawler.agent_base`` package shipped in Plan
62B-03. The nine required tests mirror VALIDATION.md and map as follows:

* LOOP-01  -- test_subclass_gets_hooks, test_subclass_without_agent_name_raises,
              test_subclass_methods_are_context_wrapped,
              test_nested_call_inherits_correlation_id,
              test_auto_wrap_allowlist_exact
* LOOP-04  -- test_dissect_writes_event
* LOOP-05  -- test_understand_writes_lesson, test_understand_supersedes_prior_lesson
* LOOP-06  -- test_improve_before_after
* LOOP-03  -- test_review_latency_placeholder (seed for Plan 62B-08 pg_cron
              dispatcher; proves the SELECT shape that the dispatcher will use
              returns a freshly-inserted review_tick row)

DB-backed tests use the ``db_schema`` fixture from conftest.py, which applies
all migrations (including 20260503 agent_lessons) against a per-test schema
and routes the pool via ``search_path``. The loop-helper functions use
``fee_crawler.agent_tools.pool.get_pool()`` internally, so the tests inject the
per-schema pool into the singleton (pattern copied from test_tools_fees.py).
"""

from __future__ import annotations

import json
import uuid

import pytest

from fee_crawler.agent_base import AUTO_WRAP_METHODS, AgentBase
from fee_crawler.agent_base.loop import (
    default_dissect,
    default_improve_commit,
    default_understand,
)
from fee_crawler.agent_tools.context import get_agent_context, with_agent_context


# ----------------------------------------------------------------------
# Fixtures / helpers
# ----------------------------------------------------------------------


class _FakeKnox(AgentBase):
    """Minimal subclass used in pure-Python tests (no DB required)."""

    agent_name = "knox"
    seen_ctx: dict = {}

    async def run_turn(self):
        _FakeKnox.seen_ctx = dict(get_agent_context() or {})

    async def review(self):
        return None

    async def dissect(self, events):
        return await default_dissect(self.agent_name, events)

    async def understand(self, patterns):
        return await default_understand(self.agent_name, patterns)

    async def improve(self, lesson):
        await default_improve_commit(self.agent_name, lesson)


@pytest.fixture
def _pool_injected(db_schema):
    """Inject per-test schema pool into the agent_tools singleton.

    Mirrors the pattern in fee_crawler/tests/test_tools_fees.py so that
    ``default_*`` helpers (which call ``get_pool()`` internally) route their
    writes to the isolated schema. Restores ``_pool = None`` on teardown so
    test ordering is not poisoned.
    """
    from fee_crawler.agent_tools import pool as pool_mod

    schema, pool = db_schema
    previous = pool_mod._pool
    pool_mod._pool = pool
    try:
        yield schema, pool
    finally:
        pool_mod._pool = previous


# ----------------------------------------------------------------------
# LOOP-01 contract tests (no DB)
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_subclass_gets_hooks():
    """LOOP-01: subclass has all 5 override points wired and callable."""
    k = _FakeKnox()
    for m in AUTO_WRAP_METHODS:
        assert callable(getattr(k, m)), f"{m} not callable on subclass"


def test_subclass_without_agent_name_raises():
    """LOOP-01: class creation without agent_name raises TypeError immediately."""
    with pytest.raises(TypeError, match="agent_name"):

        class BadAgent(AgentBase):  # noqa: F841 -- defined to trigger __init_subclass__
            async def run_turn(self):
                return None


def test_auto_wrap_allowlist_exact():
    """LOOP-01: the allowlist is frozen at exactly the 5 public methods.

    Guards against regressions that would either wrap private helpers
    (context-var corruption risk) or drop one of the 5 hooks (silently
    breaking LOG/REVIEW/DISSECT/UNDERSTAND/IMPROVE).
    """
    assert AUTO_WRAP_METHODS == (
        "run_turn",
        "review",
        "dissect",
        "understand",
        "improve",
    )


@pytest.mark.asyncio
async def test_subclass_methods_are_context_wrapped(_pool_injected):
    """LOOP-01: calling any AUTO_WRAP_METHODS method enters with_agent_context."""
    _FakeKnox.seen_ctx = {}
    k = _FakeKnox()
    await k.run_turn()
    assert _FakeKnox.seen_ctx.get("agent_name") == "knox"
    assert _FakeKnox.seen_ctx.get("correlation_id") is not None


@pytest.mark.asyncio
async def test_nested_call_inherits_correlation_id(_pool_injected):
    """LOOP-01: nested call (outer context active) inherits correlation_id.

    Simulates Atlas calling Knox: the Knox turn should carry Atlas's
    correlation_id so downstream agent_events rows stitch into the same
    lineage thread.
    """
    outer_corr = str(uuid.uuid4())
    _FakeKnox.seen_ctx = {}
    with with_agent_context(agent_name="atlas", correlation_id=outer_corr):
        k = _FakeKnox()
        await k.run_turn()
    assert _FakeKnox.seen_ctx["correlation_id"] == outer_corr


# ----------------------------------------------------------------------
# LOOP-04 / 05 / 06 DB-backed contract tests
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dissect_writes_event(_pool_injected):
    """LOOP-04: default_dissect writes exactly 1 agent_events row action='dissect'."""
    schema, pool = _pool_injected
    agent_name = "knox"
    with with_agent_context(agent_name=agent_name):
        await default_dissect(agent_name, [{"e": 1}, {"e": 2}])
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT action, input_payload::TEXT AS payload FROM agent_events "
            "WHERE agent_name = $1 AND action = 'dissect' "
            "ORDER BY created_at DESC LIMIT 1",
            agent_name,
        )
    assert row is not None
    assert row["action"] == "dissect"
    payload = json.loads(row["payload"])
    assert payload["events_count"] == 2


@pytest.mark.asyncio
async def test_understand_writes_lesson(_pool_injected):
    """LOOP-05: default_understand inserts the lesson row with our exact name."""
    schema, pool = _pool_injected
    agent_name = "knox"
    lesson_name = f"test_lesson_{uuid.uuid4().hex[:8]}"
    with with_agent_context(agent_name=agent_name):
        result = await default_understand(
            agent_name,
            [{"name": lesson_name, "description": "first", "evidence_ref": "ev1"}],
        )
    assert result["name"] == lesson_name
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT agent_name, lesson_name, description FROM agent_lessons "
            "WHERE agent_name = $1 AND lesson_name = $2",
            agent_name,
            lesson_name,
        )
    assert row is not None
    assert row["description"] == "first"


@pytest.mark.asyncio
async def test_understand_supersedes_prior_lesson(_pool_injected):
    """LOOP-05: second call with same lesson_name updates in place (active row == v2).

    ``(agent_name, lesson_name)`` is UNIQUE. The active row (``superseded_by IS NULL``)
    should carry the most recent description after a second understand() call.
    """
    schema, pool = _pool_injected
    agent_name = "knox"
    lesson_name = f"supersede_test_{uuid.uuid4().hex[:8]}"
    with with_agent_context(agent_name=agent_name):
        await default_understand(agent_name, [{"name": lesson_name, "description": "v1"}])
        await default_understand(agent_name, [{"name": lesson_name, "description": "v2"}])
    async with pool.acquire() as conn:
        active = await conn.fetchrow(
            "SELECT description FROM agent_lessons "
            "WHERE agent_name = $1 AND lesson_name = $2 AND superseded_by IS NULL",
            agent_name,
            lesson_name,
        )
    assert active is not None
    assert active["description"] == "v2"


@pytest.mark.asyncio
async def test_improve_before_after(_pool_injected):
    """LOOP-06: default_improve_commit writes before/after payload to agent_events."""
    schema, pool = _pool_injected
    agent_name = "knox"
    with with_agent_context(agent_name=agent_name):
        await default_improve_commit(
            agent_name,
            {"name": "test", "before": {"rule": "v1"}, "after": {"rule": "v2"}},
        )
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT action, input_payload::TEXT AS payload FROM agent_events "
            "WHERE agent_name = $1 AND action = 'improve' "
            "ORDER BY created_at DESC LIMIT 1",
            agent_name,
        )
    assert row is not None
    payload = json.loads(row["payload"])
    assert "before" in payload
    assert "after" in payload
    assert payload["before"] == {"rule": "v1"}
    assert payload["after"] == {"rule": "v2"}


# ----------------------------------------------------------------------
# LOOP-03 latency placeholder (seed for Plan 62B-08 pg_cron dispatcher)
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_review_latency_placeholder(_pool_injected):
    """Seed the SELECT shape Plan 62B-08 pg_cron dispatcher will use.

    Proves LOOP-03 SC1 bar is mechanically reachable: after inserting a
    ``review_tick`` row, a SELECT with a ``< 15 minute`` window returns it.
    """
    schema, pool = _pool_injected
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status)
               VALUES ('knox', 'review_tick', '_cron', '_review', 'pending')"""
        )
        row = await conn.fetchrow(
            """SELECT agent_name FROM agent_events
                WHERE action = 'review_tick'
                  AND status = 'pending'
                  AND created_at > NOW() - INTERVAL '15 minutes'
                ORDER BY created_at DESC LIMIT 1"""
        )
    assert row is not None
    assert row["agent_name"] == "knox"
