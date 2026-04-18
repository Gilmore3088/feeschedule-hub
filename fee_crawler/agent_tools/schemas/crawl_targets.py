"""Pydantic I/O for crawl_targets-domain agent tools."""
from typing import Literal, Optional
from pydantic import Field

from fee_crawler.agent_tools.schemas._base import (
    BaseToolInput, BaseToolOutput, AgentEventRef,
)


RescueStatus = Literal["pending", "rescued", "dead", "needs_human", "retry_after"]


class UpdateCrawlTargetRescueStateInput(BaseToolInput):
    crawl_target_id: int = Field(gt=0)
    rescue_status: RescueStatus
    failure_reason: Optional[str] = None


class UpdateCrawlTargetRescueStateOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None
