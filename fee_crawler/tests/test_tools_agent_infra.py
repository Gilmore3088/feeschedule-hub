"""Integration tests for Plan 62A-10 agent-infra tools."""

from __future__ import annotations

import uuid

import pytest

from fee_crawler.agent_tools import with_agent_context
from fee_crawler.agent_tools.tools_agent_infra import (
    insert_agent_message,
    update_agent_message_intent,
    upsert_agent_registry,
    upsert_agent_budget,
)
from fee_crawler.agent_tools.schemas import (
    InsertAgentMessageInput,
    UpdateAgentMessageIntentInput,
    UpsertAgentRegistryInput,
    UpsertAgentBudgetInput,
)


@pytest.mark.asyncio
async def test_agent_message_state_transition_audited(db_schema):
    """insert_agent_message -> update_agent_message_intent captures before/after state."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        corr_id = str(uuid.uuid4())
        with with_agent_context(agent_name="darwin"):
            out = await insert_agent_message(
                inp=InsertAgentMessageInput(
                    recipient_agent="knox",
                    intent="challenge",
                    correlation_id=corr_id,
                    payload={"fee_id": 42},
                ),
                agent_name="darwin",
                reasoning_prompt="challenge knox",
                reasoning_output="why $35 overdraft?",
            )
            message_id = out.message_id
            assert message_id is not None

            # Transition state open -> resolved.
            await update_agent_message_intent(
                inp=UpdateAgentMessageIntentInput(
                    message_id=message_id,
                    state="resolved",
                ),
                agent_name="darwin",
                reasoning_prompt="knox proved it",
                reasoning_output="accept",
            )

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT before_value, after_value
                     FROM agent_auth_log
                    WHERE tool_name = 'update_agent_message_intent'
                      AND entity_id = $1""",
                message_id,
            )
            assert row is not None
            before = row["before_value"] or {}
            after = row["after_value"] or {}
            assert before.get("state") == "open", f"before_value.state={before.get('state')}"
            assert after.get("state") == "resolved", f"after_value.state={after.get('state')}"
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_upsert_agent_budget_idempotent(db_schema):
    """Same (agent_name, window) upserted twice yields one row; limit_cents updated."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        with with_agent_context(agent_name="atlas"):
            await upsert_agent_budget(
                inp=UpsertAgentBudgetInput(
                    agent_name="knox",
                    window="per_cycle",
                    limit_cents=50000,
                ),
                agent_name="atlas",
                reasoning_prompt="set budget", reasoning_output="50000",
            )
            await upsert_agent_budget(
                inp=UpsertAgentBudgetInput(
                    agent_name="knox",
                    window="per_cycle",
                    limit_cents=75000,
                ),
                agent_name="atlas",
                reasoning_prompt="raise budget", reasoning_output="75000",
            )

        async with pool.acquire() as conn:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM agent_budgets "
                "WHERE agent_name='knox' AND window='per_cycle'"
            )
            assert count == 1, f"expected 1 row after upserts, got {count}"
            limit = await conn.fetchval(
                "SELECT limit_cents FROM agent_budgets "
                "WHERE agent_name='knox' AND window='per_cycle'"
            )
            assert limit == 75000, f"expected limit_cents=75000, got {limit}"
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_upsert_agent_budget_atlas_only(db_schema):
    """Non-Atlas caller is rejected with PermissionError."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        with pytest.raises(PermissionError):
            with with_agent_context(agent_name="knox"):
                await upsert_agent_budget(
                    inp=UpsertAgentBudgetInput(
                        agent_name="knox", window="per_day", limit_cents=10000,
                    ),
                    agent_name="knox",
                    reasoning_prompt="self-raise", reasoning_output="bad",
                )
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_upsert_agent_budget_does_not_touch_spent_cents(db_schema):
    """limit_cents upsert leaves spent_cents unchanged."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        with with_agent_context(agent_name="atlas"):
            await upsert_agent_budget(
                inp=UpsertAgentBudgetInput(
                    agent_name="darwin", window="per_batch", limit_cents=10000,
                ),
                agent_name="atlas",
                reasoning_prompt="init", reasoning_output="10000",
            )

        # Simulate gateway accounting: manually bump spent_cents.
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE agent_budgets SET spent_cents = 2500 "
                "WHERE agent_name = 'darwin' AND window = 'per_batch'"
            )

        with with_agent_context(agent_name="atlas"):
            await upsert_agent_budget(
                inp=UpsertAgentBudgetInput(
                    agent_name="darwin", window="per_batch", limit_cents=20000,
                ),
                agent_name="atlas",
                reasoning_prompt="raise cap", reasoning_output="20000",
            )

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT limit_cents, spent_cents FROM agent_budgets "
                "WHERE agent_name='darwin' AND window='per_batch'"
            )
            assert row["limit_cents"] == 20000
            assert row["spent_cents"] == 2500, (
                f"spent_cents must not be clobbered by limit upsert; got {row['spent_cents']}"
            )
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_upsert_agent_registry_rejects_bad_name(db_schema):
    """agent_name pattern is enforced by Pydantic — 'root' is rejected."""
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        UpsertAgentRegistryInput(
            agent_name="root",
            display_name="Root", role="supervisor",
        )
