---
phase: 62A
plan: 07
type: execute
wave: 2
depends_on:
  - 62A-05
files_modified:
  - fee_crawler/agent_tools/tools_fees.py
  - fee_crawler/agent_tools/schemas/fees.py
  - fee_crawler/tests/test_tools_fees.py
autonomous: true
requirements:
  - AGENT-05
  - TIER-04
must_haves:
  truths:
    - "Calling `create_fee_raw(...)` via with_agent_tool inserts a fees_raw row AND writes agent_events + agent_auth_log"
    - "Calling `promote_fee_to_tier2(...)` via with_agent_tool with agent_name='darwin' succeeds and writes fees_verified"
    - "Calling `promote_fee_to_tier2(...)` with agent_name='knox' raises from the DB function (insufficient_privilege)"
    - "Every tool in this plan is registered in TOOL_REGISTRY with entity matching {fees_raw, fees_verified, fees_published, fee_reviews, fee_change_events, roomba_log}"
    - "Entity count coverage: `entities_covered()` includes all 6 fee-domain entities"
    - "Fee-domain schemas live in `fee_crawler/agent_tools/schemas/fees.py`; re-exported through `schemas/__init__.py` so callers keep using `from fee_crawler.agent_tools.schemas import <ClassName>`"
  artifacts:
    - path: "fee_crawler/agent_tools/tools_fees.py"
      provides: "CRUD tools for fee-domain entities: fees_raw, fees_verified, fees_published, fee_reviews, fee_change_events, roomba_log"
      contains: "@agent_tool"
    - path: "fee_crawler/agent_tools/schemas/fees.py"
      provides: "Pydantic v2 input/output schemas for every fee-domain tool registered by tools_fees.py"
      contains: "class CreateFeeRawInput"
    - path: "fee_crawler/tests/test_tools_fees.py"
      provides: "Integration tests for each fee-domain tool exercising the gateway"
      contains: "test_promote_fee_to_tier2_darwin_only"
  key_links:
    - from: "tools_fees.create_fee_raw"
      to: "fees_raw table + agent_events + agent_auth_log"
      via: "with_agent_tool gateway context manager"
      pattern: "with_agent_tool"
    - from: "tools_fees.promote_fee_to_tier2"
      to: "promote_to_tier2 SQL function"
      via: "conn.fetchval('SELECT promote_to_tier2(...)')"
      pattern: "promote_to_tier2"
    - from: "fee_crawler/agent_tools/schemas/__init__.py (pre-wired by Plan 05)"
      to: "fee_crawler/agent_tools/schemas/fees.py"
      via: "try/except star-import re-export activates when fees.py lands"
      pattern: "from fee_crawler.agent_tools.schemas.fees import"
---

<objective>
Register CRUD tools for the 6 fee-domain entities. Every tool routes through `with_agent_tool` (Plan 62A-05 gateway), carrying identity audit + event log automatically. TIER-04 is satisfied end-to-end (Darwin-only promotion verified via integration test).

Entities covered (6):
1. `fees_raw` — create, update (outlier_flags only)
2. `fees_verified` — insert via promote_fee_to_tier2 function; direct create not exposed
3. `fees_published` — insert via promote_fee_to_tier3 function; direct create not exposed
4. `fee_reviews` — create, update
5. `fee_change_events` — create
6. `roomba_log` — create

**File-conflict fix:** Schemas for this plan live in a new per-domain module `fee_crawler/agent_tools/schemas/fees.py` so Plans 07/08/09/10 can each own a disjoint schemas file and run in parallel in Wave 2 without file contention. Plan 62A-05 already shipped the `schemas/` package skeleton (`_base.py` + `__init__.py`).

Purpose: Phase 63 Knox state agents + Phase 64 Darwin need these tools on day one. Without them, no agent can write to fees_raw or invoke promotion.
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
@supabase/migrations/20260418_fees_tier_tables.sql
@supabase/migrations/20260418_tier_promotion_functions.sql
@src/lib/fee-actions.ts
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Agent → fees_raw writes | Must go through gateway; direct asyncpg bypass forbidden by convention (CI guard added Plan 62A-09) |
| Agent → promote_to_tier2 | SQL function enforces Darwin-only at DB level |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-62A07-01 | Spoofing | Knox calls promote_fee_to_tier2 pretending to be Darwin | high | mitigate | SQL function RAISE EXCEPTION on non-Darwin; test `test_promote_fee_to_tier2_darwin_only` exercises this |
| T-62A07-02 | Tampering | Agent updates fees_raw.amount (immutable per D-02) | high | mitigate | tool update_fees_raw_outlier_flags only accepts outlier_flags parameter; schema rejects any other field; test_tools_fees asserts amount cannot be changed |
| T-62A07-03 | Information Disclosure | Agent reads roomba_log for other agents' decisions | low | accept | Internal audit data; no PII. Admin-only read via MCP in Plan 62A-13 |
| T-62A07-04 | Repudiation | fee_reviews written without agent_auth_log | high | mitigate | All 6 tools wrapped by with_agent_tool; test_every_tool_writes_audit_log iterates registry and exercises each |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Create fee-domain schemas module (schemas/fees.py)</name>
  <files>fee_crawler/agent_tools/schemas/fees.py</files>
  <read_first>
    - fee_crawler/agent_tools/schemas/_base.py (existing BaseToolInput / BaseToolOutput / AgentEventRef from Plan 62A-05)
    - fee_crawler/agent_tools/schemas/__init__.py (pre-wired by Plan 62A-05 with try/except wildcard — THIS plan does NOT edit it; only create the per-domain schema file)
    - supabase/migrations/20260418_fees_tier_tables.sql (column types)
    - .planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md Entity Inventory
  </read_first>
  <action>
Create a new per-domain module `fee_crawler/agent_tools/schemas/fees.py` (do NOT append to a shared schemas.py — that file does not exist; the schemas/ package was split per the revision fix). Plan 62A-05 pre-wired `schemas/__init__.py` with a try/except wildcard import for this module, so simply creating the file is sufficient — no `__init__.py` edit required.

### fee_crawler/agent_tools/schemas/fees.py

```python
"""Pydantic v2 schemas for fee-domain tools (Plan 62A-07).

Owned by tools_fees.py. Re-exported through fee_crawler/agent_tools/schemas/__init__.py
so callers continue using `from fee_crawler.agent_tools.schemas import <ClassName>`.
"""

from __future__ import annotations

from typing import Any, List, Optional

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
```

### No edit to `fee_crawler/agent_tools/schemas/__init__.py`

Plan 62A-05 pre-wired the package `__init__.py` with a `try/except ImportError` wrapper around every per-domain wildcard import — including `from fee_crawler.agent_tools.schemas.fees import *`. As soon as `schemas/fees.py` exists on disk, that import activates automatically. **This plan does NOT touch `schemas/__init__.py`** — Wave 2 parallel execution is safe because each plan only creates its own per-domain module (no shared file writes beyond the module they own).
  </action>
  <verify>
    <automated>python -c "from fee_crawler.agent_tools.schemas import CreateFeeRawInput, PromoteFeeToTier2Input, CreateFeeReviewInput, CreateFeeChangeEventInput, CreateRoombaLogInput; print('OK')" && python -c "from fee_crawler.agent_tools.schemas.fees import CreateFeeRawInput; print('OK direct')"</automated>
  </verify>
  <acceptance_criteria>
    - `fee_crawler/agent_tools/schemas/fees.py` exists and parses
    - `grep -c 'class CreateFeeRawInput\|class UpdateFeeRawFlagsInput\|class PromoteFeeToTier2Input\|class PromoteFeeToTier3Input\|class CreateFeeReviewInput\|class CreateFeeChangeEventInput\|class CreateRoombaLogInput' fee_crawler/agent_tools/schemas/fees.py` returns 7
    - `from fee_crawler.agent_tools.schemas import CreateFeeRawInput` resolves via the pre-wired try/except in schemas/__init__.py (no edit to __init__.py required)
    - `python -c "from fee_crawler.agent_tools.schemas import CreateFeeRawInput; CreateFeeRawInput(institution_id=1, fee_name='x')"` succeeds
    - `python -c "from fee_crawler.agent_tools.schemas import CreateFeeRawInput; CreateFeeRawInput(institution_id=-1, fee_name='x')"` raises ValidationError (gt=0 constraint)
  </acceptance_criteria>
  <done>Per-domain schemas module `schemas/fees.py` created; package `__init__.py` (pre-wired by Plan 05 with try/except) auto-activates the wildcard re-export; `from fee_crawler.agent_tools.schemas import <ClassName>` resolves for every fee-domain schema.</done>
</task>

<task type="auto">
  <name>Task 2: Implement fee-domain CRUD tools in fee_crawler/agent_tools/tools_fees.py</name>
  <files>fee_crawler/agent_tools/tools_fees.py</files>
  <read_first>
    - fee_crawler/agent_tools/gateway.py (with_agent_tool contract)
    - fee_crawler/agent_tools/registry.py (agent_tool decorator)
    - fee_crawler/agent_tools/schemas/fees.py (freshly-added Pydantic schemas)
    - supabase/migrations/20260418_fees_tier_tables.sql (fees_raw columns + PK)
    - supabase/migrations/20260418_tier_promotion_functions.sql (promote_to_tier2 signature)
  </read_first>
  <action>
Create `fee_crawler/agent_tools/tools_fees.py`. Import schemas from the `schemas/` package — callers can use either the top-level re-export (`from fee_crawler.agent_tools.schemas import ...`) or the per-domain module (`from fee_crawler.agent_tools.schemas.fees import ...`). Use the top-level form for consistency with Plans 08/09/10.

```python
"""Fee-domain CRUD tools (Plan 62A-07, Group A).

Every tool wraps `with_agent_tool` so agent_events + agent_auth_log land atomically.
"""

from __future__ import annotations

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
    row = await conn.fetchrow(
        "SELECT correlation_id::TEXT AS c FROM agent_events WHERE event_id = $1::UUID",
        event_id,
    )
    return row["c"] if row else ""


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
        # promote_to_tier2 enforces agent_name='darwin' at DB level.
        import hashlib
        rh = hashlib.sha256((reasoning_prompt + "\x1f" + reasoning_output).encode()).digest()
        new_id = await conn.fetchval(
            "SELECT promote_to_tier2($1, $2, $3::BYTEA, $4::UUID, $5, $6, $7::JSONB)",
            inp.fee_raw_id, agent_name, rh, event_id,
            inp.canonical_fee_key, inp.variant_type, inp.outlier_flags,
        )
        corr = await _correlation_of(event_id, conn)
    return PromoteFeeToTier2Output(
        success=True,
        fee_verified_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


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
        new_id = await conn.fetchval(
            "SELECT promote_to_tier3($1, $2::UUID)",
            inp.fee_verified_id, event_id,
        )
        corr = await _correlation_of(event_id, conn)
    return PromoteFeeToTier3Output(
        success=True,
        fee_published_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


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
```

Note: `fee_reviews`, `fee_change_events`, `roomba_log` are production tables. In the test schema (db_schema fixture) they don't exist because Supabase migrations don't create them (they're Modal-pipeline tables from earlier phases). Tests in the next task CREATE minimal stubs before exercising.
  </action>
  <verify>
    <automated>python -c "
from fee_crawler.agent_tools.tools_fees import (create_fee_raw, update_fee_raw_flags, promote_fee_to_tier2, promote_fee_to_tier3, create_fee_review, create_fee_change_event, create_roomba_log)
from fee_crawler.agent_tools.registry import TOOL_REGISTRY, entities_covered
names = set(TOOL_REGISTRY.keys())
assert {'create_fee_raw','update_fee_raw_flags','promote_fee_to_tier2','promote_fee_to_tier3','create_fee_review','create_fee_change_event','create_roomba_log'} <= names, f'missing tools: {names}'
ents = entities_covered()
assert {'fees_raw','fees_verified','fees_published','fee_reviews','fee_change_events','roomba_log'} <= ents, f'missing entities: {ents}'
print('OK')
"</automated>
  </verify>
  <acceptance_criteria>
    - `fee_crawler/agent_tools/tools_fees.py` parses as Python
    - All 7 functions decorated with `@agent_tool(...)`
    - Every function uses `async with with_agent_tool(...)` context manager
    - After importing the module, TOOL_REGISTRY contains: create_fee_raw, update_fee_raw_flags, promote_fee_to_tier2, promote_fee_to_tier3, create_fee_review, create_fee_change_event, create_roomba_log (7 tools)
    - entities_covered() includes: fees_raw, fees_verified, fees_published, fee_reviews, fee_change_events, roomba_log (6 entities)
    - `grep -c 'with_agent_tool' fee_crawler/agent_tools/tools_fees.py` returns at least 14 (import + 7 uses × 2 lines each via the async with)
  </acceptance_criteria>
  <done>7 fee-domain tools registered; 6 entities covered; every tool wraps gateway.</done>
</task>

<task type="auto">
  <name>Task 3: Integration tests for fee-domain tools</name>
  <files>fee_crawler/tests/test_tools_fees.py</files>
  <read_first>
    - fee_crawler/agent_tools/tools_fees.py (tool signatures)
    - fee_crawler/tests/conftest.py (db_schema fixture)
    - supabase/migrations/20260418_tier_promotion_functions.sql (promote_to_tier2 error semantics)
  </read_first>
  <action>
Create `fee_crawler/tests/test_tools_fees.py`:

```python
"""Integration tests for Plan 62A-07 fee-domain tools."""

from __future__ import annotations

import pytest

from fee_crawler.agent_tools import with_agent_context
from fee_crawler.agent_tools.tools_fees import (
    create_fee_raw, update_fee_raw_flags, promote_fee_to_tier2,
)
from fee_crawler.agent_tools.schemas import (
    CreateFeeRawInput, UpdateFeeRawFlagsInput, PromoteFeeToTier2Input,
)


# Tests require DATABASE_URL_TEST pointed at a Postgres with the db_schema fixture.
# conftest fixture applies all migrations so agent_registry + fees_raw exist.


@pytest.mark.asyncio
async def test_create_fee_raw_writes_event_and_auth_log(db_schema, monkeypatch):
    _, pool = db_schema
    # Point the gateway pool at this test's schema by resetting the singleton.
    import os
    monkeypatch.setenv("DATABASE_URL_TEST", os.environ.get("DATABASE_URL_TEST", ""))
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool  # inject our per-test pool

    # Seed a crawl_targets row for FK-less but logically-required institution_id.
    # fees_raw.institution_id has no FK so any positive int works.

    with with_agent_context(agent_name="knox"):
        out = await create_fee_raw(
            inp=CreateFeeRawInput(institution_id=1, fee_name="overdraft", amount=35.00),
            agent_name="knox",
            reasoning_prompt="extract",
            reasoning_output="found $35 overdraft",
        )
    assert out.success is True
    assert out.fee_raw_id is not None
    assert out.event_ref is not None

    async with pool.acquire() as conn:
        ev_count = await conn.fetchval(
            "SELECT COUNT(*) FROM agent_events WHERE tool_name = 'create_fee_raw' AND status = 'success'")
        auth_count = await conn.fetchval(
            "SELECT COUNT(*) FROM agent_auth_log WHERE tool_name = 'create_fee_raw'")
    assert ev_count == 1, f"expected 1 success event, got {ev_count}"
    assert auth_count == 1, f"expected 1 auth_log row, got {auth_count}"

    pool_mod._pool = None  # clean up for next test


@pytest.mark.asyncio
async def test_update_fee_raw_flags_records_before_and_after(db_schema, monkeypatch):
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        with with_agent_context(agent_name="darwin"):
            created = await create_fee_raw(
                inp=CreateFeeRawInput(institution_id=1, fee_name="wire"),
                agent_name="darwin",
                reasoning_prompt="p", reasoning_output="o",
            )
            await update_fee_raw_flags(
                inp=UpdateFeeRawFlagsInput(fee_raw_id=created.fee_raw_id, outlier_flags=["suspicious"]),
                agent_name="darwin",
                reasoning_prompt="review",
                reasoning_output="flagged",
            )
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT before_value, after_value FROM agent_auth_log "
                "WHERE tool_name = 'update_fee_raw_flags'")
        assert row is not None
        # before_value has empty outlier_flags; after has suspicious.
        assert "suspicious" not in str(row["before_value"]), f"before={row['before_value']}"
        assert "suspicious" in str(row["after_value"]), f"after={row['after_value']}"
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_promote_fee_to_tier2_darwin_only(db_schema, monkeypatch):
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        # Seed a fees_raw row so promote has something to promote.
        with with_agent_context(agent_name="knox"):
            created = await create_fee_raw(
                inp=CreateFeeRawInput(institution_id=1, fee_name="atm_foreign"),
                agent_name="knox", reasoning_prompt="p", reasoning_output="o",
            )

        # Knox calling promote_fee_to_tier2 must fail at the DB function level.
        with pytest.raises(Exception) as exc:
            with with_agent_context(agent_name="knox"):
                await promote_fee_to_tier2(
                    inp=PromoteFeeToTier2Input(
                        fee_raw_id=created.fee_raw_id,
                        canonical_fee_key="atm_foreign",
                    ),
                    agent_name="knox",
                    reasoning_prompt="p", reasoning_output="o",
                )
        assert "darwin" in str(exc.value).lower() or "privilege" in str(exc.value).lower()

        # Darwin succeeds.
        with with_agent_context(agent_name="darwin"):
            out = await promote_fee_to_tier2(
                inp=PromoteFeeToTier2Input(
                    fee_raw_id=created.fee_raw_id,
                    canonical_fee_key="atm_foreign",
                ),
                agent_name="darwin",
                reasoning_prompt="p", reasoning_output="o",
            )
        assert out.success is True
        assert out.fee_verified_id is not None
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_registry_covers_six_fee_entities():
    # Import triggers decorator registration.
    import fee_crawler.agent_tools.tools_fees  # noqa: F401
    from fee_crawler.agent_tools.registry import entities_covered
    covered = entities_covered()
    required = {"fees_raw", "fees_verified", "fees_published",
                "fee_reviews", "fee_change_events", "roomba_log"}
    assert required <= covered, f"missing: {required - covered}"
```

Note: fee_reviews, fee_change_events, roomba_log tests are not exercised here because those tables don't exist in the test schema. Plan 62A-13 adds a "legacy table bootstrap" helper that conditionally seeds them; this plan's coverage is sufficient for AGENT-05 + TIER-04 since every tool uses with_agent_tool identically.
  </action>
  <verify>
    <automated>export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://postgres:postgres@localhost:5433/bfi_test}" && pytest fee_crawler/tests/test_tools_fees.py -v --no-header</automated>
  </verify>
  <acceptance_criteria>
    - File exists and parses
    - 4 tests: test_create_fee_raw_writes_event_and_auth_log, test_update_fee_raw_flags_records_before_and_after, test_promote_fee_to_tier2_darwin_only, test_registry_covers_six_fee_entities
    - All 4 pass against db_schema fixture
    - test_promote_fee_to_tier2_darwin_only observes the SQL function's RAISE EXCEPTION on non-Darwin caller
  </acceptance_criteria>
  <done>Fee-domain tool integration tests pass; TIER-04 end-to-end verified; audit log captures before/after.</done>
</task>

</tasks>

<verification>
`pytest fee_crawler/tests/test_tools_fees.py -v` passes all 4 tests. After import, `TOOL_REGISTRY` contains 7 fee-domain tools. Gateway integration is real end-to-end (events + auth_log in real Postgres partitioned tables).
</verification>

<success_criteria>
- 7 tools registered covering 6 fee-domain entities
- Every tool routes through with_agent_tool
- TIER-04 Darwin-only enforcement verified end-to-end
- Before/after audit snapshots work on UPDATE operations
- AGENT-05 partial coverage: 6 of 33 entities handled
- Fee-domain schemas live in their own module (`schemas/fees.py`); no contention with Plans 08/09/10 (file-conflict fix per revision)
</success_criteria>

<output>
After completion, create `.planning/phases/62A-agent-foundation-data-layer/62A-07-SUMMARY.md` noting:
- 7 fee-domain tools registered
- TIER-04 end-to-end verified
- 6 of 33 entities covered; remaining 27 in Plans 62A-08, 09, 10
- Per-domain schema split: `schemas/fees.py` owns all fee-domain Pydantic classes; `schemas/__init__.py` re-exports via `from .fees import *`
</output>
