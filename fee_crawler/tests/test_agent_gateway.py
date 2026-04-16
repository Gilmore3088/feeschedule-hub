"""Gateway contract: every tool call writes exactly one agent_events row before target write."""
import pytest


@pytest.mark.asyncio
async def test_tool_writes_event_before_target(db_schema):
    pytest.xfail("gateway.with_agent_tool — delivered by plan 62A-05")
