---
phase: 62A
plan: 08
type: execute
wave: 2
depends_on:
  - 62A-05
files_modified:
  - fee_crawler/agent_tools/tools_crawl.py
  - fee_crawler/agent_tools/schemas/crawl.py
  - fee_crawler/tests/test_tools_crawl.py
autonomous: true
requirements:
  - AGENT-05
must_haves:
  truths:
    - "upsert_institution_dossier registered in TOOL_REGISTRY with entity='institution_dossiers' action='upsert'"
    - "Calling upsert_institution_dossier twice on the same institution_id updates in place (single dossier row per institution)"
    - "All 8 tools register: update_crawl_target, create_crawl_result, create_crawl_run, update_crawl_run, upsert_institution_dossier, create_job, update_job, create_wave_run, update_wave_state_run"
    - "entities_covered() adds: crawl_targets, crawl_results, crawl_runs, institution_dossiers, jobs, wave_runs, wave_state_runs"
    - "Crawl-domain schemas live in `fee_crawler/agent_tools/schemas/crawl.py`; re-exported through `schemas/__init__.py`"
  artifacts:
    - path: "fee_crawler/agent_tools/tools_crawl.py"
      provides: "CRUD tools for crawl/Knox-state-agent entities: crawl_targets, crawl_results, crawl_runs, institution_dossiers, jobs, wave_runs, wave_state_runs"
      contains: "@agent_tool"
    - path: "fee_crawler/agent_tools/schemas/crawl.py"
      provides: "Pydantic v2 input/output schemas for every crawl-domain tool registered by tools_crawl.py"
      contains: "class UpsertInstitutionDossierInput"
    - path: "fee_crawler/tests/test_tools_crawl.py"
      provides: "Integration tests for upsert_institution_dossier + gateway-routed crawl tools"
      contains: "test_institution_dossier_upsert_idempotent"
  key_links:
    - from: "tools_crawl.upsert_institution_dossier"
      to: "institution_dossiers + agent_events + agent_auth_log"
      via: "with_agent_tool + INSERT ON CONFLICT DO UPDATE"
      pattern: "ON CONFLICT.*DO UPDATE"
    - from: "fee_crawler/agent_tools/schemas/__init__.py (pre-wired by Plan 05)"
      to: "fee_crawler/agent_tools/schemas/crawl.py"
      via: "try/except star-import re-export activates when crawl.py lands"
      pattern: "from fee_crawler.agent_tools.schemas.crawl import"
---

<objective>
Register CRUD tools for 7 crawl/orchestration entities. Knox (Phase 63) uses `upsert_institution_dossier` on every state-agent run to record URL/format/strategy/outcome. Atlas (Phase 65) reads wave_runs + wave_state_runs for orchestration lineage.

Entities covered (7):
1. `crawl_targets` — update (status, url, last_*)
2. `crawl_results` — create
3. `crawl_runs` — create, update
4. `institution_dossiers` — upsert (D-03 contract; KNOX-03 foundation)
5. `jobs` — create, update
6. `wave_runs` — create (write by Atlas)
7. `wave_state_runs` — update (write by Atlas; per-state wave lineage)

**File-conflict fix:** Schemas for this plan live in a new per-domain module `fee_crawler/agent_tools/schemas/crawl.py` so Plans 07/08/09/10 can each own a disjoint schemas file and run in parallel in Wave 2. Plan 62A-05 shipped the `schemas/` package skeleton with pre-wired try/except wildcard imports; this plan only adds `schemas/crawl.py` (no `__init__.py` edit).

Purpose: Knox state agents can't persist learning without `institution_dossiers`; Atlas can't schedule without `wave_runs`; the pipeline can't report status without `jobs`. These tools are the spine of the Modal-agent runtime.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md
@.planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md
@fee_crawler/agent_tools/gateway.py
@fee_crawler/agent_tools/registry.py
@fee_crawler/agent_tools/schemas/_base.py
@fee_crawler/agent_tools/schemas/__init__.py
@supabase/migrations/20260419_institution_dossiers.sql
@supabase/migrations/20260407_wave_runs.sql
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| State agent → institution_dossiers | Knox state agents write only their own institutions (Phase 63 enforces state_code match; 62a trusts the input) |
| Atlas → wave_runs | Only Atlas should write; 62a trusts agent_name header |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-62A08-01 | Spoofing | State agent writes dossier for an institution outside its state | medium | accept | 62a scope ships the upsert tool; Phase 63 adds state_code cross-check and KNOX-08 assertion |
| T-62A08-02 | Tampering | Agent updates crawl_targets.status to 'active' to reset failure count | medium | mitigate | update_crawl_target schema restricts mutable fields to {status, fee_schedule_url, last_content_hash, last_crawl_at}; amount/asset fields excluded |
| T-62A08-03 | Denial of Service | create_crawl_result called in a tight loop | low | accept | Budget enforcement (Plan 62A-05) caps via cost_cents; crawl_results has no cost but wave-level accounting (Phase 65) will slow agents down |
| T-62A08-04 | Information Disclosure | institution_dossiers.notes exposes URLs tried per institution | low | accept | Fee schedule URLs are public data; internal strategy notes are ops-only (MCP read requires API key) |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Create crawl-domain schemas module (schemas/crawl.py)</name>
  <files>fee_crawler/agent_tools/schemas/crawl.py</files>
  <read_first>
    - fee_crawler/agent_tools/schemas/_base.py (existing BaseToolInput / BaseToolOutput / AgentEventRef from Plan 62A-05)
    - fee_crawler/agent_tools/schemas/__init__.py (pre-wired by Plan 62A-05 with try/except wildcard — THIS plan does NOT edit it; only create the per-domain schema file)
    - supabase/migrations/20260419_institution_dossiers.sql (columns + CHECK enums)
  </read_first>
  <action>
Create a new per-domain module `fee_crawler/agent_tools/schemas/crawl.py` (do NOT append to a shared schemas.py — that file does not exist; the schemas/ package was split per the revision fix). Plan 62A-05 pre-wired `schemas/__init__.py` with a try/except wildcard import for this module, so simply creating the file is sufficient — no `__init__.py` edit required.

### fee_crawler/agent_tools/schemas/crawl.py

```python
"""Pydantic v2 schemas for crawl-domain tools (Plan 62A-08).

Owned by tools_crawl.py. Re-exported through fee_crawler/agent_tools/schemas/__init__.py
so callers continue using `from fee_crawler.agent_tools.schemas import <ClassName>`.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import Field

from fee_crawler.agent_tools.schemas._base import (
    AgentEventRef,
    BaseToolInput,
    BaseToolOutput,
)


# ----------------------------------------------------------------------
# crawl_targets
# ----------------------------------------------------------------------

class UpdateCrawlTargetInput(BaseToolInput):
    crawl_target_id: int = Field(gt=0)
    status: Optional[Literal["active", "paused", "offline", "archived"]] = None
    fee_schedule_url: Optional[str] = None
    last_content_hash: Optional[str] = None
    document_type: Optional[str] = None


class UpdateCrawlTargetOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# ----------------------------------------------------------------------
# crawl_results
# ----------------------------------------------------------------------

class CreateCrawlResultInput(BaseToolInput):
    crawl_target_id: int = Field(gt=0)
    crawl_run_id: Optional[int] = None
    document_url: Optional[str] = None
    document_path: Optional[str] = None
    status: str  # 'success' | 'failed' | 'blocked' | '404'
    status_code: Optional[int] = None
    content_hash: Optional[str] = None


class CreateCrawlResultOutput(BaseToolOutput):
    crawl_result_id: Optional[int] = None
    event_ref: Optional[AgentEventRef] = None


# ----------------------------------------------------------------------
# crawl_runs
# ----------------------------------------------------------------------

class CreateCrawlRunInput(BaseToolInput):
    trigger: str  # 'scheduled' | 'manual' | 'preflight' | 'wave'
    targets_total: int = Field(ge=0)


class CreateCrawlRunOutput(BaseToolOutput):
    crawl_run_id: Optional[int] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateCrawlRunInput(BaseToolInput):
    crawl_run_id: int = Field(gt=0)
    status: Optional[Literal["running", "succeeded", "failed", "cancelled"]] = None
    targets_crawled: Optional[int] = Field(default=None, ge=0)
    targets_succeeded: Optional[int] = Field(default=None, ge=0)
    targets_failed: Optional[int] = Field(default=None, ge=0)


class UpdateCrawlRunOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# ----------------------------------------------------------------------
# institution_dossiers — upsert (KNOX-03)
# ----------------------------------------------------------------------

class UpsertInstitutionDossierInput(BaseToolInput):
    institution_id: int = Field(gt=0)
    last_url_tried: Optional[str] = None
    last_document_format: Optional[Literal[
        "pdf", "html", "js_rendered", "stealth_pass_1", "stealth_pass_2", "unknown"
    ]] = None
    last_strategy: Optional[str] = None
    last_outcome: Optional[Literal[
        "success", "blocked", "404", "no_fees", "captcha", "rate_limited", "unknown"
    ]] = None
    last_cost_cents: int = Field(default=0, ge=0)
    next_try_recommendation: Optional[Literal[
        "retry_same", "stealth_pass_1", "needs_playwright_stealth", "skip", "rediscover_url"
    ]] = None
    notes: Dict[str, Any] = Field(default_factory=dict)


class UpsertInstitutionDossierOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# ----------------------------------------------------------------------
# jobs
# ----------------------------------------------------------------------

class CreateJobInput(BaseToolInput):
    job_type: str  # 'extract' | 'discover' | 'classify' | 'recrawl' | other
    target_id: Optional[int] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class CreateJobOutput(BaseToolOutput):
    job_id: Optional[int] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateJobInput(BaseToolInput):
    job_id: int = Field(gt=0)
    status: Literal["pending", "running", "succeeded", "failed", "cancelled"]
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None


class UpdateJobOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# ----------------------------------------------------------------------
# wave_runs + wave_state_runs
# ----------------------------------------------------------------------

class CreateWaveRunInput(BaseToolInput):
    wave_type: str  # 'quarterly' | 'remediation' | 'manual'
    state_codes: List[str] = Field(default_factory=list)
    planned_targets: int = Field(default=0, ge=0)


class CreateWaveRunOutput(BaseToolOutput):
    wave_run_id: Optional[int] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateWaveStateRunInput(BaseToolInput):
    wave_state_run_id: int = Field(gt=0)
    status: Literal["pending", "running", "succeeded", "failed"]
    extracted_count: Optional[int] = Field(default=None, ge=0)
    failure_reason: Optional[str] = None


class UpdateWaveStateRunOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


__all__ = [
    "UpdateCrawlTargetInput", "UpdateCrawlTargetOutput",
    "CreateCrawlResultInput", "CreateCrawlResultOutput",
    "CreateCrawlRunInput", "CreateCrawlRunOutput",
    "UpdateCrawlRunInput", "UpdateCrawlRunOutput",
    "UpsertInstitutionDossierInput", "UpsertInstitutionDossierOutput",
    "CreateJobInput", "CreateJobOutput",
    "UpdateJobInput", "UpdateJobOutput",
    "CreateWaveRunInput", "CreateWaveRunOutput",
    "UpdateWaveStateRunInput", "UpdateWaveStateRunOutput",
]
```

### No edit to `fee_crawler/agent_tools/schemas/__init__.py`

Plan 62A-05 pre-wired the package `__init__.py` with a `try/except ImportError` wrapper around every per-domain wildcard import — including `from fee_crawler.agent_tools.schemas.crawl import *`. As soon as `schemas/crawl.py` exists on disk, that import activates automatically. **This plan does NOT touch `schemas/__init__.py`** — Wave 2 parallel execution is safe because each plan only creates its own per-domain module (no shared file writes beyond the module they own).
  </action>
  <verify>
    <automated>python -c "from fee_crawler.agent_tools.schemas import UpdateCrawlTargetInput, CreateCrawlResultInput, CreateCrawlRunInput, UpdateCrawlRunInput, UpsertInstitutionDossierInput, CreateJobInput, UpdateJobInput, CreateWaveRunInput, UpdateWaveStateRunInput; print('OK')" && python -c "from fee_crawler.agent_tools.schemas.crawl import UpsertInstitutionDossierInput; print('OK direct')"</automated>
  </verify>
  <acceptance_criteria>
    - `fee_crawler/agent_tools/schemas/crawl.py` exists and parses
    - `grep -c "class UpdateCrawlTargetInput\|class CreateCrawlResultInput\|class CreateCrawlRunInput\|class UpdateCrawlRunInput\|class UpsertInstitutionDossierInput\|class CreateJobInput\|class UpdateJobInput\|class CreateWaveRunInput\|class UpdateWaveStateRunInput" fee_crawler/agent_tools/schemas/crawl.py` returns 9
    - `from fee_crawler.agent_tools.schemas import UpsertInstitutionDossierInput` resolves via the pre-wired try/except in schemas/__init__.py (no edit to __init__.py required)
    - All 9 classes importable via `from fee_crawler.agent_tools.schemas import ...`
    - `python -c "from fee_crawler.agent_tools.schemas.crawl import UpsertInstitutionDossierInput; print('OK direct')"` succeeds
  </acceptance_criteria>
  <done>9 Pydantic schemas added in `schemas/crawl.py`; package `__init__.py` (pre-wired by Plan 05 with try/except) auto-activates the wildcard re-export.</done>
</task>

<task type="auto">
  <name>Task 2: Implement tools_crawl.py with 9 @agent_tool functions</name>
  <files>fee_crawler/agent_tools/tools_crawl.py</files>
  <read_first>
    - fee_crawler/agent_tools/tools_fees.py (pattern reference: _correlation_of helper, gateway usage)
    - fee_crawler/agent_tools/schemas/crawl.py (newly-added crawl schemas)
    - supabase/migrations/20260419_institution_dossiers.sql (upsert target)
    - fee_crawler/db.py (existing crawl_targets, crawl_results, crawl_runs column layouts)
  </read_first>
  <action>
Create `fee_crawler/agent_tools/tools_crawl.py` following the exact same pattern as tools_fees.py. Each tool:
1. Decorated with `@agent_tool(name=..., entity=..., action=...)`
2. Opens `async with with_agent_tool(...)` context manager
3. Executes the target write INSIDE the `async with` block using the yielded `conn`
4. Fetches correlation_id via the `_correlation_of` helper (copy from tools_fees.py or import)
5. Returns the appropriate output schema with success=True + event_ref

Implement all 9 tools:

```python
"""Crawl/Knox-domain CRUD tools (Plan 62A-08, Group B).

All tools route through with_agent_tool for audit + event logging.
Knox state agents (Phase 63) will be the primary caller of upsert_institution_dossier.
"""

from __future__ import annotations

import json
from typing import Optional

from fee_crawler.agent_tools.gateway import with_agent_tool
from fee_crawler.agent_tools.registry import agent_tool
from fee_crawler.agent_tools.schemas import (
    AgentEventRef,
    UpdateCrawlTargetInput, UpdateCrawlTargetOutput,
    CreateCrawlResultInput, CreateCrawlResultOutput,
    CreateCrawlRunInput, CreateCrawlRunOutput,
    UpdateCrawlRunInput, UpdateCrawlRunOutput,
    UpsertInstitutionDossierInput, UpsertInstitutionDossierOutput,
    CreateJobInput, CreateJobOutput,
    UpdateJobInput, UpdateJobOutput,
    CreateWaveRunInput, CreateWaveRunOutput,
    UpdateWaveStateRunInput, UpdateWaveStateRunOutput,
)


async def _correlation_of(event_id: str, conn) -> str:
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
    description="Mutate crawl_targets.status / fee_schedule_url / last_content_hash / document_type only.",
)
async def update_crawl_target(
    *, inp: UpdateCrawlTargetInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateCrawlTargetOutput:
    async with with_agent_tool(
        tool_name="update_crawl_target", entity="crawl_targets",
        entity_id=inp.crawl_target_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
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
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
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
    description="Record a single crawl attempt outcome.",
)
async def create_crawl_result(
    *, inp: CreateCrawlResultInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateCrawlResultOutput:
    async with with_agent_tool(
        tool_name="create_crawl_result", entity="crawl_results",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO crawl_results
                   (crawl_target_id, crawl_run_id, document_url, document_path,
                    status, status_code, content_hash)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id""",
            inp.crawl_target_id, inp.crawl_run_id, inp.document_url,
            inp.document_path, inp.status, inp.status_code, inp.content_hash,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateCrawlResultOutput(
        success=True, crawl_result_id=new_id,
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
    *, inp: CreateCrawlRunInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateCrawlRunOutput:
    async with with_agent_tool(
        tool_name="create_crawl_run", entity="crawl_runs",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            "INSERT INTO crawl_runs (trigger, targets_total) VALUES ($1, $2) RETURNING id",
            inp.trigger, inp.targets_total,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateCrawlRunOutput(
        success=True, crawl_run_id=new_id,
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
    *, inp: UpdateCrawlRunInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateCrawlRunOutput:
    async with with_agent_tool(
        tool_name="update_crawl_run", entity="crawl_runs",
        entity_id=inp.crawl_run_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        sets, args, i = [], [], 1
        for field in ("status", "targets_crawled", "targets_succeeded", "targets_failed"):
            val = getattr(inp, field)
            if val is not None:
                sets.append(f'"{field}" = ${i}'); args.append(val); i += 1
        if sets:
            args.append(inp.crawl_run_id)
            await conn.execute(
                f'UPDATE crawl_runs SET {", ".join(sets)} WHERE id = ${i}', *args,
            )
        corr = await _correlation_of(event_id, conn)
    return UpdateCrawlRunOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
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
    description="Knox state-agent strategy memory upsert per institution (one row per institution).",
)
async def upsert_institution_dossier(
    *, inp: UpsertInstitutionDossierInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpsertInstitutionDossierOutput:
    async with with_agent_tool(
        tool_name="upsert_institution_dossier", entity="institution_dossiers",
        entity_id=inp.institution_id, action="upsert", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="institution_id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
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
            inp.institution_id, inp.last_url_tried, inp.last_document_format,
            inp.last_strategy, inp.last_outcome, inp.last_cost_cents,
            inp.next_try_recommendation, inp.notes,
            event_id, agent_name,
        )
        corr = await _correlation_of(event_id, conn)
    return UpsertInstitutionDossierOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# jobs
# ========================================================================

@agent_tool(
    name="create_job", entity="jobs", action="create",
    input_schema=CreateJobInput, output_schema=CreateJobOutput,
    description="Create a pipeline job record.",
)
async def create_job(
    *, inp: CreateJobInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateJobOutput:
    async with with_agent_tool(
        tool_name="create_job", entity="jobs",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO jobs (job_type, target_id, status, payload, created_at)
               VALUES ($1, $2, 'pending', $3::JSONB, NOW())
               RETURNING id""",
            inp.job_type, inp.target_id, inp.payload,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateJobOutput(
        success=True, job_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_job", entity="jobs", action="update",
    input_schema=UpdateJobInput, output_schema=UpdateJobOutput,
    description="Update pipeline job status/result/error.",
)
async def update_job(
    *, inp: UpdateJobInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateJobOutput:
    async with with_agent_tool(
        tool_name="update_job", entity="jobs",
        entity_id=inp.job_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            """UPDATE jobs
                  SET status = $2,
                      error = COALESCE($3, error),
                      result = COALESCE($4::JSONB, result),
                      updated_at = NOW()
                WHERE id = $1""",
            inp.job_id, inp.status, inp.error, inp.result,
        )
        corr = await _correlation_of(event_id, conn)
    return UpdateJobOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# wave_runs + wave_state_runs
# ========================================================================

@agent_tool(
    name="create_wave_run", entity="wave_runs", action="create",
    input_schema=CreateWaveRunInput, output_schema=CreateWaveRunOutput,
    description="Atlas: start a new orchestration wave.",
)
async def create_wave_run(
    *, inp: CreateWaveRunInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> CreateWaveRunOutput:
    async with with_agent_tool(
        tool_name="create_wave_run", entity="wave_runs",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO wave_runs (wave_type, state_codes, planned_targets, status, created_at)
               VALUES ($1, $2, $3, 'pending', NOW())
               RETURNING id""",
            inp.wave_type, inp.state_codes, inp.planned_targets,
        )
        corr = await _correlation_of(event_id, conn)
    return CreateWaveRunOutput(
        success=True, wave_run_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_wave_state_run", entity="wave_state_runs", action="update",
    input_schema=UpdateWaveStateRunInput, output_schema=UpdateWaveStateRunOutput,
    description="Atlas: update per-state wave status + outcome counters.",
)
async def update_wave_state_run(
    *, inp: UpdateWaveStateRunInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateWaveStateRunOutput:
    async with with_agent_tool(
        tool_name="update_wave_state_run", entity="wave_state_runs",
        entity_id=inp.wave_state_run_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            """UPDATE wave_state_runs
                  SET status = $2,
                      extracted_count = COALESCE($3, extracted_count),
                      failure_reason = COALESCE($4, failure_reason),
                      updated_at = NOW()
                WHERE id = $1""",
            inp.wave_state_run_id, inp.status, inp.extracted_count, inp.failure_reason,
        )
        corr = await _correlation_of(event_id, conn)
    return UpdateWaveStateRunOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )
```
  </action>
  <verify>
    <automated>python -c "
import fee_crawler.agent_tools.tools_crawl
from fee_crawler.agent_tools.registry import TOOL_REGISTRY, entities_covered
names = set(TOOL_REGISTRY.keys())
expected = {'update_crawl_target','create_crawl_result','create_crawl_run','update_crawl_run','upsert_institution_dossier','create_job','update_job','create_wave_run','update_wave_state_run'}
assert expected <= names, f'missing: {expected - names}'
assert {'crawl_targets','crawl_results','crawl_runs','institution_dossiers','jobs','wave_runs','wave_state_runs'} <= entities_covered()
print('OK')
"</automated>
  </verify>
  <acceptance_criteria>
    - File parses; `grep -c '@agent_tool' fee_crawler/agent_tools/tools_crawl.py` returns 9
    - After import, TOOL_REGISTRY contains all 9 tool names
    - entities_covered() includes crawl_targets, crawl_results, crawl_runs, institution_dossiers, jobs, wave_runs, wave_state_runs (7 entities)
    - `grep -c 'ON CONFLICT (institution_id) DO UPDATE' fee_crawler/agent_tools/tools_crawl.py` returns 1 (upsert semantics)
  </acceptance_criteria>
  <done>9 crawl-domain tools registered covering 7 entities; upsert_institution_dossier implements KNOX-03 foundation.</done>
</task>

<task type="auto">
  <name>Task 3: Integration test — upsert_institution_dossier idempotent + crawl tool coverage</name>
  <files>fee_crawler/tests/test_tools_crawl.py</files>
  <read_first>
    - fee_crawler/agent_tools/tools_crawl.py
    - fee_crawler/tests/test_tools_fees.py (pool injection pattern)
  </read_first>
  <action>
Create `fee_crawler/tests/test_tools_crawl.py`:

```python
"""Integration tests for Plan 62A-08 crawl-domain tools."""

from __future__ import annotations

import pytest

from fee_crawler.agent_tools import with_agent_context
from fee_crawler.agent_tools.tools_crawl import upsert_institution_dossier
from fee_crawler.agent_tools.schemas import UpsertInstitutionDossierInput


@pytest.mark.asyncio
async def test_institution_dossier_upsert_idempotent(db_schema):
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        async with pool.acquire() as conn:
            # Seed a crawl_targets row (institution_dossiers FK target).
            await conn.execute(
                "INSERT INTO crawl_targets (id, institution_name, charter_type, source) "
                "VALUES (1001, 'Test Bank', 'bank', 'fdic')"
            )
        # First upsert.
        with with_agent_context(agent_name="state_vt"):
            out1 = await upsert_institution_dossier(
                inp=UpsertInstitutionDossierInput(
                    institution_id=1001,
                    last_url_tried="https://example.com/fees.pdf",
                    last_document_format="pdf",
                    last_outcome="success",
                ),
                agent_name="state_vt",
                reasoning_prompt="crawl attempt",
                reasoning_output="found pdf",
            )
        assert out1.success is True

        # Second upsert on same institution — should update in place, not insert.
        with with_agent_context(agent_name="state_vt"):
            out2 = await upsert_institution_dossier(
                inp=UpsertInstitutionDossierInput(
                    institution_id=1001,
                    last_url_tried="https://example.com/fees-v2.pdf",
                    last_outcome="blocked",
                ),
                agent_name="state_vt",
                reasoning_prompt="crawl attempt 2",
                reasoning_output="blocked",
            )
        assert out2.success is True

        async with pool.acquire() as conn:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM institution_dossiers WHERE institution_id = 1001")
            assert count == 1, f"expected 1 dossier row (upsert semantics), got {count}"

            row = await conn.fetchrow(
                "SELECT last_url_tried, last_outcome FROM institution_dossiers WHERE institution_id = 1001")
            assert row["last_url_tried"] == "https://example.com/fees-v2.pdf"
            assert row["last_outcome"] == "blocked"

            auth_rows = await conn.fetchval(
                "SELECT COUNT(*) FROM agent_auth_log WHERE tool_name = 'upsert_institution_dossier'")
            assert auth_rows == 2, f"expected 2 auth_log rows (one per upsert), got {auth_rows}"
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_crawl_registry_covers_seven_entities():
    import fee_crawler.agent_tools.tools_crawl  # noqa: F401
    from fee_crawler.agent_tools.registry import entities_covered
    covered = entities_covered()
    required = {"crawl_targets", "crawl_results", "crawl_runs",
                "institution_dossiers", "jobs", "wave_runs", "wave_state_runs"}
    assert required <= covered, f"missing: {required - covered}"
```
  </action>
  <verify>
    <automated>export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://postgres:postgres@localhost:5433/bfi_test}" && pytest fee_crawler/tests/test_tools_crawl.py -v --no-header</automated>
  </verify>
  <acceptance_criteria>
    - 2 tests pass against db_schema fixture
    - test_institution_dossier_upsert_idempotent asserts: 1 dossier row, 2 auth_log rows after 2 upserts (last one wins)
    - test_crawl_registry_covers_seven_entities confirms registry state
  </acceptance_criteria>
  <done>Upsert idempotency verified; 7 crawl-domain entities covered by registered tools.</done>
</task>

</tasks>

<verification>
`pytest fee_crawler/tests/test_tools_crawl.py -v` all pass. After importing tools_crawl, TOOL_REGISTRY has 16 tools (7 from tools_fees + 9 from tools_crawl) and 13 entities covered.
</verification>

<success_criteria>
- 9 crawl-domain tools registered covering 7 entities
- upsert_institution_dossier implements KNOX-03 foundation (one row per institution, update-in-place)
- AGENT-05 coverage: 13 of 33 entities
- Every tool routes through with_agent_tool
- Crawl-domain schemas live in their own module (`schemas/crawl.py`); no contention with Plans 07/09/10 (file-conflict fix per revision)
</success_criteria>

<output>
After completion, create `.planning/phases/62A-agent-foundation-data-layer/62A-08-SUMMARY.md`.
</output>
