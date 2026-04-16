"""Peer + external-intelligence CRUD tools (Plan 62A-10, Group A).

5 entities, 11 tools. Every tool routes through with_agent_tool for audit.
"""

from __future__ import annotations

from typing import Optional

from fee_crawler.agent_tools.gateway import with_agent_tool
from fee_crawler.agent_tools.registry import agent_tool
from fee_crawler.agent_tools.schemas import (
    AgentEventRef,
    CreateSavedPeerSetInput, CreateSavedPeerSetOutput,
    UpdateSavedPeerSetInput, UpdateSavedPeerSetOutput,
    DeleteSavedPeerSetInput, DeleteSavedPeerSetOutput,
    CreateSavedSubscriberPeerGroupInput, CreateSavedSubscriberPeerGroupOutput,
    UpdateSavedSubscriberPeerGroupInput, UpdateSavedSubscriberPeerGroupOutput,
    DeleteSavedSubscriberPeerGroupInput, DeleteSavedSubscriberPeerGroupOutput,
    UpsertClassificationCacheInput, UpsertClassificationCacheOutput,
    CreateExternalIntelligenceInput, CreateExternalIntelligenceOutput,
    UpdateExternalIntelligenceInput, UpdateExternalIntelligenceOutput,
    CreateBeigeBookThemeInput, CreateBeigeBookThemeOutput,
    UpdateBeigeBookThemeInput, UpdateBeigeBookThemeOutput,
)


async def _correlation_of(event_id: str, conn) -> str:
    row = await conn.fetchrow(
        "SELECT correlation_id::TEXT AS c FROM agent_events WHERE event_id = $1::UUID",
        event_id,
    )
    return row["c"] if row else ""


# ========================================================================
# saved_peer_sets (admin-scoped)
# ========================================================================

@agent_tool(
    name="create_saved_peer_set",
    entity="saved_peer_sets", action="create",
    input_schema=CreateSavedPeerSetInput,
    output_schema=CreateSavedPeerSetOutput,
    description="Admin: save a peer filter configuration.",
)
async def create_saved_peer_set(
    *, inp: CreateSavedPeerSetInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateSavedPeerSetOutput:
    async with with_agent_tool(
        tool_name="create_saved_peer_set", entity="saved_peer_sets",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO saved_peer_sets (name, filters)
               VALUES ($1, $2::JSONB)
               RETURNING id::TEXT""",
            inp.name, inp.filters,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateSavedPeerSetOutput(
        success=True, saved_peer_set_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_saved_peer_set",
    entity="saved_peer_sets", action="update",
    input_schema=UpdateSavedPeerSetInput,
    output_schema=UpdateSavedPeerSetOutput,
    description="Admin: edit a saved peer set.",
)
async def update_saved_peer_set(
    *, inp: UpdateSavedPeerSetInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateSavedPeerSetOutput:
    async with with_agent_tool(
        tool_name="update_saved_peer_set", entity="saved_peer_sets",
        entity_id=inp.saved_peer_set_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        sets, args, i = [], [], 1
        if inp.name is not None:
            sets.append(f'"name" = ${i}'); args.append(inp.name); i += 1
        if inp.filters is not None:
            sets.append(f'"filters" = ${i}::JSONB'); args.append(inp.filters); i += 1
        if sets:
            args.append(inp.saved_peer_set_id)
            await conn.execute(
                f'UPDATE saved_peer_sets SET {", ".join(sets)} WHERE id = ${i}::UUID',
                *args,
            )
        corr = await _correlation_of(event_id, conn)
    return UpdateSavedPeerSetOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="delete_saved_peer_set",
    entity="saved_peer_sets", action="delete",
    input_schema=DeleteSavedPeerSetInput,
    output_schema=DeleteSavedPeerSetOutput,
    description="Admin: delete a saved peer set.",
)
async def delete_saved_peer_set(
    *, inp: DeleteSavedPeerSetInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> DeleteSavedPeerSetOutput:
    async with with_agent_tool(
        tool_name="delete_saved_peer_set", entity="saved_peer_sets",
        entity_id=inp.saved_peer_set_id, action="delete", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            "DELETE FROM saved_peer_sets WHERE id = $1::UUID",
            inp.saved_peer_set_id,
        )
        corr = await _correlation_of(event_id, conn)
    return DeleteSavedPeerSetOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# saved_subscriber_peer_groups (Pro, user-scoped)
# ========================================================================

@agent_tool(
    name="create_saved_subscriber_peer_group",
    entity="saved_subscriber_peer_groups", action="create",
    input_schema=CreateSavedSubscriberPeerGroupInput,
    output_schema=CreateSavedSubscriberPeerGroupOutput,
    description="Pro: save a peer group (user-scoped).",
)
async def create_saved_subscriber_peer_group(
    *, inp: CreateSavedSubscriberPeerGroupInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateSavedSubscriberPeerGroupOutput:
    async with with_agent_tool(
        tool_name="create_saved_subscriber_peer_group",
        entity="saved_subscriber_peer_groups",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO saved_subscriber_peer_groups
                 (user_id, name, institution_ids)
               VALUES ($1, $2, $3)
               RETURNING id::TEXT""",
            inp.user_id, inp.name, inp.institution_ids,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateSavedSubscriberPeerGroupOutput(
        success=True, group_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_saved_subscriber_peer_group",
    entity="saved_subscriber_peer_groups", action="update",
    input_schema=UpdateSavedSubscriberPeerGroupInput,
    output_schema=UpdateSavedSubscriberPeerGroupOutput,
    description="Pro: edit a saved peer group (user_id guard).",
)
async def update_saved_subscriber_peer_group(
    *, inp: UpdateSavedSubscriberPeerGroupInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateSavedSubscriberPeerGroupOutput:
    async with with_agent_tool(
        tool_name="update_saved_subscriber_peer_group",
        entity="saved_subscriber_peer_groups",
        entity_id=inp.group_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        owner = await conn.fetchval(
            "SELECT user_id FROM saved_subscriber_peer_groups WHERE id = $1::UUID",
            inp.group_id,
        )
        if owner is None:
            raise ValueError(f"peer group {inp.group_id} not found")
        if str(owner) != inp.user_id:
            raise PermissionError("peer group user_id mismatch")
        sets, args, i = [], [], 1
        if inp.name is not None:
            sets.append(f'"name" = ${i}'); args.append(inp.name); i += 1
        if inp.institution_ids is not None:
            sets.append(f'"institution_ids" = ${i}'); args.append(inp.institution_ids); i += 1
        if sets:
            args.append(inp.group_id)
            await conn.execute(
                f'UPDATE saved_subscriber_peer_groups SET {", ".join(sets)} '
                f'WHERE id = ${i}::UUID', *args,
            )
        corr = await _correlation_of(event_id, conn)
    return UpdateSavedSubscriberPeerGroupOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="delete_saved_subscriber_peer_group",
    entity="saved_subscriber_peer_groups", action="delete",
    input_schema=DeleteSavedSubscriberPeerGroupInput,
    output_schema=DeleteSavedSubscriberPeerGroupOutput,
    description="Pro: delete a saved peer group (user_id guard).",
)
async def delete_saved_subscriber_peer_group(
    *, inp: DeleteSavedSubscriberPeerGroupInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> DeleteSavedSubscriberPeerGroupOutput:
    async with with_agent_tool(
        tool_name="delete_saved_subscriber_peer_group",
        entity="saved_subscriber_peer_groups",
        entity_id=inp.group_id, action="delete", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        owner = await conn.fetchval(
            "SELECT user_id FROM saved_subscriber_peer_groups WHERE id = $1::UUID",
            inp.group_id,
        )
        if owner is None:
            raise ValueError(f"peer group {inp.group_id} not found")
        if str(owner) != inp.user_id:
            raise PermissionError("peer group user_id mismatch")
        await conn.execute(
            "DELETE FROM saved_subscriber_peer_groups WHERE id = $1::UUID",
            inp.group_id,
        )
        corr = await _correlation_of(event_id, conn)
    return DeleteSavedSubscriberPeerGroupOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# classification_cache — UPSERT by cache_key (Darwin feedback loop)
# ========================================================================

@agent_tool(
    name="upsert_classification_cache",
    entity="classification_cache", action="upsert",
    input_schema=UpsertClassificationCacheInput,
    output_schema=UpsertClassificationCacheOutput,
    description="Cache a Darwin classification decision keyed by a stable cache_key.",
)
async def upsert_classification_cache(
    *, inp: UpsertClassificationCacheInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpsertClassificationCacheOutput:
    async with with_agent_tool(
        tool_name="upsert_classification_cache", entity="classification_cache",
        entity_id=inp.cache_key, action="upsert", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="cache_key",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            """INSERT INTO classification_cache
                 (cache_key, canonical_fee_key, confidence, model, source, updated_at)
               VALUES ($1, $2, $3, $4, $5, NOW())
               ON CONFLICT (cache_key) DO UPDATE SET
                 canonical_fee_key = EXCLUDED.canonical_fee_key,
                 confidence = EXCLUDED.confidence,
                 model = EXCLUDED.model,
                 source = EXCLUDED.source,
                 updated_at = NOW()""",
            inp.cache_key, inp.canonical_fee_key, inp.confidence,
            inp.model, inp.source,
        )
        corr = await _correlation_of(event_id, conn)
    return UpsertClassificationCacheOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# external_intelligence (FRED/BLS/CFPB ingestion)
# ========================================================================

@agent_tool(
    name="create_external_intelligence",
    entity="external_intelligence", action="create",
    input_schema=CreateExternalIntelligenceInput,
    output_schema=CreateExternalIntelligenceOutput,
    description="Ingest one external-intelligence record (FRED/BLS/CFPB/etc.).",
)
async def create_external_intelligence(
    *, inp: CreateExternalIntelligenceInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateExternalIntelligenceOutput:
    async with with_agent_tool(
        tool_name="create_external_intelligence", entity="external_intelligence",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO external_intelligence
                 (source, series_id, title, body, payload, observed_at)
               VALUES ($1, $2, $3, $4, $5::JSONB,
                       COALESCE($6::TIMESTAMPTZ, NOW()))
               RETURNING id::TEXT""",
            inp.source, inp.series_id, inp.title, inp.body,
            inp.payload, inp.observed_at,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateExternalIntelligenceOutput(
        success=True, external_intelligence_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_external_intelligence",
    entity="external_intelligence", action="update",
    input_schema=UpdateExternalIntelligenceInput,
    output_schema=UpdateExternalIntelligenceOutput,
    description="Edit a previously-ingested external-intel record.",
)
async def update_external_intelligence(
    *, inp: UpdateExternalIntelligenceInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateExternalIntelligenceOutput:
    async with with_agent_tool(
        tool_name="update_external_intelligence", entity="external_intelligence",
        entity_id=inp.external_intelligence_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        sets, args, i = [], [], 1
        if inp.title is not None:
            sets.append(f'"title" = ${i}'); args.append(inp.title); i += 1
        if inp.body is not None:
            sets.append(f'"body" = ${i}'); args.append(inp.body); i += 1
        if inp.payload is not None:
            sets.append(f'"payload" = ${i}::JSONB'); args.append(inp.payload); i += 1
        if sets:
            args.append(inp.external_intelligence_id)
            await conn.execute(
                f'UPDATE external_intelligence SET {", ".join(sets)} '
                f'WHERE id = ${i}::UUID', *args,
            )
        corr = await _correlation_of(event_id, conn)
    return UpdateExternalIntelligenceOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# beige_book_themes
# ========================================================================

@agent_tool(
    name="create_beige_book_theme",
    entity="beige_book_themes", action="create",
    input_schema=CreateBeigeBookThemeInput,
    output_schema=CreateBeigeBookThemeOutput,
    description="Ingest a Beige Book district theme.",
)
async def create_beige_book_theme(
    *, inp: CreateBeigeBookThemeInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateBeigeBookThemeOutput:
    async with with_agent_tool(
        tool_name="create_beige_book_theme", entity="beige_book_themes",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO beige_book_themes
                 (district, period, theme, summary, source_url)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id::TEXT""",
            inp.district, inp.period, inp.theme, inp.summary, inp.source_url,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateBeigeBookThemeOutput(
        success=True, theme_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_beige_book_theme",
    entity="beige_book_themes", action="update",
    input_schema=UpdateBeigeBookThemeInput,
    output_schema=UpdateBeigeBookThemeOutput,
    description="Edit a Beige Book theme summary / source URL.",
)
async def update_beige_book_theme(
    *, inp: UpdateBeigeBookThemeInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateBeigeBookThemeOutput:
    async with with_agent_tool(
        tool_name="update_beige_book_theme", entity="beige_book_themes",
        entity_id=inp.theme_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        sets, args, i = [], [], 1
        if inp.summary is not None:
            sets.append(f'"summary" = ${i}'); args.append(inp.summary); i += 1
        if inp.source_url is not None:
            sets.append(f'"source_url" = ${i}'); args.append(inp.source_url); i += 1
        if sets:
            args.append(inp.theme_id)
            await conn.execute(
                f'UPDATE beige_book_themes SET {", ".join(sets)} '
                f'WHERE id = ${i}::UUID', *args,
            )
        corr = await _correlation_of(event_id, conn)
    return UpdateBeigeBookThemeOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )
