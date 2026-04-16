"""Integration tests for Plan 62A-09 Hamilton-domain tools."""

from __future__ import annotations

import pytest

from fee_crawler.agent_tools import with_agent_context
from fee_crawler.agent_tools.tools_hamilton import (
    create_hamilton_conversation,
    create_hamilton_message,
    create_hamilton_scenario,
    delete_hamilton_scenario,
    update_hamilton_scenario,
    create_report_job,
    cancel_report_job,
)
from fee_crawler.agent_tools.schemas import (
    CreateHamiltonConversationInput,
    CreateHamiltonMessageInput,
    CreateHamiltonScenarioInput,
    DeleteHamiltonScenarioInput,
    UpdateHamiltonScenarioInput,
    CreateReportJobInput,
    CancelReportJobInput,
)


@pytest.mark.asyncio
async def test_hamilton_message_requires_existing_conversation(db_schema):
    """FK discipline: create_hamilton_message with a bogus conversation_id fails."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        # Bogus UUID that definitely isn't a hamilton_conversations row.
        with pytest.raises(Exception) as exc:
            with with_agent_context(agent_name="hamilton"):
                await create_hamilton_message(
                    inp=CreateHamiltonMessageInput(
                        conversation_id="00000000-0000-0000-0000-000000000000",
                        user_id="user_test_1",
                        role="user",
                        content="hello",
                    ),
                    agent_name="hamilton",
                    reasoning_prompt="p", reasoning_output="o",
                )
        msg = str(exc.value).lower()
        assert "foreign key" in msg or "violates" in msg, f"expected FK violation, got: {msg}"
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_hamilton_message_succeeds_when_conversation_exists(db_schema):
    """Happy path: create conversation -> create message -> FK holds."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        with with_agent_context(agent_name="hamilton"):
            conv = await create_hamilton_conversation(
                inp=CreateHamiltonConversationInput(
                    user_id="user_test_1", title="My session",
                ),
                agent_name="hamilton",
                reasoning_prompt="p", reasoning_output="o",
            )
            assert conv.success is True and conv.conversation_id

            msg = await create_hamilton_message(
                inp=CreateHamiltonMessageInput(
                    conversation_id=conv.conversation_id,
                    user_id="user_test_1",
                    role="user",
                    content="first turn",
                ),
                agent_name="hamilton",
                reasoning_prompt="p", reasoning_output="o",
            )
        assert msg.success is True
        assert msg.message_id is not None
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_cancel_report_job_records_before_after(db_schema):
    """Gateway action='update' path captures before_value.status='pending' -> after.status='cancelled'."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        with with_agent_context(agent_name="hamilton"):
            created = await create_report_job(
                inp=CreateReportJobInput(
                    user_id="user_test_2",
                    report_type="fee_benchmark",
                    params={"institutions": [1, 2, 3]},
                ),
                agent_name="hamilton",
                reasoning_prompt="p", reasoning_output="o",
            )
            assert created.success is True
            job_id = created.job_id
            assert job_id is not None

            await cancel_report_job(
                inp=CancelReportJobInput(job_id=job_id, reason="operator-cancel"),
                agent_name="hamilton",
                reasoning_prompt="operator requested cancel",
                reasoning_output="cancelled",
            )

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT before_value, after_value
                     FROM agent_auth_log
                    WHERE tool_name = 'cancel_report_job'
                      AND entity_id = $1""",
                job_id,
            )
        assert row is not None, "expected agent_auth_log row for cancel_report_job"
        before = row["before_value"] or {}
        after = row["after_value"] or {}
        # The db_schema fixture's agent_auth_log rows store JSONB as dict via codec.
        assert before.get("status") == "pending", f"before_value.status={before.get('status')}"
        assert after.get("status") == "cancelled", f"after_value.status={after.get('status')}"
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_delete_scenario_rejects_cross_user(db_schema):
    """Ownership guard: user B cannot delete user A's scenario."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        with with_agent_context(agent_name="hamilton"):
            created = await create_hamilton_scenario(
                inp=CreateHamiltonScenarioInput(
                    user_id="user_A",
                    institution_id=1,
                    name="A's scenario",
                ),
                agent_name="hamilton",
                reasoning_prompt="p", reasoning_output="o",
            )
            scenario_id = created.scenario_id
            assert scenario_id is not None

            # Cross-user delete MUST raise PermissionError.
            with pytest.raises(PermissionError):
                with with_agent_context(agent_name="hamilton"):
                    await delete_hamilton_scenario(
                        inp=DeleteHamiltonScenarioInput(
                            scenario_id=scenario_id, user_id="user_B",
                        ),
                        agent_name="hamilton",
                        reasoning_prompt="p", reasoning_output="o",
                    )

            # Scenario still exists (the transaction rolled back).
            async with pool.acquire() as conn:
                still_there = await conn.fetchval(
                    "SELECT COUNT(*) FROM hamilton_scenarios WHERE id = $1::UUID",
                    scenario_id,
                )
            assert still_there == 1, "scenario must survive cross-user delete attempt"
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_hamilton_registry_covers_eleven_entities():
    import fee_crawler.agent_tools.tools_hamilton  # noqa: F401
    from fee_crawler.agent_tools.registry import entities_covered
    covered = entities_covered()
    required = {
        "hamilton_watchlists", "hamilton_saved_analyses", "hamilton_scenarios",
        "hamilton_reports", "hamilton_signals", "hamilton_priority_alerts",
        "hamilton_conversations", "hamilton_messages",
        "published_reports", "report_jobs", "articles",
    }
    missing = required - covered
    assert not missing, f"missing entities: {missing}"


# Unused import guard (silences linter; these are referenced only inside imports above)
_ = update_hamilton_scenario
