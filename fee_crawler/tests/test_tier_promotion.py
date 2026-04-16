"""Promotion SQL functions — plan 62A-06."""
import pytest


@pytest.mark.asyncio
async def test_promote_to_tier2_function_exists(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT proname FROM pg_proc WHERE proname = 'promote_to_tier2'")
    assert row is not None, "promote_to_tier2 SQL function must exist"


@pytest.mark.asyncio
async def test_promote_to_tier3_function_exists(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT proname FROM pg_proc WHERE proname = 'promote_to_tier3'")
    assert row is not None, "promote_to_tier3 SQL function stub must exist"


@pytest.mark.asyncio
async def test_darwin_only(db_schema):
    pytest.xfail("promotion identity check — delivered by plan 62A-06")


@pytest.mark.asyncio
async def test_adversarial_gate_exists(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT to_regclass('agent_messages') AS t")
    assert row["t"] is not None, "agent_messages table must exist (empty in 62a)"
