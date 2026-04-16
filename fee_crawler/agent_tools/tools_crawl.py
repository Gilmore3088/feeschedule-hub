"""Crawl/Knox-domain CRUD tools (Plan 62A-08, Group B).

All tools route through with_agent_tool for audit + event logging.
Knox state agents (Phase 63) will be the primary caller of
upsert_institution_dossier to record per-institution strategy memory.
"""

from __future__ import annotations

from typing import Optional

from fee_crawler.agent_tools.gateway import with_agent_tool
from fee_crawler.agent_tools.registry import agent_tool
from fee_crawler.agent_tools.schemas import (
    AgentEventRef,
    CreateCrawlResultInput,
    CreateCrawlResultOutput,
    CreateCrawlRunInput,
    CreateCrawlRunOutput,
    CreateJobInput,
    CreateJobOutput,
    CreateWaveRunInput,
    CreateWaveRunOutput,
    UpdateCrawlRunInput,
    UpdateCrawlRunOutput,
    UpdateCrawlTargetInput,
    UpdateCrawlTargetOutput,
    UpdateJobInput,
    UpdateJobOutput,
    UpdateWaveStateRunInput,
    UpdateWaveStateRunOutput,
    UpsertInstitutionDossierInput,
    UpsertInstitutionDossierOutput,
)


async def _correlation_of(event_id: str, conn) -> str:
    """Fetch correlation_id for the event we just wrote, as a plain text uuid."""
    row = await conn.fetchrow(
        "SELECT correlation_id::TEXT AS c FROM agent_events WHERE event_id = $1::UUID",
        event_id,
    )
    return row["c"] if row else ""


# ========================================================================
# crawl_targets
# ========================================================================

@agent_tool(
    name="update_crawl_target",
    entity="crawl_targets",
    action="update",
    input_schema=UpdateCrawlTargetInput,
    output_schema=UpdateCrawlTargetOutput,
    description=(
        "Mutate crawl_targets.status / fee_schedule_url / last_content_hash / "
        "document_type only. Mutable-field allow-list enforced at the schema "
        "boundary (T-62A08-02 mitigation)."
    ),
)
async def update_crawl_target(
    *,
    inp: UpdateCrawlTargetInput,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateCrawlTargetOutput:
    async with with_agent_tool(
        tool_name="update_crawl_target",
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
        # Build dynamic UPDATE with only supplied fields.
        sets: list[str] = []
        args: list = []
        i = 1
        for field in ("status", "fee_schedule_url", "last_content_hash", "document_type"):
            val = getattr(inp, field)
            if val is not None:
                sets.append(f'"{field}" = ${i}')
                args.append(val)
                i += 1
        if sets:
            args.append(inp.crawl_target_id)
            await conn.execute(
                f'UPDATE crawl_targets SET {", ".join(sets)} WHERE id = ${i}',
                *args,
            )
        corr = await _correlation_of(event_id, conn)
    return UpdateCrawlTargetOutput(
        success=True,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# crawl_results
# ========================================================================

@agent_tool(
    name="create_crawl_result",
    entity="crawl_results",
    action="create",
    input_schema=CreateCrawlResultInput,
    output_schema=CreateCrawlResultOutput,
    description="Record a single crawl attempt outcome for one target.",
)
async def create_crawl_result(
    *,
    inp: CreateCrawlResultInput,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateCrawlResultOutput:
    async with with_agent_tool(
        tool_name="create_crawl_result",
        entity="crawl_results",
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
            """INSERT INTO crawl_results
                   (crawl_target_id, crawl_run_id, document_url, document_path,
                    status, status_code, content_hash)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id""",
            inp.crawl_target_id,
            inp.crawl_run_id,
            inp.document_url,
            inp.document_path,
            inp.status,
            inp.status_code,
            inp.content_hash,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateCrawlResultOutput(
        success=True,
        crawl_result_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# crawl_runs
# ========================================================================

@agent_tool(
    name="create_crawl_run",
    entity="crawl_runs",
    action="create",
    input_schema=CreateCrawlRunInput,
    output_schema=CreateCrawlRunOutput,
    description="Start a new crawl run with N targets.",
)
async def create_crawl_run(
    *,
    inp: CreateCrawlRunInput,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateCrawlRunOutput:
    async with with_agent_tool(
        tool_name="create_crawl_run",
        entity="crawl_runs",
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
            "INSERT INTO crawl_runs (trigger, targets_total) VALUES ($1, $2) RETURNING id",
            inp.trigger,
            inp.targets_total,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateCrawlRunOutput(
        success=True,
        crawl_run_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_crawl_run",
    entity="crawl_runs",
    action="update",
    input_schema=UpdateCrawlRunInput,
    output_schema=UpdateCrawlRunOutput,
    description="Update status + counters on a crawl run.",
)
async def update_crawl_run(
    *,
    inp: UpdateCrawlRunInput,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateCrawlRunOutput:
    async with with_agent_tool(
        tool_name="update_crawl_run",
        entity="crawl_runs",
        entity_id=inp.crawl_run_id,
        action="update",
        agent_name=agent_name,
        reasoning_prompt=reasoning_prompt,
        reasoning_output=reasoning_output,
        input_payload=inp.model_dump(),
        pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        sets: list[str] = []
        args: list = []
        i = 1
        for field in ("status", "targets_crawled", "targets_succeeded", "targets_failed"):
            val = getattr(inp, field)
            if val is not None:
                sets.append(f'"{field}" = ${i}')
                args.append(val)
                i += 1
        if sets:
            args.append(inp.crawl_run_id)
            await conn.execute(
                f'UPDATE crawl_runs SET {", ".join(sets)} WHERE id = ${i}',
                *args,
            )
        corr = await _correlation_of(event_id, conn)
    return UpdateCrawlRunOutput(
        success=True,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# institution_dossiers — UPSERT (KNOX-03)
# ========================================================================

@agent_tool(
    name="upsert_institution_dossier",
    entity="institution_dossiers",
    action="upsert",
    input_schema=UpsertInstitutionDossierInput,
    output_schema=UpsertInstitutionDossierOutput,
    description=(
        "Knox state-agent strategy memory upsert per institution (one row per "
        "institution). KNOX-03 foundation: last-wins semantics on ON CONFLICT "
        "(institution_id)."
    ),
)
async def upsert_institution_dossier(
    *,
    inp: UpsertInstitutionDossierInput,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpsertInstitutionDossierOutput:
    import json as _json

    async with with_agent_tool(
        tool_name="upsert_institution_dossier",
        entity="institution_dossiers",
        entity_id=inp.institution_id,
        action="upsert",
        agent_name=agent_name,
        reasoning_prompt=reasoning_prompt,
        reasoning_output=reasoning_output,
        input_payload=inp.model_dump(),
        pk_column="institution_id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        # JSON-stringify the notes jsonb binding to avoid depending on a
        # per-connection JSONB codec (matches gateway._dumps_or_none pattern).
        notes_json = _json.dumps(inp.notes or {}, default=str)
        await conn.execute(
            """INSERT INTO institution_dossiers
                 (institution_id, last_url_tried, last_document_format,
                  last_strategy, last_outcome, last_cost_cents,
                  next_try_recommendation, notes,
                  updated_by_agent_event_id, updated_by_agent, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB, $9::UUID, $10, NOW())
               ON CONFLICT (institution_id) DO UPDATE SET
                  last_url_tried = EXCLUDED.last_url_tried,
                  last_document_format = EXCLUDED.last_document_format,
                  last_strategy = EXCLUDED.last_strategy,
                  last_outcome = EXCLUDED.last_outcome,
                  last_cost_cents = EXCLUDED.last_cost_cents,
                  next_try_recommendation = EXCLUDED.next_try_recommendation,
                  notes = EXCLUDED.notes,
                  updated_by_agent_event_id = EXCLUDED.updated_by_agent_event_id,
                  updated_by_agent = EXCLUDED.updated_by_agent,
                  updated_at = NOW()""",
            inp.institution_id,
            inp.last_url_tried,
            inp.last_document_format,
            inp.last_strategy,
            inp.last_outcome,
            inp.last_cost_cents,
            inp.next_try_recommendation,
            notes_json,
            event_id,
            agent_name,
        )
        corr = await _correlation_of(event_id, conn)
    return UpsertInstitutionDossierOutput(
        success=True,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# jobs
# ========================================================================

@agent_tool(
    name="create_job",
    entity="jobs",
    action="create",
    input_schema=CreateJobInput,
    output_schema=CreateJobOutput,
    description="Create a pipeline job record.",
)
async def create_job(
    *,
    inp: CreateJobInput,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateJobOutput:
    import json as _json

    async with with_agent_tool(
        tool_name="create_job",
        entity="jobs",
        entity_id=None,
        action="create",
        agent_name=agent_name,
        reasoning_prompt=reasoning_prompt,
        reasoning_output=reasoning_output,
        input_payload=inp.model_dump(),
        pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        payload_json = _json.dumps(inp.payload or {}, default=str)
        new_id = await conn.fetchval(
            """INSERT INTO jobs (job_type, target_id, status, payload, created_at)
               VALUES ($1, $2, 'pending', $3::JSONB, NOW())
               RETURNING id""",
            inp.job_type,
            inp.target_id,
            payload_json,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateJobOutput(
        success=True,
        job_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_job",
    entity="jobs",
    action="update",
    input_schema=UpdateJobInput,
    output_schema=UpdateJobOutput,
    description="Update pipeline job status/result/error.",
)
async def update_job(
    *,
    inp: UpdateJobInput,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateJobOutput:
    import json as _json

    async with with_agent_tool(
        tool_name="update_job",
        entity="jobs",
        entity_id=inp.job_id,
        action="update",
        agent_name=agent_name,
        reasoning_prompt=reasoning_prompt,
        reasoning_output=reasoning_output,
        input_payload=inp.model_dump(),
        pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        result_json = _json.dumps(inp.result, default=str) if inp.result is not None else None
        await conn.execute(
            """UPDATE jobs
                  SET status = $2,
                      error = COALESCE($3, error),
                      result = COALESCE($4::JSONB, result),
                      updated_at = NOW()
                WHERE id = $1""",
            inp.job_id,
            inp.status,
            inp.error,
            result_json,
        )
        corr = await _correlation_of(event_id, conn)
    return UpdateJobOutput(
        success=True,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# wave_runs + wave_state_runs
# ========================================================================

@agent_tool(
    name="create_wave_run",
    entity="wave_runs",
    action="create",
    input_schema=CreateWaveRunInput,
    output_schema=CreateWaveRunOutput,
    description="Atlas: start a new orchestration wave.",
)
async def create_wave_run(
    *,
    inp: CreateWaveRunInput,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateWaveRunOutput:
    async with with_agent_tool(
        tool_name="create_wave_run",
        entity="wave_runs",
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
            """INSERT INTO wave_runs (wave_type, state_codes, planned_targets, status, created_at)
               VALUES ($1, $2, $3, 'pending', NOW())
               RETURNING id""",
            inp.wave_type,
            inp.state_codes,
            inp.planned_targets,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateWaveRunOutput(
        success=True,
        wave_run_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_wave_state_run",
    entity="wave_state_runs",
    action="update",
    input_schema=UpdateWaveStateRunInput,
    output_schema=UpdateWaveStateRunOutput,
    description="Atlas: update per-state wave status + outcome counters.",
)
async def update_wave_state_run(
    *,
    inp: UpdateWaveStateRunInput,
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateWaveStateRunOutput:
    async with with_agent_tool(
        tool_name="update_wave_state_run",
        entity="wave_state_runs",
        entity_id=inp.wave_state_run_id,
        action="update",
        agent_name=agent_name,
        reasoning_prompt=reasoning_prompt,
        reasoning_output=reasoning_output,
        input_payload=inp.model_dump(),
        pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            """UPDATE wave_state_runs
                  SET status = $2,
                      extracted_count = COALESCE($3, extracted_count),
                      failure_reason = COALESCE($4, failure_reason),
                      updated_at = NOW()
                WHERE id = $1""",
            inp.wave_state_run_id,
            inp.status,
            inp.extracted_count,
            inp.failure_reason,
        )
        corr = await _correlation_of(event_id, conn)
    return UpdateWaveStateRunOutput(
        success=True,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )
