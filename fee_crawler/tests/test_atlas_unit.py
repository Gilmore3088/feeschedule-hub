"""Atlas orchestrator unit tests — no DB, no LLM."""
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from fee_crawler.agents.atlas import (
    AGENT_NAME,
    DispatchPlan,
    DispatchResult,
    dispatch_state_fleet,
    select_next_states,
)
from fee_crawler.agents.state.orchestrator import StateAgentResult


def test_agent_name_is_stable():
    assert AGENT_NAME == "atlas"


def _build_state_row(state_code, pending, last_extracted_at):
    return {
        "state_code": state_code,
        "pending_count": pending,
        "last_extracted_at": last_extracted_at,
    }


def test_select_next_states_prefers_never_run_then_oldest():
    """never_run states float to the top; among stale, oldest first."""
    now = datetime.now(timezone.utc)
    rows = [
        _build_state_row("CA", 10, now - timedelta(days=1)),    # stale 1d
        _build_state_row("TX", 5, None),                         # never run
        _build_state_row("NY", 8, now - timedelta(days=7)),     # stale 7d
        _build_state_row("FL", 0, None),                         # skip (no pending)
        _build_state_row("WA", 12, now - timedelta(hours=1)),   # fresh
    ]

    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=rows)

    async def run():
        return await select_next_states(conn, limit=3)

    plans = asyncio.run(run())
    assert len(plans) == 3
    assert plans[0].state_code == "TX"          # never_run first
    assert plans[0].reason == "never_run"
    assert plans[1].state_code == "NY"          # 7d old next
    assert plans[2].state_code == "CA"          # 1d old after


def test_select_next_states_skips_states_with_no_pending():
    rows = [
        _build_state_row("CA", 0, None),
        _build_state_row("TX", 0, None),
    ]
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=rows)

    plans = asyncio.run(select_next_states(conn, limit=5))
    assert plans == []


def test_select_next_states_respects_only_states_filter():
    """only_states should restrict the candidate set passed to SQL."""
    captured: dict = {}

    async def fake_fetch(_sql, params):
        captured["params"] = params
        return []

    conn = AsyncMock()
    conn.fetch = fake_fetch  # use plain async fn so params arg flows through

    asyncio.run(select_next_states(conn, limit=2, only_states={"TX", "CA"}))
    # SQL receives a deduped list of state codes (order from list_state_codes order)
    assert set(captured["params"]) == {"TX", "CA"}


def test_dispatch_state_fleet_runs_each_planned_state():
    """Atlas runs run_state_agent for every plan returned by selection."""
    fake_plans = [
        DispatchPlan(state_code="TX", reason="never_run", pending_institution_count=10),
        DispatchPlan(state_code="CA", reason="stale", pending_institution_count=5,
                     last_extracted_at=datetime.now(timezone.utc) - timedelta(days=2)),
    ]
    runs_invoked: list[str] = []

    async def fake_run_state(conn, state_code, size=100, **_):
        runs_invoked.append(state_code)
        return StateAgentResult(
            state_code=state_code,
            agent_name=f"state_{state_code.lower()}",
            processed=1, extracted=1, fees_written=4, cost_usd=0.04,
        )

    async def run():
        with patch(
            "fee_crawler.agents.atlas.orchestrator.select_next_states",
            new=AsyncMock(return_value=fake_plans),
        ), patch(
            "fee_crawler.agents.atlas.orchestrator.run_state_agent",
            new=fake_run_state,
        ), patch(
            "fee_crawler.agents.atlas.orchestrator._was_run_today",
            new=AsyncMock(return_value=False),
        ), patch(
            "fee_crawler.agents.atlas.orchestrator._mark_run",
            new=AsyncMock(return_value=None),
        ):
            return await dispatch_state_fleet(AsyncMock(), states_per_tick=2)

    result = asyncio.run(run())
    assert runs_invoked == ["TX", "CA"]
    assert len(result.runs) == 2
    assert all(r.fees_written == 4 for r in result.runs)


def test_dispatch_skips_states_marked_recent():
    """workers_last_run guard prevents same-day double-dispatch."""
    fake_plans = [
        DispatchPlan(state_code="TX", reason="never_run", pending_institution_count=10),
    ]

    async def fake_run_state(conn, state_code, size=100, **_):
        raise AssertionError("should not run TX — marker says it ran today")

    async def run():
        with patch(
            "fee_crawler.agents.atlas.orchestrator.select_next_states",
            new=AsyncMock(return_value=fake_plans),
        ), patch(
            "fee_crawler.agents.atlas.orchestrator.run_state_agent",
            new=fake_run_state,
        ), patch(
            "fee_crawler.agents.atlas.orchestrator._was_run_today",
            new=AsyncMock(return_value=True),
        ):
            return await dispatch_state_fleet(AsyncMock(), states_per_tick=1)

    result = asyncio.run(run())
    assert result.skipped_recent == ["TX"]
    assert result.runs == []


def test_dispatch_continues_when_one_state_raises():
    """One state's exception must not block the rest of the tick."""
    fake_plans = [
        DispatchPlan(state_code="TX", reason="never_run", pending_institution_count=5),
        DispatchPlan(state_code="CA", reason="stale", pending_institution_count=5,
                     last_extracted_at=datetime.now(timezone.utc) - timedelta(days=1)),
    ]
    invoked: list[str] = []

    async def fake_run_state(conn, state_code, size=100, **_):
        invoked.append(state_code)
        if state_code == "TX":
            raise RuntimeError("TX explodes")
        return StateAgentResult(
            state_code=state_code, agent_name=f"state_{state_code.lower()}",
            processed=1, extracted=1, fees_written=4, cost_usd=0.04,
        )

    async def run():
        with patch(
            "fee_crawler.agents.atlas.orchestrator.select_next_states",
            new=AsyncMock(return_value=fake_plans),
        ), patch(
            "fee_crawler.agents.atlas.orchestrator.run_state_agent",
            new=fake_run_state,
        ), patch(
            "fee_crawler.agents.atlas.orchestrator._was_run_today",
            new=AsyncMock(return_value=False),
        ), patch(
            "fee_crawler.agents.atlas.orchestrator._mark_run",
            new=AsyncMock(return_value=None),
        ):
            return await dispatch_state_fleet(AsyncMock(), states_per_tick=2)

    result = asyncio.run(run())
    assert invoked == ["TX", "CA"]    # both attempted
    assert len(result.runs) == 1      # only CA succeeded
    assert result.runs[0].state_code == "CA"


def test_dispatch_result_to_dict_is_serializable():
    import json
    r = DispatchResult(
        plans=[DispatchPlan(state_code="TX", reason="never_run", pending_institution_count=3)],
        runs=[StateAgentResult(state_code="TX", agent_name="state_tx",
                               processed=1, extracted=1, fees_written=2, cost_usd=0.04)],
        skipped_recent=["CA"],
        duration_s=1.23,
    )
    # to_dict must produce a dict that survives json.dumps cleanly
    json.dumps(r.to_dict(), default=str)  # default=str handles datetime
