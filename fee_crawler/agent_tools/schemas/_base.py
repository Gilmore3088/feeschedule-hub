"""Shared Pydantic v2 base classes for all agent-tool schemas.

This module is intentionally minimal — it holds ONLY:
  - BaseToolInput / BaseToolOutput (shared behavior: extra='forbid', success/error fields)
  - AgentEventRef (the result envelope every write tool returns)
  - AgentName enum (optional hint for per-domain schemas; the canonical allow-list
    is enforced at the @agent_tool registry level and by per-schema Field(pattern=...))

Per-domain schemas live in sibling modules added by later plans:
  - fees.py           (Plan 62A-07)
  - crawl.py          (Plan 62A-08)
  - hamilton.py       (Plan 62A-09)
  - peer_research.py  (Plan 62A-10 group A)
  - agent_infra.py    (Plan 62A-10 group B)

All of those are re-exported through schemas/__init__.py so callers keep
using `from fee_crawler.agent_tools.schemas import <ClassName>` regardless of
which module the class lives in.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel


class BaseToolInput(BaseModel):
    """Base class — tool inputs inherit for shared fields if needed."""
    model_config = {"extra": "forbid"}


class BaseToolOutput(BaseModel):
    """Base class — tool outputs inherit."""
    model_config = {"extra": "forbid"}
    success: bool
    error: Optional[str] = None


class AgentEventRef(BaseModel):
    """Reference to an agent_events row (returned by most write tools)."""
    event_id: str  # UUID as string for JSON compatibility
    correlation_id: str


class AgentName(str, Enum):
    """Canonical agent identities. Per-domain schemas may narrow via Field(pattern=...)."""
    HAMILTON = "hamilton"
    KNOX = "knox"
    DARWIN = "darwin"
    ATLAS = "atlas"
    # State agents use the pattern `state_<lowercase-2>` (e.g., state_vt) and are
    # validated via regex in per-domain schemas rather than enumerated here.


__all__ = ["BaseToolInput", "BaseToolOutput", "AgentEventRef", "AgentName"]
