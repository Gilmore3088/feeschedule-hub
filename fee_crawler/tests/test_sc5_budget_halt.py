"""SC5: ATLAS_AGENT_BUDGET_KNOX_CENTS=1 halts Knox with budget_halt event."""
from __future__ import annotations

import pytest

from fee_crawler.agent_tools.budget import BudgetExceeded
from fee_crawler.agent_tools.context import with_agent_context
from fee_crawler.agent_tools.gateway import with_agent_tool


@pytest.mark.asyncio
async def test_sc5_env_var_halts_knox(db_schema, monkeypatch):
    """SC5: env var override set to a low limit causes the next gateway call
    to insert a budget_halt agent_events row AND raise BudgetExceeded.

    Exercises the env_override branch of budget.check_budget: we pre-seed a
    'success' agent_events row with cost_cents=100 so spent > limit(=1)
    immediately, then attempt a real gateway call and expect the halt."""
    schema, pool = db_schema

    # Seed a prior successful event so spent_cents = 100 for knox.
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status, cost_cents)
               VALUES ('knox', 'create', 'seed', 'fees_raw', 'success', 100)"""
        )

    # Force env-var budget to 1 cent → next call will halt.
    monkeypatch.setenv("ATLAS_AGENT_BUDGET_KNOX_CENTS", "1")

    with pytest.raises(BudgetExceeded) as excinfo:
        async with with_agent_tool(
            tool_name="test_budget",
            entity="fees_raw",
            entity_id=None,
            action="create",
            agent_name="knox",
            reasoning_prompt="p",
            reasoning_output="o",
            input_payload={},
            projected_cost_cents=0,
            pool=pool,
        ) as (conn, event_id):
            # Should not be reached.
            pytest.fail("gateway body executed despite budget halt")

    # The exception carries the metadata.
    assert excinfo.value.agent_name == "knox"
    assert excinfo.value.source == "env_override"
    assert excinfo.value.limit == 1
    assert excinfo.value.spent >= 100

    # A budget_halt agent_events row should have landed in the same tx.
    async with pool.acquire() as conn:
        halt_count = await conn.fetchval(
            "SELECT COUNT(*) FROM agent_events "
            "WHERE action = 'budget_halt' AND agent_name = 'knox'"
        )
        halted = await conn.fetchrow(
            "SELECT halted_at, halted_reason FROM agent_budgets "
            "WHERE agent_name = 'knox' AND halted_at IS NOT NULL "
            "LIMIT 1"
        )
    assert halt_count >= 1, "expected at least one budget_halt event"
    assert halted is not None, "agent_budgets.halted_at should be set after halt"
    assert "env_override" in (halted["halted_reason"] or "")
