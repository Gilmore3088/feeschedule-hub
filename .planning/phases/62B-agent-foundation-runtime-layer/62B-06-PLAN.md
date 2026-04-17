---
phase: 62B
plan: 06
type: execute
wave: 3
depends_on: [62B-01]
files_modified:
  - fee_crawler/agent_tools/tools_agent_infra.py
  - fee_crawler/agent_tools/schemas/agent_infra.py
  - fee_crawler/tests/test_reasoning_trace.py
autonomous: true
requirements: [COMMS-05]
must_haves:
  truths:
    - "A new read-only agent tool get_reasoning_trace(correlation_id) queries v_agent_reasoning_trace and returns a flat ordered timeline"
    - "Tool is registered via @agent_tool with crud='read' and _bfi_read_only=True (so MCP server would accept it)"
    - "Tool returns [{kind, created_at, agent_name, intent_or_action, tool_name, entity, payload, row_id}]"
    - "Tool handles empty correlation_id gracefully (returns [])"
    - "Tool respects an optional max_rows parameter (default 500)"
  artifacts:
    - path: fee_crawler/agent_tools/tools_agent_infra.py
      provides: "Adds @agent_tool get_reasoning_trace with pydantic input/output schema"
    - path: fee_crawler/agent_tools/schemas/agent_infra.py
      provides: "GetReasoningTraceIn + ReasoningTraceRow pydantic models (or extends existing schemas module)"
  key_links:
    - from: "get_reasoning_trace tool"
      to: "v_agent_reasoning_trace view (from 62B-01 migration 20260507)"
      via: "SELECT FROM v_agent_reasoning_trace WHERE correlation_id = $1"
      pattern: "v_agent_reasoning_trace"
---

<objective>
Expose the SQL view `v_agent_reasoning_trace` (shipped by 62B-01) as a read-only agent tool `get_reasoning_trace(correlation_id)` so Hamilton and admin UIs can answer "why this number?" on demand (COMMS-05 + D-12).

Purpose: The `/admin/agents` Replay tab (plan 62B-10) needs a backend data source. Hamilton (Phase 66) will call this tool. This plan wires the Python tool + Pydantic schema + pytest integration.

Output: 1 new @agent_tool registration in `tools_agent_infra.py`, 1 new pydantic schema pair, 1 pytest file.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md
@.planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md
@fee_crawler/agent_tools/tools_agent_infra.py
@fee_crawler/agent_tools/registry.py
@fee_crawler/agent_tools/schemas

<interfaces>
Existing tool pattern in `tools_agent_infra.py` — study the 4 existing @agent_tool registrations for exact signature + error handling.

Read-only-tool marker pattern used in 62a's MCP server (from `fee_crawler/agent_mcp/tools_read.py` — 4 existing read-only tools):
```python
@agent_tool(
    name="get_reasoning_trace",
    entity="agent_events",     # view reads from agent_events + agent_messages
    crud="read",               # key: read-only
)
```

62a's read tools don't route through `with_agent_tool` gateway (which is for writes). They use a pool directly. Match that pattern.

From 62B-01 migration 20260507:
- View `v_agent_reasoning_trace` columns: `kind, correlation_id, created_at, agent_name, intent_or_action, tool_name, entity, payload, row_id`
- Ordered by `created_at`

Research §Mechanics 4 lines 985-1013 (view definition reference).
Research §Code Examples for anthropic SDK tool signature (Pydantic schema).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add GetReasoningTraceIn pydantic schema + get_reasoning_trace @agent_tool + tests</name>
  <files>fee_crawler/agent_tools/tools_agent_infra.py, fee_crawler/agent_tools/schemas/agent_infra.py, fee_crawler/tests/test_reasoning_trace.py</files>
  <read_first>
    - fee_crawler/agent_tools/tools_agent_infra.py (full file — study the 4 existing tool signatures; new tool follows same @agent_tool decorator shape)
    - fee_crawler/agent_tools/registry.py (understand what @agent_tool expects; look for `crud` arg and `_bfi_read_only` marker if any)
    - fee_crawler/agent_mcp/tools_read.py (read-only tool pattern — how 62a exposes read tools)
    - fee_crawler/agent_tools/schemas/ — list existing schema files to find the right file to extend (likely `agent_infra.py`; if file doesn't exist, create it)
    - supabase/migrations/20260507_v_agent_reasoning_trace.sql (exact column names returned by view)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md D-12 (COMMS-05 design)
  </read_first>
  <behavior>
    - Test 1: get_reasoning_trace returns empty list when correlation_id has no events/messages
    - Test 2: Seeded 2 agent_events + 1 agent_messages all with same correlation_id returns 3 rows ordered by created_at
    - Test 3: Each row has expected keys: kind, created_at, agent_name, intent_or_action, tool_name, entity, payload, row_id
    - Test 4: Tool registered with crud='read' in registry — listing read-only tools includes 'get_reasoning_trace'
    - Test 5: max_rows=2 returns only first 2 rows of a 3-row trace
  </behavior>
  <action>
**Edit 1: `fee_crawler/agent_tools/schemas/agent_infra.py`**

If this file exists (check `fee_crawler/agent_tools/schemas/`), APPEND the new models. If not, create it with both existing-file content AND new additions; but most likely it exists — read first, then add:

```python
# --- 62b COMMS-05: reasoning trace ---

class GetReasoningTraceIn(BaseModel):
    correlation_id: str    # UUID as string
    max_rows: int = Field(default=500, ge=1, le=5000)


class ReasoningTraceRow(BaseModel):
    kind: str              # 'event' | 'message'
    created_at: str        # ISO timestamp
    agent_name: str
    intent_or_action: Optional[str] = None
    tool_name: Optional[str] = None
    entity: Optional[str] = None
    payload: Optional[dict] = None
    row_id: str


class GetReasoningTraceOut(BaseModel):
    rows: list[ReasoningTraceRow]
```

If the existing file uses `from pydantic import BaseModel, Field` at top and has `Optional` imported, reuse; otherwise add the imports.

**Edit 2: `fee_crawler/agent_tools/tools_agent_infra.py`**

Add a new @agent_tool at the bottom of the file:

```python
from fee_crawler.agent_tools.schemas.agent_infra import (
    # ... existing imports
    GetReasoningTraceIn, GetReasoningTraceOut, ReasoningTraceRow,
)


@agent_tool(
    name="get_reasoning_trace",
    entity="agent_events",
    crud="read",
    input_schema=GetReasoningTraceIn,
    output_schema=GetReasoningTraceOut,
    description="Phase 62b COMMS-05: returns the flat ordered timeline of agent_events + agent_messages for a given correlation_id. Read-only.",
)
async def get_reasoning_trace(
    *,
    correlation_id: str,
    max_rows: int = 500,
    agent_name: str = "_reader",   # read tool; agent_name is optional-audit
) -> dict:
    """Query v_agent_reasoning_trace for a correlation_id. Returns {rows: [...]}."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT kind, created_at, agent_name, intent_or_action,
                      tool_name, entity, payload, row_id
                 FROM v_agent_reasoning_trace
                WHERE correlation_id = $1::UUID
                ORDER BY created_at
                LIMIT $2""",
            correlation_id, max_rows,
        )
    return {
        "rows": [
            {
                "kind": r["kind"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "agent_name": r["agent_name"],
                "intent_or_action": r["intent_or_action"],
                "tool_name": r["tool_name"],
                "entity": r["entity"],
                "payload": r["payload"],
                "row_id": r["row_id"],
            }
            for r in rows
        ]
    }
```

NOTE: The @agent_tool decorator arg shape must match what `registry.py` expects. Read registry.py first; if it doesn't support `input_schema`/`output_schema`/`description` kwargs, drop those and rely on the existing pattern (perhaps the decorator auto-discovers Pydantic models via type hints). Match 62a's style exactly.

If 62a registers read tools via a different marker (e.g., `_bfi_read_only=True` via `@read_only_tool` decorator in `fee_crawler/agent_mcp/`), and if this tool will be exposed via MCP read surface, ALSO mark it there — but only if the MCP read registry lives in agent_mcp, not agent_tools. Read `fee_crawler/agent_mcp/tools_read.py` to confirm. If the existing read tools in agent_mcp only delegate to queries in `src/lib/crawler-db/`, then the `get_reasoning_trace` tool is a Python-side tool only and MCP exposure is out of scope (can be added later).

**Test file: `fee_crawler/tests/test_reasoning_trace.py`**

```python
import pytest
import uuid
import json
from datetime import datetime, timezone

from fee_crawler.agent_tools.tools_agent_infra import get_reasoning_trace


@pytest.mark.asyncio
async def test_empty_correlation_returns_empty(db_schema):
    schema, pool = db_schema
    result = await get_reasoning_trace(correlation_id=str(uuid.uuid4()), max_rows=500)
    assert result == {"rows": []}


@pytest.mark.asyncio
async def test_returns_events_and_messages_in_order(db_schema):
    schema, pool = db_schema
    corr = str(uuid.uuid4())
    async with pool.acquire() as conn:
        # 2 events
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status, correlation_id, created_at)
               VALUES ('knox','extract','extract_fees','fees_raw','success',$1::UUID, NOW() - INTERVAL '3 seconds')""",
            corr,
        )
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status, correlation_id, created_at)
               VALUES ('darwin','verify','promote_to_tier2','fees_verified','success',$1::UUID, NOW() - INTERVAL '2 seconds')""",
            corr,
        )
        # 1 message
        await conn.execute(
            """INSERT INTO agent_messages
                 (sender_agent, recipient_agent, intent, correlation_id, payload, created_at)
               VALUES ('darwin','knox','challenge',$1::UUID,'{"q":"why"}'::JSONB, NOW() - INTERVAL '1 second')""",
            corr,
        )
    result = await get_reasoning_trace(correlation_id=corr)
    rows = result["rows"]
    assert len(rows) == 3
    # Ordered by created_at
    kinds = [r["kind"] for r in rows]
    assert kinds == ["event", "event", "message"]
    # All share correlation
    for r in rows:
        assert r["agent_name"] in ("knox", "darwin")


@pytest.mark.asyncio
async def test_max_rows_limit(db_schema):
    schema, pool = db_schema
    corr = str(uuid.uuid4())
    async with pool.acquire() as conn:
        for i in range(5):
            await conn.execute(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, status, correlation_id)
                   VALUES ('knox','step','t','e','success',$1::UUID)""",
                corr,
            )
    result = await get_reasoning_trace(correlation_id=corr, max_rows=2)
    assert len(result["rows"]) == 2


@pytest.mark.asyncio
async def test_tool_registered_readonly():
    from fee_crawler.agent_tools.registry import _REGISTRY  # or whatever the registry object is
    # Flexible: just assert the tool is findable somehow
    names = [getattr(t, "name", None) for t in _REGISTRY] if isinstance(_REGISTRY, (list, tuple)) \
            else list(_REGISTRY.keys()) if isinstance(_REGISTRY, dict) \
            else []
    # Fallback: import the function and check it has registry metadata
    assert "get_reasoning_trace" in str(names) or hasattr(get_reasoning_trace, "_agent_tool_meta")
```

NOTE on the last test: the `_REGISTRY` symbol name depends on `registry.py` internals. Read that file first; use the correct accessor. If registry exposes a `list_tools()` function, use that instead. The goal is to assert the decorator successfully registered the tool with `crud='read'`.
  </action>
  <verify>
    <automated>pytest fee_crawler/tests/test_reasoning_trace.py -x -v</automated>
  </verify>
  <acceptance_criteria>
    - File `fee_crawler/agent_tools/schemas/agent_infra.py` contains class `GetReasoningTraceIn` and class `ReasoningTraceRow`
    - File `fee_crawler/agent_tools/tools_agent_infra.py` contains `async def get_reasoning_trace` with `@agent_tool` decorator including `crud="read"`
    - `grep -n "v_agent_reasoning_trace" fee_crawler/agent_tools/tools_agent_infra.py` returns at least 1 match (SQL query uses the view)
    - `grep -n "get_reasoning_trace" fee_crawler/agent_tools/tools_agent_infra.py` returns at least 2 matches (decorator + function)
    - `pytest fee_crawler/tests/test_reasoning_trace.py -x -v` exits 0
    - `python -c "from fee_crawler.agent_tools.tools_agent_infra import get_reasoning_trace; print('OK')"` exits 0
  </acceptance_criteria>
  <done>Read-only `get_reasoning_trace` tool registered, returns ordered timeline, tests green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Admin UI / Hamilton → get_reasoning_trace | read-only tool; no writes; pool query parameterized |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-62B-06-01 | Information Disclosure | View exposes payloads that might contain PII or secrets | accept | agent_events.input_payload can contain tool inputs (e.g., fees_raw data); admin-only console (plan 62B-10) restricts access. No client-side exposure; no MCP write surface. |
| T-62B-06-02 | Input Validation | correlation_id accepts non-UUID string | mitigate | Cast to `$1::UUID` in SQL — asyncpg rejects malformed UUIDs at prepare time. Pydantic `GetReasoningTraceIn.correlation_id: str` documents expected shape; add regex validation if tighter needed. |
| T-62B-06-03 | Denial of Service | Huge correlation_id trace blows memory | mitigate | `max_rows` param capped at 5000 (Pydantic `le=5000`); default 500. Index on `agent_events (correlation_id)` (from 62a migration) + `agent_messages (correlation_id)` (from 62a) keep the query fast. |
</threat_model>

<verification>
- Tool function importable
- 4+ tests pass
</verification>

<success_criteria>
- [ ] `get_reasoning_trace` tool registered with crud='read'
- [ ] Pydantic schema defines input + output
- [ ] All tests green
- [ ] View used (not raw JOIN) — single source of truth stays in migration 20260507
</success_criteria>

<output>
After completion, create `.planning/phases/62B-agent-foundation-runtime-layer/62B-06-SUMMARY.md` noting the registry mechanism used + whether the tool was also exposed in the agent_mcp read-only surface.
</output>
