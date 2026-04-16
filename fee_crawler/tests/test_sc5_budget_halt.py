"""SC5: ATLAS_AGENT_BUDGET_KNOX_CENTS=1000 halts Knox with budget_halt event."""
import pytest


@pytest.mark.asyncio
async def test_sc5_env_var_halts_knox(db_schema, monkeypatch):
    pytest.xfail("SC5 end-to-end — plan 62A-13")
