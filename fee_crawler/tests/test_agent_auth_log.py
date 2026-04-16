"""agent_auth_log row per tool call with before/after/reasoning_hash."""
from __future__ import annotations

import json

import pytest

from fee_crawler.agent_tools.gateway import with_agent_tool


@pytest.mark.asyncio
async def test_auth_log_captures_before_and_after(db_schema):
    """AGENT-04: gateway captures before_value + after_value for UPDATE action
    and writes one agent_auth_log row per call inside the same transaction."""
    schema, pool = db_schema

    # Seed a fees_raw row so we have something to UPDATE.
    async with pool.acquire() as conn:
        fee_raw_id = await conn.fetchval(
            """INSERT INTO fees_raw
                 (institution_id, agent_event_id, fee_name, amount)
               VALUES
                 (1, '00000000-0000-0000-0000-000000000000'::UUID, 'overdraft', 35.00)
               RETURNING fee_raw_id"""
        )

    async with with_agent_tool(
        tool_name="update_fee_amount",
        entity="fees_raw",
        entity_id=fee_raw_id,
        action="update",
        agent_name="darwin",
        reasoning_prompt="prompt",
        reasoning_output="output",
        input_payload={"amount": 99.00},
        pk_column="fee_raw_id",
        pool=pool,
    ) as (conn, event_id):
        await conn.execute(
            "UPDATE fees_raw SET amount = $1 WHERE fee_raw_id = $2",
            99.00, fee_raw_id,
        )

    # Verify agent_auth_log row captures before/after/reasoning_hash.
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT agent_event_id, agent_name, actor_type, tool_name,
                      entity, entity_id, before_value, after_value,
                      reasoning_hash
                 FROM agent_auth_log
                WHERE agent_event_id = $1::UUID""",
            event_id,
        )
    assert row is not None, "no agent_auth_log row for this event"
    assert row["agent_name"] == "darwin"
    assert row["actor_type"] == "agent"
    assert row["tool_name"] == "update_fee_amount"
    assert row["entity"] == "fees_raw"
    assert row["entity_id"] == str(fee_raw_id)
    assert row["reasoning_hash"] is not None
    assert len(row["reasoning_hash"]) == 32, "reasoning_hash must be 32 bytes"

    # before/after may come back as str (if codec missing) or dict.
    before = row["before_value"]
    after = row["after_value"]
    if isinstance(before, str):
        before = json.loads(before)
    if isinstance(after, str):
        after = json.loads(after)
    assert before is not None, "before_value should capture pre-update state"
    assert after is not None, "after_value should capture post-update state"
    assert float(before["amount"]) == 35.00
    assert float(after["amount"]) == 99.00
    assert before["amount"] != after["amount"]


@pytest.mark.asyncio
async def test_auth_log_has_required_columns(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'agent_auth_log'")
    present = {r["column_name"] for r in rows}
    required = {
        "auth_id", "created_at", "agent_event_id", "agent_name",
        "actor_type", "actor_id", "tool_name", "entity", "entity_id",
        "before_value", "after_value", "reasoning_hash", "parent_event_id",
    }
    assert required - present == set(), f"agent_auth_log missing: {required - present}"
