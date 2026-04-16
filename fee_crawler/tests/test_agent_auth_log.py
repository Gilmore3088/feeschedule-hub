"""agent_auth_log row per tool call with before/after/reasoning_hash."""
import pytest


@pytest.mark.asyncio
async def test_auth_log_captures_before_and_after(db_schema):
    pytest.xfail("gateway writes auth_log — delivered by plan 62A-05")


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
