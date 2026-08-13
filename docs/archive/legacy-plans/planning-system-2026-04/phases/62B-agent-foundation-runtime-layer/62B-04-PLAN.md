---
phase: 62B
plan: 04
type: execute
wave: 2
depends_on: [62B-01]
files_modified:
  - fee_crawler/testing/__init__.py
  - fee_crawler/testing/fake_anthropic.py
  - fee_crawler/testing/canary_schema.py
  - fee_crawler/testing/canary_runner.py
  - fee_crawler/testing/shadow_helpers.py
  - fee_crawler/testing/contract_test_base.py
  - fee_crawler/agent_tools/context.py
  - fee_crawler/agent_tools/gateway.py
  - fee_crawler/tests/test_fake_anthropic.py
  - fee_crawler/tests/test_canary_runner.py
  - fee_crawler/tests/test_shadow_helpers.py
autonomous: true
requirements: [BOOT-03]
must_haves:
  truths:
    - "FakeAnthropicClient duck-types anthropic.Anthropic with .messages.create async, records every call, returns scripted FakeResponse"
    - "CanaryCorpus pydantic schema validates JSON fixtures with version/description/expectations fields"
    - "canary_runner runs an agent against a corpus, diffs coverage/confidence/extraction_count vs. frozen baseline, writes a canary_runs row"
    - "shadow_run_id flows through with_agent_context → gateway → is_shadow column on agent_events"
    - "Shadow-mode call does NOT write to the business target table; payload lands in shadow_outputs"
    - "contract_test_base provides a reusable pytest fixture + helper asserting a tool-call sequence from scripted FakeAnthropic"
  artifacts:
    - path: fee_crawler/testing/fake_anthropic.py
      provides: "FakeAnthropicClient + ToolUseBlock + TextBlock + FakeResponse + RecordedCall"
    - path: fee_crawler/testing/canary_schema.py
      provides: "CanaryCorpus + CanaryExpectation pydantic models"
    - path: fee_crawler/testing/canary_runner.py
      provides: "run_canary(agent_name, corpus, baseline_run_id=None) -> CanaryVerdict; writes canary_runs row"
    - path: fee_crawler/testing/shadow_helpers.py
      provides: "make_shadow_run_id(), shadow_run_context(), shadow_diff_report(shadow_run_id)"
    - path: fee_crawler/agent_tools/context.py
      provides: "with_agent_context gains shadow_run_id kwarg; context dict carries shadow_run_id"
    - path: fee_crawler/agent_tools/gateway.py
      provides: "gateway sets agent_events.is_shadow=true + status='shadow_diff' when shadow_run_id present; introduces is_shadow_active() helper"
  key_links:
    - from: "with_agent_context(shadow_run_id=...)"
      to: "gateway reads get_agent_context()['shadow_run_id']"
      via: "is_shadow_active() helper"
      pattern: "def is_shadow_active"
    - from: "FakeAnthropicClient.messages.create"
      to: "self.recorded_calls + scripted FIFO pop"
      via: "duck-typed anthropic.Messages.create"
      pattern: "class _Messages"
---

<objective>
Deliver the 4-layer testing harness (D-18..D-21) so Phase 63-65 agent code has deterministic test infrastructure:

1. **Contract testing** — custom `FakeAnthropicClient` (D-19) returns scripted responses, records calls. Zero external deps; no VCR cassettes.
2. **Fixture replay** — reuses FakeAnthropicClient + corpus fixtures (content lands in Phase 63).
3. **Canary runner + schema** (D-20) — corpus JSON validated by Pydantic, runs agent against N institutions, diffs three metrics vs. frozen baseline, writes `canary_runs` row. Full corpus is populated in Phase 63.
4. **Shadow mode skeleton** (D-21) — `shadow_run_id` on context → gateway suppresses business-table writes and routes to `shadow_outputs`; `is_shadow=true` on agent_events.

Purpose: Without this, Plan 62B-07 adversarial gate cannot run canary regressions; Plans 62B-05..11 have no reliable test harness for agent flows.

Output: New `fee_crawler/testing/` package; 2 edits to `agent_tools/` (context + gateway shadow branch); 3 pytest meta-test files.
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
@supabase/migrations/20260504_shadow_outputs.sql
@supabase/migrations/20260505_canary_runs.sql

<interfaces>
Existing `fee_crawler/agent_tools/context.py` signature to EXTEND:
```python
@contextlib.contextmanager
def with_agent_context(*, agent_name, correlation_id=None, parent_event_id=None, cost_cents=0):
    ...
```
EDIT: add `shadow_run_id: Optional[str] = None` kwarg; include in context dict.

Existing `fee_crawler/agent_tools/gateway.py`:
- `with_agent_tool(...)` async context manager — writes pending agent_events, yields (conn, event_id), then writes agent_auth_log + status=success
EDIT: after the existing body, if context has shadow_run_id, UPDATE status='shadow_diff' + is_shadow=TRUE on the agent_events row AND do NOT insert agent_auth_log (suppress per D-21).

From 62B-01 migration 20260504:
- `shadow_outputs (shadow_output_id BIGSERIAL PK, created_at, shadow_run_id UUID, agent_name TEXT FK, entity TEXT, payload_diff JSONB, agent_event_id UUID)`

From 62B-01 migration 20260505:
- `canary_runs (run_id UUID PK, agent_name TEXT FK, corpus_version TEXT, started_at, finished_at, status CHECK, is_baseline BOOL, coverage NUMERIC, confidence_mean NUMERIC, extraction_count INT, coverage_delta, confidence_delta, extraction_count_delta, verdict TEXT, report_payload JSONB, baseline_run_id UUID)`

Research §Code Examples lines 531-607 (FakeAnthropicClient full code).
Research §Mechanics 5 lines 1020-1093 (shadow-mode gateway branch).
Research §Mechanics 7 lines 1108-1153 (canary schema + baseline).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: FakeAnthropicClient + contract_test_base + shadow_helpers + canary schema</name>
  <files>fee_crawler/testing/__init__.py, fee_crawler/testing/fake_anthropic.py, fee_crawler/testing/canary_schema.py, fee_crawler/testing/shadow_helpers.py, fee_crawler/testing/contract_test_base.py, fee_crawler/tests/test_fake_anthropic.py</files>
  <read_first>
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Code Examples lines 531-607 (FakeAnthropicClient complete code) + §Mechanics 6 lines 1095-1105 (injection pattern) + §Mechanics 7 lines 1139-1153 (canary schema)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md D-18..D-21 (testing harness scope)
    - fee_crawler/agent_tools/schemas/ (existing pydantic schema pattern — follow this for canary_schema)
    - fee_crawler/tests/conftest.py (to understand how to extend with fake_anthropic fixture)
    - fee_crawler/requirements.txt (confirm anthropic SDK version pinned)
  </read_first>
  <behavior>
    - Test 1: FakeAnthropicClient duck-types anthropic.Anthropic().messages.create — returns FakeResponse with .stop_reason, .content, .usage
    - Test 2: FakeAnthropicClient records every call's model/messages/tools/system
    - Test 3: tool_calls property extracts only tool_use blocks from recorded_calls
    - Test 4: Running out of scripted responses raises RuntimeError
    - Test 5: CanaryCorpus pydantic model accepts valid JSON, rejects missing fields
    - Test 6: shadow_run_context() is a contextmanager that yields a UUID and enters with_agent_context(shadow_run_id=uuid)
    - Test 7: contract_test_base.assert_tool_call_sequence(client, expected_names) passes when names match, raises AssertionError otherwise
  </behavior>
  <action>
**File 1: `fee_crawler/testing/__init__.py`**
```python
"""Phase 62b testing harness — BOOT-03 (D-18..D-21).

Layers:
  - Contract tests: FakeAnthropicClient (D-19) + contract_test_base helpers
  - Fixture replay: reuses FakeAnthropicClient with saved scripted paths
  - Canary: canary_schema + canary_runner (D-20)
  - Shadow mode: shadow_helpers + gateway branch (D-21)
"""
from fee_crawler.testing.fake_anthropic import (
    FakeAnthropicClient, FakeResponse, RecordedCall, TextBlock, ToolUseBlock,
)
from fee_crawler.testing.canary_schema import CanaryCorpus, CanaryExpectation, CanaryVerdict
from fee_crawler.testing.shadow_helpers import (
    make_shadow_run_id, shadow_run_context, shadow_diff_report,
)

__all__ = [
    "FakeAnthropicClient", "FakeResponse", "RecordedCall", "TextBlock", "ToolUseBlock",
    "CanaryCorpus", "CanaryExpectation", "CanaryVerdict",
    "make_shadow_run_id", "shadow_run_context", "shadow_diff_report",
]
```

**File 2: `fee_crawler/testing/fake_anthropic.py`**

Copy verbatim research §Code Examples lines 531-607. Ensure the module docstring explains D-19 rationale and that `messages.create` is async. The existing research example uses `async def create`, which matches anthropic.AsyncAnthropic. Since the fee_crawler codebase uses `anthropic.Anthropic` (sync) in most places, also add a sync facade so both can be tested:

```python
class FakeAnthropicClient:
    def __init__(self, scripted: list[FakeResponse], mode: str = "async"):
        self._scripted = list(scripted)
        self.recorded_calls: list[RecordedCall] = []
        self._mode = mode

    class _Messages:
        def __init__(self, outer, is_async=True):
            self._outer = outer
            self._is_async = is_async
        async def create(self, **kw):
            return self._do(**kw)
        def create_sync(self, **kw):
            return self._do(**kw)
        def _do(self, **kw):
            call = RecordedCall(model=kw.get('model', ''), messages=kw.get('messages', []),
                                tools=kw.get('tools'), system=kw.get('system'))
            self._outer.recorded_calls.append(call)
            if not self._outer._scripted:
                raise RuntimeError("FakeAnthropicClient ran out of scripted responses")
            return self._outer._scripted.pop(0)

    @property
    def messages(self):
        return FakeAnthropicClient._Messages(self, is_async=(self._mode == "async"))

    @property
    def tool_calls(self):
        result = []
        for call in self.recorded_calls:
            for msg in call.messages or []:
                content = msg.get('content') if isinstance(msg, dict) else None
                if isinstance(content, list):
                    for b in content:
                        if isinstance(b, dict) and b.get('type') == 'tool_use':
                            result.append(b)
        return result
```

**File 3: `fee_crawler/testing/canary_schema.py`**

```python
"""Pydantic schema for canary corpus fixtures (D-20).

Corpus content lands in Phase 63; this schema is the contract.
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class CanaryExpectation(BaseModel):
    institution_id: int
    expected_fees: list[dict] = Field(default_factory=list)
    min_coverage: float = 1.0
    min_confidence: float = 0.85


class CanaryCorpus(BaseModel):
    version: str
    description: str
    expectations: list[CanaryExpectation] = Field(default_factory=list)


class CanaryVerdict(BaseModel):
    passed: bool
    coverage: float
    confidence_mean: float
    extraction_count: int
    coverage_delta: Optional[float] = None
    confidence_delta: Optional[float] = None
    extraction_count_delta: Optional[int] = None
    reason: Optional[str] = None
```

**File 4: `fee_crawler/testing/shadow_helpers.py`**

```python
"""Shadow-mode context + diff helpers (D-21)."""
from __future__ import annotations

import contextlib
import uuid
from typing import Optional

from fee_crawler.agent_tools.context import with_agent_context
from fee_crawler.agent_tools.pool import get_pool


def make_shadow_run_id() -> str:
    return str(uuid.uuid4())


@contextlib.contextmanager
def shadow_run_context(*, agent_name: str, shadow_run_id: Optional[str] = None):
    """Enter with_agent_context() with shadow_run_id set.

    Inside this block, every with_agent_tool() call writes is_shadow=true on
    agent_events and business-table writes MUST be routed to shadow_outputs
    (see gateway edit in Task 2).
    """
    rid = shadow_run_id or make_shadow_run_id()
    with with_agent_context(agent_name=agent_name, shadow_run_id=rid):
        yield rid


async def shadow_diff_report(shadow_run_id: str) -> dict:
    """Return {entity: [payload_diff rows]} for a shadow run."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT entity, payload_diff, created_at, agent_event_id FROM shadow_outputs "
            "WHERE shadow_run_id = $1 ORDER BY created_at",
            shadow_run_id,
        )
    grouped: dict = {}
    for r in rows:
        grouped.setdefault(r["entity"], []).append({
            "payload_diff": r["payload_diff"],
            "created_at": r["created_at"].isoformat(),
            "agent_event_id": str(r["agent_event_id"]) if r["agent_event_id"] else None,
        })
    return grouped
```

**File 5: `fee_crawler/testing/contract_test_base.py`**

```python
"""Helpers for contract tests using FakeAnthropicClient."""
from fee_crawler.testing.fake_anthropic import FakeAnthropicClient


def assert_tool_call_sequence(client: FakeAnthropicClient, expected_names: list[str]) -> None:
    """Assert the exact ordered sequence of tool names the agent invoked via the client."""
    actual = [c.get("name") for c in client.tool_calls]
    if actual != expected_names:
        raise AssertionError(
            f"Tool call sequence mismatch.\n  expected: {expected_names}\n  actual:   {actual}"
        )


def recorded_system_prompts(client: FakeAnthropicClient) -> list[str]:
    """Helper to inspect system prompts the agent sent (useful for context-injection tests)."""
    return [c.system for c in client.recorded_calls if c.system]
```

**Test file: `fee_crawler/tests/test_fake_anthropic.py`**

```python
import pytest
from fee_crawler.testing import FakeAnthropicClient, FakeResponse, TextBlock, ToolUseBlock
from fee_crawler.testing.canary_schema import CanaryCorpus, CanaryExpectation
from fee_crawler.testing.shadow_helpers import make_shadow_run_id, shadow_run_context
from fee_crawler.testing.contract_test_base import assert_tool_call_sequence
from fee_crawler.agent_tools.context import get_agent_context


@pytest.mark.asyncio
async def test_fake_client_records_and_returns_scripted():
    client = FakeAnthropicClient(scripted=[
        FakeResponse(stop_reason="tool_use", content=[ToolUseBlock(name="list_recent_events", input={"hours": 24})]),
        FakeResponse(stop_reason="end_turn", content=[TextBlock(text="done")]),
    ])
    r1 = await client.messages.create(model="claude", messages=[{"role": "user", "content": "review"}])
    r2 = await client.messages.create(model="claude", messages=[
        {"role": "user", "content": "review"},
        {"role": "assistant", "content": [{"type": "tool_use", "name": "list_recent_events", "input": {"hours": 24}}]},
    ])
    assert r1.stop_reason == "tool_use"
    assert r2.stop_reason == "end_turn"
    assert len(client.recorded_calls) == 2


def test_tool_calls_property():
    client = FakeAnthropicClient(scripted=[FakeResponse()])
    client.recorded_calls.append(type("R", (), {
        "model": "x", "system": None, "tools": None, "messages": [
            {"role": "assistant", "content": [{"type": "tool_use", "name": "t1"}]},
            {"role": "assistant", "content": [{"type": "text", "text": "hi"}]},
        ]
    })())
    assert len(client.tool_calls) == 1
    assert client.tool_calls[0]["name"] == "t1"


def test_scripted_exhausted_raises():
    client = FakeAnthropicClient(scripted=[FakeResponse()])
    import asyncio
    asyncio.run(client.messages.create(model="m", messages=[]))
    with pytest.raises(RuntimeError, match="ran out"):
        asyncio.run(client.messages.create(model="m", messages=[]))


def test_canary_corpus_validates():
    c = CanaryCorpus(version="v1", description="d", expectations=[
        CanaryExpectation(institution_id=1, expected_fees=[{"canonical_fee_key": "od"}]),
    ])
    assert c.version == "v1"


def test_canary_corpus_rejects_missing():
    with pytest.raises(Exception):  # pydantic ValidationError
        CanaryCorpus(description="no version")


def test_shadow_run_context_sets_context():
    captured = {}
    with shadow_run_context(agent_name="knox") as rid:
        ctx = get_agent_context()
        captured["shadow_run_id"] = ctx.get("shadow_run_id")
        captured["agent_name"] = ctx.get("agent_name")
    assert captured["shadow_run_id"] == rid
    assert captured["agent_name"] == "knox"


def test_assert_tool_call_sequence_mismatch_raises():
    client = FakeAnthropicClient(scripted=[])
    client.recorded_calls.append(type("R", (), {
        "model": "x", "system": None, "tools": None, "messages": [
            {"role": "assistant", "content": [{"type": "tool_use", "name": "a"}]},
        ]
    })())
    with pytest.raises(AssertionError, match="sequence mismatch"):
        assert_tool_call_sequence(client, ["b"])
    assert_tool_call_sequence(client, ["a"])  # should not raise
```
  </action>
  <verify>
    <automated>pytest fee_crawler/tests/test_fake_anthropic.py -x -v</automated>
  </verify>
  <acceptance_criteria>
    - Files `fee_crawler/testing/__init__.py`, `fake_anthropic.py`, `canary_schema.py`, `shadow_helpers.py`, `contract_test_base.py` all exist
    - `python -c "from fee_crawler.testing import FakeAnthropicClient, CanaryCorpus, shadow_run_context, FakeResponse, ToolUseBlock, TextBlock"` exits 0
    - `grep -n "class FakeAnthropicClient" fee_crawler/testing/fake_anthropic.py` returns 1 match
    - `grep -n "class CanaryCorpus\|class CanaryExpectation" fee_crawler/testing/canary_schema.py` returns 2 matches
    - `grep -n "def shadow_run_context\|def make_shadow_run_id" fee_crawler/testing/shadow_helpers.py` returns 2 matches
    - `pytest fee_crawler/tests/test_fake_anthropic.py -x -v` exits 0
  </acceptance_criteria>
  <done>Testing harness helpers + FakeAnthropicClient green; pydantic canary schema validates correctly.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire shadow_run_id through context.py + gateway.py; add canary_runner</name>
  <files>fee_crawler/agent_tools/context.py, fee_crawler/agent_tools/gateway.py, fee_crawler/testing/canary_runner.py, fee_crawler/tests/test_shadow_helpers.py, fee_crawler/tests/test_canary_runner.py</files>
  <read_first>
    - fee_crawler/agent_tools/context.py (full 40 lines — this is the ONLY file that owns the context dict)
    - fee_crawler/agent_tools/gateway.py (full 220 lines — understand the 3-phase pattern: pending INSERT → yield → success UPDATE + auth_log INSERT)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Mechanics 5 lines 1020-1093 (shadow gateway branch cleanest implementation) + §Pitfall 5 (gateway-level suppression required; per-tool is wrong)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Mechanics 7 lines 1108-1137 (canary baseline + pass bar)
    - supabase/migrations/20260504_shadow_outputs.sql and supabase/migrations/20260505_canary_runs.sql (exact column names)
  </read_first>
  <behavior>
    - Test 1: with_agent_context(shadow_run_id=uuid) puts shadow_run_id in the context dict
    - Test 2: Calling with_agent_tool inside shadow context → agent_events row has is_shadow=true and status='shadow_diff'
    - Test 3: Calling with_agent_tool inside shadow context does NOT insert agent_auth_log (suppressed per D-21)
    - Test 4: is_shadow_active() returns True inside shadow context, False outside
    - Test 5: Running canary_runner with passing expectations (coverage/confidence/count all ≥ baseline) writes canary_runs row status='passed'
    - Test 6: Running canary_runner with regression (negative delta) writes status='failed'
    - Test 7: First run per (agent_name, corpus_version) is marked is_baseline=true; subsequent runs reference baseline_run_id
  </behavior>
  <action>
**Edit 1: `fee_crawler/agent_tools/context.py`**

Add `shadow_run_id: Optional[str] = None` parameter. Updated full file:

```python
"""Per-call agent context (correlation_id, parent_event_id, cost_cents, shadow_run_id).

Set via the `with_agent_context` context manager at the top of an agent's turn.
Gateway reads via get_agent_context() when creating agent_events rows.

Phase 62b D-21: shadow_run_id is propagated here; gateway routes business-table
writes to shadow_outputs when present.
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
    shadow_run_id: Optional[str] = None,
):
    """Set agent-scoped values for the duration of a `with` block."""
    token = _context.set({
        "agent_name": agent_name,
        "correlation_id": correlation_id or str(uuid.uuid4()),
        "parent_event_id": parent_event_id,
        "cost_cents": cost_cents,
        "shadow_run_id": shadow_run_id,
    })
    try:
        yield
    finally:
        _context.reset(token)


def get_agent_context() -> dict:
    """Return the current context dict (empty if no with_agent_context active)."""
    return _context.get()
```

**Edit 2: `fee_crawler/agent_tools/gateway.py`**

Add two changes:

1. Add helper at top (after existing imports):
```python
def is_shadow_active() -> bool:
    """True when an outer with_agent_context set shadow_run_id."""
    return bool(get_agent_context().get("shadow_run_id"))
```

2. Inside `with_agent_tool` async context manager, after the existing `UPDATE agent_events SET status='success' ...` block, branch on shadow:

```python
# Phase 62b D-21: if shadow_run_id active, rewrite status to shadow_diff + flag is_shadow.
# Suppress agent_auth_log (it was just inserted above) by DELETEing it.
# NOTE: ideal implementation would check shadow_run_id BEFORE writing auth_log;
# to minimize gateway.py churn, we conditionally DELETE here. Caller is still
# responsible for routing business-table writes to shadow_outputs (§Mechanics 5).
shadow_rid = ctx.get("shadow_run_id")
if shadow_rid:
    await conn.execute(
        """UPDATE agent_events
              SET status = 'shadow_diff', is_shadow = TRUE,
                  output_payload = jsonb_set(
                    COALESCE(output_payload, '{}'::jsonb),
                    '{shadow_run_id}',
                    to_jsonb($2::TEXT)
                  )
            WHERE event_id = $1""",
        event_id, shadow_rid,
    )
    await conn.execute(
        "DELETE FROM agent_auth_log WHERE agent_event_id = $1",
        event_id,
    )
```

Place this block INSIDE the `async with conn.transaction():` block, AFTER the existing step-9 `account_budget()` call. This preserves existing happy-path behavior for non-shadow calls.

Keep `check_budget`, `AgentUnknown`, `_truncate_payload`, `_snapshot_row` unchanged.

**File 3: `fee_crawler/testing/canary_runner.py`**

```python
"""Canary runner (D-20 + LOOP-07).

Given an agent_name + CanaryCorpus, run the agent against each institution,
compute coverage/confidence_mean/extraction_count, and compare to the frozen
baseline (first run per (agent_name, corpus_version) marked is_baseline=true).

Writes a canary_runs row with verdict + deltas. Returns CanaryVerdict.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Awaitable, Callable, Optional

from fee_crawler.agent_tools.pool import get_pool
from fee_crawler.testing.canary_schema import CanaryCorpus, CanaryVerdict


AgentRunner = Callable[[int], Awaitable[dict]]  # (institution_id) -> {coverage, confidence_mean, extraction_count}


async def run_canary(
    agent_name: str,
    corpus: CanaryCorpus,
    runner: AgentRunner,
    *,
    force_baseline: bool = False,
) -> CanaryVerdict:
    """Execute the corpus and return verdict. Writes one canary_runs row.

    force_baseline: when True, mark this run as is_baseline=true even if a prior baseline exists.
    """
    pool = await get_pool()
    run_id = str(uuid.uuid4())
    started = datetime.utcnow()

    # Run the agent against each institution.
    results = []
    for exp in corpus.expectations:
        r = await runner(exp.institution_id)
        results.append(r)

    coverage_mean = sum(r.get("coverage", 0.0) for r in results) / max(len(results), 1)
    confidence_mean = sum(r.get("confidence_mean", 0.0) for r in results) / max(len(results), 1)
    extraction_count = sum(r.get("extraction_count", 0) for r in results)

    # Look up baseline.
    baseline = None
    if not force_baseline:
        async with pool.acquire() as conn:
            baseline = await conn.fetchrow(
                """SELECT run_id, coverage, confidence_mean, extraction_count
                     FROM canary_runs
                    WHERE agent_name = $1 AND corpus_version = $2 AND is_baseline""",
                agent_name, corpus.version,
            )

    is_baseline = force_baseline or baseline is None
    cov_d = conf_d = cnt_d = None
    passed = True
    verdict_reason = None
    if baseline is not None:
        cov_d = float(coverage_mean) - float(baseline["coverage"] or 0.0)
        conf_d = float(confidence_mean) - float(baseline["confidence_mean"] or 0.0)
        cnt_d = int(extraction_count) - int(baseline["extraction_count"] or 0)
        if cov_d < 0 or conf_d < 0 or cnt_d < 0:
            passed = False
            verdict_reason = f"regression: coverage_delta={cov_d} confidence_delta={conf_d} extraction_count_delta={cnt_d}"

    status = "passed" if passed else "failed"

    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO canary_runs
                 (run_id, agent_name, corpus_version, started_at, finished_at, status,
                  is_baseline, coverage, confidence_mean, extraction_count,
                  coverage_delta, confidence_delta, extraction_count_delta,
                  verdict, report_payload, baseline_run_id)
               VALUES ($1::UUID, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::JSONB, $15::UUID)""",
            run_id, agent_name, corpus.version, started, status, is_baseline,
            coverage_mean, confidence_mean, extraction_count,
            cov_d, conf_d, cnt_d,
            verdict_reason or ("baseline" if is_baseline else "pass"),
            json.dumps({"results": results}),
            baseline["run_id"] if baseline else None,
        )

    return CanaryVerdict(
        passed=passed,
        coverage=float(coverage_mean),
        confidence_mean=float(confidence_mean),
        extraction_count=int(extraction_count),
        coverage_delta=cov_d,
        confidence_delta=conf_d,
        extraction_count_delta=cnt_d,
        reason=verdict_reason,
    )
```

**Test file: `fee_crawler/tests/test_shadow_helpers.py`**

```python
import pytest
import uuid
from fee_crawler.agent_tools.context import with_agent_context, get_agent_context
from fee_crawler.agent_tools.gateway import is_shadow_active, with_agent_tool
from fee_crawler.testing.shadow_helpers import shadow_run_context, shadow_diff_report


def test_is_shadow_active_false_by_default():
    assert is_shadow_active() is False


def test_is_shadow_active_true_inside_shadow_ctx():
    with with_agent_context(agent_name="knox", shadow_run_id=str(uuid.uuid4())):
        assert is_shadow_active() is True


@pytest.mark.asyncio
async def test_shadow_gateway_call_sets_is_shadow(db_schema):
    schema, pool = db_schema
    agent_name = "knox"
    rid = str(uuid.uuid4())
    # Insert a dummy 'entity' row so the gateway can run (use a throwaway SELECT-only path).
    # Call with_agent_tool in shadow mode; action='create' on a fake entity.
    with with_agent_context(agent_name=agent_name, shadow_run_id=rid):
        async with with_agent_tool(
            tool_name="shadow_smoke",
            entity="_smoke",
            entity_id=None,
            action="create",
            agent_name=agent_name,
            reasoning_prompt="p",
            reasoning_output="o",
            pool=pool,
        ) as (conn, event_id):
            pass  # no target write
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status, is_shadow FROM agent_events WHERE event_id = $1::UUID",
            event_id,
        )
    assert row is not None
    assert row["status"] == "shadow_diff"
    assert row["is_shadow"] is True
    # agent_auth_log suppressed for shadow calls
    async with pool.acquire() as conn:
        auth_row = await conn.fetchrow(
            "SELECT 1 FROM agent_auth_log WHERE agent_event_id = $1::UUID",
            event_id,
        )
    assert auth_row is None


@pytest.mark.asyncio
async def test_shadow_diff_report_groups_by_entity(db_schema):
    schema, pool = db_schema
    rid = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO shadow_outputs (shadow_run_id, agent_name, entity, payload_diff) "
            "VALUES ($1::UUID, 'knox', 'fees_raw', '{\"a\":1}'::JSONB)",
            rid,
        )
        await conn.execute(
            "INSERT INTO shadow_outputs (shadow_run_id, agent_name, entity, payload_diff) "
            "VALUES ($1::UUID, 'knox', 'fees_raw', '{\"a\":2}'::JSONB)",
            rid,
        )
    report = await shadow_diff_report(rid)
    assert "fees_raw" in report
    assert len(report["fees_raw"]) == 2
```

**Test file: `fee_crawler/tests/test_canary_runner.py`**

```python
import pytest
from fee_crawler.testing.canary_runner import run_canary
from fee_crawler.testing.canary_schema import CanaryCorpus, CanaryExpectation


@pytest.mark.asyncio
async def test_first_run_is_baseline(db_schema):
    schema, pool = db_schema
    corpus = CanaryCorpus(version="v1", description="d",
                           expectations=[CanaryExpectation(institution_id=1)])
    async def runner(inst): return {"coverage": 1.0, "confidence_mean": 0.9, "extraction_count": 10}
    v1 = await run_canary("knox", corpus, runner)
    assert v1.passed is True
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT is_baseline FROM canary_runs WHERE agent_name='knox' ORDER BY started_at DESC LIMIT 1")
    assert row["is_baseline"] is True


@pytest.mark.asyncio
async def test_regression_fails(db_schema):
    schema, pool = db_schema
    corpus = CanaryCorpus(version="v1", description="d",
                           expectations=[CanaryExpectation(institution_id=1)])
    async def baseline_runner(inst): return {"coverage": 1.0, "confidence_mean": 0.9, "extraction_count": 10}
    async def regressed_runner(inst): return {"coverage": 0.8, "confidence_mean": 0.9, "extraction_count": 10}
    await run_canary("knox", corpus, baseline_runner)
    verdict = await run_canary("knox", corpus, regressed_runner)
    assert verdict.passed is False
    assert verdict.coverage_delta is not None and verdict.coverage_delta < 0


@pytest.mark.asyncio
async def test_pass_meets_baseline(db_schema):
    schema, pool = db_schema
    corpus = CanaryCorpus(version="v1", description="d",
                           expectations=[CanaryExpectation(institution_id=1)])
    async def runner(inst): return {"coverage": 1.0, "confidence_mean": 0.9, "extraction_count": 10}
    await run_canary("knox", corpus, runner)
    v = await run_canary("knox", corpus, runner)
    assert v.passed is True
```
  </action>
  <verify>
    <automated>pytest fee_crawler/tests/test_shadow_helpers.py fee_crawler/tests/test_canary_runner.py -x -v</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "shadow_run_id" fee_crawler/agent_tools/context.py` returns at least 2 matches (param + dict key)
    - `grep -n "def is_shadow_active" fee_crawler/agent_tools/gateway.py` returns 1 match
    - `grep -n "status = 'shadow_diff'\|shadow_diff" fee_crawler/agent_tools/gateway.py` returns at least 1 match
    - `grep -n "DELETE FROM agent_auth_log" fee_crawler/agent_tools/gateway.py` returns 1 match (shadow suppression)
    - File `fee_crawler/testing/canary_runner.py` exists, defines `run_canary` + `AgentRunner` type alias
    - `pytest fee_crawler/tests/test_shadow_helpers.py fee_crawler/tests/test_canary_runner.py -x -v` exits 0
    - `pytest fee_crawler/tests/test_agent_gateway.py -x` (existing 62a tests) STILL passes (regression check — we didn't break 62a)
  </acceptance_criteria>
  <done>Shadow context + gateway branch wired; canary runner writes canary_runs rows with correct baseline/regression logic; all tests green; 62a gateway tests still pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| shadow context → gateway | shadow_run_id from context dictates whether writes suppress |
| canary_runner → canary_runs INSERT | service-role write; no user input |
| FakeAnthropicClient → test assertions | scripted in-memory; no network |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-62B-04-01 | Tampering | Shadow mode leaks business-table write | mitigate | Gateway-level suppression (§Pitfall 5): the gateway rewrites agent_events.status='shadow_diff' and DELETEs agent_auth_log. Caller still bears responsibility to route business table writes to shadow_outputs (contract test in plan 62B-05 for messaging insert_agent_message — not exercised here since no write tool is called). Test `test_shadow_gateway_call_sets_is_shadow` asserts status + is_shadow. |
| T-62B-04-02 | Repudiation | Shadow suppresses agent_auth_log → write-side audit gone | accept | Agent_events still written with status='shadow_diff' + is_shadow=TRUE; full audit trail preserved on that row. Agent_auth_log suppression is intentional (D-21: no business write means no auth_log row needed). |
| T-62B-04-03 | Input Validation | CanaryCorpus accepts arbitrary JSON from file | mitigate | Pydantic validates required fields; extraction logic in runner only reads known keys via dict.get(). Corpus files live in `fee_crawler/fixtures/golden_corpus/` (Phase 63) — not externally writable. |
| T-62B-04-04 | Tampering | FakeAnthropicClient confused with real client in prod | mitigate | Class lives under `fee_crawler/testing/`; imports flagged by reviewers. Contract test fixtures inject the fake; prod code paths use `anthropic.Anthropic`. `grep` for `FakeAnthropicClient` in non-test code = CI guard opportunity (followup). |
</threat_model>

<verification>
- `from fee_crawler.testing import FakeAnthropicClient, CanaryCorpus, shadow_run_context` works
- All 7+ tests across 3 test files pass
- 62a gateway tests untouched and still passing
</verification>

<success_criteria>
- [ ] `fee_crawler/testing/` package created with 5 modules
- [ ] `context.py` extended with shadow_run_id
- [ ] `gateway.py` shadow branch writes is_shadow=true + status='shadow_diff' and deletes agent_auth_log
- [ ] 3 test files green (test_fake_anthropic, test_shadow_helpers, test_canary_runner)
- [ ] Existing 62a gateway tests still green
</success_criteria>

<output>
After completion, create `.planning/phases/62B-agent-foundation-runtime-layer/62B-04-SUMMARY.md` documenting the testing harness surface, the shadow-gateway suppression pattern chosen, and any deviation from research template.
</output>
