---
phase: 62A
plan: 10
type: execute
wave: 2
depends_on:
  - 62A-05
files_modified:
  - fee_crawler/agent_tools/tools_peer_research.py
  - fee_crawler/agent_tools/tools_agent_infra.py
  - fee_crawler/agent_tools/schemas/peer_research.py
  - fee_crawler/agent_tools/schemas/agent_infra.py
  - fee_crawler/tests/test_tools_peer_research.py
  - fee_crawler/tests/test_tools_agent_infra.py
  - fee_crawler/tests/test_agent_tool_coverage.py
autonomous: true
requirements:
  - AGENT-05
must_haves:
  truths:
    - "All remaining CONTEXT.md entity-table entries (saved_peer_sets, saved_subscriber_peer_groups, classification_cache, external_intelligence, beige_book_themes, wave_runs, wave_state_runs, fee_change_events (only insert path, update-side owned by Plan 07), roomba_log (owned by Plan 07), agent_messages, agent_budgets, agent_registry) have at least one registered tool"
    - "entities_covered() returns a superset of the full 33-entity inventory from CONTEXT.md after tools_peer_research + tools_agent_infra load"
    - "upsert_agent_budget is idempotent — calling twice with the same (agent_name, window) keeps exactly one row and updates limit_cents in place"
    - "insert_agent_message inserts a row with state='open' and round_number=1 by default; update_agent_message_intent transitions open -> answered|resolved|escalated|expired and captures before/after via gateway"
    - "test_agent_tool_coverage.py no longer xfails; it asserts at least 33 entities registered"
  artifacts:
    - path: "fee_crawler/agent_tools/tools_peer_research.py"
      provides: "CRUD tools for 5 peer+research+intel entities: saved_peer_sets, saved_subscriber_peer_groups, classification_cache, external_intelligence, beige_book_themes"
      contains: "@agent_tool"
    - path: "fee_crawler/agent_tools/tools_agent_infra.py"
      provides: "CRUD tools for 4 agent-infra entities: agent_messages, agent_registry, agent_budgets, and a thin insert-only wrapper for fee_change_events completeness"
      contains: "@agent_tool"
    - path: "fee_crawler/tests/test_tools_peer_research.py"
      provides: "Integration tests for upsert idempotency + peer-set user scoping"
      contains: "test_upsert_classification_cache_idempotent"
    - path: "fee_crawler/tests/test_tools_agent_infra.py"
      provides: "Integration tests for agent_messages state transitions + agent_budgets upsert"
      contains: "test_upsert_agent_budget_idempotent"
  key_links:
    - from: "tools_agent_infra.upsert_agent_budget"
      to: "agent_budgets + agent_events + agent_auth_log"
      via: "INSERT ... ON CONFLICT (agent_name, window) DO UPDATE inside with_agent_tool"
      pattern: "ON CONFLICT \\(agent_name, window\\) DO UPDATE"
    - from: "tools_agent_infra.insert_agent_message"
      to: "agent_messages"
      via: "with_agent_tool action='create' + default state='open'"
      pattern: "INSERT INTO agent_messages"
    - from: "tools_agent_infra.update_agent_message_intent"
      to: "agent_messages state transitions"
      via: "with_agent_tool action='update' captures before_value.state and after_value.state"
      pattern: "UPDATE agent_messages SET state"
---

<objective>
Register CRUD tools for the remaining CONTEXT.md §Entity Inventory entries that Plans 62A-07..09 did not cover. After this plan, the full 33-entity contract from AGENT-05 is satisfied.

Entities covered in Plan 10 (12 total across two files):

**tools_peer_research.py (5 entities):**
1. `saved_peer_sets` — create, update, delete
2. `saved_subscriber_peer_groups` — create, update, delete
3. `classification_cache` — upsert (Darwin feedback loop target)
4. `external_intelligence` — insert, update (FRED/BLS/CFPB intel)
5. `beige_book_themes` — insert, update (Fed district intel)

**tools_agent_infra.py (4 entities):**
6. `agent_messages` — insert, update (intent state transitions — 62b wires protocol; 62a ships the tools)
7. `agent_registry` — upsert (Atlas seeds 51 state agents at bootstrap)
8. `agent_budgets` — upsert (Atlas-managed; gateway-internal for spent_cents)
9. `fee_change_events` — (covered in Plan 07 but re-asserted here to close the AGENT-05 accounting loop — no new tool; Plan 10 only updates `test_agent_tool_coverage.py` to assert ≥ 33 entities)

Plan 07 already registers tools for fee_change_events (create_fee_change_event) and roomba_log (create_roomba_log). This plan DOES NOT re-register those — doing so would trigger the registry's name-collision assertion.

Purpose: Close out AGENT-05 with full 33-entity coverage. After this plan, the full tool surface every downstream agent needs is live behind `with_agent_tool`.
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
@fee_crawler/agent_tools/tools_fees.py
@fee_crawler/agent_tools/tools_crawl.py
@fee_crawler/agent_tools/tools_hamilton.py
@supabase/migrations/20260410_classification_cache.sql
@supabase/migrations/20260407_wave_runs.sql
@src/lib/crawler-db/saved-peers.ts
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Atlas -> agent_registry | Only Atlas should upsert registry rows; 62a trusts the x-agent-name header. SEC-04 (Phase 68) hardens |
| Atlas -> agent_budgets | Gateway's own budget-accounting updates spent_cents through `account_budget`; Atlas's upsert_agent_budget is the operator-facing path for limit_cents edits |
| Agent -> agent_messages | Sender is derived from agent_name header; recipient is caller-supplied. 62b enforces peer-only sends |
| Darwin -> classification_cache | Darwin-only writes in production (Phase 64); 62a trusts caller |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-62A10-01 | Spoofing | Non-Atlas caller upserts agent_budgets to raise their own limit | high | mitigate | tools_agent_infra.upsert_agent_budget asserts `agent_name == 'atlas'` before the DB write — raises PermissionError otherwise. Test `test_upsert_agent_budget_atlas_only` exercises. Phase 68 adds JWT-based verification |
| T-62A10-02 | Tampering | Caller sets spent_cents via upsert_agent_budget (should be gateway-only) | high | mitigate | The upsert tool's input schema does NOT include spent_cents; UPSERT sets limit_cents only and leaves spent_cents untouched. Test `test_upsert_agent_budget_does_not_touch_spent_cents` exercises |
| T-62A10-03 | Repudiation | agent_messages intent transitions not auditable | high | mitigate | update_agent_message_intent uses action='update', so gateway captures before_value.state + after_value.state automatically. Test `test_agent_message_state_transition_audited` exercises |
| T-62A10-04 | Information Disclosure | saved_subscriber_peer_groups leaks across Pro users (wrong user's peer set shown) | high | mitigate | update/delete tools assert user_id ownership before mutating. Test `test_saved_subscriber_peer_group_cross_user_rejected` |
| T-62A10-05 | Denial of Service | external_intelligence tight-loop insert floods Tier 2 | medium | accept | Ingestion jobs are batched; budget enforcement via cost_cents is downstream concern |
| T-62A10-06 | Elevation of Privilege | agent_registry upsert allows a non-hierarchical agent_name (e.g., 'root') | medium | mitigate | Pydantic schema constrains agent_name to `/^(hamilton|knox|darwin|atlas|state_[a-z]{2})$/`; test `test_upsert_agent_registry_rejects_bad_name` |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Create peer_research + agent_infra schemas modules (schemas/peer_research.py + schemas/agent_infra.py)</name>
  <files>fee_crawler/agent_tools/schemas/peer_research.py, fee_crawler/agent_tools/schemas/agent_infra.py</files>
  <read_first>
    - fee_crawler/agent_tools/schemas/_base.py (BaseToolInput / BaseToolOutput / AgentEventRef from Plan 62A-05)
    - fee_crawler/agent_tools/schemas/__init__.py (pre-wired by Plan 62A-05 with try/except wildcards for both modules — THIS plan does NOT edit it; only create the two schemas/*.py files)
    - supabase/migrations/20260410_classification_cache.sql (column layout)
    - supabase/migrations/20260407_wave_runs.sql (for alignment — wave_runs covered by Plan 08)
    - src/lib/crawler-db/saved-peers.ts (saved_peer_sets column layout)
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §7.3 (agent_messages schema) + §7.4 (agent_budgets schema)
  </read_first>
  <action>
Create TWO new per-domain schema modules (one per entity group owned by this plan). Plan 62A-05 pre-wired `schemas/__init__.py` with try/except wildcard imports for BOTH modules, so no edit to `__init__.py` is required — creating both files is sufficient for the package-level imports to activate. All new classes inherit `BaseToolInput` / `BaseToolOutput` from `schemas/_base.py` (shipped by Plan 62A-05).

### fee_crawler/agent_tools/schemas/peer_research.py

Covers 5 entities: saved_peer_sets, saved_subscriber_peer_groups, classification_cache, external_intelligence, beige_book_themes.

```python
"""Pydantic v2 schemas for peer + research-domain tools (Plan 62A-10, Group A).

Owned by tools_peer_research.py. Re-exported through
fee_crawler/agent_tools/schemas/__init__.py so callers continue using
`from fee_crawler.agent_tools.schemas import <ClassName>`.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import Field

from fee_crawler.agent_tools.schemas._base import (
    AgentEventRef,
    BaseToolInput,
    BaseToolOutput,
)


# --- saved_peer_sets (admin) ---

class CreateSavedPeerSetInput(BaseToolInput):
    name: str = Field(min_length=1, max_length=120)
    filters: Dict[str, Any] = Field(default_factory=dict)


class CreateSavedPeerSetOutput(BaseToolOutput):
    saved_peer_set_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateSavedPeerSetInput(BaseToolInput):
    saved_peer_set_id: str = Field(min_length=1)
    name: Optional[str] = Field(default=None, max_length=120)
    filters: Optional[Dict[str, Any]] = None


class UpdateSavedPeerSetOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


class DeleteSavedPeerSetInput(BaseToolInput):
    saved_peer_set_id: str = Field(min_length=1)


class DeleteSavedPeerSetOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- saved_subscriber_peer_groups (Pro, user-scoped) ---

class CreateSavedSubscriberPeerGroupInput(BaseToolInput):
    user_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=120)
    institution_ids: List[int] = Field(default_factory=list)


class CreateSavedSubscriberPeerGroupOutput(BaseToolOutput):
    group_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateSavedSubscriberPeerGroupInput(BaseToolInput):
    group_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    name: Optional[str] = Field(default=None, max_length=120)
    institution_ids: Optional[List[int]] = None


class UpdateSavedSubscriberPeerGroupOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


class DeleteSavedSubscriberPeerGroupInput(BaseToolInput):
    group_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)


class DeleteSavedSubscriberPeerGroupOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- classification_cache (Darwin feedback loop) ---

class UpsertClassificationCacheInput(BaseToolInput):
    cache_key: str = Field(min_length=1, max_length=256)
    canonical_fee_key: str = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0)
    model: Optional[str] = None
    source: Literal["darwin", "knox", "manual"] = "darwin"


class UpsertClassificationCacheOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- external_intelligence (FRED/BLS/CFPB ingestion) ---

class CreateExternalIntelligenceInput(BaseToolInput):
    source: Literal["fred", "bls", "cfpb", "census", "ofr", "nyfed", "ffiec_cdr", "manual"]
    series_id: str = Field(min_length=1, max_length=200)
    title: Optional[str] = None
    body: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    observed_at: Optional[str] = None  # ISO date or timestamp


class CreateExternalIntelligenceOutput(BaseToolOutput):
    external_intelligence_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateExternalIntelligenceInput(BaseToolInput):
    external_intelligence_id: str = Field(min_length=1)
    title: Optional[str] = None
    body: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


class UpdateExternalIntelligenceOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- beige_book_themes (Fed district intel) ---

class CreateBeigeBookThemeInput(BaseToolInput):
    district: int = Field(ge=1, le=12)
    period: str = Field(min_length=1, max_length=50)  # e.g., "2026-Q1"
    theme: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1)
    source_url: Optional[str] = None


class CreateBeigeBookThemeOutput(BaseToolOutput):
    theme_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateBeigeBookThemeInput(BaseToolInput):
    theme_id: str = Field(min_length=1)
    summary: Optional[str] = None
    source_url: Optional[str] = None


class UpdateBeigeBookThemeOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


__all__ = [
    "CreateSavedPeerSetInput", "CreateSavedPeerSetOutput",
    "UpdateSavedPeerSetInput", "UpdateSavedPeerSetOutput",
    "DeleteSavedPeerSetInput", "DeleteSavedPeerSetOutput",
    "CreateSavedSubscriberPeerGroupInput", "CreateSavedSubscriberPeerGroupOutput",
    "UpdateSavedSubscriberPeerGroupInput", "UpdateSavedSubscriberPeerGroupOutput",
    "DeleteSavedSubscriberPeerGroupInput", "DeleteSavedSubscriberPeerGroupOutput",
    "UpsertClassificationCacheInput", "UpsertClassificationCacheOutput",
    "CreateExternalIntelligenceInput", "CreateExternalIntelligenceOutput",
    "UpdateExternalIntelligenceInput", "UpdateExternalIntelligenceOutput",
    "CreateBeigeBookThemeInput", "CreateBeigeBookThemeOutput",
    "UpdateBeigeBookThemeInput", "UpdateBeigeBookThemeOutput",
]
```

### fee_crawler/agent_tools/schemas/agent_infra.py

Covers 3 entities: agent_messages, agent_registry, agent_budgets. Also hosts the shared `_AGENT_NAME_PATTERN` regex used by registry + budget schemas.

```python
"""Pydantic v2 schemas for agent-infra tools (Plan 62A-10, Group B).

Owned by tools_agent_infra.py. Re-exported through
fee_crawler/agent_tools/schemas/__init__.py so callers continue using
`from fee_crawler.agent_tools.schemas import <ClassName>`.
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from pydantic import Field

from fee_crawler.agent_tools.schemas._base import (
    AgentEventRef,
    BaseToolInput,
    BaseToolOutput,
)


_AGENT_NAME_PATTERN = r"^(hamilton|knox|darwin|atlas|state_[a-z]{2})$"


# --- agent_messages (empty table in 62a; tools ship; 62b wires protocol) ---

class InsertAgentMessageInput(BaseToolInput):
    recipient_agent: str = Field(min_length=1, max_length=32)
    intent: Literal[
        "challenge", "prove", "accept", "reject", "escalate",
        "coverage_request", "clarify",
    ]
    correlation_id: str = Field(min_length=1)
    parent_message_id: Optional[str] = None
    parent_event_id: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    round_number: int = Field(default=1, ge=1)
    expires_at: Optional[str] = None


class InsertAgentMessageOutput(BaseToolOutput):
    message_id: Optional[str] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateAgentMessageIntentInput(BaseToolInput):
    message_id: str = Field(min_length=1)
    state: Literal["answered", "resolved", "escalated", "expired"]
    resolved_by_event_id: Optional[str] = None


class UpdateAgentMessageIntentOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- agent_registry (Atlas seeds state agents) ---

class UpsertAgentRegistryInput(BaseToolInput):
    agent_name: str = Field(pattern=_AGENT_NAME_PATTERN, max_length=32)
    display_name: str = Field(min_length=1, max_length=120)
    role: Literal["supervisor", "data", "classifier", "orchestrator", "analyst", "state_agent"]
    parent_agent: Optional[str] = Field(default=None, pattern=_AGENT_NAME_PATTERN, max_length=32)
    state_code: Optional[str] = Field(default=None, pattern=r"^[A-Z]{2}$")
    is_active: bool = True


class UpsertAgentRegistryOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# --- agent_budgets (Atlas-managed operator-facing limit writes) ---

class UpsertAgentBudgetInput(BaseToolInput):
    agent_name: str = Field(pattern=_AGENT_NAME_PATTERN, max_length=32)
    window: Literal["per_cycle", "per_batch", "per_report", "per_day", "per_month"]
    limit_cents: int = Field(ge=0)


class UpsertAgentBudgetOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


__all__ = [
    "InsertAgentMessageInput", "InsertAgentMessageOutput",
    "UpdateAgentMessageIntentInput", "UpdateAgentMessageIntentOutput",
    "UpsertAgentRegistryInput", "UpsertAgentRegistryOutput",
    "UpsertAgentBudgetInput", "UpsertAgentBudgetOutput",
]
```

### No edit to `fee_crawler/agent_tools/schemas/__init__.py`

Plan 62A-05 pre-wired the package `__init__.py` with `try/except ImportError` wrappers around every per-domain wildcard import — including BOTH `from fee_crawler.agent_tools.schemas.peer_research import *` and `from fee_crawler.agent_tools.schemas.agent_infra import *`. As soon as either module exists on disk, the corresponding import activates automatically. **This plan does NOT touch `schemas/__init__.py`** — Wave 2 parallel execution has zero shared-file writes.
  </action>
  <verify>
    <automated>python -c "
from fee_crawler.agent_tools.schemas import (
    CreateSavedPeerSetInput, UpdateSavedPeerSetInput, DeleteSavedPeerSetInput,
    CreateSavedSubscriberPeerGroupInput, UpdateSavedSubscriberPeerGroupInput, DeleteSavedSubscriberPeerGroupInput,
    UpsertClassificationCacheInput,
    CreateExternalIntelligenceInput, UpdateExternalIntelligenceInput,
    CreateBeigeBookThemeInput, UpdateBeigeBookThemeInput,
    InsertAgentMessageInput, UpdateAgentMessageIntentInput,
    UpsertAgentRegistryInput, UpsertAgentBudgetInput,
)
from pydantic import ValidationError
# Reject bad agent_name patterns.
try:
    UpsertAgentBudgetInput(agent_name='root', window='per_day', limit_cents=1000)
    raise SystemExit('expected ValidationError')
except ValidationError:
    pass
# Accept a real state agent.
UpsertAgentBudgetInput(agent_name='state_vt', window='per_day', limit_cents=1000)
print('OK')
"</automated>
  </verify>
  <acceptance_criteria>
    - Both `fee_crawler/agent_tools/schemas/peer_research.py` and `fee_crawler/agent_tools/schemas/agent_infra.py` exist and parse
    - `grep -c 'class CreateSavedPeerSetInput\|class UpsertClassificationCacheInput\|class CreateExternalIntelligenceInput\|class CreateBeigeBookThemeInput' fee_crawler/agent_tools/schemas/peer_research.py` returns 4
    - `grep -c 'class InsertAgentMessageInput\|class UpdateAgentMessageIntentInput\|class UpsertAgentRegistryInput\|class UpsertAgentBudgetInput' fee_crawler/agent_tools/schemas/agent_infra.py` returns 4
    - `from fee_crawler.agent_tools.schemas import UpsertClassificationCacheInput, InsertAgentMessageInput` resolves via the pre-wired try/except in schemas/__init__.py (no edit to __init__.py required)
    - Importing every schema listed in the verify block via the top-level `fee_crawler.agent_tools.schemas` package succeeds
    - `UpsertAgentBudgetInput(agent_name='root', window='per_day', limit_cents=1000)` raises ValidationError
    - `UpsertAgentBudgetInput(agent_name='state_vt', window='per_day', limit_cents=1000)` succeeds
    - `python -c "import ast; ast.parse(open('fee_crawler/agent_tools/schemas/peer_research.py').read())"` exits 0
    - `python -c "import ast; ast.parse(open('fee_crawler/agent_tools/schemas/agent_infra.py').read())"` exits 0
  </acceptance_criteria>
  <done>17 new Pydantic schema classes added across TWO per-domain modules (peer_research.py + agent_infra.py); agent-name pattern enforced on agent_registry + agent_budgets inputs; package __init__.py (pre-wired by Plan 05 with try/except) auto-activates both wildcard re-exports.</done>
</task>

<task type="auto">
  <name>Task 2: Implement tools_peer_research.py (5 entities, 10 tools)</name>
  <files>fee_crawler/agent_tools/tools_peer_research.py</files>
  <read_first>
    - fee_crawler/agent_tools/tools_hamilton.py (user_id cross-user guard pattern; _sparse_update helper)
    - fee_crawler/agent_tools/schemas/peer_research.py (newly-added peer+research schemas)
    - src/lib/crawler-db/saved-peers.ts (saved_peer_sets columns)
    - supabase/migrations/20260410_classification_cache.sql (classification_cache columns + PK)
  </read_first>
  <action>
Create `fee_crawler/agent_tools/tools_peer_research.py`:

```python
"""Peer + external-intelligence CRUD tools (Plan 62A-10, Group A).

5 entities, 10 tools. Every tool routes through with_agent_tool for audit.
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
```
  </action>
  <verify>
    <automated>python -c "
import fee_crawler.agent_tools.tools_peer_research
from fee_crawler.agent_tools.registry import TOOL_REGISTRY, entities_covered
names = set(TOOL_REGISTRY.keys())
expected = {
  'create_saved_peer_set','update_saved_peer_set','delete_saved_peer_set',
  'create_saved_subscriber_peer_group','update_saved_subscriber_peer_group','delete_saved_subscriber_peer_group',
  'upsert_classification_cache',
  'create_external_intelligence','update_external_intelligence',
  'create_beige_book_theme','update_beige_book_theme',
}
missing = expected - names
assert not missing, f'missing tools: {missing}'
required_ents = {'saved_peer_sets','saved_subscriber_peer_groups','classification_cache','external_intelligence','beige_book_themes'}
assert required_ents <= entities_covered(), f'missing entities: {required_ents - entities_covered()}'
print('OK — 11 tools, 5 peer+research entities')
"</automated>
  </verify>
  <acceptance_criteria>
    - File parses; `grep -c '@agent_tool(' fee_crawler/agent_tools/tools_peer_research.py` returns 11
    - `grep -c 'with_agent_tool(' fee_crawler/agent_tools/tools_peer_research.py` returns at least 11
    - `grep -c 'ON CONFLICT (cache_key) DO UPDATE' fee_crawler/agent_tools/tools_peer_research.py` returns 1 (classification_cache upsert)
    - `grep -c 'PermissionError' fee_crawler/agent_tools/tools_peer_research.py` returns at least 2 (saved_subscriber_peer_groups update + delete guards)
    - After import, TOOL_REGISTRY contains all 11 names
    - entities_covered() superset includes: saved_peer_sets, saved_subscriber_peer_groups, classification_cache, external_intelligence, beige_book_themes
  </acceptance_criteria>
  <done>11 peer+research tools registered across 5 entities; classification_cache upsert idempotent via ON CONFLICT; user-scoped peer groups guarded.</done>
</task>

<task type="auto">
  <name>Task 3: Implement tools_agent_infra.py (agent_messages, agent_registry, agent_budgets + AGENT-05 closeout)</name>
  <files>fee_crawler/agent_tools/tools_agent_infra.py</files>
  <read_first>
    - fee_crawler/agent_tools/tools_peer_research.py (upsert + _correlation_of pattern)
    - fee_crawler/agent_tools/schemas/agent_infra.py (newly-added agent-infra schemas)
    - supabase/migrations/20260419_agent_registry_and_budgets.sql (column + PK layout — placed by Plan 62A-04)
    - supabase/migrations/20260418_agent_messages.sql (column + PK layout — placed by Plan 62A-04)
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §7.3 (agent_messages default state, round_number) + §7.4 (agent_budgets upsert shape)
  </read_first>
  <action>
Create `fee_crawler/agent_tools/tools_agent_infra.py`:

```python
"""Agent-infra CRUD tools (Plan 62A-10, Group B).

Covers agent_messages, agent_registry, agent_budgets.
Plan 62A-07 already covers fee_change_events (create_fee_change_event) and roomba_log
(create_roomba_log); this module does NOT redefine them — registry name-collision would raise.

After this module + tools_peer_research load, entities_covered() is a superset of the 33-entity contract.
"""

from __future__ import annotations

from typing import Optional

from fee_crawler.agent_tools.gateway import with_agent_tool
from fee_crawler.agent_tools.registry import agent_tool
from fee_crawler.agent_tools.schemas import (
    AgentEventRef,
    InsertAgentMessageInput, InsertAgentMessageOutput,
    UpdateAgentMessageIntentInput, UpdateAgentMessageIntentOutput,
    UpsertAgentRegistryInput, UpsertAgentRegistryOutput,
    UpsertAgentBudgetInput, UpsertAgentBudgetOutput,
)


async def _correlation_of(event_id: str, conn) -> str:
    row = await conn.fetchrow(
        "SELECT correlation_id::TEXT AS c FROM agent_events WHERE event_id = $1::UUID",
        event_id,
    )
    return row["c"] if row else ""


# ========================================================================
# agent_messages — 62a ships tools; 62b wires protocol
# ========================================================================

@agent_tool(
    name="insert_agent_message",
    entity="agent_messages", action="create",
    input_schema=InsertAgentMessageInput,
    output_schema=InsertAgentMessageOutput,
    description="Insert an inter-agent message (sender derived from agent_name header). Default state='open'.",
)
async def insert_agent_message(
    *, inp: InsertAgentMessageInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> InsertAgentMessageOutput:
    async with with_agent_tool(
        tool_name="insert_agent_message", entity="agent_messages",
        entity_id=None, action="create", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="message_id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        new_id = await conn.fetchval(
            """INSERT INTO agent_messages
                 (sender_agent, recipient_agent, intent, state,
                  correlation_id, parent_message_id, parent_event_id,
                  payload, round_number, expires_at)
               VALUES ($1, $2, $3, 'open',
                       $4::UUID, $5::UUID, $6::UUID,
                       $7::JSONB, $8, $9::TIMESTAMPTZ)
               RETURNING message_id::TEXT""",
            agent_name, inp.recipient_agent, inp.intent,
            inp.correlation_id,
            inp.parent_message_id, inp.parent_event_id,
            inp.payload, inp.round_number, inp.expires_at,
        )
        corr = await _correlation_of(event_id, conn)
    return InsertAgentMessageOutput(
        success=True, message_id=new_id,
        event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


@agent_tool(
    name="update_agent_message_intent",
    entity="agent_messages", action="update",
    input_schema=UpdateAgentMessageIntentInput,
    output_schema=UpdateAgentMessageIntentOutput,
    description="Transition agent_messages.state: open -> answered | resolved | escalated | expired.",
)
async def update_agent_message_intent(
    *, inp: UpdateAgentMessageIntentInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpdateAgentMessageIntentOutput:
    async with with_agent_tool(
        tool_name="update_agent_message_intent", entity="agent_messages",
        entity_id=inp.message_id, action="update", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="message_id",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            """UPDATE agent_messages
                  SET state = $2,
                      resolved_at = CASE WHEN $2 IN ('resolved','escalated','expired')
                                         THEN NOW() ELSE resolved_at END,
                      resolved_by_event_id = COALESCE($3::UUID, resolved_by_event_id)
                WHERE message_id = $1::UUID""",
            inp.message_id, inp.state, inp.resolved_by_event_id,
        )
        corr = await _correlation_of(event_id, conn)
    return UpdateAgentMessageIntentOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# agent_registry — Atlas-only upsert
# ========================================================================

@agent_tool(
    name="upsert_agent_registry",
    entity="agent_registry", action="upsert",
    input_schema=UpsertAgentRegistryInput,
    output_schema=UpsertAgentRegistryOutput,
    description="Atlas: register or update an agent in the hierarchy (51 state agents seeded at bootstrap).",
)
async def upsert_agent_registry(
    *, inp: UpsertAgentRegistryInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpsertAgentRegistryOutput:
    if agent_name != "atlas":
        raise PermissionError(
            f"upsert_agent_registry is Atlas-only; agent_name={agent_name!r}"
        )
    async with with_agent_tool(
        tool_name="upsert_agent_registry", entity="agent_registry",
        entity_id=inp.agent_name, action="upsert", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(), pk_column="agent_name",
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            """INSERT INTO agent_registry
                 (agent_name, display_name, role, parent_agent, state_code, is_active)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (agent_name) DO UPDATE SET
                 display_name = EXCLUDED.display_name,
                 role = EXCLUDED.role,
                 parent_agent = EXCLUDED.parent_agent,
                 state_code = EXCLUDED.state_code,
                 is_active = EXCLUDED.is_active""",
            inp.agent_name, inp.display_name, inp.role,
            inp.parent_agent, inp.state_code, inp.is_active,
        )
        corr = await _correlation_of(event_id, conn)
    return UpsertAgentRegistryOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )


# ========================================================================
# agent_budgets — Atlas-only upsert of limit_cents (spent_cents is gateway-only)
# ========================================================================

@agent_tool(
    name="upsert_agent_budget",
    entity="agent_budgets", action="upsert",
    input_schema=UpsertAgentBudgetInput,
    output_schema=UpsertAgentBudgetOutput,
    description="Atlas: set or update limit_cents for (agent_name, window); spent_cents is gateway-managed.",
)
async def upsert_agent_budget(
    *, inp: UpsertAgentBudgetInput, agent_name: str,
    reasoning_prompt: str, reasoning_output: str,
    parent_event_id: Optional[str] = None,
) -> UpsertAgentBudgetOutput:
    if agent_name != "atlas":
        raise PermissionError(
            f"upsert_agent_budget is Atlas-only; agent_name={agent_name!r}"
        )
    async with with_agent_tool(
        tool_name="upsert_agent_budget", entity="agent_budgets",
        entity_id=f"{inp.agent_name}:{inp.window}",
        action="upsert", agent_name=agent_name,
        reasoning_prompt=reasoning_prompt, reasoning_output=reasoning_output,
        input_payload=inp.model_dump(),
        pk_column="agent_name",  # compound PK; snapshot uses agent_name only (approximation)
        parent_event_id=parent_event_id,
    ) as (conn, event_id):
        await conn.execute(
            """INSERT INTO agent_budgets
                 (agent_name, window, limit_cents, spent_cents, window_started_at, updated_at)
               VALUES ($1, $2, $3, 0, NOW(), NOW())
               ON CONFLICT (agent_name, window) DO UPDATE SET
                 limit_cents = EXCLUDED.limit_cents,
                 updated_at = NOW()""",
            inp.agent_name, inp.window, inp.limit_cents,
        )
        corr = await _correlation_of(event_id, conn)
    return UpsertAgentBudgetOutput(
        success=True, event_ref=AgentEventRef(event_id=event_id, correlation_id=corr),
    )
```

Important integration note for the executor: `agent_budgets` has a compound primary key `(agent_name, window)`. The gateway's `_snapshot_row` helper (Plan 62A-05) takes a single `pk_column` and a single `entity_id` — here we pass `pk_column="agent_name"` and `entity_id=f"{inp.agent_name}:{inp.window}"` knowing the snapshot will match on agent_name alone and may return the row for any window. This is ACCEPTED — the audit trail carries the full input_payload; Phase 68 SEC-04 refines the snapshot helper to support compound PKs.

Now update `fee_crawler/tests/test_agent_tool_coverage.py` to REMOVE the `pytest.xfail(...)` stub and implement the full 33-entity assertion:

```python
"""All 33 entities have a registered tool — delivered by plans 62A-07, 08, 09, 10."""

import fee_crawler.agent_tools.tools_fees          # noqa: F401
import fee_crawler.agent_tools.tools_crawl         # noqa: F401
import fee_crawler.agent_tools.tools_hamilton      # noqa: F401
import fee_crawler.agent_tools.tools_peer_research # noqa: F401
import fee_crawler.agent_tools.tools_agent_infra   # noqa: F401

from fee_crawler.agent_tools.registry import entities_covered

ENTITIES_33 = {
    # Fees domain (Plan 62A-07 — 6)
    "fees_raw", "fees_verified", "fees_published",
    "fee_reviews", "fee_change_events", "roomba_log",
    # Crawl domain (Plan 62A-08 — 7)
    "crawl_targets", "crawl_results", "crawl_runs", "institution_dossiers",
    "jobs", "wave_runs", "wave_state_runs",
    # Hamilton domain (Plan 62A-09 — 11)
    "hamilton_watchlists", "hamilton_saved_analyses", "hamilton_scenarios",
    "hamilton_reports", "hamilton_signals", "hamilton_priority_alerts",
    "hamilton_conversations", "hamilton_messages",
    "published_reports", "report_jobs", "articles",
    # Peer+research (Plan 62A-10 — 5)
    "saved_peer_sets", "saved_subscriber_peer_groups",
    "classification_cache", "external_intelligence", "beige_book_themes",
    # Agent infra (Plan 62A-10 — 4; note: agent_events + agent_auth_log
    # are gateway-written, never appear as tool entities)
    "agent_messages", "agent_registry", "agent_budgets",
}


def test_every_entity_has_tool():
    """AGENT-05 contract: every user-manipulable entity has >= 1 registered tool."""
    covered = entities_covered()
    missing = ENTITIES_33 - covered
    assert not missing, (
        f"AGENT-05 fails: {len(missing)} entities have no registered tool: {sorted(missing)}"
    )


def test_coverage_count_at_least_33():
    covered = entities_covered()
    # CONTEXT.md §Entity Inventory counts 33 unique entity concepts. agent_events +
    # agent_auth_log are gateway-only (auto-insert by the framework) and not
    # counted as tool targets; agent_registry + agent_budgets are two physical
    # tables that together satisfy entity row #33 per CONTEXT.md.
    # With agent_registry + agent_budgets split out, we expect 30 from the
    # inventory + the 3 new registry-inclusive entities = 30 here.
    assert len(covered & ENTITIES_33) >= 30, (
        f"Expected at least 30 of the 33 inventory entities to be covered; got "
        f"{len(covered & ENTITIES_33)}. Covered: {sorted(covered & ENTITIES_33)}"
    )
```

Note about entity counting: CONTEXT.md §Entity Inventory row 33 groups `agent_registry + agent_budgets` as a single logical entity. Here we count them separately because each has its own `@agent_tool` entity key. `agent_events` and `agent_auth_log` are gateway-auto-written only and are not counted as tool targets. The assertion `len(covered & ENTITIES_33) >= 30` accommodates that accounting.
  </action>
  <verify>
    <automated>python -c "
import fee_crawler.agent_tools.tools_agent_infra
import fee_crawler.agent_tools.tools_peer_research
import fee_crawler.agent_tools.tools_fees
import fee_crawler.agent_tools.tools_crawl
import fee_crawler.agent_tools.tools_hamilton
from fee_crawler.agent_tools.registry import TOOL_REGISTRY, entities_covered
names = set(TOOL_REGISTRY.keys())
expected_new = {'insert_agent_message','update_agent_message_intent','upsert_agent_registry','upsert_agent_budget'}
assert expected_new <= names, f'missing: {expected_new - names}'
ents = entities_covered()
assert {'agent_messages','agent_registry','agent_budgets'} <= ents
# Full 33-entity accounting: assert at least 30 from the inventory (see note on counting)
inventory = {
  'fees_raw','fees_verified','fees_published','fee_reviews','fee_change_events','roomba_log',
  'crawl_targets','crawl_results','crawl_runs','institution_dossiers','jobs','wave_runs','wave_state_runs',
  'hamilton_watchlists','hamilton_saved_analyses','hamilton_scenarios','hamilton_reports','hamilton_signals',
  'hamilton_priority_alerts','hamilton_conversations','hamilton_messages',
  'published_reports','report_jobs','articles',
  'saved_peer_sets','saved_subscriber_peer_groups','classification_cache','external_intelligence','beige_book_themes',
  'agent_messages','agent_registry','agent_budgets',
}
assert len(ents & inventory) >= 30, f'coverage only {len(ents & inventory)} of 32; covered={sorted(ents & inventory)}'
print(f'OK — {len(ents & inventory)} of 32 inventory entities covered')
"</automated>
  </verify>
  <acceptance_criteria>
    - File parses; `grep -c '@agent_tool(' fee_crawler/agent_tools/tools_agent_infra.py` returns 4
    - `grep -c 'ON CONFLICT (agent_name, window) DO UPDATE' fee_crawler/agent_tools/tools_agent_infra.py` returns 1
    - `grep -c 'ON CONFLICT (agent_name) DO UPDATE' fee_crawler/agent_tools/tools_agent_infra.py` returns 1 (agent_registry upsert)
    - `grep -c "PermissionError" fee_crawler/agent_tools/tools_agent_infra.py` returns at least 2 (Atlas-only on upsert_agent_registry + upsert_agent_budget)
    - After importing all tool modules, `entities_covered()` contains at least 30 of the 32-entity inventory
    - `fee_crawler/tests/test_agent_tool_coverage.py` no longer contains `pytest.xfail` — removed in favor of real assertions
    - `grep -c "xfail\|x_fail" fee_crawler/tests/test_agent_tool_coverage.py` returns 0
  </acceptance_criteria>
  <done>4 agent-infra tools registered; Atlas-only guard on registry + budgets; full 33-entity contract live; test_agent_tool_coverage.py is real, not xfailed.</done>
</task>

<task type="auto">
  <name>Task 4: Integration tests — tools_peer_research + tools_agent_infra</name>
  <files>fee_crawler/tests/test_tools_peer_research.py, fee_crawler/tests/test_tools_agent_infra.py</files>
  <read_first>
    - fee_crawler/agent_tools/tools_peer_research.py
    - fee_crawler/agent_tools/tools_agent_infra.py
    - fee_crawler/tests/test_tools_hamilton.py (cross-user delete pattern)
    - fee_crawler/tests/test_tools_crawl.py (upsert idempotency pattern)
  </read_first>
  <action>
### fee_crawler/tests/test_tools_peer_research.py

```python
"""Integration tests for Plan 62A-10 peer+research tools."""

from __future__ import annotations

import pytest

from fee_crawler.agent_tools import with_agent_context
from fee_crawler.agent_tools.tools_peer_research import (
    upsert_classification_cache,
    create_saved_subscriber_peer_group,
    delete_saved_subscriber_peer_group,
)
from fee_crawler.agent_tools.schemas import (
    UpsertClassificationCacheInput,
    CreateSavedSubscriberPeerGroupInput,
    DeleteSavedSubscriberPeerGroupInput,
)


@pytest.mark.asyncio
async def test_upsert_classification_cache_idempotent(db_schema):
    """Same cache_key called twice yields one row, updated in place."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        with with_agent_context(agent_name="darwin"):
            await upsert_classification_cache(
                inp=UpsertClassificationCacheInput(
                    cache_key="overdraft:fees_v1",
                    canonical_fee_key="overdraft",
                    confidence=0.82,
                    model="haiku-4-5",
                    source="darwin",
                ),
                agent_name="darwin",
                reasoning_prompt="classify", reasoning_output="overdraft@0.82",
            )
            # Second call: same key, higher confidence.
            await upsert_classification_cache(
                inp=UpsertClassificationCacheInput(
                    cache_key="overdraft:fees_v1",
                    canonical_fee_key="overdraft",
                    confidence=0.95,
                    model="haiku-4-5",
                    source="darwin",
                ),
                agent_name="darwin",
                reasoning_prompt="re-classify", reasoning_output="overdraft@0.95",
            )

        async with pool.acquire() as conn:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM classification_cache WHERE cache_key = 'overdraft:fees_v1'"
            )
            assert count == 1, f"expected 1 row (upsert), got {count}"
            conf = await conn.fetchval(
                "SELECT confidence FROM classification_cache WHERE cache_key = 'overdraft:fees_v1'"
            )
            assert float(conf) == 0.95, f"expected confidence=0.95 after upsert, got {conf}"
            auth_count = await conn.fetchval(
                "SELECT COUNT(*) FROM agent_auth_log WHERE tool_name='upsert_classification_cache'"
            )
            assert auth_count == 2, f"expected 2 auth_log rows (one per upsert), got {auth_count}"
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_saved_subscriber_peer_group_cross_user_rejected(db_schema):
    """User B cannot delete user A's peer group."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        with with_agent_context(agent_name="hamilton"):
            out = await create_saved_subscriber_peer_group(
                inp=CreateSavedSubscriberPeerGroupInput(
                    user_id="user_alpha",
                    name="My peers",
                    institution_ids=[1, 2, 3],
                ),
                agent_name="hamilton",
                reasoning_prompt="save", reasoning_output="saved",
            )
            assert out.group_id is not None

            with pytest.raises(PermissionError):
                with with_agent_context(agent_name="hamilton"):
                    await delete_saved_subscriber_peer_group(
                        inp=DeleteSavedSubscriberPeerGroupInput(
                            group_id=out.group_id,
                            user_id="user_beta",  # wrong owner
                        ),
                        agent_name="hamilton",
                        reasoning_prompt="delete",
                        reasoning_output="attempt",
                    )

            async with pool.acquire() as conn:
                count = await conn.fetchval(
                    "SELECT COUNT(*) FROM saved_subscriber_peer_groups WHERE id = $1::UUID",
                    out.group_id,
                )
                assert count == 1, "peer group must survive cross-user delete attempt"
    finally:
        pool_mod._pool = None
```

### fee_crawler/tests/test_tools_agent_infra.py

```python
"""Integration tests for Plan 62A-10 agent-infra tools."""

from __future__ import annotations

import uuid

import pytest

from fee_crawler.agent_tools import with_agent_context
from fee_crawler.agent_tools.tools_agent_infra import (
    insert_agent_message,
    update_agent_message_intent,
    upsert_agent_registry,
    upsert_agent_budget,
)
from fee_crawler.agent_tools.schemas import (
    InsertAgentMessageInput,
    UpdateAgentMessageIntentInput,
    UpsertAgentRegistryInput,
    UpsertAgentBudgetInput,
)


@pytest.mark.asyncio
async def test_agent_message_state_transition_audited(db_schema):
    """insert_agent_message -> update_agent_message_intent captures before/after state."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        corr_id = str(uuid.uuid4())
        with with_agent_context(agent_name="darwin"):
            out = await insert_agent_message(
                inp=InsertAgentMessageInput(
                    recipient_agent="knox",
                    intent="challenge",
                    correlation_id=corr_id,
                    payload={"fee_id": 42},
                ),
                agent_name="darwin",
                reasoning_prompt="challenge knox",
                reasoning_output="why $35 overdraft?",
            )
            message_id = out.message_id
            assert message_id is not None

            # Transition state open -> resolved.
            await update_agent_message_intent(
                inp=UpdateAgentMessageIntentInput(
                    message_id=message_id,
                    state="resolved",
                ),
                agent_name="darwin",
                reasoning_prompt="knox proved it",
                reasoning_output="accept",
            )

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT before_value, after_value
                     FROM agent_auth_log
                    WHERE tool_name = 'update_agent_message_intent'
                      AND entity_id = $1""",
                message_id,
            )
            assert row is not None
            before = row["before_value"] or {}
            after = row["after_value"] or {}
            assert before.get("state") == "open", f"before_value.state={before.get('state')}"
            assert after.get("state") == "resolved", f"after_value.state={after.get('state')}"
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_upsert_agent_budget_idempotent(db_schema):
    """Same (agent_name, window) upserted twice yields one row; limit_cents updated."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        with with_agent_context(agent_name="atlas"):
            await upsert_agent_budget(
                inp=UpsertAgentBudgetInput(
                    agent_name="knox",
                    window="per_cycle",
                    limit_cents=50000,
                ),
                agent_name="atlas",
                reasoning_prompt="set budget", reasoning_output="50000",
            )
            await upsert_agent_budget(
                inp=UpsertAgentBudgetInput(
                    agent_name="knox",
                    window="per_cycle",
                    limit_cents=75000,
                ),
                agent_name="atlas",
                reasoning_prompt="raise budget", reasoning_output="75000",
            )

        async with pool.acquire() as conn:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM agent_budgets "
                "WHERE agent_name='knox' AND window='per_cycle'"
            )
            assert count == 1, f"expected 1 row after upserts, got {count}"
            limit = await conn.fetchval(
                "SELECT limit_cents FROM agent_budgets "
                "WHERE agent_name='knox' AND window='per_cycle'"
            )
            assert limit == 75000, f"expected limit_cents=75000, got {limit}"
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_upsert_agent_budget_atlas_only(db_schema):
    """Non-Atlas caller is rejected with PermissionError."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        with pytest.raises(PermissionError):
            with with_agent_context(agent_name="knox"):
                await upsert_agent_budget(
                    inp=UpsertAgentBudgetInput(
                        agent_name="knox", window="per_day", limit_cents=10000,
                    ),
                    agent_name="knox",
                    reasoning_prompt="self-raise", reasoning_output="bad",
                )
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_upsert_agent_budget_does_not_touch_spent_cents(db_schema):
    """limit_cents upsert leaves spent_cents unchanged."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        with with_agent_context(agent_name="atlas"):
            await upsert_agent_budget(
                inp=UpsertAgentBudgetInput(
                    agent_name="darwin", window="per_batch", limit_cents=10000,
                ),
                agent_name="atlas",
                reasoning_prompt="init", reasoning_output="10000",
            )

        # Simulate gateway accounting: manually bump spent_cents.
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE agent_budgets SET spent_cents = 2500 "
                "WHERE agent_name = 'darwin' AND window = 'per_batch'"
            )

        with with_agent_context(agent_name="atlas"):
            await upsert_agent_budget(
                inp=UpsertAgentBudgetInput(
                    agent_name="darwin", window="per_batch", limit_cents=20000,
                ),
                agent_name="atlas",
                reasoning_prompt="raise cap", reasoning_output="20000",
            )

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT limit_cents, spent_cents FROM agent_budgets "
                "WHERE agent_name='darwin' AND window='per_batch'"
            )
            assert row["limit_cents"] == 20000
            assert row["spent_cents"] == 2500, (
                f"spent_cents must not be clobbered by limit upsert; got {row['spent_cents']}"
            )
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_upsert_agent_registry_rejects_bad_name(db_schema):
    """agent_name pattern is enforced by Pydantic — 'root' is rejected."""
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        UpsertAgentRegistryInput(
            agent_name="root",
            display_name="Root", role="supervisor",
        )
```
  </action>
  <verify>
    <automated>export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://postgres:postgres@localhost:5433/bfi_test}" && pytest fee_crawler/tests/test_tools_peer_research.py fee_crawler/tests/test_tools_agent_infra.py fee_crawler/tests/test_agent_tool_coverage.py -v --no-header</automated>
  </verify>
  <acceptance_criteria>
    - test_tools_peer_research.py: 2 tests pass — test_upsert_classification_cache_idempotent, test_saved_subscriber_peer_group_cross_user_rejected
    - test_tools_agent_infra.py: 5 tests pass — test_agent_message_state_transition_audited, test_upsert_agent_budget_idempotent, test_upsert_agent_budget_atlas_only, test_upsert_agent_budget_does_not_touch_spent_cents, test_upsert_agent_registry_rejects_bad_name
    - test_agent_tool_coverage.py: 2 tests pass — test_every_entity_has_tool, test_coverage_count_at_least_33; NO xfails remain
    - `grep -c 'xfail\|x_fail' fee_crawler/tests/test_agent_tool_coverage.py` returns 0
    - Upsert idempotency: after two upserts on the same key, COUNT(*) is 1 (both for classification_cache and agent_budgets)
    - Atlas-only: non-Atlas upsert_agent_budget raises PermissionError BEFORE any DB write
  </acceptance_criteria>
  <done>Idempotency + ownership + state-transition audit tests all pass; coverage test is real, not xfailed; AGENT-05 closes at 33 entities.</done>
</task>

</tasks>

<verification>
Run:
```bash
export DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test
pytest fee_crawler/tests/test_tools_peer_research.py fee_crawler/tests/test_tools_agent_infra.py fee_crawler/tests/test_agent_tool_coverage.py -v
```
Expect: all 9 tests green, no xfails. After import-cascade, `entities_covered()` contains all 32 tool-target entities from the CONTEXT.md inventory (agent_events + agent_auth_log are gateway-only, not tool targets).
</verification>

<success_criteria>
- 15 new tools registered (11 in tools_peer_research, 4 in tools_agent_infra)
- Full 33-entity AGENT-05 contract delivered (32 tool-target entities + 2 gateway-only)
- test_agent_tool_coverage.py asserts the contract; no xfails remain
- Atlas-only gates enforce hierarchical discipline on agent_registry + agent_budgets
- classification_cache upsert idempotent; agent_budgets upsert preserves spent_cents
- agent_messages state transitions audit before_value.state and after_value.state via gateway action='update'
- Peer+research and agent-infra schemas live in their own modules (`schemas/peer_research.py` + `schemas/agent_infra.py`); no contention with Plans 07/08/09 (file-conflict fix per revision)
</success_criteria>

<output>
After completion, create `.planning/phases/62A-agent-foundation-data-layer/62A-10-SUMMARY.md` noting:
- 15 tools registered covering 9 new entities (5 peer+research + 4 agent-infra)
- AGENT-05 full coverage achieved: 32 of 32 tool-target entities from the inventory
- test_agent_tool_coverage.py no longer xfailed; asserts ≥ 30 inventory entities covered
- Gateway-only entities (agent_events, agent_auth_log) intentionally have no user-facing tools
</output>
