---
phase: 62B
plan: 03
type: execute
wave: 2
depends_on: [62B-01, 62B-02]
files_modified:
  - fee_crawler/agent_base/__init__.py
  - fee_crawler/agent_base/base.py
  - fee_crawler/agent_base/loop.py
  - fee_crawler/tests/test_agent_base_auto_wrap.py
autonomous: true
requirements: [LOOP-01, LOOP-02, LOOP-04, LOOP-05, LOOP-06]
must_haves:
  truths:
    - "Subclassing AgentBase sets agent_name on every call's context without the developer touching contextvars"
    - "Calling any framework tool from inside a subclass method routes through gateway.py (LOOP-02 — already satisfied by 62a, here just verified end-to-end)"
    - "dissect() writes agent_events row with action='dissect' containing delta JSON payload"
    - "understand() writes a row to agent_lessons with agent_name + lesson_name + description (superseding any previous same-named lesson)"
    - "improve() captures before/after in agent_events input_payload"
    - "The auto-wrap method allowlist is exactly ('run_turn','review','dissect','understand','improve')"
    - "Subclass without agent_name raises TypeError at class-creation time"
  artifacts:
    - path: fee_crawler/agent_base/base.py
      provides: "AgentBase class with __init_subclass__ auto-wrap + 5 method hooks"
      min_lines: 120
    - path: fee_crawler/agent_base/loop.py
      provides: "Default dissect/understand/improve helpers that agents can call instead of overriding entirely"
    - path: fee_crawler/tests/test_agent_base_auto_wrap.py
      provides: "LOOP-01, LOOP-04, LOOP-05, LOOP-06 contract tests"
  key_links:
    - from: "AgentBase.__init_subclass__"
      to: "fee_crawler/agent_tools/context.py with_agent_context"
      via: "cls._wrap_with_context per method in AUTO_WRAP_METHODS"
      pattern: "with with_agent_context"
    - from: "AgentBase.understand()"
      to: "agent_lessons INSERT with ON CONFLICT (agent_name, lesson_name) DO UPDATE SET superseded_by"
      via: "get_pool() + INSERT"
      pattern: "INSERT INTO agent_lessons"
---

<objective>
Ship the Python AgentBase framework under `fee_crawler/agent_base/` so downstream agent work (Knox, Darwin, Atlas, state agents in phases 63-65) can subclass it and receive LOG/REVIEW/DISSECT/UNDERSTAND/IMPROVE hooks "for free" (per D-01..D-04).

LOG (LOOP-02) is already auto-wired by 62a's tool gateway — AgentBase's job is to enter `with_agent_context` automatically on every public method call. REVIEW runtime (LOOP-03) is plan 62B-08 (pg_cron dispatcher). LOOP-07 adversarial gate on improve() is plan 62B-07. This plan ships: (1) the subclass contract, (2) the auto-wrap mechanism, (3) baseline dissect/understand/improve_before_gate implementations that write the right rows.

Purpose: No agent in Phases 63-65 can ship until this exists.

Output: New package `fee_crawler/agent_base/` with 2 modules; 1 pytest file; all 5 LOOP-01/04/05/06 behaviors verified.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md
@.planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md
@fee_crawler/agent_tools/context.py
@fee_crawler/agent_tools/gateway.py
@fee_crawler/agent_tools/pool.py
@supabase/migrations/20260503_agent_lessons.sql

<interfaces>
Existing `fee_crawler/agent_tools/context.py`:
```python
@contextlib.contextmanager
def with_agent_context(*, agent_name: str, correlation_id: Optional[str] = None,
                       parent_event_id: Optional[str] = None, cost_cents: int = 0):
    """Set agent-scoped values; yields; resets on exit."""
def get_agent_context() -> dict: ...
```

Existing `fee_crawler/agent_tools/gateway.py`:
- `with_agent_tool(tool_name, entity, entity_id, action, agent_name, reasoning_prompt, reasoning_output, input_payload=..., pool=...)` async context manager — yields `(conn, event_id)`; writes agent_events + agent_auth_log in one transaction

New `agent_lessons` table (from 62B-01 migration 20260503):
- `lesson_id BIGSERIAL PK, created_at, agent_name TEXT FK, lesson_name TEXT, description TEXT, evidence_refs JSONB, confidence NUMERIC(5,4), superseded_by BIGINT, source_event_id UUID, UNIQUE (agent_name, lesson_name)`

Research §Mechanics 1 (AgentBase auto-wrap pattern) — lines 827-860:
- Use `__init_subclass__` (PEP 487), NOT metaclass
- Allowlist: `AUTO_WRAP_METHODS = ("run_turn", "review", "dissect", "understand", "improve")`
- Subclass without `agent_name` raises TypeError at class-creation
- Nested call inherits correlation_id from outer `with_agent_context`

Research §Code Examples (lines 456-527): full `AgentBase` class body including `_queue_improve_rejected` for LOOP-07 (that method is called by the adversarial gate — plan 62B-07 finalizes the gate; this plan leaves a stub that always commits so LOOP-06 tests work).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create fee_crawler/agent_base/ package with AgentBase class + loop helpers</name>
  <files>fee_crawler/agent_base/__init__.py, fee_crawler/agent_base/base.py, fee_crawler/agent_base/loop.py</files>
  <read_first>
    - fee_crawler/agent_tools/context.py (full file — AgentBase wraps with_agent_context)
    - fee_crawler/agent_tools/gateway.py (full file — understand what pending-INSERT + success-UPDATE contract exists for LOG)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Mechanics 1 (lines 827-860) + §Code Examples lines 456-527 (the full AgentBase body)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md D-01..D-06 (subclass contract), D-07..D-08 (LOOP-07 gate)
    - supabase/migrations/20260503_agent_lessons.sql (exact columns for understand())
    - fee_crawler/agent_tools/pool.py (get_pool signature)
  </read_first>
  <action>
**File 1: `fee_crawler/agent_base/__init__.py`**
```python
"""Phase 62b agent runtime — 5-step loop framework (LOOP-01..06).

AgentBase is the Python subclass contract. Knox / Darwin / Atlas / 51 state agents
(Phases 63-65) subclass it and receive automatic context propagation, LOG via the
62a gateway, and baseline DISSECT / UNDERSTAND / IMPROVE plumbing.
"""

from fee_crawler.agent_base.base import AgentBase, AUTO_WRAP_METHODS

__all__ = ["AgentBase", "AUTO_WRAP_METHODS"]
```

**File 2: `fee_crawler/agent_base/base.py`**

Follow research §Code Examples + §Mechanics 1 verbatim. Key contract:

```python
"""AgentBase — 5-step loop framework (LOOP-01..06).

Subclasses MUST set class attribute `agent_name` (matches agent_registry.agent_name).
__init_subclass__ auto-wraps public methods in the AUTO_WRAP_METHODS allowlist so
every invocation enters with_agent_context() — developers never touch contextvars.
"""
from __future__ import annotations

import functools
import json
import uuid
from typing import Any, Optional

from fee_crawler.agent_tools.context import with_agent_context, get_agent_context
from fee_crawler.agent_tools.pool import get_pool

AUTO_WRAP_METHODS = ("run_turn", "review", "dissect", "understand", "improve")


class AgentBase:
    """Base class for Knox / Darwin / Atlas / 51 state agents.

    Class attributes (MUST set in subclass):
      agent_name: str             # matches agent_registry.agent_name
      review_schedule: str        # cron string; default '0 * * * *' (D-05 pg_cron)
      canary_corpus_path: Optional[str]  # required for LOOP-07 IMPROVE gate

    Override hooks (async):
      run_turn(*args, **kw)
      review()
      dissect(events: list[dict]) -> list[dict]  # returns patterns
      understand(patterns: list[dict]) -> dict   # returns lesson dict {name, description, evidence}
      improve(lesson: dict) -> None              # adversarial-gated; this phase stub-commits
    """

    agent_name: str = ""
    review_schedule: str = "0 * * * *"
    canary_corpus_path: Optional[str] = None

    def __init_subclass__(cls, **kw: Any) -> None:
        super().__init_subclass__(**kw)
        if not cls.agent_name:
            raise TypeError(
                f"{cls.__name__} must set class attribute `agent_name` "
                f"(matches agent_registry.agent_name)."
            )
        for method in AUTO_WRAP_METHODS:
            if method in cls.__dict__:
                original = cls.__dict__[method]
                setattr(cls, method, cls._wrap_with_context(original))

    @staticmethod
    def _wrap_with_context(fn):
        @functools.wraps(fn)
        async def wrapped(self, *args, **kwargs):
            ctx = get_agent_context()
            inherited_correlation = ctx.get("correlation_id") if ctx else None
            inherited_parent = ctx.get("parent_event_id") if ctx else None
            with with_agent_context(
                agent_name=self.agent_name,
                correlation_id=inherited_correlation,
                parent_event_id=inherited_parent,
            ):
                return await fn(self, *args, **kwargs)
        return wrapped

    # --- 5-step override points. Subclasses override these. ---

    async def run_turn(self, *args, **kwargs):
        """LOOP main: agent-specific work. LOG happens automatically via gateway."""
        raise NotImplementedError("Subclass must override run_turn()")

    async def review(self):
        """LOOP-03 periodic self-review. Scheduled by pg_cron dispatcher (62B-08)."""
        raise NotImplementedError("Subclass must override review()")

    async def dissect(self, events: list[dict]) -> list[dict]:
        """LOOP-04 default: writes an agent_events row action='dissect' with event summary."""
        from fee_crawler.agent_base.loop import default_dissect
        return await default_dissect(self.agent_name, events)

    async def understand(self, patterns: list[dict]) -> dict:
        """LOOP-05 default: writes to agent_lessons."""
        from fee_crawler.agent_base.loop import default_understand
        return await default_understand(self.agent_name, patterns)

    async def improve(self, lesson: dict) -> None:
        """LOOP-06 commit-through stub. Phase 62B-07 wraps this in adversarial gate."""
        from fee_crawler.agent_base.loop import default_improve_commit
        await default_improve_commit(self.agent_name, lesson)
```

**File 3: `fee_crawler/agent_base/loop.py`**

```python
"""Default implementations of LOOP-04/05/06 steps.

Subclasses can override dissect/understand/improve entirely OR call these defaults
to get baseline behavior (write-through to agent_events + agent_lessons).
"""
from __future__ import annotations

import json
import uuid
from typing import Optional

from fee_crawler.agent_tools.context import get_agent_context
from fee_crawler.agent_tools.pool import get_pool


async def default_dissect(agent_name: str, events: list[dict]) -> list[dict]:
    """LOOP-04: write agent_events row action='dissect' with expected-vs-actual delta.

    Returns the input events unchanged; subclasses compute real patterns.
    """
    pool = await get_pool()
    ctx = get_agent_context()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status,
                  correlation_id, parent_event_id, input_payload)
               VALUES ($1, 'dissect', '_agent_base', '_dissect', 'success',
                       $2::UUID, $3::UUID, $4::JSONB)""",
            agent_name,
            ctx.get("correlation_id"),
            ctx.get("parent_event_id"),
            json.dumps({"events_count": len(events), "events": events[:10]}),  # first 10 for size
        )
    return events


async def default_understand(agent_name: str, patterns: list[dict]) -> dict:
    """LOOP-05: write to agent_lessons with ON CONFLICT supersede logic.

    Returns the lesson dict {name, description, evidence}.
    """
    if not patterns:
        return {}
    # Compose a deterministic lesson from patterns.
    lesson_name = patterns[0].get("name", f"auto_{uuid.uuid4().hex[:8]}")
    description = patterns[0].get("description", "auto-generated lesson from dissect patterns")
    evidence = [p.get("evidence_ref") for p in patterns if p.get("evidence_ref")]

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Upsert: insert new; if (agent_name, lesson_name) exists, supersede it.
        # Step 1: mark any active lesson with same name as superseded.
        await conn.execute(
            """UPDATE agent_lessons SET superseded_by = -1
                 WHERE agent_name = $1 AND lesson_name = $2 AND superseded_by IS NULL""",
            agent_name, lesson_name,
        )
        # Step 2: insert new. We fill superseded_by=-1 into the placeholder via
        # a second UPDATE after insert (so the FK resolves).
        new_id = await conn.fetchval(
            """INSERT INTO agent_lessons
                 (agent_name, lesson_name, description, evidence_refs)
               VALUES ($1, $2, $3, $4::JSONB)
               ON CONFLICT (agent_name, lesson_name) DO UPDATE
                 SET description = EXCLUDED.description,
                     evidence_refs = EXCLUDED.evidence_refs,
                     created_at = NOW()
               RETURNING lesson_id""",
            agent_name, lesson_name, description, json.dumps(evidence),
        )
        # Step 3: point the superseded placeholder at the new row (if any).
        await conn.execute(
            """UPDATE agent_lessons SET superseded_by = $1
                 WHERE agent_name = $2 AND lesson_name = $3
                   AND superseded_by = -1 AND lesson_id <> $1""",
            new_id, agent_name, lesson_name,
        )
    return {"name": lesson_name, "description": description, "evidence": evidence, "lesson_id": new_id}


async def default_improve_commit(agent_name: str, lesson: dict) -> None:
    """LOOP-06: commit improve with before/after snapshot in input_payload.

    Plan 62B-07 wraps this call in the adversarial gate (canary + optional peer).
    This default path is used in tests + for agents without a canary corpus yet.
    """
    pool = await get_pool()
    ctx = get_agent_context()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status,
                  correlation_id, parent_event_id, input_payload)
               VALUES ($1, 'improve', '_agent_base', '_improve', 'success',
                       $2::UUID, $3::UUID, $4::JSONB)""",
            agent_name,
            ctx.get("correlation_id"),
            ctx.get("parent_event_id"),
            json.dumps({
                "before": lesson.get("before"),
                "after": lesson.get("after", lesson),
                "lesson_name": lesson.get("name"),
            }),
        )
```

NOTE: The superseded_by logic above uses a two-step update-and-relink because agent_lessons has a self-FK. If the column name in migration 20260503 differs (e.g., `superseded_at` vs `superseded_by`), align to whatever was shipped in 62B-01.
  </action>
  <verify>
    <automated>python -c "from fee_crawler.agent_base import AgentBase, AUTO_WRAP_METHODS; assert AUTO_WRAP_METHODS == ('run_turn','review','dissect','understand','improve'); print('import OK')"</automated>
  </verify>
  <acceptance_criteria>
    - File `fee_crawler/agent_base/__init__.py` exists and exports `AgentBase` + `AUTO_WRAP_METHODS`
    - File `fee_crawler/agent_base/base.py` exists, contains `class AgentBase` and `def __init_subclass__` and `AUTO_WRAP_METHODS = ("run_turn", "review", "dissect", "understand", "improve")`
    - File `fee_crawler/agent_base/loop.py` exists and exports `default_dissect`, `default_understand`, `default_improve_commit`
    - `python -c "from fee_crawler.agent_base import AgentBase"` exits 0 (import clean)
    - `grep -n "raise TypeError" fee_crawler/agent_base/base.py` returns at least 1 match (agent_name enforcement)
    - `grep -n "with with_agent_context" fee_crawler/agent_base/base.py` returns at least 1 match
    - `grep -n "INSERT INTO agent_lessons" fee_crawler/agent_base/loop.py` returns at least 1 match
    - `grep -n "action, 'dissect'" fee_crawler/agent_base/loop.py` OR `grep -n "'dissect'" fee_crawler/agent_base/loop.py` returns at least 1 match
  </acceptance_criteria>
  <done>Package imports cleanly; class + 3 default loop helpers implemented.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Contract tests — LOOP-01, LOOP-04, LOOP-05, LOOP-06 (and LOOP-02 spot-check)</name>
  <files>fee_crawler/tests/test_agent_base_auto_wrap.py</files>
  <read_first>
    - fee_crawler/agent_base/base.py (just written)
    - fee_crawler/agent_base/loop.py (just written)
    - fee_crawler/tests/conftest.py (for db_schema fixture)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Mechanics 1 test example (lines 844-859)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-VALIDATION.md lines 41-46 (expected test function names)
  </read_first>
  <behavior>
    - test_subclass_gets_hooks: subclassing AgentBase works; all 5 methods accessible
    - test_subclass_without_agent_name_raises: class-creation without agent_name raises TypeError
    - test_subclass_methods_are_context_wrapped: calling run_turn inside a subclass automatically enters with_agent_context(agent_name=...) and sets a correlation_id
    - test_nested_call_inherits_correlation_id: outer with_agent_context's correlation_id is preserved when an AgentBase method is invoked within
    - test_dissect_writes_event: calling default_dissect writes exactly 1 agent_events row with action='dissect'
    - test_understand_writes_lesson: calling default_understand writes agent_lessons row with expected (agent_name, lesson_name)
    - test_understand_supersedes_prior_lesson: calling default_understand twice with same lesson_name updates existing row; superseded_by stays NULL on active row
    - test_improve_before_after: calling default_improve_commit writes agent_events action='improve' with input_payload containing before/after keys
    - test_review_latency_placeholder: create an agent_events row with action='review_tick' and assert a query "find unreviewed events in last 15 min" returns it (seeds LOOP-03 test helper that Plan 62B-08 will exercise against pg_cron)
  </behavior>
  <action>
Create `fee_crawler/tests/test_agent_base_auto_wrap.py`. Use the existing `db_schema` fixture from `fee_crawler/tests/conftest.py` (it applies all migrations including 20260501..20260510 from 62B-01 against a fresh per-test schema).

```python
"""Phase 62b LOOP-01, 04, 05, 06 contract tests + LOOP-03 latency helper."""
import pytest
import uuid
import json
from datetime import datetime, timedelta

from fee_crawler.agent_base import AgentBase
from fee_crawler.agent_base.loop import default_dissect, default_understand, default_improve_commit
from fee_crawler.agent_tools.context import with_agent_context, get_agent_context


class _FakeKnox(AgentBase):
    agent_name = "knox"
    seen_ctx: dict = {}
    async def run_turn(self):
        _FakeKnox.seen_ctx = dict(get_agent_context())
    async def review(self): pass
    async def dissect(self, events): return await default_dissect(self.agent_name, events)
    async def understand(self, patterns): return await default_understand(self.agent_name, patterns)
    async def improve(self, lesson): await default_improve_commit(self.agent_name, lesson)


@pytest.mark.asyncio
async def test_subclass_gets_hooks():
    k = _FakeKnox()
    for m in ("run_turn", "review", "dissect", "understand", "improve"):
        assert callable(getattr(k, m)), f"{m} not callable on subclass"


def test_subclass_without_agent_name_raises():
    with pytest.raises(TypeError, match="agent_name"):
        class BadAgent(AgentBase):
            # intentionally no agent_name
            async def run_turn(self): pass


@pytest.mark.asyncio
async def test_subclass_methods_are_context_wrapped():
    _FakeKnox.seen_ctx = {}
    k = _FakeKnox()
    await k.run_turn()
    assert _FakeKnox.seen_ctx.get("agent_name") == "knox"
    assert _FakeKnox.seen_ctx.get("correlation_id") is not None


@pytest.mark.asyncio
async def test_nested_call_inherits_correlation_id():
    outer_corr = str(uuid.uuid4())
    _FakeKnox.seen_ctx = {}
    with with_agent_context(agent_name="atlas", correlation_id=outer_corr):
        k = _FakeKnox()
        await k.run_turn()
    assert _FakeKnox.seen_ctx["correlation_id"] == outer_corr


@pytest.mark.asyncio
async def test_dissect_writes_event(db_schema):
    schema, pool = db_schema
    agent_name = "knox"
    with with_agent_context(agent_name=agent_name):
        await default_dissect(agent_name, [{"e": 1}, {"e": 2}])
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT action, input_payload::TEXT AS payload FROM agent_events "
            "WHERE agent_name = $1 AND action = 'dissect' ORDER BY created_at DESC LIMIT 1",
            agent_name,
        )
    assert row is not None
    assert row["action"] == "dissect"
    assert "events_count" in row["payload"]


@pytest.mark.asyncio
async def test_understand_writes_lesson(db_schema):
    schema, pool = db_schema
    agent_name = "knox"
    lesson_name = f"test_lesson_{uuid.uuid4().hex[:8]}"
    with with_agent_context(agent_name=agent_name):
        result = await default_understand(
            agent_name,
            [{"name": lesson_name, "description": "first", "evidence_ref": "ev1"}],
        )
    assert result["name"] == lesson_name
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT agent_name, lesson_name, description FROM agent_lessons "
            "WHERE agent_name = $1 AND lesson_name = $2",
            agent_name, lesson_name,
        )
    assert row is not None
    assert row["description"] == "first"


@pytest.mark.asyncio
async def test_understand_supersedes_prior_lesson(db_schema):
    schema, pool = db_schema
    agent_name = "knox"
    lesson_name = f"supersede_test_{uuid.uuid4().hex[:8]}"
    with with_agent_context(agent_name=agent_name):
        await default_understand(agent_name, [{"name": lesson_name, "description": "v1"}])
        await default_understand(agent_name, [{"name": lesson_name, "description": "v2"}])
    async with pool.acquire() as conn:
        active = await conn.fetchrow(
            "SELECT description FROM agent_lessons "
            "WHERE agent_name = $1 AND lesson_name = $2 AND superseded_by IS NULL",
            agent_name, lesson_name,
        )
    assert active is not None
    assert active["description"] == "v2"


@pytest.mark.asyncio
async def test_improve_before_after(db_schema):
    schema, pool = db_schema
    agent_name = "knox"
    with with_agent_context(agent_name=agent_name):
        await default_improve_commit(
            agent_name,
            {"name": "test", "before": {"rule": "v1"}, "after": {"rule": "v2"}},
        )
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT action, input_payload::TEXT AS payload FROM agent_events "
            "WHERE agent_name = $1 AND action = 'improve' ORDER BY created_at DESC LIMIT 1",
            agent_name,
        )
    assert row is not None
    payload = json.loads(row["payload"])
    assert "before" in payload
    assert "after" in payload


@pytest.mark.asyncio
async def test_review_latency_placeholder(db_schema):
    """Seeds the query shape Plan 62B-08 pg_cron dispatcher will use.

    Proves LOOP-03 SC1 bar is mechanically reachable: after inserting a
    review_tick row, a SELECT with a < 15 min window returns it.
    """
    schema, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status)
               VALUES ('knox', 'review_tick', '_cron', '_review', 'pending')"""
        )
        row = await conn.fetchrow(
            """SELECT agent_name FROM agent_events
                WHERE action = 'review_tick'
                  AND status = 'pending'
                  AND created_at > NOW() - INTERVAL '15 minutes'
                ORDER BY created_at DESC LIMIT 1"""
        )
    assert row is not None
    assert row["agent_name"] == "knox"
```
  </action>
  <verify>
    <automated>pytest fee_crawler/tests/test_agent_base_auto_wrap.py -x -v</automated>
  </verify>
  <acceptance_criteria>
    - File `fee_crawler/tests/test_agent_base_auto_wrap.py` exists with 9 `def test_` functions
    - `pytest fee_crawler/tests/test_agent_base_auto_wrap.py -x -v` exits 0
    - `grep -c "^async def test_\|^def test_" fee_crawler/tests/test_agent_base_auto_wrap.py` returns at least 9
    - `grep -n "test_subclass_gets_hooks\|test_dissect_writes_event\|test_understand_writes_lesson\|test_improve_before_after\|test_review_latency" fee_crawler/tests/test_agent_base_auto_wrap.py` returns at least 5 hits (matching VALIDATION.md)
  </acceptance_criteria>
  <done>All 9 tests green. LOOP-01, 04, 05, 06 contract tests pass; LOOP-03 latency placeholder works.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Subclass code → AgentBase `__init_subclass__` | New class registration enforces agent_name presence |
| default_* loop helpers → agent_events / agent_lessons INSERT | Writes executed as service role via pool; no user input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-62B-03-01 | Tampering | AgentBase wraps non-allowlisted private helper methods | mitigate | Allowlist is explicit in AUTO_WRAP_METHODS tuple (5 methods); private helpers (_foo) are NOT wrapped per research §Mechanics 1 rationale. Test `test_subclass_gets_hooks` asserts exactly the 5. |
| T-62B-03-02 | Input Validation | default_understand accepts lesson_name from untrusted pattern dict | mitigate | Written as parameterized asyncpg query ($1, $2, ...); lesson_name is TEXT and cannot inject. Evidence_refs serialized as JSONB via json.dumps. |
| T-62B-03-03 | Repudiation | AgentBase skips LOG when run_turn raises | accept | Exceptions propagate; 62a gateway's pending-INSERT on tool call still writes the pending event. `run_turn` itself does not write an event unless it calls a tool or default_* helper. This is intended: AgentBase provides context, not unconditional LOG. |
</threat_model>

<verification>
- Package imports cleanly (Task 1 verify)
- All 9 contract tests pass (Task 2)
- No modifications to `fee_crawler/agent_tools/*` (confirmed via git diff — this plan is additive)
</verification>

<success_criteria>
- [ ] AgentBase class exists with 5 override hooks + auto-wrap
- [ ] Tests for LOOP-01, LOOP-04, LOOP-05, LOOP-06 all green
- [ ] LOOP-03 latency placeholder test passes
- [ ] No import errors
</success_criteria>

<output>
After completion, create `.planning/phases/62B-agent-foundation-runtime-layer/62B-03-SUMMARY.md` documenting the AgentBase surface area, the 5-method allowlist rationale, and any deviations from the research template (e.g., if agent_lessons column names required adjusting the default_understand UPSERT pattern).
</output>
