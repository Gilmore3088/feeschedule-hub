"""Hamilton-domain CRUD tools (Plan 62A-09).

Covers 11 entities from CONTEXT.md Entity Inventory rows 10-22. Every tool wraps
`with_agent_tool` (Plan 62A-05 gateway) for identity audit + agent_events logging.

Downstream integration: `src/app/pro/(hamilton)/*/actions.ts` and
`src/app/admin/hamilton/actions.ts` are refactored in Phase 66 to call the
TS wrappers generated from these Python schemas.
"""

from __future__ import annotations

from typing import Optional

from fee_crawler.agent_tools.gateway import with_agent_tool
from fee_crawler.agent_tools.registry import agent_tool
from fee_crawler.agent_tools.schemas import (
    AgentEventRef,
    CreateHamiltonWatchlistInput, CreateHamiltonWatchlistOutput,
    UpdateHamiltonWatchlistInput, UpdateHamiltonWatchlistOutput,
    DeleteHamiltonWatchlistInput, DeleteHamiltonWatchlistOutput,
    CreateHamiltonSavedAnalysisInput, CreateHamiltonSavedAnalysisOutput,
    UpdateHamiltonSavedAnalysisInput, UpdateHamiltonSavedAnalysisOutput,
    DeleteHamiltonSavedAnalysisInput, DeleteHamiltonSavedAnalysisOutput,
    CreateHamiltonScenarioInput, CreateHamiltonScenarioOutput,
    UpdateHamiltonScenarioInput, UpdateHamiltonScenarioOutput,
    DeleteHamiltonScenarioInput, DeleteHamiltonScenarioOutput,
    CreateHamiltonReportInput, CreateHamiltonReportOutput,
    UpdateHamiltonReportInput, UpdateHamiltonReportOutput,
    DeleteHamiltonReportInput, DeleteHamiltonReportOutput,
    CreateHamiltonSignalInput, CreateHamiltonSignalOutput,
    CreateHamiltonPriorityAlertInput, CreateHamiltonPriorityAlertOutput,
    UpdateHamiltonPriorityAlertInput, UpdateHamiltonPriorityAlertOutput,
    CreateHamiltonConversationInput, CreateHamiltonConversationOutput,
    UpdateHamiltonConversationInput, UpdateHamiltonConversationOutput,
    CreateHamiltonMessageInput, CreateHamiltonMessageOutput,
    CreatePublishedReportInput, CreatePublishedReportOutput,
    UpdatePublishedReportInput, UpdatePublishedReportOutput,
    CreateReportJobInput, CreateReportJobOutput,
    UpdateReportJobInput, UpdateReportJobOutput,
    CancelReportJobInput, CancelReportJobOutput,
    CreateArticleInput, CreateArticleOutput,
    UpdateArticleInput, UpdateArticleOutput,
    DeleteArticleInput, DeleteArticleOutput,
)


async def _correlation_of(event_id: str, conn) -> str:
    row = await conn.fetchrow(
        "SELECT correlation_id::TEXT AS c FROM agent_events WHERE event_id = $1::UUID",
        event_id,
    )
    return row["c"] if row else ""


def _sparse_update(fields: dict, id_arg: object, id_column: str, table: str) -> tuple[str, list]:
    """Build an UPDATE with only non-None fields. Returns (sql, args) or ('', []) if empty."""
    sets: list[str] = []
    args: list = []
    i = 1
    for name, val in fields.items():
        if val is not None:
            sets.append(f'"{name}" = ${i}')
            args.append(val)
            i += 1
    if not sets:
        return "", []
    args.append(id_arg)
    sql = f'UPDATE "{table}" SET {", ".join(sets)}, updated_at = NOW() WHERE "{id_column}" = ${i}'
    return sql, args


# ========================================================================
# hamilton_watchlists
# ========================================================================

@agent_tool(
    name="create_hamilton_watchlist",
    entity="hamilton_watchlists",
    action="create",
    input_schema=CreateHamiltonWatchlistInput,
    output_schema=CreateHamiltonWatchlistOutput,
    description="Create a Monitor-screen watchlist for a Pro user.",
)
async def create_hamilton_watchlist(
    *, inp: CreateHamiltonWatchlistInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateHamiltonWatchlistOutput:
    async with with_agent_tool(
        tool_name="create_hamilton_watchlist", entity="hamilton_watchlists",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO hamilton_watchlists
                 (user_id, name, filters, notify_on_change)
               VALUES ($1, $2, $3::JSONB, $4)
               RETURNING id::TEXT""",
            inp.user_id, inp.name, inp.filters, inp.notify_on_change,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateHamiltonWatchlistOutput(
        success=True, watchlist_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_hamilton_watchlist",
    entity="hamilton_watchlists",
    action="update",
    input_schema=UpdateHamiltonWatchlistInput,
    output_schema=UpdateHamiltonWatchlistOutput,
    description="Mutate a Pro user's watchlist (user_id ownership enforced).",
)
async def update_hamilton_watchlist(
    *, inp: UpdateHamiltonWatchlistInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateHamiltonWatchlistOutput:
    async with with_agent_tool(
        tool_name="update_hamilton_watchlist", entity="hamilton_watchlists",
        entity_id=inp.watchlist_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        owner = await conn.fetchval(
            "SELECT user_id FROM hamilton_watchlists WHERE id = $1::UUID",
            inp.watchlist_id,
        )
        if owner is None:
            raise ValueError(f"hamilton_watchlist {inp.watchlist_id} not found")
        if str(owner) != inp.user_id:
            raise PermissionError("watchlist user_id mismatch")
        sql, args = _sparse_update(
            {"name": inp.name, "filters": inp.filters,
             "notify_on_change": inp.notify_on_change},
            inp.watchlist_id, "id", "hamilton_watchlists",
        )
        if sql:
            await conn.execute(sql, *args)
        corr = await _correlation_of(event_id, conn)
    return UpdateHamiltonWatchlistOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="delete_hamilton_watchlist",
    entity="hamilton_watchlists",
    action="delete",
    input_schema=DeleteHamiltonWatchlistInput,
    output_schema=DeleteHamiltonWatchlistOutput,
    description="Delete a Pro user's watchlist (user_id ownership enforced).",
)
async def delete_hamilton_watchlist(
    *, inp: DeleteHamiltonWatchlistInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> DeleteHamiltonWatchlistOutput:
    async with with_agent_tool(
        tool_name="delete_hamilton_watchlist", entity="hamilton_watchlists",
        entity_id=inp.watchlist_id, action="delete", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        owner = await conn.fetchval(
            "SELECT user_id FROM hamilton_watchlists WHERE id = $1::UUID",
            inp.watchlist_id,
        )
        if owner is None:
            raise ValueError(f"hamilton_watchlist {inp.watchlist_id} not found")
        if str(owner) != inp.user_id:
            raise PermissionError("watchlist user_id mismatch")
        await conn.execute(
            "DELETE FROM hamilton_watchlists WHERE id = $1::UUID",
            inp.watchlist_id,
        )
        corr = await _correlation_of(event_id, conn)
    return DeleteHamiltonWatchlistOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# hamilton_saved_analyses -- same CRUD shape
# ========================================================================

@agent_tool(
    name="create_hamilton_saved_analysis",
    entity="hamilton_saved_analyses", action="create",
    input_schema=CreateHamiltonSavedAnalysisInput,
    output_schema=CreateHamiltonSavedAnalysisOutput,
    description="Pro Analyze screen: persist a saved AI response for an institution.",
)
async def create_hamilton_saved_analysis(
    *, inp: CreateHamiltonSavedAnalysisInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateHamiltonSavedAnalysisOutput:
    async with with_agent_tool(
        tool_name="create_hamilton_saved_analysis", entity="hamilton_saved_analyses",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO hamilton_saved_analyses
                 (user_id, institution_id, question, response, model)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id::TEXT""",
            inp.user_id, inp.institution_id, inp.question, inp.response, inp.model,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateHamiltonSavedAnalysisOutput(
        success=True, analysis_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_hamilton_saved_analysis",
    entity="hamilton_saved_analyses", action="update",
    input_schema=UpdateHamiltonSavedAnalysisInput,
    output_schema=UpdateHamiltonSavedAnalysisOutput,
    description="Edit a saved Pro analysis (user_id guard).",
)
async def update_hamilton_saved_analysis(
    *, inp: UpdateHamiltonSavedAnalysisInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateHamiltonSavedAnalysisOutput:
    async with with_agent_tool(
        tool_name="update_hamilton_saved_analysis", entity="hamilton_saved_analyses",
        entity_id=inp.analysis_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        owner = await conn.fetchval(
            "SELECT user_id FROM hamilton_saved_analyses WHERE id = $1::UUID",
            inp.analysis_id,
        )
        if owner is None:
            raise ValueError(f"analysis {inp.analysis_id} not found")
        if str(owner) != inp.user_id:
            raise PermissionError("analysis user_id mismatch")
        sql, args = _sparse_update(
            {"question": inp.question, "response": inp.response},
            inp.analysis_id, "id", "hamilton_saved_analyses",
        )
        if sql:
            await conn.execute(sql, *args)
        corr = await _correlation_of(event_id, conn)
    return UpdateHamiltonSavedAnalysisOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="delete_hamilton_saved_analysis",
    entity="hamilton_saved_analyses", action="delete",
    input_schema=DeleteHamiltonSavedAnalysisInput,
    output_schema=DeleteHamiltonSavedAnalysisOutput,
    description="Delete a saved Pro analysis (user_id guard).",
)
async def delete_hamilton_saved_analysis(
    *, inp: DeleteHamiltonSavedAnalysisInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> DeleteHamiltonSavedAnalysisOutput:
    async with with_agent_tool(
        tool_name="delete_hamilton_saved_analysis", entity="hamilton_saved_analyses",
        entity_id=inp.analysis_id, action="delete", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        owner = await conn.fetchval(
            "SELECT user_id FROM hamilton_saved_analyses WHERE id = $1::UUID",
            inp.analysis_id,
        )
        if owner is None:
            raise ValueError(f"analysis {inp.analysis_id} not found")
        if str(owner) != inp.user_id:
            raise PermissionError("analysis user_id mismatch")
        await conn.execute(
            "DELETE FROM hamilton_saved_analyses WHERE id = $1::UUID",
            inp.analysis_id,
        )
        corr = await _correlation_of(event_id, conn)
    return DeleteHamiltonSavedAnalysisOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# hamilton_scenarios -- CRUD with user_id guard
# ========================================================================

@agent_tool(
    name="create_hamilton_scenario",
    entity="hamilton_scenarios", action="create",
    input_schema=CreateHamiltonScenarioInput,
    output_schema=CreateHamiltonScenarioOutput,
    description="Pro Simulate screen: persist a scenario.",
)
async def create_hamilton_scenario(
    *, inp: CreateHamiltonScenarioInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateHamiltonScenarioOutput:
    async with with_agent_tool(
        tool_name="create_hamilton_scenario", entity="hamilton_scenarios",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO hamilton_scenarios
                 (user_id, institution_id, name, changes, confidence_tier)
               VALUES ($1, $2, $3, $4::JSONB, $5)
               RETURNING id::TEXT""",
            inp.user_id, inp.institution_id, inp.name, inp.changes, inp.confidence_tier,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateHamiltonScenarioOutput(
        success=True, scenario_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_hamilton_scenario",
    entity="hamilton_scenarios", action="update",
    input_schema=UpdateHamiltonScenarioInput,
    output_schema=UpdateHamiltonScenarioOutput,
    description="Edit a Pro Simulate scenario (user_id guard).",
)
async def update_hamilton_scenario(
    *, inp: UpdateHamiltonScenarioInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateHamiltonScenarioOutput:
    async with with_agent_tool(
        tool_name="update_hamilton_scenario", entity="hamilton_scenarios",
        entity_id=inp.scenario_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        owner = await conn.fetchval(
            "SELECT user_id FROM hamilton_scenarios WHERE id = $1::UUID",
            inp.scenario_id,
        )
        if owner is None:
            raise ValueError(f"scenario {inp.scenario_id} not found")
        if str(owner) != inp.user_id:
            raise PermissionError("scenario user_id mismatch")
        sql, args = _sparse_update(
            {"name": inp.name, "changes": inp.changes,
             "confidence_tier": inp.confidence_tier},
            inp.scenario_id, "id", "hamilton_scenarios",
        )
        if sql:
            await conn.execute(sql, *args)
        corr = await _correlation_of(event_id, conn)
    return UpdateHamiltonScenarioOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="delete_hamilton_scenario",
    entity="hamilton_scenarios", action="delete",
    input_schema=DeleteHamiltonScenarioInput,
    output_schema=DeleteHamiltonScenarioOutput,
    description="Delete a Pro Simulate scenario (user_id guard).",
)
async def delete_hamilton_scenario(
    *, inp: DeleteHamiltonScenarioInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> DeleteHamiltonScenarioOutput:
    async with with_agent_tool(
        tool_name="delete_hamilton_scenario", entity="hamilton_scenarios",
        entity_id=inp.scenario_id, action="delete", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        owner = await conn.fetchval(
            "SELECT user_id FROM hamilton_scenarios WHERE id = $1::UUID",
            inp.scenario_id,
        )
        if owner is None:
            raise ValueError(f"scenario {inp.scenario_id} not found")
        if str(owner) != inp.user_id:
            raise PermissionError("scenario user_id mismatch")
        await conn.execute(
            "DELETE FROM hamilton_scenarios WHERE id = $1::UUID",
            inp.scenario_id,
        )
        corr = await _correlation_of(event_id, conn)
    return DeleteHamiltonScenarioOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# hamilton_reports -- CRUD
# ========================================================================

@agent_tool(
    name="create_hamilton_report",
    entity="hamilton_reports", action="create",
    input_schema=CreateHamiltonReportInput,
    output_schema=CreateHamiltonReportOutput,
    description="Pro Reports screen: create a new report row (PDF-ready).",
)
async def create_hamilton_report(
    *, inp: CreateHamiltonReportInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateHamiltonReportOutput:
    async with with_agent_tool(
        tool_name="create_hamilton_report", entity="hamilton_reports",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO hamilton_reports
                 (user_id, scenario_id, title, sections, status)
               VALUES ($1, $2::UUID, $3, $4::JSONB, 'draft')
               RETURNING id::TEXT""",
            inp.user_id, inp.scenario_id, inp.title, inp.sections,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateHamiltonReportOutput(
        success=True, report_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_hamilton_report",
    entity="hamilton_reports", action="update",
    input_schema=UpdateHamiltonReportInput,
    output_schema=UpdateHamiltonReportOutput,
    description="Edit a Pro report (user_id guard).",
)
async def update_hamilton_report(
    *, inp: UpdateHamiltonReportInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateHamiltonReportOutput:
    async with with_agent_tool(
        tool_name="update_hamilton_report", entity="hamilton_reports",
        entity_id=inp.report_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        owner = await conn.fetchval(
            "SELECT user_id FROM hamilton_reports WHERE id = $1::UUID",
            inp.report_id,
        )
        if owner is None:
            raise ValueError(f"report {inp.report_id} not found")
        if str(owner) != inp.user_id:
            raise PermissionError("report user_id mismatch")
        sql, args = _sparse_update(
            {"title": inp.title, "sections": inp.sections, "status": inp.status},
            inp.report_id, "id", "hamilton_reports",
        )
        if sql:
            await conn.execute(sql, *args)
        corr = await _correlation_of(event_id, conn)
    return UpdateHamiltonReportOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="delete_hamilton_report",
    entity="hamilton_reports", action="delete",
    input_schema=DeleteHamiltonReportInput,
    output_schema=DeleteHamiltonReportOutput,
    description="Delete a Pro report (user_id guard).",
)
async def delete_hamilton_report(
    *, inp: DeleteHamiltonReportInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> DeleteHamiltonReportOutput:
    async with with_agent_tool(
        tool_name="delete_hamilton_report", entity="hamilton_reports",
        entity_id=inp.report_id, action="delete", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        owner = await conn.fetchval(
            "SELECT user_id FROM hamilton_reports WHERE id = $1::UUID",
            inp.report_id,
        )
        if owner is None:
            raise ValueError(f"report {inp.report_id} not found")
        if str(owner) != inp.user_id:
            raise PermissionError("report user_id mismatch")
        await conn.execute(
            "DELETE FROM hamilton_reports WHERE id = $1::UUID", inp.report_id,
        )
        corr = await _correlation_of(event_id, conn)
    return DeleteHamiltonReportOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# hamilton_signals -- insert only (immutable)
# ========================================================================

@agent_tool(
    name="create_hamilton_signal",
    entity="hamilton_signals", action="create",
    input_schema=CreateHamiltonSignalInput,
    output_schema=CreateHamiltonSignalOutput,
    description="Insert a Monitor signal (fee change, coverage gap, demand reflection).",
)
async def create_hamilton_signal(
    *, inp: CreateHamiltonSignalInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateHamiltonSignalOutput:
    async with with_agent_tool(
        tool_name="create_hamilton_signal", entity="hamilton_signals",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO hamilton_signals
                 (signal_type, institution_id, canonical_fee_key, severity, payload)
               VALUES ($1, $2, $3, $4, $5::JSONB)
               RETURNING id::TEXT""",
            inp.signal_type, inp.institution_id, inp.canonical_fee_key,
            inp.severity, inp.payload,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateHamiltonSignalOutput(
        success=True, signal_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# hamilton_priority_alerts -- insert + update (ack/resolve)
# ========================================================================

@agent_tool(
    name="create_hamilton_priority_alert",
    entity="hamilton_priority_alerts", action="create",
    input_schema=CreateHamiltonPriorityAlertInput,
    output_schema=CreateHamiltonPriorityAlertOutput,
    description="Attach a priority alert to a signal for a specific Pro user.",
)
async def create_hamilton_priority_alert(
    *, inp: CreateHamiltonPriorityAlertInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateHamiltonPriorityAlertOutput:
    async with with_agent_tool(
        tool_name="create_hamilton_priority_alert", entity="hamilton_priority_alerts",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO hamilton_priority_alerts
                 (user_id, signal_id, priority, status)
               VALUES ($1, $2::UUID, $3, 'unread')
               RETURNING id::TEXT""",
            inp.user_id, inp.signal_id, inp.priority,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateHamiltonPriorityAlertOutput(
        success=True, alert_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_hamilton_priority_alert",
    entity="hamilton_priority_alerts", action="update",
    input_schema=UpdateHamiltonPriorityAlertInput,
    output_schema=UpdateHamiltonPriorityAlertOutput,
    description="Transition alert status: unread -> read -> acknowledged -> resolved/dismissed.",
)
async def update_hamilton_priority_alert(
    *, inp: UpdateHamiltonPriorityAlertInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateHamiltonPriorityAlertOutput:
    async with with_agent_tool(
        tool_name="update_hamilton_priority_alert", entity="hamilton_priority_alerts",
        entity_id=inp.alert_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        owner = await conn.fetchval(
            "SELECT user_id FROM hamilton_priority_alerts WHERE id = $1::UUID",
            inp.alert_id,
        )
        if owner is None:
            raise ValueError(f"alert {inp.alert_id} not found")
        if str(owner) != inp.user_id:
            raise PermissionError("alert user_id mismatch")
        await conn.execute(
            "UPDATE hamilton_priority_alerts SET status = $2, updated_at = NOW() "
            "WHERE id = $1::UUID",
            inp.alert_id, inp.status,
        )
        corr = await _correlation_of(event_id, conn)
    return UpdateHamiltonPriorityAlertOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# hamilton_conversations + hamilton_messages
# ========================================================================

@agent_tool(
    name="create_hamilton_conversation",
    entity="hamilton_conversations", action="create",
    input_schema=CreateHamiltonConversationInput,
    output_schema=CreateHamiltonConversationOutput,
    description="Start a new research-hub conversation session for a Pro user.",
)
async def create_hamilton_conversation(
    *, inp: CreateHamiltonConversationInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateHamiltonConversationOutput:
    async with with_agent_tool(
        tool_name="create_hamilton_conversation", entity="hamilton_conversations",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO hamilton_conversations (user_id, title, metadata)
               VALUES ($1, $2, $3::JSONB)
               RETURNING id::TEXT""",
            inp.user_id, inp.title, inp.metadata,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateHamiltonConversationOutput(
        success=True, conversation_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_hamilton_conversation",
    entity="hamilton_conversations", action="update",
    input_schema=UpdateHamiltonConversationInput,
    output_schema=UpdateHamiltonConversationOutput,
    description="Rename or update metadata on a research-hub conversation.",
)
async def update_hamilton_conversation(
    *, inp: UpdateHamiltonConversationInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateHamiltonConversationOutput:
    async with with_agent_tool(
        tool_name="update_hamilton_conversation", entity="hamilton_conversations",
        entity_id=inp.conversation_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        owner = await conn.fetchval(
            "SELECT user_id FROM hamilton_conversations WHERE id = $1::UUID",
            inp.conversation_id,
        )
        if owner is None:
            raise ValueError(f"conversation {inp.conversation_id} not found")
        if str(owner) != inp.user_id:
            raise PermissionError("conversation user_id mismatch")
        sql, args = _sparse_update(
            {"title": inp.title, "metadata": inp.metadata},
            inp.conversation_id, "id", "hamilton_conversations",
        )
        if sql:
            await conn.execute(sql, *args)
        corr = await _correlation_of(event_id, conn)
    return UpdateHamiltonConversationOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="create_hamilton_message",
    entity="hamilton_messages", action="create",
    input_schema=CreateHamiltonMessageInput,
    output_schema=CreateHamiltonMessageOutput,
    description="Append a turn to a research-hub conversation. FK-guarded by hamilton_conversations.",
)
async def create_hamilton_message(
    *, inp: CreateHamiltonMessageInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateHamiltonMessageOutput:
    async with with_agent_tool(
        tool_name="create_hamilton_message", entity="hamilton_messages",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        # FK REFERENCES hamilton_conversations(id) raises foreign_key_violation
        # asyncpg.ForeignKeyViolationError on orphan insert -- caller propagates.
        new_id = await conn.fetchval(
            """INSERT INTO hamilton_messages
                 (conversation_id, user_id, role, content, tool_calls)
               VALUES ($1::UUID, $2, $3, $4, $5::JSONB)
               RETURNING id::TEXT""",
            inp.conversation_id, inp.user_id, inp.role, inp.content, inp.tool_calls,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateHamiltonMessageOutput(
        success=True, message_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# published_reports
# ========================================================================

@agent_tool(
    name="create_published_report",
    entity="published_reports", action="create",
    input_schema=CreatePublishedReportInput,
    output_schema=CreatePublishedReportOutput,
    description="Admin: publish a report to the public site.",
)
async def create_published_report(
    *, inp: CreatePublishedReportInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreatePublishedReportOutput:
    async with with_agent_tool(
        tool_name="create_published_report", entity="published_reports",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO published_reports
                 (slug, title, summary, body, published_by, status)
               VALUES ($1, $2, $3, $4, $5, 'draft')
               RETURNING id::TEXT""",
            inp.slug, inp.title, inp.summary, inp.body, inp.published_by,
        )
        corr = await _correlation_of(event_id, conn)
    return CreatePublishedReportOutput(
        success=True, published_report_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_published_report",
    entity="published_reports", action="update",
    input_schema=UpdatePublishedReportInput,
    output_schema=UpdatePublishedReportOutput,
    description="Admin: edit a published report (title/summary/body/status).",
)
async def update_published_report(
    *, inp: UpdatePublishedReportInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdatePublishedReportOutput:
    async with with_agent_tool(
        tool_name="update_published_report", entity="published_reports",
        entity_id=inp.published_report_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        sql, args = _sparse_update(
            {"title": inp.title, "summary": inp.summary,
             "body": inp.body, "status": inp.status},
            inp.published_report_id, "id", "published_reports",
        )
        if sql:
            await conn.execute(sql, *args)
        corr = await _correlation_of(event_id, conn)
    return UpdatePublishedReportOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# report_jobs -- create, update, cancel
# ========================================================================

@agent_tool(
    name="create_report_job",
    entity="report_jobs", action="create",
    input_schema=CreateReportJobInput,
    output_schema=CreateReportJobOutput,
    description="Queue a new report generation job.",
)
async def create_report_job(
    *, inp: CreateReportJobInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateReportJobOutput:
    async with with_agent_tool(
        tool_name="create_report_job", entity="report_jobs",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO report_jobs (user_id, report_type, params, status)
               VALUES ($1, $2, $3::JSONB, 'pending')
               RETURNING id::TEXT""",
            inp.user_id, inp.report_type, inp.params,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateReportJobOutput(
        success=True, job_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_report_job",
    entity="report_jobs", action="update",
    input_schema=UpdateReportJobInput,
    output_schema=UpdateReportJobOutput,
    description="Mutate status/progress/result/error on a running job.",
)
async def update_report_job(
    *, inp: UpdateReportJobInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateReportJobOutput:
    async with with_agent_tool(
        tool_name="update_report_job", entity="report_jobs",
        entity_id=inp.job_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            """UPDATE report_jobs
                  SET status = $2,
                      progress_pct = COALESCE($3, progress_pct),
                      result_url = COALESCE($4, result_url),
                      error = COALESCE($5, error),
                      updated_at = NOW()
                WHERE id = $1::UUID""",
            inp.job_id, inp.status, inp.progress_pct, inp.result_url, inp.error,
        )
        corr = await _correlation_of(event_id, conn)
    return UpdateReportJobOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="cancel_report_job",
    entity="report_jobs", action="update",
    input_schema=CancelReportJobInput,
    output_schema=CancelReportJobOutput,
    description="Cancel a pending/running report job; writes before/after to agent_auth_log.",
)
async def cancel_report_job(
    *, inp: CancelReportJobInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CancelReportJobOutput:
    async with with_agent_tool(
        tool_name="cancel_report_job", entity="report_jobs",
        entity_id=inp.job_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            """UPDATE report_jobs
                  SET status = 'cancelled',
                      error = COALESCE($2, error),
                      cancelled_at = NOW(),
                      updated_at = NOW()
                WHERE id = $1::UUID
                  AND status IN ('pending', 'running')""",
            inp.job_id, inp.reason,
        )
        corr = await _correlation_of(event_id, conn)
    return CancelReportJobOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# articles
# ========================================================================

@agent_tool(
    name="create_article",
    entity="articles", action="create",
    input_schema=CreateArticleInput,
    output_schema=CreateArticleOutput,
    description="Admin: author a news/research article (content-layer).",
)
async def create_article(
    *, inp: CreateArticleInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateArticleOutput:
    async with with_agent_tool(
        tool_name="create_article", entity="articles",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO articles (slug, title, body, author, tags, status)
               VALUES ($1, $2, $3, $4, $5, 'draft')
               RETURNING id::TEXT""",
            inp.slug, inp.title, inp.body, inp.author, inp.tags,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateArticleOutput(
        success=True, article_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_article",
    entity="articles", action="update",
    input_schema=UpdateArticleInput,
    output_schema=UpdateArticleOutput,
    description="Admin: edit an article (title/body/tags/status).",
)
async def update_article(
    *, inp: UpdateArticleInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateArticleOutput:
    async with with_agent_tool(
        tool_name="update_article", entity="articles",
        entity_id=inp.article_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        sql, args = _sparse_update(
            {"title": inp.title, "body": inp.body, "tags": inp.tags, "status": inp.status},
            inp.article_id, "id", "articles",
        )
        if sql:
            await conn.execute(sql, *args)
        corr = await _correlation_of(event_id, conn)
    return UpdateArticleOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="delete_article",
    entity="articles", action="delete",
    input_schema=DeleteArticleInput,
    output_schema=DeleteArticleOutput,
    description="Admin: delete an article.",
)
async def delete_article(
    *, inp: DeleteArticleInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> DeleteArticleOutput:
    async with with_agent_tool(
        tool_name="delete_article", entity="articles",
        entity_id=inp.article_id, action="delete", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            "DELETE FROM articles WHERE id = $1::UUID", inp.article_id,
        )
        corr = await _correlation_of(event_id, conn)
    return DeleteArticleOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )
