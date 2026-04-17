"""Pydantic v2 schemas for agent-infra tools (Plan 62A-10, Group B).

Owned by tools_agent_infra.py. Re-exported through
fee_crawler/agent_tools/schemas/__init__.py so callers continue using
`from fee_crawler.agent_tools.schemas import <ClassName>`.
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field

from fee_crawler.agent_tools.schemas._base import (
    AgentEventRef,
    BaseToolInput,
    BaseToolOutput,
)


_AGENT_NAME_PATTERN = r"^(hamilton|knox|darwin|atlas|state_[a-z]{2})$"


# --- agent_messages (empty table in 62a; tools ship; 62b wires protocol) ---

class InsertAgentMessageInput(BaseToolInput):
    recipient_agent: str = Field(min_length=1, max_length=32)
    intent: Literal[
        "challenge", "prove", "accept", "reject", "escalate",
        "coverage_request", "clarify",
    ]
    correlation_id: str = Field(min_length=1)
    parent_message_id: Optional[str] = None
    parent_event_id: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    round_number: int = Field(default=1, ge=1)
    expires_at: Optional[str] = None


class InsertAgentMessageOutput(BaseToolOutput):
    message_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateAgentMessageIntentInput(BaseToolInput):
    message_id: str = Field(min_length=1)
    state: Literal["answered", "resolved", "escalated", "expired"]
    resolved_by_event_id: Optional[str] = None


class UpdateAgentMessageIntentOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- agent_registry (Atlas seeds state agents) ---

class UpsertAgentRegistryInput(BaseToolInput):
    agent_name: str = Field(pattern=_AGENT_NAME_PATTERN, max_length=32)
    display_name: str = Field(min_length=1, max_length=120)
    role: Literal["supervisor", "data", "classifier", "orchestrator", "analyst", "state_agent"]
    parent_agent: Optional[str] = Field(default=None, pattern=_AGENT_NAME_PATTERN, max_length=32)
    state_code: Optional[str] = Field(default=None, pattern=r"^[A-Z]{2}$")
    is_active: bool = True


class UpsertAgentRegistryOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- agent_budgets (Atlas-managed operator-facing limit writes) ---

class UpsertAgentBudgetInput(BaseToolInput):
    agent_name: str = Field(pattern=_AGENT_NAME_PATTERN, max_length=32)
    window: Literal["per_cycle", "per_batch", "per_report", "per_day", "per_month"]
    limit_cents: int = Field(ge=0)


class UpsertAgentBudgetOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- 62b COMMS-05: reasoning trace (read-only agent tool) ---

class GetReasoningTraceIn(BaseToolInput):
    """Input to the read-only get_reasoning_trace tool.

    correlation_id: UUID string identifying the reasoning thread; empty string
    short-circuits to an empty result without touching the DB.
    max_rows:       LIMIT clause on the view query. Default 500; hard cap 5000
                    guards against runaway traces (see 62B-06 threat model T-03).
    """

    correlation_id: str = Field(default="", max_length=64)
    max_rows: int = Field(default=500, ge=1, le=5000)


class ReasoningTraceRow(BaseModel):
    """A single row from v_agent_reasoning_trace.

    kind is the discriminator: 'event' rows come from agent_events,
    'message' rows come from agent_messages. Optional columns are NULL
    on the side that doesn't apply (e.g. tool_name is NULL for messages).
    """

    model_config = {"extra": "forbid"}

    kind: str
    created_at: str
    agent_name: str
    intent_or_action: Optional[str] = None
    tool_name: Optional[str] = None
    entity: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    row_id: str


class GetReasoningTraceOut(BaseToolOutput):
    rows: list[ReasoningTraceRow] = Field(default_factory=list)


__all__ = [
    "InsertAgentMessageInput", "InsertAgentMessageOutput",
    "UpdateAgentMessageIntentInput", "UpdateAgentMessageIntentOutput",
    "UpsertAgentRegistryInput", "UpsertAgentRegistryOutput",
    "UpsertAgentBudgetInput", "UpsertAgentBudgetOutput",
    "GetReasoningTraceIn", "GetReasoningTraceOut", "ReasoningTraceRow",
]
