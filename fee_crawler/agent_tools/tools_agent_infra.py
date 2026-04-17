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
from fee_crawler.agent_tools.pool import get_pool
from fee_crawler.agent_tools.registry import agent_tool
from fee_crawler.agent_tools.schemas import (
    AgentEventRef,
    InsertAgentMessageInput, InsertAgentMessageOutput,
    UpdateAgentMessageIntentInput, UpdateAgentMessageIntentOutput,
    UpsertAgentRegistryInput, UpsertAgentRegistryOutput,
    UpsertAgentBudgetInput, UpsertAgentBudgetOutput,
    GetReasoningTraceIn, GetReasoningTraceOut,
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
                 (agent_name, budget_window, limit_cents, spent_cents, window_started_at, updated_at)
               VALUES ($1, $2, $3, 0, NOW(), NOW())
               ON CONFLICT (agent_name, budget_window) DO UPDATE SET
                 limit_cents = EXCLUDED.limit_cents,
                 updated_at = NOW()""",
            inp.agent_name, inp.window, inp.limit_cents,
        )
        corr = await _correlation_of(event_id, conn)
    return UpsertAgentBudgetOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# agent_events + agent_messages — read-only reasoning trace (Plan 62B-06)
# ========================================================================
#
# COMMS-05 + D-12 surface: Hamilton and the /admin/agents Replay tab (Plan
# 62B-10) call this tool to answer "why this number?" for a given
# correlation_id. The view v_agent_reasoning_trace (migration 20260507)
# joins agent_events + agent_messages into a flat ordered timeline; this
# tool is a thin SELECT-from-view pass-through with a max_rows clamp.
#
# Registered with action='read' so TOOL_REGISTRY exposes it to read-only
# callers (MCP surface per tools_read.py convention). The underlying
# function carries _bfi_read_only=True (set at module load below) so a
# future MCP wrapper can lift it directly without additional auditing.


@agent_tool(
    name="get_reasoning_trace",
    entity="agent_events",
    action="read",
    input_schema=GetReasoningTraceIn,
    output_schema=GetReasoningTraceOut,
    description=(
        "Phase 62b COMMS-05: return the flat ordered timeline of "
        "agent_events + agent_messages for a given correlation_id. "
        "Read-only; queries v_agent_reasoning_trace."
    ),
)
async def get_reasoning_trace(
    *,
    correlation_id: str,
    max_rows: int = 500,
) -> dict:
    """Query v_agent_reasoning_trace for a correlation_id.

    Returns {"rows": [...]} where each row has keys kind, created_at,
    agent_name, intent_or_action, tool_name, entity, payload, row_id.
    An empty correlation_id short-circuits to {"rows": []} without
    touching the DB.
    """
    if not correlation_id:
        return {"rows": []}

    # Pydantic-validate the input so tests that call the tool directly still
    # benefit from max_rows bounds (ge=1, le=5000). Keyword-call shape keeps
    # the tool Anthropic-SDK-friendly.
    params = GetReasoningTraceIn(
        correlation_id=correlation_id, max_rows=max_rows,
    )

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT kind, created_at, agent_name, intent_or_action,
                      tool_name, entity, payload, row_id
                 FROM v_agent_reasoning_trace
                WHERE correlation_id = $1::UUID
                ORDER BY created_at
                LIMIT $2""",
            params.correlation_id, params.max_rows,
        )
    return {
        "rows": [
            {
                "kind": r["kind"],
                "created_at": (
                    r["created_at"].isoformat() if r["created_at"] else None
                ),
                "agent_name": r["agent_name"],
                "intent_or_action": r["intent_or_action"],
                "tool_name": r["tool_name"],
                "entity": r["entity"],
                "payload": r["payload"],
                "row_id": r["row_id"],
            }
            for r in rows
        ]
    }


# MCP read-surface marker (parallels fee_crawler/agent_mcp/tools_read.py's
# @read_only_tool pattern). The MCP server's startup assertion scans for
# this attribute before exposing a tool externally.
get_reasoning_trace._bfi_read_only = True  # type: ignore[attr-defined]
