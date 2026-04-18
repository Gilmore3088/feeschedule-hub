"""Crawl_targets-domain agent tools — update rescue state."""
from __future__ import annotations

from typing import Optional

from fee_crawler.agent_tools.gateway import with_agent_tool
from fee_crawler.agent_tools.registry import agent_tool
from fee_crawler.agent_tools.schemas import (
    AgentEventRef,
    UpdateCrawlTargetRescueStateInput,
    UpdateCrawlTargetRescueStateOutput,
)


async def _correlation_of(event_id: str, conn) -> str:
    row = await conn.fetchrow(
        "SELECT correlation_id::TEXT AS c FROM agent_events WHERE event_id = $1::UUID",
        event_id,
    )
    return row["c"] if row else ""


@agent_tool(
    name="update_crawl_target_rescue_state",
    entity="crawl_targets",
    action="update",
    input_schema=UpdateCrawlTargetRescueStateInput,
    output_schema=UpdateCrawlTargetRescueStateOutput,
    description="Mark a crawl_target's rescue_status — Magellan uses this after the ladder completes.",
)
async def update_crawl_target_rescue_state(
    *,
    inp: UpdateCrawlTargetRescueStateInput,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateCrawlTargetRescueStateOutput:
    async with with_agent_tool(
        tool_name="update_crawl_target_rescue_state",
        entity="crawl_targets",
        entity_id=inp.crawl_target_id,
        action="update",
        agent_name=agent_name,
        reasoning_prompt=reasoning_prompt,
        reasoning_output=reasoning_output,
        input_payload=inp.model_dump(),
        pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            "UPDATE crawl_targets SET rescue_status = $2, last_rescue_attempt_at = NOW() "
            "WHERE id = $1",
            inp.crawl_target_id, inp.rescue_status,
        )
        corr = await _correlation_of(event_id, conn)
    return UpdateCrawlTargetRescueStateOutput(
        success=True,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )
