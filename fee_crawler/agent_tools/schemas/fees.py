"""Pydantic v2 schemas for fee-domain tools (Plan 62A-07).

Owned by tools_fees.py. Re-exported through fee_crawler/agent_tools/schemas/__init__.py
so callers continue using `from fee_crawler.agent_tools.schemas import <ClassName>`.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import Field

from fee_crawler.agent_tools.schemas._base import (
    AgentEventRef,
    BaseToolInput,
    BaseToolOutput,
)


# ----------------------------------------------------------------------
# fees_raw — create + update (flags-only)
# ----------------------------------------------------------------------

class CreateFeeRawInput(BaseToolInput):
    institution_id: int = Field(gt=0)
    crawl_event_id: Optional[int] = None
    document_r2_key: Optional[str] = None
    source_url: Optional[str] = None
    extraction_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    fee_name: str = Field(min_length=1)
    amount: Optional[float] = None
    frequency: Optional[str] = None
    conditions: Optional[str] = None
    outlier_flags: List[str] = Field(default_factory=list)
    # agent_event_id is set automatically by the gateway's pending-row insert.


class CreateFeeRawOutput(BaseToolOutput):
    fee_raw_id: Optional[int] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateFeeRawFlagsInput(BaseToolInput):
    fee_raw_id: int = Field(gt=0)
    outlier_flags: List[str]


class UpdateFeeRawFlagsOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# ----------------------------------------------------------------------
# fees_verified / fees_published — promotion functions
# ----------------------------------------------------------------------

class PromoteFeeToTier2Input(BaseToolInput):
    fee_raw_id: int = Field(gt=0)
    canonical_fee_key: str = Field(min_length=1)
    variant_type: Optional[str] = None
    outlier_flags: List[str] = Field(default_factory=list)


class PromoteFeeToTier2Output(BaseToolOutput):
    fee_verified_id: Optional[int] = None
    event_ref: Optional[AgentEventRef] = None


class PromoteFeeToTier3Input(BaseToolInput):
    fee_verified_id: int = Field(gt=0)
    # Optional batch_id tags the resulting fees_published row for
    # rollback-publish grouping (roadmap #6). NULL matches legacy behaviour;
    # rows without a batch_id are not eligible for batch rollback.
    batch_id: Optional[str] = Field(default=None, max_length=128)


class PromoteFeeToTier3Output(BaseToolOutput):
    fee_published_id: Optional[int] = None
    event_ref: Optional[AgentEventRef] = None


# ----------------------------------------------------------------------
# fee_reviews
# ----------------------------------------------------------------------

class CreateFeeReviewInput(BaseToolInput):
    fee_id: int = Field(gt=0)
    action: str  # 'approve' | 'reject' | 'stage' | 'edit'
    notes: Optional[str] = None


class CreateFeeReviewOutput(BaseToolOutput):
    fee_review_id: Optional[int] = None
    event_ref: Optional[AgentEventRef] = None


# ----------------------------------------------------------------------
# fee_change_events
# ----------------------------------------------------------------------

class CreateFeeChangeEventInput(BaseToolInput):
    institution_id: int = Field(gt=0)
    canonical_fee_key: str = Field(min_length=1)
    old_amount: Optional[float] = None
    new_amount: Optional[float] = None
    detected_at: Optional[str] = None  # ISO timestamp; defaults to NOW()
    change_type: str  # 'increase' | 'decrease' | 'removed' | 'added'


class CreateFeeChangeEventOutput(BaseToolOutput):
    fee_change_event_id: Optional[int] = None
    event_ref: Optional[AgentEventRef] = None


# ----------------------------------------------------------------------
# roomba_log
# ----------------------------------------------------------------------

class CreateRoombaLogInput(BaseToolInput):
    fee_id: int = Field(gt=0)
    verdict: str  # 'verified' | 'suspicious' | 'rejected'
    reasoning: Optional[str] = None


class CreateRoombaLogOutput(BaseToolOutput):
    roomba_log_id: Optional[int] = None
    event_ref: Optional[AgentEventRef] = None


__all__ = [
    "CreateFeeRawInput", "CreateFeeRawOutput",
    "UpdateFeeRawFlagsInput", "UpdateFeeRawFlagsOutput",
    "PromoteFeeToTier2Input", "PromoteFeeToTier2Output",
    "PromoteFeeToTier3Input", "PromoteFeeToTier3Output",
    "CreateFeeReviewInput", "CreateFeeReviewOutput",
    "CreateFeeChangeEventInput", "CreateFeeChangeEventOutput",
    "CreateRoombaLogInput", "CreateRoombaLogOutput",
]
