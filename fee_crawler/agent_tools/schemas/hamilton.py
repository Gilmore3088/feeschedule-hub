"""Pydantic v2 schemas for Hamilton-domain tools (Plan 62A-09).

Owned by tools_hamilton.py. Re-exported through
fee_crawler/agent_tools/schemas/__init__.py so callers continue using
`from fee_crawler.agent_tools.schemas import <ClassName>`.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from uuid import UUID  # noqa: F401 -- available for downstream type hints

from pydantic import Field

from fee_crawler.agent_tools.schemas._base import (
    AgentEventRef,
    BaseToolInput,
    BaseToolOutput,
)


# ----------------------------------------------------------------------
# Plan 62A-09: Hamilton domain schemas (11 entities)
# ----------------------------------------------------------------------


# --- hamilton_watchlists ---

class CreateHamiltonWatchlistInput(BaseToolInput):
    user_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=120)
    filters: Dict[str, Any] = Field(default_factory=dict)
    notify_on_change: bool = True


class CreateHamiltonWatchlistOutput(BaseToolOutput):
    watchlist_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateHamiltonWatchlistInput(BaseToolInput):
    watchlist_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    name: Optional[str] = Field(default=None, max_length=120)
    filters: Optional[Dict[str, Any]] = None
    notify_on_change: Optional[bool] = None


class UpdateHamiltonWatchlistOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


class DeleteHamiltonWatchlistInput(BaseToolInput):
    watchlist_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)


class DeleteHamiltonWatchlistOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- hamilton_saved_analyses ---

class CreateHamiltonSavedAnalysisInput(BaseToolInput):
    user_id: str = Field(min_length=1)
    institution_id: int = Field(gt=0)
    question: str = Field(min_length=1)
    response: str = Field(min_length=1)
    model: Optional[str] = None


class CreateHamiltonSavedAnalysisOutput(BaseToolOutput):
    analysis_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateHamiltonSavedAnalysisInput(BaseToolInput):
    analysis_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    question: Optional[str] = None
    response: Optional[str] = None


class UpdateHamiltonSavedAnalysisOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


class DeleteHamiltonSavedAnalysisInput(BaseToolInput):
    analysis_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)


class DeleteHamiltonSavedAnalysisOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- hamilton_scenarios ---

class CreateHamiltonScenarioInput(BaseToolInput):
    user_id: str = Field(min_length=1)
    institution_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=200)
    changes: Dict[str, Any] = Field(default_factory=dict)
    confidence_tier: Literal["low", "medium", "high"] = "medium"


class CreateHamiltonScenarioOutput(BaseToolOutput):
    scenario_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateHamiltonScenarioInput(BaseToolInput):
    scenario_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    name: Optional[str] = Field(default=None, max_length=200)
    changes: Optional[Dict[str, Any]] = None
    confidence_tier: Optional[Literal["low", "medium", "high"]] = None


class UpdateHamiltonScenarioOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


class DeleteHamiltonScenarioInput(BaseToolInput):
    scenario_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)


class DeleteHamiltonScenarioOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- hamilton_reports ---

class CreateHamiltonReportInput(BaseToolInput):
    user_id: str = Field(min_length=1)
    scenario_id: Optional[str] = None
    title: str = Field(min_length=1, max_length=240)
    sections: List[Dict[str, Any]] = Field(default_factory=list)


class CreateHamiltonReportOutput(BaseToolOutput):
    report_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateHamiltonReportInput(BaseToolInput):
    report_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    title: Optional[str] = Field(default=None, max_length=240)
    sections: Optional[List[Dict[str, Any]]] = None
    status: Optional[Literal["draft", "published", "archived"]] = None


class UpdateHamiltonReportOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


class DeleteHamiltonReportInput(BaseToolInput):
    report_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)


class DeleteHamiltonReportOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- hamilton_signals (immutable inserts) ---

class CreateHamiltonSignalInput(BaseToolInput):
    signal_type: Literal[
        "fee_change", "coverage_gap", "demand_reflection", "peer_movement"
    ]
    institution_id: Optional[int] = None
    canonical_fee_key: Optional[str] = None
    severity: Literal["info", "warn", "critical"] = "info"
    payload: Dict[str, Any] = Field(default_factory=dict)


class CreateHamiltonSignalOutput(BaseToolOutput):
    signal_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


# --- hamilton_priority_alerts ---

class CreateHamiltonPriorityAlertInput(BaseToolInput):
    user_id: str = Field(min_length=1)
    signal_id: str = Field(min_length=1)
    priority: Literal["low", "medium", "high"] = "medium"


class CreateHamiltonPriorityAlertOutput(BaseToolOutput):
    alert_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateHamiltonPriorityAlertInput(BaseToolInput):
    alert_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    status: Literal["unread", "read", "acknowledged", "resolved", "dismissed"]


class UpdateHamiltonPriorityAlertOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- hamilton_conversations ---

class CreateHamiltonConversationInput(BaseToolInput):
    user_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class CreateHamiltonConversationOutput(BaseToolOutput):
    conversation_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateHamiltonConversationInput(BaseToolInput):
    conversation_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    title: Optional[str] = Field(default=None, max_length=200)
    metadata: Optional[Dict[str, Any]] = None


class UpdateHamiltonConversationOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- hamilton_messages (per-turn log; immutable) ---

class CreateHamiltonMessageInput(BaseToolInput):
    conversation_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    role: Literal["user", "assistant", "system", "tool"]
    content: str = Field(min_length=1)
    tool_calls: Optional[List[Dict[str, Any]]] = None


class CreateHamiltonMessageOutput(BaseToolOutput):
    message_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


# --- published_reports ---

class CreatePublishedReportInput(BaseToolInput):
    slug: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1)
    summary: Optional[str] = None
    body: str = Field(min_length=1)
    published_by: str = Field(min_length=1)


class CreatePublishedReportOutput(BaseToolOutput):
    published_report_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdatePublishedReportInput(BaseToolInput):
    published_report_id: str = Field(min_length=1)
    title: Optional[str] = None
    summary: Optional[str] = None
    body: Optional[str] = None
    status: Optional[Literal["draft", "published", "unpublished"]] = None


class UpdatePublishedReportOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- report_jobs ---

class CreateReportJobInput(BaseToolInput):
    user_id: str = Field(min_length=1)
    report_type: str = Field(min_length=1)
    params: Dict[str, Any] = Field(default_factory=dict)


class CreateReportJobOutput(BaseToolOutput):
    job_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateReportJobInput(BaseToolInput):
    job_id: str = Field(min_length=1)
    status: Literal["pending", "running", "succeeded", "failed"]
    progress_pct: Optional[int] = Field(default=None, ge=0, le=100)
    result_url: Optional[str] = None
    error: Optional[str] = None


class UpdateReportJobOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


class CancelReportJobInput(BaseToolInput):
    job_id: str = Field(min_length=1)
    reason: Optional[str] = Field(default=None, max_length=500)


class CancelReportJobOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- articles ---

class CreateArticleInput(BaseToolInput):
    slug: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1)
    body: str = Field(min_length=1)
    author: str = Field(min_length=1)
    tags: List[str] = Field(default_factory=list)


class CreateArticleOutput(BaseToolOutput):
    article_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateArticleInput(BaseToolInput):
    article_id: str = Field(min_length=1)
    title: Optional[str] = None
    body: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[Literal["draft", "published", "archived"]] = None


class UpdateArticleOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


class DeleteArticleInput(BaseToolInput):
    article_id: str = Field(min_length=1)


class DeleteArticleOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


__all__ = [
    "CreateHamiltonWatchlistInput", "CreateHamiltonWatchlistOutput",
    "UpdateHamiltonWatchlistInput", "UpdateHamiltonWatchlistOutput",
    "DeleteHamiltonWatchlistInput", "DeleteHamiltonWatchlistOutput",
    "CreateHamiltonSavedAnalysisInput", "CreateHamiltonSavedAnalysisOutput",
    "UpdateHamiltonSavedAnalysisInput", "UpdateHamiltonSavedAnalysisOutput",
    "DeleteHamiltonSavedAnalysisInput", "DeleteHamiltonSavedAnalysisOutput",
    "CreateHamiltonScenarioInput", "CreateHamiltonScenarioOutput",
    "UpdateHamiltonScenarioInput", "UpdateHamiltonScenarioOutput",
    "DeleteHamiltonScenarioInput", "DeleteHamiltonScenarioOutput",
    "CreateHamiltonReportInput", "CreateHamiltonReportOutput",
    "UpdateHamiltonReportInput", "UpdateHamiltonReportOutput",
    "DeleteHamiltonReportInput", "DeleteHamiltonReportOutput",
    "CreateHamiltonSignalInput", "CreateHamiltonSignalOutput",
    "CreateHamiltonPriorityAlertInput", "CreateHamiltonPriorityAlertOutput",
    "UpdateHamiltonPriorityAlertInput", "UpdateHamiltonPriorityAlertOutput",
    "CreateHamiltonConversationInput", "CreateHamiltonConversationOutput",
    "UpdateHamiltonConversationInput", "UpdateHamiltonConversationOutput",
    "CreateHamiltonMessageInput", "CreateHamiltonMessageOutput",
    "CreatePublishedReportInput", "CreatePublishedReportOutput",
    "UpdatePublishedReportInput", "UpdatePublishedReportOutput",
    "CreateReportJobInput", "CreateReportJobOutput",
    "UpdateReportJobInput", "UpdateReportJobOutput",
    "CancelReportJobInput", "CancelReportJobOutput",
    "CreateArticleInput", "CreateArticleOutput",
    "UpdateArticleInput", "UpdateArticleOutput",
    "DeleteArticleInput", "DeleteArticleOutput",
]
