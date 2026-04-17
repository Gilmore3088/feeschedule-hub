"""SC5 acceptance: ATLAS_AGENT_BUDGET_KNOX_CENTS=1000 halts Knox with a
budget_halt agent_events row.

ROADMAP.md Phase 62a Success Criterion 5:
  Setting ATLAS_AGENT_BUDGET_KNOX_CENTS=1000 causes Knox to halt its next
  cycle (with an agent_events row of action='budget_halt') the moment spend
  crosses threshold.

Strategy:
  1. Seed 1500 cents of prior Knox spend via direct INSERT into agent_events.
  2. Set the env var to 1000 cents.
  3. Call any knox-scoped tool via the gateway.
  4. Assert BudgetExceeded raised AND a budget_halt row landed.

Defense-in-depth: never import Anthropic or Stripe SDKs in this test; the
gateway check happens in Python without any external network call.
"""

from __future__ import annotations

import os
import uuid

import pytest

import fee_crawler.agent_tools.tools_fees  # noqa: F401 — register knox-callable tools
from fee_crawler.agent_tools import with_agent_context
from fee_crawler.agent_tools.budget import BudgetExceeded
from fee_crawler.agent_tools.tools_fees import create_fee_raw
from fee_crawler.agent_tools.schemas import CreateFeeRawInput


@pytest.mark.asyncio
async def test_sc5_env_var_halts_knox(db_schema, monkeypatch):
    """Set ATLAS_AGENT_BUDGET_KNOX_CENTS=1000, seed 1500 cents of prior spend,
    attempt a knox tool call; expect BudgetExceeded + budget_halt event."""
    schema, pool = db_schema

    # Inject pool singleton so gateway uses our per-test pool.
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool

    try:
        # Seed prior Knox spend (1500 cents across one representative event).
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO agent_events
                     (event_id, agent_name, action, tool_name, entity, status,
                      cost_cents, correlation_id, reasoning_hash)
                   VALUES ($1::UUID, 'knox', 'extract', '_seed', 'fees_raw',
                           'success', 1500, $2::UUID, $3)""",
                str(uuid.uuid4()), str(uuid.uuid4()), b"\x00" * 32,
            )

        # Set the env-var override.
        monkeypatch.setenv("ATLAS_AGENT_BUDGET_KNOX_CENTS", "1000")
        assert os.environ.get("ATLAS_AGENT_BUDGET_KNOX_CENTS") == "1000"

        # Attempt a knox-scoped tool call — gateway check_budget should raise.
        with pytest.raises(BudgetExceeded) as exc_info:
            with with_agent_context(agent_name="knox"):
                await create_fee_raw(
                    inp=CreateFeeRawInput(
                        institution_id=1,
                        fee_name="sc5-smoke",
                    ),
                    agent_name="knox",
                    reasoning_prompt="sc5",
                    reasoning_output="sc5",
                )

        # Exception carries the spent/limit/source diagnostic.
        exc = exc_info.value
        assert exc.agent_name == "knox"
        assert exc.limit == 1000
        assert exc.spent >= 1500
        assert exc.source == "env_override"

        # A budget_halt agent_events row landed.
        async with pool.acquire() as conn:
            halt_count = await conn.fetchval(
                "SELECT COUNT(*) FROM agent_events "
                "WHERE agent_name = 'knox' AND action = 'budget_halt'"
            )
        assert halt_count >= 1, "expected at least one budget_halt row for knox"

        # And agent_budgets was marked halted if a row existed.
        async with pool.acquire() as conn:
            halted_row = await conn.fetchrow(
                "SELECT halted_at, halted_reason FROM agent_budgets "
                "WHERE agent_name = 'knox' LIMIT 1"
            )
        # If the seed migration did not pre-create an agent_budgets row, halted_row
        # is None — that's acceptable; the env_override path doesn't require a
        # pre-existing row. What matters is the budget_halt agent_events row above.
        if halted_row is not None:
            assert halted_row["halted_at"] is not None, (
                "agent_budgets.halted_at must be set when the env-override path halts"
            )
            assert "env_override" in (halted_row["halted_reason"] or ""), (
                f"agent_budgets.halted_reason must mention env_override; "
                f"got {halted_row['halted_reason']!r}"
            )

    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_sc5_env_var_unset_does_not_halt(db_schema, monkeypatch):
    """Control: with the env var UNSET, the same call succeeds (no halt)."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        # Ensure env var is absent.
        monkeypatch.delenv("ATLAS_AGENT_BUDGET_KNOX_CENTS", raising=False)
        with with_agent_context(agent_name="knox"):
            out = await create_fee_raw(
                inp=CreateFeeRawInput(
                    institution_id=1, fee_name="sc5-control"
                ),
                agent_name="knox",
                reasoning_prompt="sc5-ctl",
                reasoning_output="sc5-ctl",
            )
        assert out.success is True
        assert out.fee_raw_id is not None
    finally:
        pool_mod._pool = None
