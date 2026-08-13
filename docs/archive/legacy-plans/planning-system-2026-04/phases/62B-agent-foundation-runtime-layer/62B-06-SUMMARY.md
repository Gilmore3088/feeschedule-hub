---
phase: 62B
plan: 06
subsystem: agent-foundation-runtime-layer
tags: [comms-05, observability, read-only-tool, hamilton, replay]
requires:
  - v_agent_reasoning_trace view (migration 20260507 from 62B-01)
  - agent_events table (62a AGENT-01, migration 20260417)
  - agent_messages table (62a AGENT-05, migration 20260419)
  - @agent_tool decorator + TOOL_REGISTRY (62a registry.py)
  - asyncpg pool singleton (fee_crawler/agent_tools/pool.py)
provides:
  - get_reasoning_trace(correlation_id, max_rows) read-only agent tool
  - GetReasoningTraceIn / ReasoningTraceRow / GetReasoningTraceOut schemas
  - MCP read-surface marker (_bfi_read_only=True) on the tool function
affects:
  - fee_crawler/agent_tools/tools_agent_infra.py (additive: new tool)
  - fee_crawler/agent_tools/schemas/agent_infra.py (additive: new schemas)
  - fee_crawler/tests/test_reasoning_trace.py (new test module)
tech-stack:
  added: []
  patterns:
    - Read-only agent tool: @agent_tool(action='read') + module-level
      _bfi_read_only=True marker
    - View-as-source-of-truth: tool is a thin SELECT pass-through, no JOINs
      inline so migration 20260507 owns the shape
key-files:
  created:
    - fee_crawler/tests/test_reasoning_trace.py
  modified:
    - fee_crawler/agent_tools/tools_agent_infra.py
    - fee_crawler/agent_tools/schemas/agent_infra.py
decisions:
  - Used action='read' (registry.py vocabulary) rather than crud='read' (plan
    frontmatter vocabulary). Registry signature is the binding contract.
  - Set _bfi_read_only=True as a function attribute, not a decorator kwarg.
    Mirrors the tools_read.py convention so a future MCP wrapper can assert
    the marker without a new decorator path.
  - Empty correlation_id short-circuits without hitting the DB. Prevents
    accidental full-view LIMIT 500 scans on misconfigured callers.
  - max_rows bounded 1..5000 via pydantic (ge=1, le=5000). Default 500
    keeps the common Hamilton/admin-UI trace query fast.
  - Pool accessed via get_pool() (transaction-mode pool), not session-mode.
    Read tool; no LISTEN/NOTIFY required.
  - Tool NOT wired into fee_crawler/agent_mcp/tools_read.py in this plan.
    That surface is reserved for MCP-exposed read tools; the admin-only
    /admin/agents Replay tab (Plan 62B-10) will call get_reasoning_trace
    directly through the Python surface. Wiring into MCP is a follow-up
    if/when an external MCP client needs it.
metrics:
  duration: ~12 minutes
  completed: 2026-04-16
  tasks: 1
  files_created: 1
  files_modified: 2
---

# Phase 62B Plan 06: Reasoning-Trace Read Tool Summary

Expose migration 20260507's `v_agent_reasoning_trace` view as a read-only
`@agent_tool` named `get_reasoning_trace(correlation_id)` so Hamilton and
the /admin/agents Replay tab can answer "why this number?" against a single,
ordered timeline of events + messages.

## What shipped

**Tool registration** — `fee_crawler/agent_tools/tools_agent_infra.py`
gains a new @agent_tool block at the bottom of the module:

```python
@agent_tool(
    name="get_reasoning_trace",
    entity="agent_events",
    action="read",
    input_schema=GetReasoningTraceIn,
    output_schema=GetReasoningTraceOut,
    description="Phase 62b COMMS-05: return the flat ordered timeline ...",
)
async def get_reasoning_trace(*, correlation_id: str, max_rows: int = 500) -> dict:
    ...

get_reasoning_trace._bfi_read_only = True  # MCP read-surface marker
```

The query itself is a thin SELECT from `v_agent_reasoning_trace`:

```sql
SELECT kind, created_at, agent_name, intent_or_action,
       tool_name, entity, payload, row_id
  FROM v_agent_reasoning_trace
 WHERE correlation_id = $1::UUID
 ORDER BY created_at
 LIMIT $2
```

Empty `correlation_id` short-circuits to `{"rows": []}` without opening a
pool connection. Otherwise the row list carries the full view projection
(ISO-encoded `created_at`, JSONB `payload` as a dict).

**Pydantic schemas** — appended to `fee_crawler/agent_tools/schemas/agent_infra.py`:

- `GetReasoningTraceIn` (correlation_id: str, max_rows: int bounded 1..5000)
- `ReasoningTraceRow` (kind, created_at, agent_name, intent_or_action,
  tool_name, entity, payload, row_id — all with `extra='forbid'`)
- `GetReasoningTraceOut` (rows: list[ReasoningTraceRow], + success/error
  from `BaseToolOutput`)

Re-export through `schemas/__init__.py` already wired (wildcard import from
agent_infra was set up by Plan 62A-10).

**Test coverage** — `fee_crawler/tests/test_reasoning_trace.py` (6 tests):

| Test | Kind | Target |
|------|------|--------|
| `test_tool_registered_with_read_action` | pure-Python | `TOOL_REGISTRY['get_reasoning_trace'].action == 'read'` + entity='agent_events' |
| `test_tool_marked_as_bfi_read_only` | pure-Python | `get_reasoning_trace._bfi_read_only is True` |
| `test_empty_correlation_returns_empty_rows` | db_schema | `{"rows": []}` on unknown correlation_id |
| `test_returns_events_and_messages_in_order` | db_schema | Seeded 2 events + 1 message → 3 rows, kinds = [event, event, message] |
| `test_each_row_has_expected_keys` | db_schema | Row shape matches the 8-key contract |
| `test_max_rows_limit_respected` | db_schema | max_rows=2 caps a 5-event trace at 2 |

DB-backed tests use the existing `db_schema` fixture (per-test schema +
applied migrations, pool bound via `pool_mod._pool = pool`). They skip
cleanly when `DATABASE_URL_TEST` is unset, matching conftest.py contract.

## Commits

| Hash | Message |
|------|---------|
| 7e211d8 | test(62B-06): add failing tests for get_reasoning_trace tool |
| 1c0d922 | feat(62B-06): add get_reasoning_trace read-only agent tool (COMMS-05) |

## Acceptance criteria

- [x] `GetReasoningTraceIn` and `ReasoningTraceRow` classes exist in
  `fee_crawler/agent_tools/schemas/agent_infra.py`
- [x] `get_reasoning_trace` exists in
  `fee_crawler/agent_tools/tools_agent_infra.py` with `@agent_tool` decorator
  carrying `action="read"` (registry.py uses `action` not `crud`)
- [x] `grep v_agent_reasoning_trace fee_crawler/agent_tools/tools_agent_infra.py`
  returns 4 matches (comment, description, docstring, SQL — criterion ≥1)
- [x] `grep get_reasoning_trace fee_crawler/agent_tools/tools_agent_infra.py`
  returns 3 matches (criterion ≥2)
- [x] `pytest fee_crawler/tests/test_reasoning_trace.py -x -v` exits 0
  (2 passed, 4 skipped without DB — matches conftest skip contract)
- [x] `python -c "from fee_crawler.agent_tools.tools_agent_infra import get_reasoning_trace; print('OK')"`
  exits 0

## Decisions Made

- **Registry vocabulary:** Plan frontmatter said `crud='read'`. Actual
  registry signature uses `action`. Chose `action="read"` to match the
  binding contract. `TOOL_REGISTRY['get_reasoning_trace'].action == 'read'`
  is the testable assertion.
- **MCP marker strategy:** Set `_bfi_read_only=True` as a function
  attribute after registration (post-decorator line). The tools_read.py
  convention already sets this attribute on the underlying function; we
  match it so any future unified MCP read-surface scanner would accept the
  tool without modification.
- **View-only query:** The SQL inside the tool is `SELECT ... FROM
  v_agent_reasoning_trace`. No JOINs or UNIONs inlined. Keeps the view
  (migration 20260507) as the single source of truth for the kind/row
  shape. If the view ever adds a column, only the Pydantic row schema
  needs to update.
- **Empty-input fast path:** Rather than letting pydantic reject empty
  correlation_id at the input boundary (which would raise), the tool
  short-circuits to `{"rows": []}` so callers can chain without special-
  casing. `GetReasoningTraceIn.correlation_id` has `default=""` to make
  this explicit.
- **MCP wiring deferred:** The plan's NOTE in the <action> block said
  MCP exposure is optional. The current admin Replay tab (Plan 62B-10)
  and Hamilton (Phase 66) are Python-internal callers, so we stop at the
  `@agent_tool` surface. Adding a corresponding `@read_only_tool` in
  `fee_crawler/agent_mcp/tools_read.py` is a 15-line follow-up when an
  external MCP client actually needs it.

## Deviations from Plan

None — plan executed exactly as written. One naming reconciliation noted
above (`crud` → `action`), which was explicitly flagged in the plan's NOTE
as "Match 62a's style exactly" — i.e., follow the actual decorator shape.

## Known Stubs

None.

## Threat Flags

None. The tool adds no new network, auth, or schema-level surface. Read-
only query against an existing view; pydantic bounds `max_rows` to guard
against DoS. STRIDE register (plan threat_model) entries T-01/T-02/T-03
are satisfied:
- T-01 (Information Disclosure): accepted — admin-only callers this phase.
- T-02 (Input Validation): mitigated via `$1::UUID` cast (asyncpg rejects
  malformed UUIDs at prepare) + `max_length=64` on the string.
- T-03 (DoS): mitigated via pydantic `max_rows` `le=5000`, default 500,
  and the existing indexes on `correlation_id` in both source tables.

## Self-Check: PASSED

**Created files:**
- FOUND: fee_crawler/tests/test_reasoning_trace.py

**Modified files:**
- FOUND: fee_crawler/agent_tools/tools_agent_infra.py (get_reasoning_trace
  added)
- FOUND: fee_crawler/agent_tools/schemas/agent_infra.py
  (GetReasoningTraceIn, ReasoningTraceRow, GetReasoningTraceOut added)

**Commits:**
- FOUND: 7e211d8 test(62B-06): add failing tests for get_reasoning_trace tool
- FOUND: 1c0d922 feat(62B-06): add get_reasoning_trace read-only agent tool (COMMS-05)

**Runtime verification:**
- `python -c "from fee_crawler.agent_tools.tools_agent_infra import get_reasoning_trace; print('OK')"` → OK
- `python -m pytest fee_crawler/tests/test_reasoning_trace.py -v` → 2 passed, 4 skipped
- `python -m pytest fee_crawler/tests/test_agent_tool_coverage.py -v` → 2 passed (entity coverage unaffected)
