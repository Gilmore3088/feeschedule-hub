"""Fee-domain CRUD tools (Plan 62A-07, Group A).

Every tool wraps `with_agent_tool` so agent_events + agent_auth_log land atomically.

Entities covered (6):
  - fees_raw          — create, update (outlier_flags only; amount is immutable per D-02)
  - fees_verified     — create via promote_fee_to_tier2 wrapper (Darwin-only SQL function)
  - fees_published    — create via promote_fee_to_tier3 wrapper (adversarial-gated stub in 62a)
  - fee_reviews       — create
  - fee_change_events — create
  - roomba_log        — create

Downstream: Phase 63 Knox state agents + Phase 64 Darwin require these tools on day one.
"""

from __future__ import annotations

import hashlib
from typing import Optional

from fee_crawler.agent_tools.gateway import with_agent_tool
from fee_crawler.agent_tools.registry import agent_tool
from fee_crawler.agent_tools.schemas import (
    AgentEventRef,
    CreateFeeChangeEventInput, CreateFeeChangeEventOutput,
    CreateFeeRawInput, CreateFeeRawOutput,
    CreateFeeReviewInput, CreateFeeReviewOutput,
    CreateRoombaLogInput, CreateRoombaLogOutput,
    PromoteFeeToTier2Input, PromoteFeeToTier2Output,
    PromoteFeeToTier3Input, PromoteFeeToTier3Output,
    UpdateFeeRawFlagsInput, UpdateFeeRawFlagsOutput,
)


async def _correlation_of(event_id: str, conn) -> str:
    """Look up the correlation_id for an event_id to return inside AgentEventRef."""
    row = await conn.fetchrow(
        "SELECT correlation_id::TEXT AS c FROM agent_events WHERE event_id = $1::UUID",
        event_id,
    )
    return row["c"] if row else ""


# ----------------------------------------------------------------------
# fees_raw
# ----------------------------------------------------------------------

@agent_tool(
    name="create_fee_raw",
    entity="fees_raw",
    action="create",
    input_schema=CreateFeeRawInput,
    output_schema=CreateFeeRawOutput,
    description="Insert a new Tier 1 fee row from a state-agent extraction.",
)
async def create_fee_raw(
    *,
    inp: CreateFeeRawInput,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateFeeRawOutput:
    async with with_agent_tool(
        tool_name="create_fee_raw",
        entity="fees_raw",
        entity_id=None,
        action="create",
        agent_name=agent_name,
        reasoning_prompt=reasoning_prompt,
        reasoning_output=reasoning_output,
        input_payload=inp.model_dump(),
        pk_column="fee_raw_id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO fees_raw
                  (institution_id, crawl_event_id, document_r2_key, source_url,
                   extraction_confidence, agent_event_id,
                   fee_name, amount, frequency, conditions, outlier_flags, source)
               VALUES ($1, $2, $3, $4, $5, $6::UUID, $7, $8, $9, $10, $11::JSONB, 'knox')
               RETURNING fee_raw_id""",
            inp.institution_id, inp.crawl_event_id, inp.document_r2_key, inp.source_url,
            inp.extraction_confidence, event_id,
            inp.fee_name, inp.amount, inp.frequency, inp.conditions,
            inp.outlier_flags,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateFeeRawOutput(
        success=True,
        fee_raw_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_fee_raw_flags",
    entity="fees_raw",
    action="update",
    input_schema=UpdateFeeRawFlagsInput,
    output_schema=UpdateFeeRawFlagsOutput,
    description="Mutate only outlier_flags on a Tier 1 row; amount is immutable.",
)
async def update_fee_raw_flags(
    *,
    inp: UpdateFeeRawFlagsInput,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateFeeRawFlagsOutput:
    async with with_agent_tool(
        tool_name="update_fee_raw_flags",
        entity="fees_raw",
        entity_id=inp.fee_raw_id,
        action="update",
        agent_name=agent_name,
        reasoning_prompt=reasoning_prompt,
        reasoning_output=reasoning_output,
        input_payload=inp.model_dump(),
        pk_column="fee_raw_id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            "UPDATE fees_raw SET outlier_flags = $2::JSONB WHERE fee_raw_id = $1",
            inp.fee_raw_id, inp.outlier_flags,
        )
        corr = await _correlation_of(event_id, conn)
    return UpdateFeeRawFlagsOutput(
        success=True,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ----------------------------------------------------------------------
# fees_verified — via promote_to_tier2 (Darwin-only SQL function)
# ----------------------------------------------------------------------

@agent_tool(
    name="promote_fee_to_tier2",
    entity="fees_verified",
    action="create",
    input_schema=PromoteFeeToTier2Input,
    output_schema=PromoteFeeToTier2Output,
    description="Darwin-only: promote fees_raw -> fees_verified via promote_to_tier2 SQL function.",
)
async def promote_fee_to_tier2(
    *,
    inp: PromoteFeeToTier2Input,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> PromoteFeeToTier2Output:
    async with with_agent_tool(
        tool_name="promote_fee_to_tier2",
        entity="fees_verified",
        entity_id=None,
        action="create",
        agent_name=agent_name,
        reasoning_prompt=reasoning_prompt,
        reasoning_output=reasoning_output,
        input_payload=inp.model_dump(),
        pk_column="fee_verified_id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        # promote_to_tier2 enforces agent_name='darwin' at DB level (RAISE EXCEPTION on mismatch).
        reasoning_hash = hashlib.sha256(
            (reasoning_prompt + "\x1f" + reasoning_output).encode("utf-8")
        ).digest()
        new_id = await conn.fetchval(
            "SELECT promote_to_tier2($1, $2, $3::BYTEA, $4::UUID, $5, $6, $7::JSONB)",
            inp.fee_raw_id, agent_name, reasoning_hash, event_id,
            inp.canonical_fee_key, inp.variant_type, inp.outlier_flags,
        )
        corr = await _correlation_of(event_id, conn)
    return PromoteFeeToTier2Output(
        success=True,
        fee_verified_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ----------------------------------------------------------------------
# fees_published — via promote_to_tier3 (adversarial-gated; 62a stub, 62b tightens)
# ----------------------------------------------------------------------

@agent_tool(
    name="promote_fee_to_tier3",
    entity="fees_published",
    action="create",
    input_schema=PromoteFeeToTier3Input,
    output_schema=PromoteFeeToTier3Output,
    description="Adversarial-gated: promote fees_verified -> fees_published. 62a stub permits; 62b tightens.",
)
async def promote_fee_to_tier3(
    *,
    inp: PromoteFeeToTier3Input,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> PromoteFeeToTier3Output:
    async with with_agent_tool(
        tool_name="promote_fee_to_tier3",
        entity="fees_published",
        entity_id=None,
        action="create",
        agent_name=agent_name,
        reasoning_prompt=reasoning_prompt,
        reasoning_output=reasoning_output,
        input_payload=inp.model_dump(),
        pk_column="fee_published_id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        # Third arg (batch_id) is optional; NULL matches pre-rollback behaviour.
        # Supplied by publish_fees / knox-review / darwin drain orchestrators per
        # run so rollback-publish can target a single batch.
        new_id = await conn.fetchval(
            "SELECT promote_to_tier3($1, $2::UUID, $3)",
            inp.fee_verified_id, event_id, inp.batch_id,
        )
        corr = await _correlation_of(event_id, conn)
    return PromoteFeeToTier3Output(
        success=True,
        fee_published_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ----------------------------------------------------------------------
# fee_reviews
# ----------------------------------------------------------------------

@agent_tool(
    name="create_fee_review",
    entity="fee_reviews",
    action="create",
    input_schema=CreateFeeReviewInput,
    output_schema=CreateFeeReviewOutput,
    description="Admin or Darwin records a review verdict on a fee.",
)
async def create_fee_review(
    *,
    inp: CreateFeeReviewInput,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateFeeReviewOutput:
    async with with_agent_tool(
        tool_name="create_fee_review",
        entity="fee_reviews",
        entity_id=None,
        action="create",
        agent_name=agent_name,
        reasoning_prompt=reasoning_prompt,
        reasoning_output=reasoning_output,
        input_payload=inp.model_dump(),
        pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        # fee_reviews table exists in production; insert structure mirrors src/lib/fee-actions.ts.
        new_id = await conn.fetchval(
            """INSERT INTO fee_reviews (fee_id, action, notes, reviewed_at)
               VALUES ($1, $2, $3, NOW())
               RETURNING id""",
            inp.fee_id, inp.action, inp.notes,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateFeeReviewOutput(
        success=True,
        fee_review_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ----------------------------------------------------------------------
# fee_change_events
# ----------------------------------------------------------------------

@agent_tool(
    name="create_fee_change_event",
    entity="fee_change_events",
    action="create",
    input_schema=CreateFeeChangeEventInput,
    output_schema=CreateFeeChangeEventOutput,
    description="Record a detected fee change (peer movement tracker).",
)
async def create_fee_change_event(
    *,
    inp: CreateFeeChangeEventInput,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateFeeChangeEventOutput:
    async with with_agent_tool(
        tool_name="create_fee_change_event",
        entity="fee_change_events",
        entity_id=None,
        action="create",
        agent_name=agent_name,
        reasoning_prompt=reasoning_prompt,
        reasoning_output=reasoning_output,
        input_payload=inp.model_dump(),
        pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO fee_change_events
                  (institution_id, canonical_fee_key, old_amount, new_amount,
                   detected_at, change_type)
               VALUES ($1, $2, $3, $4, COALESCE($5::TIMESTAMPTZ, NOW()), $6)
               RETURNING id""",
            inp.institution_id, inp.canonical_fee_key,
            inp.old_amount, inp.new_amount, inp.detected_at, inp.change_type,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateFeeChangeEventOutput(
        success=True,
        fee_change_event_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ----------------------------------------------------------------------
# roomba_log
# ----------------------------------------------------------------------

@agent_tool(
    name="create_roomba_log",
    entity="roomba_log",
    action="create",
    input_schema=CreateRoombaLogInput,
    output_schema=CreateRoombaLogOutput,
    description="Darwin's verification verdict log (replaces legacy Roomba rejection log).",
)
async def create_roomba_log(
    *,
    inp: CreateRoombaLogInput,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateRoombaLogOutput:
    async with with_agent_tool(
        tool_name="create_roomba_log",
        entity="roomba_log",
        entity_id=None,
        action="create",
        agent_name=agent_name,
        reasoning_prompt=reasoning_prompt,
        reasoning_output=reasoning_output,
        input_payload=inp.model_dump(),
        pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO roomba_log (fee_id, verdict, reasoning)
               VALUES ($1, $2, $3)
               RETURNING id""",
            inp.fee_id, inp.verdict, inp.reasoning,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateRoombaLogOutput(
        success=True,
        roomba_log_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


__all__ = [
    "create_fee_raw",
    "update_fee_raw_flags",
    "promote_fee_to_tier2",
    "promote_fee_to_tier3",
    "create_fee_review",
    "create_fee_change_event",
    "create_roomba_log",
]
