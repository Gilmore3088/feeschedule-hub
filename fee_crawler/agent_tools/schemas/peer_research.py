"""Pydantic v2 schemas for peer + research-domain tools (Plan 62A-10, Group A).

Owned by tools_peer_research.py. Re-exported through
fee_crawler/agent_tools/schemas/__init__.py so callers continue using
`from fee_crawler.agent_tools.schemas import <ClassName>`.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import Field

from fee_crawler.agent_tools.schemas._base import (
    AgentEventRef,
    BaseToolInput,
    BaseToolOutput,
)


# --- saved_peer_sets (admin) ---

class CreateSavedPeerSetInput(BaseToolInput):
    name: str = Field(min_length=1, max_length=120)
    filters: Dict[str, Any] = Field(default_factory=dict)


class CreateSavedPeerSetOutput(BaseToolOutput):
    saved_peer_set_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateSavedPeerSetInput(BaseToolInput):
    saved_peer_set_id: str = Field(min_length=1)
    name: Optional[str] = Field(default=None, max_length=120)
    filters: Optional[Dict[str, Any]] = None


class UpdateSavedPeerSetOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


class DeleteSavedPeerSetInput(BaseToolInput):
    saved_peer_set_id: str = Field(min_length=1)


class DeleteSavedPeerSetOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- saved_subscriber_peer_groups (Pro, user-scoped) ---

class CreateSavedSubscriberPeerGroupInput(BaseToolInput):
    user_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=120)
    institution_ids: List[int] = Field(default_factory=list)


class CreateSavedSubscriberPeerGroupOutput(BaseToolOutput):
    group_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateSavedSubscriberPeerGroupInput(BaseToolInput):
    group_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    name: Optional[str] = Field(default=None, max_length=120)
    institution_ids: Optional[List[int]] = None


class UpdateSavedSubscriberPeerGroupOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


class DeleteSavedSubscriberPeerGroupInput(BaseToolInput):
    group_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)


class DeleteSavedSubscriberPeerGroupOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- classification_cache (Darwin feedback loop) ---

class UpsertClassificationCacheInput(BaseToolInput):
    cache_key: str = Field(min_length=1, max_length=256)
    canonical_fee_key: str = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0)
    model: Optional[str] = None
    source: Literal["darwin", "knox", "manual"] = "darwin"


class UpsertClassificationCacheOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- external_intelligence (FRED/BLS/CFPB ingestion) ---

class CreateExternalIntelligenceInput(BaseToolInput):
    source: Literal["fred", "bls", "cfpb", "census", "ofr", "nyfed", "ffiec_cdr", "manual"]
    series_id: str = Field(min_length=1, max_length=200)
    title: Optional[str] = None
    body: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    observed_at: Optional[str] = None  # ISO date or timestamp


class CreateExternalIntelligenceOutput(BaseToolOutput):
    external_intelligence_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateExternalIntelligenceInput(BaseToolInput):
    external_intelligence_id: str = Field(min_length=1)
    title: Optional[str] = None
    body: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


class UpdateExternalIntelligenceOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- beige_book_themes (Fed district intel) ---

class CreateBeigeBookThemeInput(BaseToolInput):
    district: int = Field(ge=1, le=12)
    period: str = Field(min_length=1, max_length=50)  # e.g., "2026-Q1"
    theme: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1)
    source_url: Optional[str] = None


class CreateBeigeBookThemeOutput(BaseToolOutput):
    theme_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateBeigeBookThemeInput(BaseToolInput):
    theme_id: str = Field(min_length=1)
    summary: Optional[str] = None
    source_url: Optional[str] = None


class UpdateBeigeBookThemeOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


__all__ = [
    "CreateSavedPeerSetInput", "CreateSavedPeerSetOutput",
    "UpdateSavedPeerSetInput", "UpdateSavedPeerSetOutput",
    "DeleteSavedPeerSetInput", "DeleteSavedPeerSetOutput",
    "CreateSavedSubscriberPeerGroupInput", "CreateSavedSubscriberPeerGroupOutput",
    "UpdateSavedSubscriberPeerGroupInput", "UpdateSavedSubscriberPeerGroupOutput",
    "DeleteSavedSubscriberPeerGroupInput", "DeleteSavedSubscriberPeerGroupOutput",
    "UpsertClassificationCacheInput", "UpsertClassificationCacheOutput",
    "CreateExternalIntelligenceInput", "CreateExternalIntelligenceOutput",
    "UpdateExternalIntelligenceInput", "UpdateExternalIntelligenceOutput",
    "CreateBeigeBookThemeInput", "CreateBeigeBookThemeOutput",
    "UpdateBeigeBookThemeInput", "UpdateBeigeBookThemeOutput",
]
