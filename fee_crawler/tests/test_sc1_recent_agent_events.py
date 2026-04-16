"""SC1: SELECT COUNT(*) FROM agent_events WHERE agent_name='knox' AND recent — sub-second."""
import pytest


@pytest.mark.asyncio
async def test_sc1_recent_query_uses_partition_pruning(db_schema):
    pytest.xfail("SC1 end-to-end — plan 62A-13 delivers acceptance")
