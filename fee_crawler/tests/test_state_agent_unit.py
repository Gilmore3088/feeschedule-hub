"""State agent unit tests — no DB, no LLM. Mocks extract_batch."""
import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from fee_crawler.agents.state import (
    STATE_AGENT_PREFIX,
    list_state_codes,
    run_state_agent,
    state_agent_name,
)
from fee_crawler.agents.state.orchestrator import StateAgentResult


def test_list_state_codes_has_51_entries():
    codes = list_state_codes()
    assert len(codes) == 51
    assert "DC" in codes
    assert "TX" in codes
    assert "ZZ" not in codes


def test_state_agent_name_lowercases_and_prefixes():
    assert state_agent_name("TX") == "state_tx"
    assert state_agent_name("tx") == "state_tx"
    assert state_agent_name("DC") == "state_dc"
    assert state_agent_name("ca") == "state_ca"


def test_state_agent_name_rejects_unknown():
    with pytest.raises(ValueError, match="unknown state code"):
        state_agent_name("ZZ")
    with pytest.raises(ValueError):
        state_agent_name("")


def test_prefix_is_stable():
    assert STATE_AGENT_PREFIX == "state_"


def _fake_batch_result(**kw):
    """Build a minimal BatchResult-compatible object for mocking."""
    class _B:
        processed = kw.get("processed", 1)
        extracted = kw.get("extracted", 1)
        fees_written = kw.get("fees_written", 5)
        unchanged = kw.get("unchanged", 0)
        failed = kw.get("failed", 0)
        cost_usd = kw.get("cost_usd", 0.04)
        duration_s = kw.get("duration_s", 1.2)
    return _B()


def test_run_state_agent_passes_state_code_and_agent_name():
    captured: dict = {}

    async def fake_extract_batch(conn, size, *, config, state_code=None, agent_name=None, **_):
        captured["state_code"] = state_code
        captured["agent_name"] = agent_name
        captured["size"] = size
        return _fake_batch_result(extracted=3, fees_written=12, cost_usd=0.12)

    async def run():
        with patch(
            "fee_crawler.agents.state.orchestrator.extract_batch",
            new=fake_extract_batch,
        ):
            return await run_state_agent(AsyncMock(), "TX", size=50)

    res = asyncio.run(run())
    assert captured["state_code"] == "TX"
    assert captured["agent_name"] == "state_tx"
    assert captured["size"] == 50
    assert isinstance(res, StateAgentResult)
    assert res.state_code == "TX"
    assert res.agent_name == "state_tx"
    assert res.fees_written == 12
    assert res.cost_usd == 0.12


def test_run_state_agent_normalizes_case():
    """`run_state_agent('ca')` must hit agent_name='state_ca' (lowercase)."""
    captured: dict = {}

    async def fake_extract_batch(conn, size, *, config, state_code=None, agent_name=None, **_):
        captured["state_code"] = state_code
        captured["agent_name"] = agent_name
        return _fake_batch_result()

    async def run():
        with patch(
            "fee_crawler.agents.state.orchestrator.extract_batch",
            new=fake_extract_batch,
        ):
            return await run_state_agent(AsyncMock(), "ca")

    asyncio.run(run())
    assert captured["state_code"] == "CA"
    assert captured["agent_name"] == "state_ca"
