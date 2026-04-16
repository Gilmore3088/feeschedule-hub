"""Gateway contract: every tool call writes exactly one agent_events row before target write.

Tests drive with_agent_tool against a per-test Postgres schema (see conftest.db_schema).
The gateway's contract:
  1. INSERT agent_events with status='pending' BEFORE yielding to caller body.
  2. On successful exit, flip status='success' + insert agent_auth_log in same tx.
  3. On exception inside body, roll the whole transaction back.
  4. Reject agent_names not present (or not is_active) in agent_registry.
"""
from __future__ import annotations

import pytest

from fee_crawler.agent_tools.gateway import AgentUnknown, with_agent_tool


@pytest.mark.asyncio
async def test_tool_writes_event_before_target(db_schema):
    """AGENT-02: agent_events row lands with status='pending' BEFORE body runs,
    then flips to status='success' on successful exit."""
    schema, pool = db_schema

    async with with_agent_tool(
        tool_name="test_create",
        entity="fees_raw",
        entity_id=None,
        action="create",
        agent_name="knox",
        reasoning_prompt="p",
        reasoning_output="o",
        input_payload={"probe": True},
        pool=pool,
    ) as (conn, event_id):
        # Inside the body, the gateway has inserted the event with status='pending'.
        status = await conn.fetchval(
            "SELECT status FROM agent_events WHERE event_id = $1::UUID",
            event_id,
        )
        assert status == "pending", (
            f"expected status='pending' inside body, got {status!r}"
        )

    # After the context manager exits cleanly, status should be 'success'.
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status, tool_name, agent_name FROM agent_events "
            "WHERE event_id = $1::UUID",
            event_id,
        )
    assert row is not None, "event_id not found after context manager exit"
    assert row["status"] == "success", f"got {row['status']!r}"
    assert row["tool_name"] == "test_create"
    assert row["agent_name"] == "knox"


@pytest.mark.asyncio
async def test_exception_rolls_back_transaction(db_schema):
    """AGENT-02: raising inside the body rolls the whole tx back —
    no agent_events row persists."""
    schema, pool = db_schema

    class Sentinel(RuntimeError):
        pass

    with pytest.raises(Sentinel):
        async with with_agent_tool(
            tool_name="test_rollback",
            entity="fees_raw",
            entity_id=None,
            action="create",
            agent_name="knox",
            reasoning_prompt="p",
            reasoning_output="o",
            input_payload={},
            pool=pool,
        ) as (conn, event_id):
            raise Sentinel("boom")

    async with pool.acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM agent_events WHERE tool_name = $1",
            "test_rollback",
        )
    assert count == 0, f"expected rollback but found {count} events"


@pytest.mark.asyncio
async def test_unknown_agent_raises(db_schema):
    """T-62A05-01: agent_name not in agent_registry raises AgentUnknown."""
    schema, pool = db_schema
    with pytest.raises(AgentUnknown):
        async with with_agent_tool(
            tool_name="test_unknown",
            entity="fees_raw",
            entity_id=None,
            action="create",
            agent_name="admin_override",
            reasoning_prompt="p",
            reasoning_output="o",
            input_payload={},
            pool=pool,
        ) as (conn, event_id):
            pass  # should not reach here


@pytest.mark.asyncio
async def test_inactive_agent_raises(db_schema):
    """agent_registry.is_active=false blocks with AgentUnknown."""
    schema, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE agent_registry SET is_active = FALSE WHERE agent_name = 'darwin'"
        )

    with pytest.raises(AgentUnknown):
        async with with_agent_tool(
            tool_name="test_inactive",
            entity="fees_raw",
            entity_id=None,
            action="create",
            agent_name="darwin",
            reasoning_prompt="p",
            reasoning_output="o",
            input_payload={},
            pool=pool,
        ) as (conn, event_id):
            pass
