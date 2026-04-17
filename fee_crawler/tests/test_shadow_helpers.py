"""Shadow-mode integration tests (D-21).

Covers:
  - is_shadow_active() reads from the current agent context.
  - A gateway call inside shadow context rewrites agent_events to
    status='shadow_diff' + is_shadow=TRUE and DELETEs agent_auth_log.
  - shadow_diff_report() groups shadow_outputs rows by entity.

Non-DB tests (is_shadow_active smoke) run anywhere; DB tests require
DATABASE_URL_TEST (skipped via conftest.db_schema fixture otherwise).
"""

from __future__ import annotations

import uuid

import pytest

from fee_crawler.agent_tools.context import with_agent_context
from fee_crawler.agent_tools.gateway import is_shadow_active, with_agent_tool
from fee_crawler.testing.shadow_helpers import shadow_diff_report


def test_is_shadow_active_false_by_default():
    """Outside any with_agent_context block, no shadow flag is set."""
    assert is_shadow_active() is False


def test_is_shadow_active_true_inside_shadow_ctx():
    """Setting shadow_run_id on with_agent_context flips the flag."""
    with with_agent_context(
        agent_name="knox", shadow_run_id=str(uuid.uuid4())
    ):
        assert is_shadow_active() is True
    # Reset on exit.
    assert is_shadow_active() is False


def test_is_shadow_active_false_without_shadow_kwarg():
    """with_agent_context without shadow_run_id leaves shadow inactive."""
    with with_agent_context(agent_name="knox"):
        assert is_shadow_active() is False


@pytest.mark.asyncio
async def test_shadow_gateway_call_sets_is_shadow(db_schema):
    """A create-action inside shadow context must land status='shadow_diff' + is_shadow=TRUE.

    agent_auth_log must NOT persist for the event (suppressed per D-21).
    """
    schema, pool = db_schema
    agent_name = "knox"
    rid = str(uuid.uuid4())
    captured_event_id: str | None = None

    with with_agent_context(agent_name=agent_name, shadow_run_id=rid):
        async with with_agent_tool(
            tool_name="shadow_smoke",
            entity="_smoke",  # unknown entity — snapshot gracefully returns None
            entity_id=None,
            action="create",
            agent_name=agent_name,
            reasoning_prompt="p",
            reasoning_output="o",
            input_payload={"probe": True},
            pool=pool,
        ) as (conn, event_id):
            captured_event_id = event_id
            # No business-table write happens in shadow mode — caller is
            # expected to route to shadow_outputs; this test doesn't exercise
            # that path (it's tool-specific and lands in 62B-05).

    assert captured_event_id is not None

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status, is_shadow FROM agent_events WHERE event_id = $1::UUID",
            captured_event_id,
        )
    assert row is not None, "agent_events row missing after shadow call"
    assert row["status"] == "shadow_diff", f"got {row['status']!r}"
    assert row["is_shadow"] is True, "is_shadow flag not set"

    # agent_auth_log entry must be absent (suppressed by gateway branch).
    async with pool.acquire() as conn:
        auth_row = await conn.fetchrow(
            "SELECT 1 FROM agent_auth_log WHERE agent_event_id = $1::UUID",
            captured_event_id,
        )
    assert auth_row is None, (
        "agent_auth_log row should be suppressed for shadow-mode calls"
    )


@pytest.mark.asyncio
async def test_shadow_gateway_non_shadow_call_writes_auth_log(db_schema):
    """Baseline: a non-shadow call still writes status='success' + agent_auth_log.

    Guards against accidental regression of the 62a happy path.
    """
    schema, pool = db_schema

    async with with_agent_tool(
        tool_name="non_shadow_smoke",
        entity="_smoke",
        entity_id=None,
        action="create",
        agent_name="knox",
        reasoning_prompt="p",
        reasoning_output="o",
        pool=pool,
    ) as (conn, event_id):
        non_shadow_event = event_id

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status, is_shadow FROM agent_events WHERE event_id = $1::UUID",
            non_shadow_event,
        )
    assert row is not None
    assert row["status"] == "success"
    assert row["is_shadow"] is False

    async with pool.acquire() as conn:
        auth_row = await conn.fetchrow(
            "SELECT 1 FROM agent_auth_log WHERE agent_event_id = $1::UUID",
            non_shadow_event,
        )
    assert auth_row is not None, "agent_auth_log missing for non-shadow call"


@pytest.mark.asyncio
async def test_shadow_diff_report_groups_by_entity(db_schema, monkeypatch):
    """shadow_diff_report() groups shadow_outputs rows by entity and preserves order."""
    schema, pool = db_schema

    # shadow_diff_report uses the module pool; redirect it to the test pool.
    from fee_crawler.testing import shadow_helpers

    async def _fake_get_pool():
        return pool

    monkeypatch.setattr(shadow_helpers, "get_pool", _fake_get_pool)

    rid = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO shadow_outputs (shadow_run_id, agent_name, entity, payload_diff) "
            "VALUES ($1::UUID, 'knox', 'fees_raw', '{\"a\":1}'::JSONB)",
            rid,
        )
        await conn.execute(
            "INSERT INTO shadow_outputs (shadow_run_id, agent_name, entity, payload_diff) "
            "VALUES ($1::UUID, 'knox', 'fees_raw', '{\"a\":2}'::JSONB)",
            rid,
        )
        await conn.execute(
            "INSERT INTO shadow_outputs (shadow_run_id, agent_name, entity, payload_diff) "
            "VALUES ($1::UUID, 'knox', 'agent_messages', '{\"b\":3}'::JSONB)",
            rid,
        )

    report = await shadow_diff_report(rid)
    assert "fees_raw" in report
    assert "agent_messages" in report
    assert len(report["fees_raw"]) == 2
    assert len(report["agent_messages"]) == 1
