"""SC1 sub-second query at 10K-row volume (scaled down for CI)."""
import pytest
import time


@pytest.mark.asyncio
@pytest.mark.slow
async def test_recent_hour_query_sub_second(db_schema):
    pytest.xfail("perf test — plan 62A-02 delivers partition + index, plan 62A-13 seeds data")
