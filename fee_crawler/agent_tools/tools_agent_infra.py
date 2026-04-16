"""Agent-infra CRUD tools (Plan 62A-10, Group B).

Covers agent_messages, agent_registry, agent_budgets.
Plan 62A-07 already covers fee_change_events (create_fee_change_event) and roomba_log
(create_roomba_log); this module does NOT redefine them — registry name-collision would raise.

After this module + tools_peer_research load, entities_covered() is a superset of the
33-entity contract (32 tool-target entities; agent_events + agent_auth_log are
gateway-auto-written only and not counted as tool targets).
"""

from __future__ import annotations

from typing import Optional

from fee_crawler.agent_tools.gateway import with_agent_tool
from fee_crawler.agent_tools.registry import agent_tool
from fee_crawler.agent_tools.schemas import (
    AgentEventRef,
    InsertAgentMessageInput, InsertAgentMessageOutput,
    UpdateAgentMessageIntentInput, UpdateAgentMessageIntentOutput,
    UpsertAgentRegistryInput, UpsertAgentRegistryOutput,
    UpsertAgentBudgetInput, UpsertAgentBudgetOutput,
)


async def _correlation_of(event_id: str, conn) -> str:
    row = await conn.fetchrow(
        "SELECT correlation_id::TEXT AS c FROM agent_events WHERE event_id = $1::UUID",
        event_id,
    )
    return row["c"] if row else ""


# ========================================================================
# agent_messages — 62a ships tools; 62b wires protocol
# ========================================================================

@agent_tool(
    name="insert_agent_message",
    entity="agent_messages", action="create",
    input_schema=InsertAgentMessageInput,
    output_schema=InsertAgentMessageOutput,
    description="Insert an inter-agent message (sender derived from agent_name header). Default state='open'.",
)
async def insert_agent_message(
    *, inp: InsertAgentMessageInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> InsertAgentMessageOutput:
    async with with_agent_tool(
        tool_name="insert_agent_message", entity="agent_messages",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="message_id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO agent_messages
                 (sender_agent, recipient_agent, intent, state,
                  correlation_id, parent_message_id, parent_event_id,
                  payload, round_number, expires_at)
               VALUES ($1, $2, $3, 'open',
                       $4::UUID, $5::UUID, $6::UUID,
                       $7::JSONB, $8, $9::TIMESTAMPTZ)
               RETURNING message_id::TEXT""",
            agent_name, inp.recipient_agent, inp.intent,
            inp.correlation_id,
            inp.parent_message_id, inp.parent_event_id,
            inp.payload, inp.round_number, inp.expires_at,
        )
        corr = await _correlation_of(event_id, conn)
    return InsertAgentMessageOutput(
        success=True, message_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_agent_message_intent",
    entity="agent_messages", action="update",
    input_schema=UpdateAgentMessageIntentInput,
    output_schema=UpdateAgentMessageIntentOutput,
    description="Transition agent_messages.state: open -> answered | resolved | escalated | expired.",
)
async def update_agent_message_intent(
    *, inp: UpdateAgentMessageIntentInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateAgentMessageIntentOutput:
    async with with_agent_tool(
        tool_name="update_agent_message_intent", entity="agent_messages",
        entity_id=inp.message_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="message_id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            """UPDATE agent_messages
                  SET state = $2,
                      resolved_at = CASE WHEN $2 IN ('resolved','escalated','expired')
                                         THEN NOW() ELSE resolved_at END,
                      resolved_by_event_id = COALESCE($3::UUID, resolved_by_event_id)
                WHERE message_id = $1::UUID""",
            inp.message_id, inp.state, inp.resolved_by_event_id,
        )
        corr = await _correlation_of(event_id, conn)
    return UpdateAgentMessageIntentOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# agent_registry — Atlas-only upsert
# ========================================================================

@agent_tool(
    name="upsert_agent_registry",
    entity="agent_registry", action="upsert",
    input_schema=UpsertAgentRegistryInput,
    output_schema=UpsertAgentRegistryOutput,
    description="Atlas: register or update an agent in the hierarchy (51 state agents seeded at bootstrap).",
)
async def upsert_agent_registry(
    *, inp: UpsertAgentRegistryInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpsertAgentRegistryOutput:
    if agent_name != "atlas":
        raise PermissionError(
            f"upsert_agent_registry is Atlas-only; agent_name={agent_name!r}"
        )
    async with with_agent_tool(
        tool_name="upsert_agent_registry", entity="agent_registry",
        entity_id=inp.agent_name, action="upsert", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="agent_name",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            """INSERT INTO agent_registry
                 (agent_name, display_name, role, parent_agent, state_code, is_active)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (agent_name) DO UPDATE SET
                 display_name = EXCLUDED.display_name,
                 role = EXCLUDED.role,
                 parent_agent = EXCLUDED.parent_agent,
                 state_code = EXCLUDED.state_code,
                 is_active = EXCLUDED.is_active""",
            inp.agent_name, inp.display_name, inp.role,
            inp.parent_agent, inp.state_code, inp.is_active,
        )
        corr = await _correlation_of(event_id, conn)
    return UpsertAgentRegistryOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# agent_budgets — Atlas-only upsert of limit_cents (spent_cents is gateway-only)
# ========================================================================

@agent_tool(
    name="upsert_agent_budget",
    entity="agent_budgets", action="upsert",
    input_schema=UpsertAgentBudgetInput,
    output_schema=UpsertAgentBudgetOutput,
    description="Atlas: set or update limit_cents for (agent_name, window); spent_cents is gateway-managed.",
)
async def upsert_agent_budget(
    *, inp: UpsertAgentBudgetInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpsertAgentBudgetOutput:
    if agent_name != "atlas":
        raise PermissionError(
            f"upsert_agent_budget is Atlas-only; agent_name={agent_name!r}"
        )
    async with with_agent_tool(
        tool_name="upsert_agent_budget", entity="agent_budgets",
        entity_id=f"{inp.agent_name}:{inp.window}",
        action="upsert", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(),
        pk_column="agent_name",  # compound PK; snapshot uses agent_name only (approximation)
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            """INSERT INTO agent_budgets
                 (agent_name, window, limit_cents, spent_cents, window_started_at, updated_at)
               VALUES ($1, $2, $3, 0, NOW(), NOW())
               ON CONFLICT (agent_name, window) DO UPDATE SET
                 limit_cents = EXCLUDED.limit_cents,
                 updated_at = NOW()""",
            inp.agent_name, inp.window, inp.limit_cents,
        )
        corr = await _correlation_of(event_id, conn)
    return UpsertAgentBudgetOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )
