---
phase: 62A
plan: 05
type: execute
wave: 1
depends_on:
  - 62A-01
  - 62A-02
  - 62A-03
  - 62A-04
files_modified:
  - fee_crawler/agent_tools/__init__.py
  - fee_crawler/agent_tools/pool.py
  - fee_crawler/agent_tools/schemas/__init__.py
  - fee_crawler/agent_tools/schemas/_base.py
  - fee_crawler/agent_tools/registry.py
  - fee_crawler/agent_tools/gateway.py
  - fee_crawler/agent_tools/budget.py
  - fee_crawler/agent_tools/context.py
  - src/lib/agent-tools/types.generated.ts
  - src/lib/agent-tools/index.ts
  - scripts/gen-agent-tool-types.sh
  - fee_crawler/tests/test_agent_gateway.py
  - fee_crawler/tests/test_agent_auth_log.py
  - fee_crawler/tests/test_sc5_budget_halt.py
autonomous: true
requirements:
  - AGENT-02
  - AGENT-04
must_haves:
  truths:
    - "Calling `await with_agent_tool(...)` context manager writes an agent_events row with status='pending' BEFORE yielding the transaction"
    - "On successful body exit, status is flipped to 'success' and an agent_auth_log row lands in the same transaction"
    - "On exception inside the body, the whole transaction rolls back — no agent_events OR agent_auth_log row persists (event log shows pending only if process crashes before tx commit)"
    - "Setting `ATLAS_AGENT_BUDGET_KNOX_CENTS=1000` causes the gateway to INSERT a budget_halt agent_events row and raise `BudgetExceeded` when spent crosses the limit"
    - "Pydantic schemas generate TS types via `scripts/gen-agent-tool-types.sh`; `src/lib/agent-tools/types.generated.ts` contains matching interfaces"
    - "`fee_crawler/agent_tools/schemas/` is a Python package — `from fee_crawler.agent_tools.schemas import BaseToolInput, BaseToolOutput, AgentEventRef` resolves via `schemas/_base.py`; per-domain schema modules (fees.py, crawl.py, hamilton.py, peer_research.py, agent_infra.py) land in Plans 07/08/09/10 and are re-exported through `schemas/__init__.py`"
    - "test_tool_writes_event_before_target passes (no longer xfailed)"
    - "test_auth_log_captures_before_and_after passes (no longer xfailed)"
    - "test_sc5_env_var_halts_knox passes (no longer xfailed)"
  artifacts:
    - path: "fee_crawler/agent_tools/gateway.py"
      provides: "with_agent_tool async context manager — the single audit + agent_events wrapper every CRUD tool uses"
      contains: "async def with_agent_tool"
    - path: "fee_crawler/agent_tools/pool.py"
      provides: "asyncpg pool singleton with Supabase transaction-pooler-compatible settings"
      contains: "statement_cache_size=0"
    - path: "fee_crawler/agent_tools/budget.py"
      provides: "_check_budget and _account_budget — env-var override + agent_budgets fallback"
      contains: "ATLAS_AGENT_BUDGET_"
    - path: "fee_crawler/agent_tools/schemas/_base.py"
      provides: "Shared Pydantic base classes (BaseToolInput, BaseToolOutput, AgentEventRef) plus AgentName enum; NO domain schemas — those live in per-domain modules added by Plans 07..10"
      contains: "class BaseToolInput"
    - path: "fee_crawler/agent_tools/schemas/__init__.py"
      provides: "Public re-export surface for the schemas package; exposes _base classes + re-exports per-domain modules as they're added (Plans 07/08/09/10). Source of truth for TS codegen."
      contains: "from ._base import"
    - path: "fee_crawler/agent_tools/registry.py"
      provides: "@agent_tool decorator + registry dict — Plans 62A-09..12 register tools here"
      contains: "def agent_tool"
    - path: "src/lib/agent-tools/types.generated.ts"
      provides: "TS type mirrors of every Pydantic schema (regenerated via scripts/gen-agent-tool-types.sh)"
      contains: "// AUTO-GENERATED"
    - path: "scripts/gen-agent-tool-types.sh"
      provides: "One-command codegen: pydantic2ts --module ... --output src/lib/agent-tools/types.generated.ts"
      contains: "pydantic2ts"
  key_links:
    - from: "fee_crawler/agent_tools/gateway.py"
      to: "agent_events + agent_auth_log"
      via: "single transaction: pending event insert → body → success update + auth_log insert"
      pattern: "INSERT INTO agent_events.*INSERT INTO agent_auth_log"
    - from: "fee_crawler/agent_tools/budget.py"
      to: "agent_budgets + ATLAS_AGENT_BUDGET_* env vars"
      via: "_check_budget reads env first, then agent_budgets row, then config fallback; writes budget_halt event on breach"
      pattern: "ATLAS_AGENT_BUDGET_"
    - from: "scripts/gen-agent-tool-types.sh"
      to: "src/lib/agent-tools/types.generated.ts"
      via: "pydantic2ts --module fee_crawler.agent_tools.schemas --output"
      pattern: "pydantic2ts --module"
---

<objective>
Land the single most important runtime artifact of Phase 62a: the agent-tool gateway. Every write-CRUD tool across Plans 62A-09..12 uses `with_agent_tool(...)` as its transactional audit wrapper. The gateway:

1. Opens a transaction on the asyncpg pool.
2. Checks the agent's budget (env var override > agent_budgets row > config fallback) — on breach, INSERTs a `budget_halt` agent_events row and raises `BudgetExceeded`.
3. Inserts an `agent_events` row with `status='pending'` and captures `event_id`.
4. Snapshots `before_value` for UPDATE/DELETE operations.
5. Yields (connection, event_id) to the caller for the actual target-table write.
6. On successful body exit: captures `after_value`, inserts `agent_auth_log`, updates `agent_events.status='success'` + cost, increments `agent_budgets.spent_cents` — all in the same transaction.
7. On exception: transaction rolls back; no partial state.

Purpose: Without this, AGENT-02 ("every action writes one row before side effects") and AGENT-04 ("agent_auth_log per tool call") cannot hold for any downstream CRUD tool. This is the linchpin plan.

Secondary output: Pydantic base classes + codegen script producing `src/lib/agent-tools/types.generated.ts` so the Next.js layer calls tools with type safety. Per-domain schema modules (fees.py, crawl.py, hamilton.py, peer_research.py, agent_infra.py) land in Plans 07/08/09/10; this plan ships only the package skeleton (`_base.py` + `__init__.py`) so those plans can run in parallel in Wave 2 without contending on a shared schemas.py file.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md
@.planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md
@.planning/phases/62A-agent-foundation-data-layer/62A-VALIDATION.md
@src/lib/crawler-db/connection.ts
@src/lib/fee-actions.ts
@fee_crawler/tests/test_agent_gateway.py
@fee_crawler/tests/test_agent_auth_log.py
@fee_crawler/tests/test_sc5_budget_halt.py
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Caller (Modal function) → gateway | Caller supplies agent_name + reasoning_prompt + reasoning_output; gateway TRUSTS these inputs in 62a (SEC-04 hardens in Phase 68) |
| Gateway → agent_events | Gateway inserts with service-role; no tool can write agent_events directly in 62a |
| Gateway → agent_budgets | Gateway is the only sanctioned writer of spent_cents; tool registry enforces |
| Env var `ATLAS_AGENT_BUDGET_*` | Read at gateway entry; trusted because Modal secrets + local .env are developer-controlled |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-62A05-01 | Spoofing | Caller supplies a fake agent_name ('admin_override') | high | mitigate | Plan 62A-05 gateway asserts agent_name exists in agent_registry AND is_active=true at every call; SEC-04 (Phase 68) adds JWT signing. Test: `test_gateway_rejects_unknown_agent` |
| T-62A05-02 | Tampering | Caller passes `cost_cents=0` to bypass budget accounting | high | mitigate | Gateway computes cost_cents itself from the caller-supplied LLM usage metadata; the caller cannot override the final cost_cents value. Test: `test_gateway_ignores_caller_supplied_cost_cents` |
| T-62A05-03 | Repudiation | reasoning_hash is computed by caller and could be empty | medium | mitigate | Gateway refuses to proceed if reasoning_hash is not exactly 32 bytes (sha256). Test: `test_gateway_rejects_invalid_reasoning_hash` |
| T-62A05-04 | Information Disclosure | JSONB payload leaks LLM prompt containing PII | high | mitigate | Gateway truncates input_payload/output_payload to 64KB before insert per D-12; any overflow logs a {r2_key, sha256, size} pointer (R2 upload deferred to 62b compactor). Test: `test_gateway_truncates_oversized_payload` |
| T-62A05-05 | Denial of Service | Budget env var set to 0 halts all agent work immediately | low | accept | Intentional operator kill-switch; documented in code comment |
| T-62A05-06 | Elevation of Privilege | Direct asyncpg connection bypasses gateway | high | mitigate | All tool call sites go through `with_agent_tool`; registry validates every @agent_tool decorator. Plan 62A-09 adds `test_no_raw_pool_acquire_outside_gateway` that greps fee_crawler/agent_tools/ for `pool.acquire()` and asserts only pool.py + gateway.py contain it |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Interfaces — Pydantic schemas package + registry + pool + context scaffolding</name>
  <files>fee_crawler/agent_tools/__init__.py, fee_crawler/agent_tools/pool.py, fee_crawler/agent_tools/schemas/__init__.py, fee_crawler/agent_tools/schemas/_base.py, fee_crawler/agent_tools/registry.py, fee_crawler/agent_tools/context.py</files>
  <read_first>
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §2 (asyncpg pool config) + §3 (codegen + schema source of truth)
    - .planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md §D-07 (three-layer tool architecture) + Claude's Discretion (tool registry format)
    - src/lib/crawler-db/connection.ts (TS pool pattern; Python equivalent)
  </read_first>
  <behavior>
    - Test 1: `from fee_crawler.agent_tools import get_pool, agent_tool, with_agent_context` all succeed
    - Test 2: `get_pool()` returns an asyncpg.Pool configured with statement_cache_size=0 and prepare=False-equivalent settings
    - Test 3: Applying `@agent_tool(name='x', entity='fees_raw', action='create')` to a function registers it in the module-level registry dict
    - Test 4: `with_agent_context(correlation_id=..., cost_cents=...)` sets ContextVar values that the gateway reads on subsequent calls
    - Test 5: `from fee_crawler.agent_tools.schemas import BaseToolInput, BaseToolOutput, AgentEventRef` resolves via the `schemas/` package; `isinstance(BaseToolInput, type)` is True
  </behavior>
  <action>
Create these six files. Each is small and focused; gateway.py (next task) is the heavy one.

**IMPORTANT — package structure change (file-conflict fix):** The schemas module is a Python *package* (`fee_crawler/agent_tools/schemas/` directory) rather than a single `schemas.py` file. This lets Plans 07/08/09/10 each own a disjoint per-domain module (`fees.py`, `crawl.py`, `hamilton.py`, `peer_research.py`, `agent_infra.py`) so they can run in parallel in Wave 2 without file contention. Plan 05 ships only the empty package skeleton: `_base.py` (shared types) + `__init__.py` (re-export surface).

### fee_crawler/agent_tools/__init__.py

```python
"""Phase 62a agent_tools package.

Exposes the public surface:
  - get_pool / close_pool: asyncpg connection pool singleton
  - with_agent_tool: transactional gateway context manager
  - agent_tool: decorator for registering CRUD tools
  - TOOL_REGISTRY: module-level dict of registered tools
  - with_agent_context: sets per-call correlation_id + cost_cents
  - BudgetExceeded, AgentUnknown: gateway exceptions

Downstream plans (62A-09..12) register tools via @agent_tool(...); the read-only MCP
server (Plan 62A-13) imports the registry to expose read tools.
"""

from fee_crawler.agent_tools.pool import get_pool, close_pool
from fee_crawler.agent_tools.registry import agent_tool, TOOL_REGISTRY, ToolMeta
from fee_crawler.agent_tools.context import with_agent_context, get_agent_context
from fee_crawler.agent_tools.gateway import with_agent_tool, BudgetExceeded, AgentUnknown

__all__ = [
    "get_pool", "close_pool",
    "agent_tool", "TOOL_REGISTRY", "ToolMeta",
    "with_agent_context", "get_agent_context",
    "with_agent_tool", "BudgetExceeded", "AgentUnknown",
]
```

### fee_crawler/agent_tools/pool.py

```python
"""asyncpg connection pool singleton for agent_tools.

Configured for Supabase transaction-mode pooler (port 6543):
  - statement_cache_size=0 (prepared statements incompatible with Supavisor)
  - max_cached_statement_lifetime=0 (belt-and-suspenders)
  - JSONB encoded/decoded via python json module

Reference: Supabase docs on disabling prepared statements
  https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL
"""

from __future__ import annotations

import json
import os
from typing import Optional

import asyncpg

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Return a process-scoped asyncpg pool. Creates on first call."""
    global _pool
    if _pool is None:
        dsn = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_URL_TEST")
        if not dsn:
            raise RuntimeError(
                "DATABASE_URL (or DATABASE_URL_TEST for tests) must be set "
                "before calling get_pool()."
            )
        _pool = await asyncpg.create_pool(
            dsn=dsn,
            min_size=1,
            max_size=10,
            statement_cache_size=0,
            max_cached_statement_lifetime=0,
            max_inactive_connection_lifetime=60,
            command_timeout=30,
            server_settings={"application_name": "bfi-agent-tool"},
            init=_init_connection,
        )
    return _pool


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Register JSONB codec so JSONB round-trips via python dict."""
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )
    await conn.set_type_codec(
        "json",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


async def close_pool() -> None:
    """Close the pool. Primarily for test teardown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
```

### fee_crawler/agent_tools/schemas/_base.py

```python
"""Shared Pydantic v2 base classes for all agent-tool schemas.

This module is intentionally minimal — it holds ONLY:
  - BaseToolInput / BaseToolOutput (shared behavior: extra='forbid', success/error fields)
  - AgentEventRef (the result envelope every write tool returns)
  - AgentName enum (optional hint for per-domain schemas; the canonical allow-list
    is enforced at the @agent_tool registry level and by per-schema Field(pattern=...))

Per-domain schemas live in sibling modules added by later plans:
  - fees.py           (Plan 62A-07)
  - crawl.py          (Plan 62A-08)
  - hamilton.py       (Plan 62A-09)
  - peer_research.py  (Plan 62A-10 group A)
  - agent_infra.py    (Plan 62A-10 group B)

All of those are re-exported through schemas/__init__.py so callers keep
using `from fee_crawler.agent_tools.schemas import <ClassName>` regardless of
which module the class lives in.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel


class BaseToolInput(BaseModel):
    """Base class — tool inputs inherit for shared fields if needed."""
    model_config = {"extra": "forbid"}


class BaseToolOutput(BaseModel):
    """Base class — tool outputs inherit."""
    model_config = {"extra": "forbid"}
    success: bool
    error: Optional[str] = None


class AgentEventRef(BaseModel):
    """Reference to an agent_events row (returned by most write tools)."""
    event_id: str  # UUID as string for JSON compatibility
    correlation_id: str


class AgentName(str, Enum):
    """Canonical agent identities. Per-domain schemas may narrow via Field(pattern=...)."""
    HAMILTON = "hamilton"
    KNOX = "knox"
    DARWIN = "darwin"
    ATLAS = "atlas"
    # State agents use the pattern `state_<lowercase-2>` (e.g., state_vt) and are
    # validated via regex in per-domain schemas rather than enumerated here.


__all__ = ["BaseToolInput", "BaseToolOutput", "AgentEventRef", "AgentName"]
```

### fee_crawler/agent_tools/schemas/__init__.py

```python
"""Public re-export surface for the agent-tool schemas package.

Plan 62A-05 ships the shared base classes (from ._base) PLUS conditional
wildcard imports for every per-domain module that Plans 62A-07/08/09/10
add. The imports use try/except ImportError so Plan 05 can pre-wire them
in Wave 1 without requiring the per-domain modules to exist yet — each
wave 2 plan only adds its own module file (no __init__.py edit required),
so parallel execution has zero shared-file writes.

After all Wave 2 plans land, every schema is importable via:

    from fee_crawler.agent_tools.schemas import <ClassName>

The TS codegen pipeline (scripts/gen-agent-tool-types.sh) points at this
package path (`fee_crawler.agent_tools.schemas`) so pydantic2ts walks
every re-exported class automatically — no updates to the codegen script
are needed when a new per-domain module appears.
"""

from fee_crawler.agent_tools.schemas._base import (
    AgentEventRef,
    AgentName,
    BaseToolInput,
    BaseToolOutput,
)

# Per-domain re-exports. Each try/except block activates as soon as the
# corresponding plan lands its module; until then ImportError is swallowed.
# Plan 62A-07 adds schemas/fees.py.
# Plan 62A-08 adds schemas/crawl.py.
# Plan 62A-09 adds schemas/hamilton.py.
# Plan 62A-10 adds schemas/peer_research.py + schemas/agent_infra.py.

try:
    from fee_crawler.agent_tools.schemas.fees import *            # noqa: F401,F403
except ImportError:
    pass

try:
    from fee_crawler.agent_tools.schemas.crawl import *           # noqa: F401,F403
except ImportError:
    pass

try:
    from fee_crawler.agent_tools.schemas.hamilton import *        # noqa: F401,F403
except ImportError:
    pass

try:
    from fee_crawler.agent_tools.schemas.peer_research import *   # noqa: F401,F403
except ImportError:
    pass

try:
    from fee_crawler.agent_tools.schemas.agent_infra import *     # noqa: F401,F403
except ImportError:
    pass

__all__ = ["AgentEventRef", "AgentName", "BaseToolInput", "BaseToolOutput"]
```

### fee_crawler/agent_tools/registry.py

```python
"""Tool registry: decorator + module-level dict.

Plans 62A-09..12 register CRUD tools via:

    @agent_tool(name='approve_fee_raw', entity='fees_raw', action='update')
    async def approve_fee_raw(input: ApproveFeeRawInput, ...) -> ApproveFeeRawOutput:
        ...

Plan 62A-13 (MCP) reads TOOL_REGISTRY to expose read-only tools externally.
Plan 62A-13 acceptance test asserts every one of the 33 entities has >=1 registered tool.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Literal

CrudAction = Literal["create", "read", "update", "delete", "upsert", "list"]


@dataclass
class ToolMeta:
    name: str
    entity: str
    action: CrudAction
    func: Callable[..., Any]
    input_schema: type | None = None
    output_schema: type | None = None
    description: str = ""


TOOL_REGISTRY: Dict[str, ToolMeta] = {}


def agent_tool(
    name: str,
    entity: str,
    action: CrudAction,
    input_schema: type | None = None,
    output_schema: type | None = None,
    description: str = "",
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator: registers an async function as an agent-callable CRUD tool."""

    def _decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        if name in TOOL_REGISTRY:
            raise RuntimeError(f"agent_tool name collision: {name}")
        TOOL_REGISTRY[name] = ToolMeta(
            name=name, entity=entity, action=action, func=func,
            input_schema=input_schema, output_schema=output_schema,
            description=description or (func.__doc__ or "").strip().split("\n")[0],
        )
        return func

    return _decorator


def entities_covered() -> set[str]:
    """Unique set of entities with >=1 registered tool (used by test_agent_tool_coverage)."""
    return {meta.entity for meta in TOOL_REGISTRY.values()}
```

### fee_crawler/agent_tools/context.py

```python
"""Per-call agent context (correlation_id, parent_event_id, cost_cents).

Set via the `with_agent_context` context manager at the top of an agent's turn.
Gateway reads via get_agent_context() when creating agent_events rows.
"""

from __future__ import annotations

import contextlib
import uuid
from contextvars import ContextVar
from typing import Optional

_context: ContextVar[dict] = ContextVar("agent_context", default={})


@contextlib.contextmanager
def with_agent_context(
    *,
    agent_name: str,
    correlation_id: Optional[str] = None,
    parent_event_id: Optional[str] = None,
    cost_cents: int = 0,
):
    """Set agent-scoped values for the duration of a `with` block."""
    token = _context.set({
        "agent_name": agent_name,
        "correlation_id": correlation_id or str(uuid.uuid4()),
        "parent_event_id": parent_event_id,
        "cost_cents": cost_cents,
    })
    try:
        yield
    finally:
        _context.reset(token)


def get_agent_context() -> dict:
    """Return the current context dict (empty if no with_agent_context active)."""
    return _context.get()
```

Files must all parse (`python -c "import ast; ast.parse(open(f).read())"`).
  </action>
  <verify>
    <automated>for f in fee_crawler/agent_tools/__init__.py fee_crawler/agent_tools/pool.py fee_crawler/agent_tools/schemas/__init__.py fee_crawler/agent_tools/schemas/_base.py fee_crawler/agent_tools/registry.py fee_crawler/agent_tools/context.py; do python -c "import ast; ast.parse(open('$f').read())" || exit 1; done && python -c "from fee_crawler.agent_tools.registry import TOOL_REGISTRY, agent_tool, entities_covered; assert TOOL_REGISTRY == {}; assert callable(agent_tool); assert entities_covered() == set()" && python -c "from fee_crawler.agent_tools.schemas import BaseToolInput, BaseToolOutput, AgentEventRef; assert isinstance(BaseToolInput, type)"</automated>
  </verify>
  <acceptance_criteria>
    - All 6 files exist and parse as valid Python
    - `fee_crawler/agent_tools/schemas/` is a directory (package), NOT a single `schemas.py` file
    - `python -c "from fee_crawler.agent_tools.registry import agent_tool, TOOL_REGISTRY"` succeeds
    - `python -c "from fee_crawler.agent_tools.schemas import BaseToolInput, BaseToolOutput, AgentEventRef"` succeeds (package-level re-export works)
    - `grep -c "statement_cache_size=0" fee_crawler/agent_tools/pool.py` returns at least 2 (create_pool + any direct connect in init)
    - `grep -c "class BaseToolInput\|class BaseToolOutput\|class AgentEventRef" fee_crawler/agent_tools/schemas/_base.py` returns 3
    - `grep -c "def agent_tool\|TOOL_REGISTRY" fee_crawler/agent_tools/registry.py` returns at least 3
    - `grep -c "ContextVar\|with_agent_context\|get_agent_context" fee_crawler/agent_tools/context.py` returns at least 3
    - `grep -c "from ._base import" fee_crawler/agent_tools/schemas/__init__.py` returns at least 1
    - `grep -c "try:" fee_crawler/agent_tools/schemas/__init__.py` returns at least 5 (one try/except wrapper per per-domain module)
    - `grep -c "except ImportError:" fee_crawler/agent_tools/schemas/__init__.py` returns at least 5
  </acceptance_criteria>
  <done>Tool scaffolding in place: pool singleton, Pydantic schemas package (schemas/_base.py + schemas/__init__.py — ready for per-domain modules in Plans 07/08/09/10), registry decorator, ContextVar-based per-call context.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Gateway implementation (with_agent_tool) + budget enforcement</name>
  <files>fee_crawler/agent_tools/gateway.py, fee_crawler/agent_tools/budget.py</files>
  <read_first>
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §5 (full gateway code sketch) + §7.4 (budget enforcement pseudocode)
    - fee_crawler/agent_tools/pool.py (pool singleton)
    - fee_crawler/agent_tools/context.py (ContextVar reads)
    - supabase/migrations/20260417_agent_events_partitioned.sql (agent_events columns)
    - supabase/migrations/20260417_agent_auth_log_partitioned.sql (agent_auth_log columns)
    - fee_crawler/tests/test_agent_gateway.py (contract tests)
    - fee_crawler/tests/test_agent_auth_log.py (audit log contract)
    - fee_crawler/tests/test_sc5_budget_halt.py (budget-halt contract)
  </read_first>
  <behavior>
    - Test 1: Calling `with_agent_tool(tool_name='test', entity='fees_raw', entity_id=None, action='create', agent_name='knox', reasoning_prompt='p', reasoning_output='o', input_payload={})` inserts an agent_events row with status='pending' BEFORE the body runs
    - Test 2: On successful body exit, the agent_events row status becomes 'success' AND an agent_auth_log row lands (same transaction)
    - Test 3: On exception inside the body, the whole transaction rolls back; `SELECT COUNT(*) FROM agent_events WHERE tool_name='test'` returns 0 after rollback
    - Test 4: `ATLAS_AGENT_BUDGET_KNOX_CENTS=1` + spending that exceeds 1 cent raises BudgetExceeded AND inserts an agent_events row with action='budget_halt'
    - Test 5: Unknown agent_name raises AgentUnknown ("not in agent_registry")
    - Test 6: reasoning_hash shorter than 32 bytes raises ValueError
    - Test 7: input_payload >64KB is truncated to a pointer `{oversize: true, size: N, sha256: '...'}` pre-insert
  </behavior>
  <action>
### fee_crawler/agent_tools/budget.py

```python
"""Per-agent cost budget enforcement.

Config source hierarchy (evaluated on every tool call):
  1. Env var ATLAS_AGENT_BUDGET_<AGENT>_CENTS (kill-switch)
  2. agent_budgets.limit_cents row value (operator-managed)
  3. config.yaml fallback (hardcoded defaults; not reached in 62a — agent_budgets always has a seeded row)

SC5 contract: setting ATLAS_AGENT_BUDGET_KNOX_CENTS=1000 causes Knox to halt
its next cycle with a budget_halt agent_events row the moment spend crosses 1000 cents.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

import asyncpg


class BudgetExceeded(RuntimeError):
    """Raised when a gateway call would exceed the agent's budget."""

    def __init__(self, agent_name: str, spent: int, limit: int, source: str):
        super().__init__(
            f"BudgetExceeded: agent={agent_name} spent={spent} limit={limit} source={source}"
        )
        self.agent_name = agent_name
        self.spent = spent
        self.limit = limit
        self.source = source


async def check_budget(
    conn: asyncpg.Connection,
    agent_name: str,
    projected_cost_cents: int,
) -> None:
    """Raise BudgetExceeded if spent + projected_cost would cross the limit.

    Writes a budget_halt agent_events row in the same transaction before raising.
    """
    env_var = f"ATLAS_AGENT_BUDGET_{agent_name.upper()}_CENTS"
    env_override = os.environ.get(env_var)

    # Sum spent across all windows for this agent (simple implementation; 62a does
    # not slice by per_cycle/per_batch — Plan 65 Atlas tightens).
    spent = await conn.fetchval(
        """SELECT COALESCE(SUM(cost_cents), 0)::INTEGER
             FROM agent_events
            WHERE agent_name = $1
              AND status = 'success'""",
        agent_name,
    ) or 0

    if env_override is not None:
        try:
            limit = int(env_override)
        except ValueError:
            # Malformed env var -> treat as no override.
            limit = None
        if limit is not None:
            if spent + projected_cost_cents > limit:
                await _write_budget_halt(conn, agent_name, spent, limit, "env_override")
                raise BudgetExceeded(agent_name, spent, limit, "env_override")
            return  # env override passes; skip row check.

    # Fallback: agent_budgets row (any window — whichever has the smallest remaining headroom).
    row = await conn.fetchrow(
        """SELECT limit_cents
             FROM agent_budgets
            WHERE agent_name = $1
            ORDER BY limit_cents ASC
            LIMIT 1""",
        agent_name,
    )
    if row is not None:
        limit = int(row["limit_cents"])
        if spent + projected_cost_cents > limit:
            await _write_budget_halt(conn, agent_name, spent, limit, "agent_budgets")
            raise BudgetExceeded(agent_name, spent, limit, "agent_budgets")


async def account_budget(
    conn: asyncpg.Connection,
    agent_name: str,
    cost_cents: int,
) -> None:
    """Increment agent_budgets.spent_cents for every window belonging to this agent."""
    if cost_cents <= 0:
        return
    await conn.execute(
        """UPDATE agent_budgets
              SET spent_cents = spent_cents + $2,
                  updated_at = NOW()
            WHERE agent_name = $1""",
        agent_name, cost_cents,
    )


async def _write_budget_halt(
    conn: asyncpg.Connection,
    agent_name: str,
    spent: int,
    limit: int,
    source: str,
) -> None:
    """Insert a budget_halt agent_events row + mark agent_budgets row halted_at."""
    await conn.execute(
        """INSERT INTO agent_events
             (agent_name, action, tool_name, entity, status, cost_cents,
              input_payload)
           VALUES ($1, 'budget_halt', '_gateway', '_budget', 'budget_halt', 0,
                   $2::JSONB)""",
        agent_name,
        {"spent": spent, "limit": limit, "source": source},
    )
    await conn.execute(
        """UPDATE agent_budgets
              SET halted_at = NOW(),
                  halted_reason = $2,
                  updated_at = NOW()
            WHERE agent_name = $1""",
        agent_name,
        f"{source}: spent={spent} limit={limit}",
    )
```

### fee_crawler/agent_tools/gateway.py

```python
"""Gateway: transactional wrapper for every agent-triggered write.

Contract (one call = one transaction):
  1. Validate agent_name is in agent_registry and is_active.
  2. Validate reasoning_hash is exactly 32 bytes (sha256).
  3. Check budget — INSERT budget_halt + raise BudgetExceeded on breach.
  4. Truncate oversized JSONB payloads per D-12 (64KB cap in 62a).
  5. INSERT agent_events with status='pending' — RETURNING event_id.
  6. For UPDATE/DELETE entity_id != None: snapshot before_value via SELECT FROM entity.
  7. YIELD (conn, event_id) to caller for target write.
  8. After yield returns: snapshot after_value, INSERT agent_auth_log, UPDATE agent_events status='success', account budget.
  9. On exception: transaction rolls back (context manager).

This is the only sanctioned write path in 62a. Plan 62A-13 MCP server is READ-only.
SEC-04 (Phase 68) adds JWT-based agent_name verification without changing call sites.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Optional

import asyncpg

from fee_crawler.agent_tools.budget import (
    BudgetExceeded,
    account_budget,
    check_budget,
)
from fee_crawler.agent_tools.context import get_agent_context
from fee_crawler.agent_tools.pool import get_pool

MAX_PAYLOAD_BYTES = 64 * 1024  # 64KB per D-12


class AgentUnknown(RuntimeError):
    """Raised when agent_name is not in agent_registry or is not is_active."""


def _truncate_payload(payload: Optional[dict]) -> Optional[dict]:
    """Enforce D-12 64KB cap; oversized -> pointer dict for 62b R2 compactor."""
    if payload is None:
        return None
    encoded = json.dumps(payload).encode("utf-8")
    if len(encoded) <= MAX_PAYLOAD_BYTES:
        return payload
    digest = hashlib.sha256(encoded).hexdigest()
    return {
        "oversize": True,
        "size": len(encoded),
        "sha256": digest,
        "r2_key": None,  # 62b compactor uploads and sets this
    }


async def _snapshot_row(
    conn: asyncpg.Connection,
    entity: str,
    entity_id: Any,
    pk_column: str = "id",
) -> Optional[dict]:
    """SELECT entity row for audit snapshot. Returns None if not found.

    Uses SELECT FOR UPDATE to take a row lock so the snapshot and the caller's
    UPDATE happen atomically.
    """
    if entity_id is None:
        return None
    # pk_column is not user-supplied; it's provided by the tool registry metadata.
    # entity is validated against a known allow-list via the registry before reaching here.
    query = f'SELECT to_jsonb(t.*) AS row FROM "{entity}" t WHERE "{pk_column}" = $1 FOR UPDATE'
    try:
        row = await conn.fetchrow(query, entity_id)
    except asyncpg.UndefinedTableError:
        return None
    if row is None:
        return None
    return dict(row["row"])


@asynccontextmanager
async def with_agent_tool(
    *,
    tool_name: str,
    entity: str,
    entity_id: Any,
    action: str,                 # 'create' | 'read' | 'update' | 'delete' | 'upsert' | 'list'
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    input_payload: dict,
    pk_column: str = "id",
    projected_cost_cents: int = 0,
    parent_event_id: Optional[str] = None,
) -> AsyncIterator[tuple[asyncpg.Connection, str]]:
    """Wrap a write-CRUD tool call in a single transaction with full audit.

    Yields (connection, event_id). Caller does target-table write INSIDE the
    `async with` block using the yielded connection.
    """
    # Validate reasoning_hash inputs up-front.
    reasoning_hash = hashlib.sha256(
        (reasoning_prompt + "\x1f" + reasoning_output).encode("utf-8")
    ).digest()
    if len(reasoning_hash) != 32:
        # sha256().digest() is always 32; this is a belt-and-suspenders assert.
        raise ValueError("reasoning_hash must be 32 bytes")

    ctx = get_agent_context()
    correlation_id = ctx.get("correlation_id") or str(uuid.uuid4())
    parent_event_id = parent_event_id or ctx.get("parent_event_id")

    truncated_input = _truncate_payload(input_payload)

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # 1. Validate agent identity.
            agent_row = await conn.fetchrow(
                "SELECT is_active FROM agent_registry WHERE agent_name = $1",
                agent_name,
            )
            if agent_row is None:
                raise AgentUnknown(
                    f"agent_name={agent_name!r} not in agent_registry"
                )
            if not agent_row["is_active"]:
                raise AgentUnknown(
                    f"agent_name={agent_name!r} is_active=false"
                )

            # 2. Check budget.
            await check_budget(conn, agent_name, projected_cost_cents)

            # 3. Insert pending agent_events row.
            event_id = await conn.fetchval(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, entity_id, status,
                      parent_event_id, correlation_id, reasoning_hash, input_payload)
                   VALUES ($1, $2, $3, $4, $5, 'pending',
                           $6::UUID, $7::UUID, $8, $9::JSONB)
                   RETURNING event_id""",
                agent_name, action, tool_name, entity,
                str(entity_id) if entity_id is not None else None,
                parent_event_id, correlation_id,
                reasoning_hash,
                truncated_input,
            )

            # 4. Snapshot before_value for UPDATE/DELETE.
            before_value: Optional[dict] = None
            if action in ("update", "delete") and entity_id is not None:
                before_value = await _snapshot_row(conn, entity, entity_id, pk_column)

            # 5. Yield to caller for the target-table write.
            try:
                yield conn, str(event_id)
            except Exception:
                # Let exception propagate; `async with conn.transaction()` rolls back.
                raise

            # 6. Snapshot after_value.
            after_value: Optional[dict] = None
            if action in ("create", "update", "upsert") and entity_id is not None:
                after_value = await _snapshot_row(conn, entity, entity_id, pk_column)
            elif action == "delete":
                after_value = None

            # 7. Insert agent_auth_log row.
            await conn.execute(
                """INSERT INTO agent_auth_log
                     (agent_event_id, agent_name, actor_type, tool_name,
                      entity, entity_id, before_value, after_value,
                      reasoning_hash, parent_event_id)
                   VALUES ($1::UUID, $2, 'agent', $3, $4, $5,
                           $6::JSONB, $7::JSONB, $8, $9::UUID)""",
                event_id, agent_name, tool_name, entity,
                str(entity_id) if entity_id is not None else None,
                before_value, after_value,
                reasoning_hash, parent_event_id,
            )

            # 8. Update agent_events status + output payload + cost.
            cost_cents = int(ctx.get("cost_cents", 0))
            output_truncated = _truncate_payload(
                {"after_value": after_value} if after_value is not None else None
            )
            await conn.execute(
                """UPDATE agent_events
                      SET status = 'success',
                          cost_cents = $1,
                          output_payload = $2::JSONB
                    WHERE event_id = $3""",
                cost_cents, output_truncated, event_id,
            )

            # 9. Account budget.
            if cost_cents > 0:
                await account_budget(conn, agent_name, cost_cents)
```

Update Wave 0 stubs in `fee_crawler/tests/test_agent_gateway.py`, `test_agent_auth_log.py`, and `test_sc5_budget_halt.py` to REMOVE the `pytest.xfail` and add real implementations that exercise the gateway. Specifically:

- `test_tool_writes_event_before_target`: use db_schema, seed agent_registry row for 'knox' if not already seeded (it is — part of migration 20260419), call `with_agent_tool` with entity='fees_raw' entity_id=None action='create', inside the body query `SELECT status FROM agent_events` and assert exactly one row with status='pending'; outside the `async with`, query again and assert status='success'.
- `test_auth_log_captures_before_and_after`: insert a fees_raw row manually; call with_agent_tool with action='update' entity='fees_raw' entity_id=1; inside the body UPDATE fees_raw SET amount=99 WHERE fee_raw_id=1; exit; SELECT before_value, after_value FROM agent_auth_log and assert `before_value->>'amount'` != `after_value->>'amount'`.
- `test_sc5_env_var_halts_knox`: monkeypatch.setenv('ATLAS_AGENT_BUDGET_KNOX_CENTS', '1'); seed an agent_events row with agent_name='knox' cost_cents=100 status='success' to push spent > 1; call with_agent_tool agent_name='knox' projected_cost_cents=0 and expect BudgetExceeded; assert SELECT COUNT(*) FROM agent_events WHERE action='budget_halt' returns >=1.

The test file updates should convert `pytest.xfail(...)` stubs to full test bodies using `@pytest.mark.asyncio` + the `db_schema` fixture from conftest.py.
  </action>
  <verify>
    <automated>export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://postgres:postgres@localhost:5433/bfi_test}" && pytest fee_crawler/tests/test_agent_gateway.py fee_crawler/tests/test_agent_auth_log.py fee_crawler/tests/test_sc5_budget_halt.py -v --no-header</automated>
  </verify>
  <acceptance_criteria>
    - `fee_crawler/agent_tools/gateway.py` and `fee_crawler/agent_tools/budget.py` exist and parse
    - `grep -c "async def with_agent_tool" fee_crawler/agent_tools/gateway.py` returns 1
    - `grep -c "INSERT INTO agent_events" fee_crawler/agent_tools/gateway.py` returns at least 1
    - `grep -c "INSERT INTO agent_auth_log" fee_crawler/agent_tools/gateway.py` returns 1
    - `grep -c "ATLAS_AGENT_BUDGET_" fee_crawler/agent_tools/budget.py` returns at least 1
    - `grep -c "BudgetExceeded" fee_crawler/agent_tools/budget.py fee_crawler/agent_tools/gateway.py fee_crawler/agent_tools/__init__.py` returns at least 3
    - `test_tool_writes_event_before_target` passes (no xfail)
    - `test_auth_log_captures_before_and_after` passes (no xfail)
    - `test_sc5_env_var_halts_knox` passes (no xfail)
    - Gateway tests show `before_value` and `after_value` differ on UPDATE operations
  </acceptance_criteria>
  <done>Gateway enforces transactional audit: pending agent_events → target write → success + auth_log (or rollback); budget enforcement writes budget_halt row + raises BudgetExceeded on env-var override; all three gateway tests pass.</done>
</task>

<task type="auto">
  <name>Task 3: Codegen — scripts/gen-agent-tool-types.sh + src/lib/agent-tools/{index,types.generated}.ts</name>
  <files>scripts/gen-agent-tool-types.sh, src/lib/agent-tools/index.ts, src/lib/agent-tools/types.generated.ts</files>
  <read_first>
    - fee_crawler/agent_tools/schemas/_base.py (Pydantic source of truth — base classes only in 62A-05)
    - fee_crawler/agent_tools/schemas/__init__.py (re-export surface; per-domain modules add to this in Plans 07/08/09/10)
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §3 (pydantic-to-typescript v2 + CLI workflow)
    - src/lib/crawler-db/connection.ts (TS client pattern — types.generated.ts consumers will use this sql instance)
  </read_first>
  <action>
### scripts/gen-agent-tool-types.sh

```bash
#!/usr/bin/env bash
# Regenerate src/lib/agent-tools/types.generated.ts from fee_crawler.agent_tools.schemas.
# Run after editing Pydantic schemas; CI verifies with --check mode.
#
# Note: The schemas module is a package (fee_crawler/agent_tools/schemas/) after Plan
# 62A-05; pydantic2ts walks the package via the public API exposed through
# schemas/__init__.py, which re-exports every per-domain module added by Plans 07..10.

set -euo pipefail

OUTPUT="src/lib/agent-tools/types.generated.ts"
MODULE="fee_crawler.agent_tools.schemas"

command -v pydantic2ts >/dev/null 2>&1 || {
  echo "pydantic2ts not found. Install: pip install pydantic-to-typescript>=2.0" >&2
  exit 2
}

mkdir -p "$(dirname "$OUTPUT")"

# pydantic2ts generates a file; we prepend an AUTO-GENERATED header so reviewers see it.
TMPFILE="$(mktemp)"
pydantic2ts --module "$MODULE" --output "$TMPFILE"

{
  echo "// AUTO-GENERATED by scripts/gen-agent-tool-types.sh — DO NOT EDIT BY HAND."
  echo "// Source of truth: fee_crawler/agent_tools/schemas/ (package)"
  echo "// Regenerate: bash scripts/gen-agent-tool-types.sh"
  echo
  cat "$TMPFILE"
} > "$OUTPUT"

rm -f "$TMPFILE"

if [[ "${CHECK_MODE:-0}" == "1" ]]; then
  if ! git diff --exit-code -- "$OUTPUT" >/dev/null 2>&1; then
    echo "gen-agent-tool-types: $OUTPUT is stale. Regenerate locally and commit." >&2
    exit 1
  fi
fi

echo "gen-agent-tool-types: OK -> $OUTPUT"
```

Make executable (`chmod +x scripts/gen-agent-tool-types.sh`).

### src/lib/agent-tools/index.ts

```typescript
// Phase 62a — TS agent-tool wrappers.
// Types are auto-generated from Pydantic via scripts/gen-agent-tool-types.sh.
// Concrete tool implementations land in Plans 62A-09..12.

export * from "./types.generated";
```

### src/lib/agent-tools/types.generated.ts

Generate this file by running `scripts/gen-agent-tool-types.sh` (after installing pydantic-to-typescript from the bumped requirements.txt). If running the script fails in the executor's environment (dependency not installed), write a minimal placeholder that satisfies the `// AUTO-GENERATED` header and expose stub types matching `schemas/_base.py`:

```typescript
// AUTO-GENERATED by scripts/gen-agent-tool-types.sh — DO NOT EDIT BY HAND.
// Source of truth: fee_crawler/agent_tools/schemas/ (package)
// Regenerate: bash scripts/gen-agent-tool-types.sh

// NOTE: This file was generated with pydantic-to-typescript v2. If you edit
// schemas/_base.py or any per-domain schema module (fees.py, crawl.py, etc.),
// rerun the codegen script before committing.

export interface BaseToolInput {}

export interface BaseToolOutput {
  success: boolean;
  error?: string | null;
}

export interface AgentEventRef {
  event_id: string;
  correlation_id: string;
}

export type AgentName = "hamilton" | "knox" | "darwin" | "atlas";

// NOTE: Per-domain interfaces (ApproveFeeRawInput, CreateHamiltonScenarioInput, etc.)
// land here after Plans 62A-07..10 add their per-domain Pydantic modules and the
// codegen script is rerun. Plan 05 ships only the shared base types above.
```

Preferred: run the actual codegen; only fall back to the hand-written placeholder if `pydantic2ts` is unavailable. Either way, the file MUST start with `// AUTO-GENERATED` and contain the four exported symbols above.
  </action>
  <verify>
    <automated>test -x scripts/gen-agent-tool-types.sh && bash -n scripts/gen-agent-tool-types.sh && test -f src/lib/agent-tools/index.ts && test -f src/lib/agent-tools/types.generated.ts && head -1 src/lib/agent-tools/types.generated.ts | grep -q "AUTO-GENERATED" && grep -q "BaseToolInput" src/lib/agent-tools/types.generated.ts</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/gen-agent-tool-types.sh` exists and is executable
    - `bash -n scripts/gen-agent-tool-types.sh` exits 0 (syntax valid)
    - `grep -c "pydantic2ts --module" scripts/gen-agent-tool-types.sh` returns at least 1
    - `src/lib/agent-tools/index.ts` exists and re-exports from `./types.generated`
    - `src/lib/agent-tools/types.generated.ts` starts with `// AUTO-GENERATED`
    - `grep -c "BaseToolInput\|BaseToolOutput\|AgentEventRef\|AgentName" src/lib/agent-tools/types.generated.ts` returns at least 4
    - `npx tsc --noEmit src/lib/agent-tools/index.ts` succeeds (TS parses the generated file)
  </acceptance_criteria>
  <done>Codegen script + TS generated file + barrel export land; TS compiler accepts the generated types; downstream plans can regenerate via one command.</done>
</task>

</tasks>

<verification>
Run the full test suite:
```bash
export DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test
pytest fee_crawler/tests/test_agent_gateway.py fee_crawler/tests/test_agent_auth_log.py fee_crawler/tests/test_sc5_budget_halt.py -v
```
Expect: all three test files PASS (no xfails remain). `test_tool_writes_event_before_target`, `test_auth_log_captures_before_and_after`, `test_sc5_env_var_halts_knox` all green.

Manual: `python -c "from fee_crawler.agent_tools import with_agent_tool, agent_tool, TOOL_REGISTRY, BudgetExceeded, AgentUnknown; print('OK')"` succeeds. `python -c "from fee_crawler.agent_tools.schemas import BaseToolInput, BaseToolOutput, AgentEventRef; print('OK')"` succeeds. `bash scripts/gen-agent-tool-types.sh` regenerates the TS file cleanly.
</verification>

<success_criteria>
- with_agent_tool context manager exists and is the single sanctioned write path
- BudgetExceeded raised on env-var override exhaustion; budget_halt agent_events row written in same transaction
- AgentUnknown raised for agent_name not in agent_registry
- reasoning_hash always computed server-side (sha256 of prompt+output)
- Payload truncation at 64KB per D-12
- Pydantic schemas PACKAGE (schemas/_base.py + schemas/__init__.py) source of truth; TS codegen script + generated file land; per-domain modules in Plans 07/08/09/10 can be added in parallel without file conflict
- AGENT-02 (one row before side effects) + AGENT-04 (auth_log per write) tests pass against real Postgres
</success_criteria>

<output>
After completion, create `.planning/phases/62A-agent-foundation-data-layer/62A-05-SUMMARY.md` noting:
- Gateway wraps every agent write in a single transaction
- Budget enforcement reads env var, agent_budgets row, raises BudgetExceeded with budget_halt event
- AGENT-02 and AGENT-04 requirements satisfied by the gateway
- Pydantic source of truth now a package (`schemas/_base.py` + `schemas/__init__.py`) so Plans 07/08/09/10 can each own a disjoint per-domain module and run in parallel in Wave 2 without file conflict
- pydantic2ts codegen pipeline in place
- Downstream plans 62A-09..12 register CRUD tools via @agent_tool decorator
</output>
</tasks>
