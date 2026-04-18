"""Schema probes for agent_events — migrations plan 62A-02 delivers."""
import pytest

REQUIRED_COLUMNS = {
    "event_id", "created_at", "agent_name", "action", "tool_name",
    "entity", "entity_id", "status", "cost_cents", "confidence",
    "parent_event_id", "correlation_id", "reasoning_hash",
    "input_payload", "output_payload", "source_refs", "error",
}


@pytest.mark.asyncio
async def test_agent_events_has_required_columns(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'agent_events'"
        )
    present = {r["column_name"] for r in rows}
    missing = REQUIRED_COLUMNS - present
    assert not missing, f"agent_events missing columns: {missing}"


@pytest.mark.asyncio
async def test_agent_events_is_partitioned(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT partstrat FROM pg_partitioned_table pt "
            "JOIN pg_class c ON pt.partrelid = c.oid "
            "WHERE c.relname = 'agent_events'"
        )
    assert row is not None, "agent_events must be partitioned"
    # partstrat is a Postgres "char" column; asyncpg returns it as bytes.
    partstrat = row["partstrat"]
    if isinstance(partstrat, bytes):
        partstrat = partstrat.decode()
    assert partstrat == "r", "expected RANGE partitioning"


@pytest.mark.asyncio
async def test_agent_events_has_required_indexes(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT indexdef FROM pg_indexes WHERE tablename = 'agent_events'"
        )
    indexdefs = " ".join(r["indexdef"] for r in rows)
    assert "agent_name" in indexdefs and "created_at" in indexdefs
    assert "correlation_id" in indexdefs
    assert "parent_event_id" in indexdefs
