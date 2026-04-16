"""Pydantic v2 schemas for agent-infra tools (Plan 62A-10, Group B).

Owned by tools_agent_infra.py. Re-exported through
fee_crawler/agent_tools/schemas/__init__.py so callers continue using
`from fee_crawler.agent_tools.schemas import <ClassName>`.
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from pydantic import Field

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


__all__ = [
    "InsertAgentMessageInput", "InsertAgentMessageOutput",
    "UpdateAgentMessageIntentInput", "UpdateAgentMessageIntentOutput",
    "UpsertAgentRegistryInput", "UpsertAgentRegistryOutput",
    "UpsertAgentBudgetInput", "UpsertAgentBudgetOutput",
]
