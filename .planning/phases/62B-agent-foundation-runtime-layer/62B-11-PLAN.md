---
phase: 62B
plan: 11
type: execute
wave: 5
depends_on: [62B-03, 62B-05, 62B-07]
files_modified:
  - fee_crawler/commands/agent_graduate.py
  - fee_crawler/__main__.py
  - fee_crawler/agent_base/bootstrap.py
  - fee_crawler/commands/exception_digest.py
  - .planning/runbooks/agent-bootstrap.md
  - fee_crawler/tests/test_agent_bootstrap.py
  - fee_crawler/tests/test_exception_digest.py
autonomous: false
requirements: [BOOT-01]
must_haves:
  truths:
    - "A CLI command python -m fee_crawler agent-graduate <name> --to <state> runs a named per-agent SQL predicate and only flips agent_registry.lifecycle_state if the predicate returns TRUE"
    - "Predicates are fixed strings per (agent_name, from_state, to_state) — no user input interpolation (Pitfall 6)"
    - "Pausing is always allowed (no predicate): agent-graduate knox --to paused always succeeds"
    - "AgentBase.run_turn reads agent_registry.lifecycle_state at turn start and branches: paused → abort; q1 → hold for human (stub: set pending flag); q2 → auto-commit confidence>=0.85 + sample 5%; q3 → autonomy + quarterly sample"
    - "Exception digest CLI (python -m fee_crawler exception-digest) surfaces 3 sources: improve_rejected events, escalated messages, q2 exception samples"
    - "Runbook .planning/runbooks/agent-bootstrap.md documents Q1/Q2/Q3 semantics, graduation predicates, rollback, exception-review SLA (48h), failure modes"
    - "Graduation CLI exits non-zero and prints clear error when predicate fails; agent_registry.lifecycle_state is NOT changed"
  artifacts:
    - path: fee_crawler/commands/agent_graduate.py
      provides: "CLI entry: agent-graduate <name> --to <state>; PREDICATES dict; psql-equivalent predicate runner"
    - path: fee_crawler/agent_base/bootstrap.py
      provides: "lifecycle_state read + branch helper AgentBase.run_turn invokes before delegating to subclass"
    - path: fee_crawler/commands/exception_digest.py
      provides: "CLI entry: exception-digest; writes markdown to stdout or file"
    - path: .planning/runbooks/agent-bootstrap.md
      provides: "Operator runbook for Q1/Q2/Q3 + graduation + rollback + 48h SLA"
  key_links:
    - from: "agent-graduate CLI"
      to: "PREDICATES[(agent_name, from, to)]"
      via: "lookup + conn.fetchval(predicate)"
      pattern: "PREDICATES"
    - from: "AgentBase.run_turn entry"
      to: "bootstrap.get_lifecycle_state(agent_name) + branch on state"
      via: "SELECT lifecycle_state FROM agent_registry"
      pattern: "lifecycle_state"
---

<objective>
Ship the BOOT-01 bootstrap protocol surface: (a) `agent-graduate` CLI with per-agent SQL predicates (D-22, D-23), (b) lifecycle-state branch inside `AgentBase.run_turn` (D-22, D-24), (c) exception-digest CLI reading from improve_rejected + escalated + q2-exception rows (D-08, D-11, D-24), (d) the runbook at `.planning/runbooks/agent-bootstrap.md` (D-25).

Purpose: Success Criterion 5 in ROADMAP Phase 62b: "a developer can read the runbook and advance an agent from Q1 to Q2 by meeting a named, measurable graduation bar." Without this plan, lifecycle_state column (from 62B-01) is just a column — not a gate.

Output: 4 code files + 1 runbook + 2 pytest files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md
@.planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md
@fee_crawler/agent_base/base.py
@fee_crawler/agent_messaging/escalation.py
@supabase/migrations/20260502_agent_registry_lifecycle_state.sql
@fee_crawler/__main__.py

<interfaces>
From 62B-01 migration 20260502: `agent_registry.lifecycle_state CHECK IN ('q1_validation','q2_high_confidence','q3_autonomy','paused')`

From 62B-03 `AgentBase` — extend `run_turn` wrap to check lifecycle_state at entry.

From 62B-05 `fee_crawler/agent_messaging/escalation.py::list_escalated_threads` — used by digest.

From 62B-07 `agent_events status='improve_rejected'` rows — digest source.

Research §Mechanics 8 (lines 1155-1178) lifecycle_state migration already seeded in 62B-01.
Research §Mechanics 9 (lines 1180-1232) complete CLI pattern with PREDICATES dict.
Research §Mechanics 10 (lines 1237-1244) exception-digest sources.
Research §Mechanics 15 (lines 1384-1396) runbook template sections.
Research §Pitfall 6 (lines 362-365) — SQL injection prevention.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: agent-graduate CLI + lifecycle-state branch in AgentBase + tests</name>
  <files>fee_crawler/commands/agent_graduate.py, fee_crawler/agent_base/bootstrap.py, fee_crawler/agent_base/base.py, fee_crawler/__main__.py, fee_crawler/tests/test_agent_bootstrap.py</files>
  <read_first>
    - fee_crawler/agent_base/base.py (understand run_turn auto-wrap + override pattern from 62B-03)
    - fee_crawler/__main__.py (CLI dispatch pattern; how existing subcommands are wired)
    - fee_crawler/commands/ — list other CLI commands to follow naming/style convention
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Mechanics 9 lines 1180-1232 (full agent_graduate CLI code)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md D-22..D-25
    - supabase/migrations/20260502_agent_registry_lifecycle_state.sql (CHECK values)
  </read_first>
  <behavior>
    - Test 1: agent-graduate with --to paused always succeeds (no predicate required)
    - Test 2: agent-graduate knox --to q2_high_confidence with failing predicate (empty seed data) exits non-zero; agent_registry.lifecycle_state NOT changed
    - Test 3: agent-graduate knox --to q2_high_confidence with passing data flips lifecycle_state
    - Test 4: Unknown agent_name → CLI exits with SystemExit and clear message
    - Test 5: AgentBase.run_turn aborts cleanly when lifecycle_state='paused' (writes agent_events action='paused_abort')
    - Test 6: AgentBase.run_turn proceeds normally when lifecycle_state='q2_high_confidence' (no abort)
    - Test 7: Predicate strings contain no `%` or `{}` format placeholders (static; no injection surface)
  </behavior>
  <action>
**File 1: `fee_crawler/commands/agent_graduate.py`**

Follow research §Mechanics 9 verbatim, adapted to fee_crawler's existing CLI style:

```python
"""agent-graduate CLI (D-22 + D-23).

python -m fee_crawler agent-graduate <agent_name> --to <state>

States: q1_validation | q2_high_confidence | q3_autonomy | paused

Named per-agent SQL predicates for forward transitions (q1->q2, q2->q3). Pausing
is always allowed (rollback per D-25). Predicates are fixed strings — no user input.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from typing import Optional

from fee_crawler.agent_tools.pool import get_pool

# Per-agent graduation predicates. Fixed strings (no format placeholders, no user
# interpolation — research Pitfall 6). Darwin/Atlas predicates land in Phases 64/65;
# knox is the canonical example per CONTEXT D-23.
PREDICATES: dict[tuple[str, str, str], str] = {
    ("knox", "q1_validation", "q2_high_confidence"): """
        SELECT COALESCE(
          (100.0 * SUM(CASE WHEN outlier_flags ? 'human_accepted' THEN 1 ELSE 0 END)
                 / NULLIF(COUNT(*), 0)) > 95,
          FALSE
        )
          FROM fees_raw
         WHERE source = 'knox' AND created_at > NOW() - INTERVAL '30 days'
    """,
    ("knox", "q2_high_confidence", "q3_autonomy"): """
        SELECT COALESCE(AVG(extraction_confidence) > 0.90, FALSE)
          FROM fees_raw
         WHERE source = 'knox' AND created_at > NOW() - INTERVAL '90 days'
    """,
}

ALLOWED_STATES = ("q1_validation", "q2_high_confidence", "q3_autonomy", "paused")


async def graduate(agent_name: str, to_state: str) -> int:
    """Execute the graduation check + state flip. Returns process exit code."""
    if to_state not in ALLOWED_STATES:
        print(f"error: --to must be one of {ALLOWED_STATES}", file=sys.stderr)
        return 2

    pool = await get_pool()
    async with pool.acquire() as conn:
        current = await conn.fetchval(
            "SELECT lifecycle_state FROM agent_registry WHERE agent_name = $1",
            agent_name,
        )
        if current is None:
            print(f"error: unknown agent: {agent_name}", file=sys.stderr)
            return 3

        # Pausing always allowed — D-25 rollback.
        if to_state == "paused":
            await conn.execute(
                "UPDATE agent_registry SET lifecycle_state = 'paused' WHERE agent_name = $1",
                agent_name,
            )
            print(f"graduated {agent_name}: {current} -> paused")
            return 0

        if current == to_state:
            print(f"noop: {agent_name} already in {to_state}")
            return 0

        predicate = PREDICATES.get((agent_name, current, to_state))
        if predicate is None:
            print(
                f"error: no graduation predicate registered for "
                f"({agent_name}, {current} -> {to_state}). Add entry to PREDICATES dict.",
                file=sys.stderr,
            )
            return 4

        passed = await conn.fetchval(predicate)
        if not passed:
            print(
                f"graduation FAILED: predicate for ({agent_name}, {current} -> {to_state}) "
                f"returned FALSE. State stays on {current}.",
                file=sys.stderr,
            )
            return 5

        await conn.execute(
            "UPDATE agent_registry SET lifecycle_state = $2 WHERE agent_name = $1",
            agent_name, to_state,
        )
        print(f"graduated {agent_name}: {current} -> {to_state}")
        return 0


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="agent-graduate", description=__doc__)
    ap.add_argument("agent_name")
    ap.add_argument("--to", required=True, choices=list(ALLOWED_STATES))
    args = ap.parse_args(argv)
    return asyncio.run(graduate(args.agent_name, args.to))


if __name__ == "__main__":
    raise SystemExit(main())
```

**File 2: `fee_crawler/agent_base/bootstrap.py`**

```python
"""Lifecycle-state branch helper (BOOT-01 D-22).

AgentBase.run_turn checks lifecycle_state at turn entry and picks the Q1/Q2/Q3/paused
behavior branch per research §Mechanics 8.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from fee_crawler.agent_tools.pool import get_pool

log = logging.getLogger(__name__)


class AgentPaused(RuntimeError):
    """Raised from AgentBase.run_turn when lifecycle_state='paused'."""


async def get_lifecycle_state(agent_name: str) -> Optional[str]:
    """Return the current lifecycle_state for agent_name, or None if unknown."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT lifecycle_state FROM agent_registry WHERE agent_name = $1",
            agent_name,
        )


async def write_paused_abort(agent_name: str) -> None:
    """Log a paused_abort event so /admin/agents Overview can see halted agents."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status, input_payload)
               VALUES ($1, 'paused_abort', '_agent_base', '_run_turn', 'success',
                       '{"reason":"lifecycle_state=paused"}'::JSONB)""",
            agent_name,
        )


def should_hold_for_human(lifecycle_state: Optional[str], confidence: Optional[float] = None) -> bool:
    """Q1 = hold every output; Q2 = hold confidence < 0.85; Q3 = no hold (quarterly sample handled elsewhere)."""
    if lifecycle_state == "q1_validation":
        return True
    if lifecycle_state == "q2_high_confidence":
        if confidence is None:
            return False  # unknown confidence → do not hold arbitrary outputs
        return confidence < 0.85
    return False
```

**File 3: `fee_crawler/agent_base/base.py` — EDIT**

Modify the existing `run_turn` to check lifecycle state BEFORE the subclass's body. Since `run_turn` is auto-wrapped, the check happens inside the wrapper:

Update `_wrap_with_context` to also check lifecycle_state on `run_turn` specifically:

```python
    @staticmethod
    def _wrap_with_context(fn):
        method_name = fn.__name__
        @functools.wraps(fn)
        async def wrapped(self, *args, **kwargs):
            # BOOT-01 (D-22): only run_turn honors lifecycle_state at entry.
            if method_name == "run_turn":
                from fee_crawler.agent_base.bootstrap import (
                    get_lifecycle_state, write_paused_abort, AgentPaused,
                )
                state = await get_lifecycle_state(self.agent_name)
                if state == "paused":
                    await write_paused_abort(self.agent_name)
                    raise AgentPaused(f"{self.agent_name} is paused; run_turn aborted")
            ctx = get_agent_context()
            with with_agent_context(
                agent_name=self.agent_name,
                correlation_id=ctx.get("correlation_id") if ctx else None,
                parent_event_id=ctx.get("parent_event_id") if ctx else None,
            ):
                return await fn(self, *args, **kwargs)
        return wrapped
```

Ensure this edit preserves all existing behavior for non-run_turn methods.

**File 4: `fee_crawler/__main__.py` — EDIT**

Add the `agent-graduate` subcommand. Read the existing dispatch pattern first; add a new branch:

```python
# inside existing main()
if args.command == "agent-graduate":
    from fee_crawler.commands.agent_graduate import main as agent_graduate_main
    # Forward remaining argv
    import sys
    return agent_graduate_main(sys.argv[2:])
```

Match the existing CLI dispatch style — do not restructure. If `__main__.py` uses `subparsers`, register it there.

**File 5: `fee_crawler/tests/test_agent_bootstrap.py`**

```python
import pytest
import uuid

from fee_crawler.agent_base import AgentBase
from fee_crawler.agent_base.bootstrap import (
    get_lifecycle_state, AgentPaused, should_hold_for_human,
)
from fee_crawler.commands.agent_graduate import graduate, PREDICATES


class _PausedAgent(AgentBase):
    agent_name = "knox"
    run_called = False
    async def run_turn(self):
        _PausedAgent.run_called = True
    async def review(self): pass


@pytest.mark.asyncio
async def test_graduate_to_paused_always_works(db_schema):
    schema, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute("UPDATE agent_registry SET lifecycle_state='q1_validation' WHERE agent_name='knox'")
    exit_code = await graduate("knox", "paused")
    assert exit_code == 0
    state = await get_lifecycle_state("knox")
    assert state == "paused"


@pytest.mark.asyncio
async def test_graduate_unknown_agent_exits_nonzero(db_schema):
    exit_code = await graduate("nonexistent_agent", "q2_high_confidence")
    assert exit_code != 0


@pytest.mark.asyncio
async def test_graduate_predicate_fail_does_not_change_state(db_schema):
    schema, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute("UPDATE agent_registry SET lifecycle_state='q1_validation' WHERE agent_name='knox'")
    # No fees_raw data → predicate returns FALSE
    exit_code = await graduate("knox", "q2_high_confidence")
    assert exit_code == 5
    state = await get_lifecycle_state("knox")
    assert state == "q1_validation"


@pytest.mark.asyncio
async def test_graduate_missing_predicate_errors(db_schema):
    schema, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute("UPDATE agent_registry SET lifecycle_state='q1_validation' WHERE agent_name='darwin'")
    # No predicate for (darwin, q1->q2) yet (added Phase 64)
    exit_code = await graduate("darwin", "q2_high_confidence")
    assert exit_code == 4


@pytest.mark.asyncio
async def test_paused_agent_run_turn_aborts(db_schema):
    schema, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute("UPDATE agent_registry SET lifecycle_state='paused' WHERE agent_name='knox'")
    _PausedAgent.run_called = False
    a = _PausedAgent()
    with pytest.raises(AgentPaused):
        await a.run_turn()
    assert _PausedAgent.run_called is False
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT action FROM agent_events WHERE agent_name='knox' AND action='paused_abort' ORDER BY created_at DESC LIMIT 1"
        )
    assert row is not None


@pytest.mark.asyncio
async def test_active_agent_run_turn_runs(db_schema):
    schema, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute("UPDATE agent_registry SET lifecycle_state='q2_high_confidence' WHERE agent_name='knox'")
    _PausedAgent.run_called = False
    a = _PausedAgent()
    await a.run_turn()
    assert _PausedAgent.run_called is True


def test_should_hold_for_human():
    assert should_hold_for_human("q1_validation") is True
    assert should_hold_for_human("q2_high_confidence", 0.80) is True
    assert should_hold_for_human("q2_high_confidence", 0.95) is False
    assert should_hold_for_human("q3_autonomy") is False
    assert should_hold_for_human("paused") is False


def test_predicates_are_fixed_strings():
    # D-23 + Pitfall 6 — no format placeholders, no dynamic interpolation
    for key, predicate in PREDICATES.items():
        assert "%s" not in predicate
        assert "{}" not in predicate
        assert "{0}" not in predicate
```
  </action>
  <verify>
    <automated>pytest fee_crawler/tests/test_agent_bootstrap.py -x -v</automated>
  </verify>
  <acceptance_criteria>
    - File `fee_crawler/commands/agent_graduate.py` exists with `PREDICATES` dict, `graduate()` async function, and `main()` argparse entry
    - `grep -n "PREDICATES = {\|PREDICATES: dict" fee_crawler/commands/agent_graduate.py` returns 1 match
    - `grep -n "%s\|{.*}" fee_crawler/commands/agent_graduate.py` returns 0 matches inside the PREDICATES values (static strings only)
    - File `fee_crawler/agent_base/bootstrap.py` exists with `get_lifecycle_state`, `AgentPaused`, `should_hold_for_human`
    - `grep -n "paused_abort" fee_crawler/agent_base/bootstrap.py` returns 1 match
    - `grep -n "agent-graduate\|agent_graduate" fee_crawler/__main__.py` returns at least 1 match (CLI wired)
    - `pytest fee_crawler/tests/test_agent_bootstrap.py -x -v` exits 0
    - `python -m fee_crawler agent-graduate --help` prints argparse usage (sanity check that CLI is wired)
  </acceptance_criteria>
  <done>CLI + lifecycle branch + 8 tests green; no format placeholders in predicates.</done>
</task>

<task type="auto">
  <name>Task 2: Exception digest CLI + runbook</name>
  <files>fee_crawler/commands/exception_digest.py, fee_crawler/__main__.py, .planning/runbooks/agent-bootstrap.md, fee_crawler/tests/test_exception_digest.py</files>
  <read_first>
    - fee_crawler/agent_messaging/escalation.py (list_escalated_threads function)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Mechanics 10 lines 1237-1244 (digest sources)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Mechanics 15 lines 1384-1396 (runbook template)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md D-25 (runbook location)
    - fee_crawler/commands/agent_graduate.py (just written — to link from runbook)
  </read_first>
  <action>
**File 1: `fee_crawler/commands/exception_digest.py`**

```python
"""Daily exception digest CLI (D-08 + D-11 + D-24).

python -m fee_crawler exception-digest [--hours 24] [--out path.md]

Emits a markdown digest listing, for the last N hours:
  1. improve_rejected events (D-08) — failed IMPROVE gates
  2. escalated agent_messages (D-11) — handshakes past 3 rounds or 24h
  3. q2 exception samples (D-24) — confidence < 0.85 + random 5%

Target: James reviews in under 20 minutes per day.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from fee_crawler.agent_tools.pool import get_pool
from fee_crawler.agent_messaging.escalation import list_escalated_threads


async def build_digest(since_hours: int = 24) -> str:
    """Return a markdown digest string."""
    pool = await get_pool()
    lines: list[str] = []
    lines.append(f"# Agent Exception Digest — {datetime.utcnow().isoformat(timespec='seconds')}Z")
    lines.append(f"_Window: last {since_hours}h · SLA: review within 48h_")
    lines.append("")

    # Section 1: improve_rejected
    async with pool.acquire() as conn:
        rejected = await conn.fetch(
            """SELECT event_id, agent_name, created_at, input_payload
                 FROM agent_events
                WHERE status = 'improve_rejected'
                  AND created_at > NOW() - make_interval(hours => $1)
                ORDER BY created_at DESC""",
            since_hours,
        )
    lines.append(f"## 1. Improve Rejected ({len(rejected)})")
    if not rejected:
        lines.append("_none_")
    for r in rejected[:50]:
        payload_snip = str(r["input_payload"])[:200]
        lines.append(f"- `{r['event_id']}` · {r['agent_name']} · {r['created_at'].isoformat()} — {payload_snip}")
    lines.append("")

    # Section 2: escalated agent_messages
    escalated = await list_escalated_threads(since_hours=since_hours)
    lines.append(f"## 2. Escalated Handshakes ({len(escalated)})")
    if not escalated:
        lines.append("_none_")
    for e in escalated[:50]:
        lines.append(
            f"- `{e['correlation_id']}` · {e['sender_agent']}→{e['recipient_agent']} "
            f"· round {e['round_number']} · {e['intent']} · {e['created_at'].isoformat()}"
        )
    lines.append("")

    # Section 3: q2 exception samples (confidence<0.85 OR random 5%)
    async with pool.acquire() as conn:
        q2_samples = await conn.fetch(
            """SELECT event_id, agent_name, tool_name, entity, confidence, created_at
                 FROM agent_events e
                 JOIN agent_registry r ON r.agent_name = e.agent_name
                WHERE r.lifecycle_state = 'q2_high_confidence'
                  AND e.status = 'success'
                  AND e.created_at > NOW() - make_interval(hours => $1)
                  AND (e.confidence IS NOT NULL AND e.confidence < 0.85 OR random() < 0.05)
                ORDER BY e.created_at DESC
                LIMIT 100""",
            since_hours,
        )
    lines.append(f"## 3. Q2 Exception Samples ({len(q2_samples)})")
    if not q2_samples:
        lines.append("_none_")
    for s in q2_samples:
        conf = f"{float(s['confidence']):.2f}" if s['confidence'] is not None else "n/a"
        lines.append(
            f"- `{s['event_id']}` · {s['agent_name']} · {s['tool_name']} → {s['entity']} "
            f"· conf={conf} · {s['created_at'].isoformat()}"
        )
    lines.append("")
    return "\n".join(lines)


async def run(since_hours: int, out_path: Optional[Path]) -> int:
    digest = await build_digest(since_hours)
    if out_path is None:
        sys.stdout.write(digest)
        sys.stdout.write("\n")
    else:
        out_path.write_text(digest)
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="exception-digest", description=__doc__)
    ap.add_argument("--hours", type=int, default=24)
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args(argv)
    return asyncio.run(run(args.hours, args.out))


if __name__ == "__main__":
    raise SystemExit(main())
```

**Edit 2: `fee_crawler/__main__.py` — EDIT** to wire the new subcommand alongside agent-graduate. Match existing style.

**File 3: `.planning/runbooks/agent-bootstrap.md`**

Write the runbook per research §Mechanics 15 template. Required sections:

```markdown
# Agent Bootstrap Runbook

Phase 62b BOOT-01 (D-25). Version-controlled operator reference for Q1/Q2/Q3
graduation, rollback, and exception review. SLA: James reviews daily digest
within 48 hours.

## 1. Overview

Every agent (Knox, Darwin, Atlas, 51 state agents) lives in one of four
lifecycle states, stored in `agent_registry.lifecycle_state`:

- `q1_validation` — every output held for human approval via daily digest
- `q2_high_confidence` — auto-commit outputs with confidence >= 0.85;
  everything below + random 5% sample go to digest
- `q3_autonomy` — fully autonomous with quarterly random sampling
- `paused` — AgentBase.run_turn aborts immediately

## 2. Lifecycle Semantics

AgentBase reads `lifecycle_state` at the top of `run_turn()`. Behavior:

- `q1_validation` → all outputs pending human review
- `q2_high_confidence` → auto-commit >= 0.85 confidence; else digest
- `q3_autonomy` → full auto; 5% sampled nightly
- `paused` → raises AgentPaused; writes `agent_events action='paused_abort'`

## 3. Graduation

CLI: `python -m fee_crawler agent-graduate <agent_name> --to <state>`

Predicates live in `fee_crawler/commands/agent_graduate.py` PREDICATES dict.
Fixed strings per (agent_name, from_state, to_state). **Do not interpolate
user input.** (research Pitfall 6)

Examples:
```
python -m fee_crawler agent-graduate knox --to q2_high_confidence
python -m fee_crawler agent-graduate darwin --to paused
```

Exit codes:
- 0 = graduated (or noop if already in target state)
- 2 = invalid --to value
- 3 = unknown agent
- 4 = no predicate registered for transition
- 5 = predicate failed

## 4. Rollback

Always allowed — no predicate:

```
python -m fee_crawler agent-graduate <agent_name> --to paused
```

Returns to autonomous operation by graduating back through q1/q2/q3 via the
normal CLI path.

## 5. Exception Review SLA

- James reviews daily digest within 48 hours (D-25).
- Digest sources (D-08, D-11, D-24):
  1. `agent_events` with `status='improve_rejected'` (failed IMPROVE gates)
  2. `agent_messages` with `state='escalated'` (past 3 rounds or 24h)
  3. Q2 samples: `agent_events` with confidence < 0.85 OR random 5%

Generate digest: `python -m fee_crawler exception-digest --hours 24`

## 6. Failure Modes

- Graduation predicate returns NULL → treat as failure (exit 5); agent stays.
- Predicate regression (metrics drop after graduation): operator manually
  `agent-graduate <name> --to paused`; investigate; re-graduate once healthy.
- `agent_registry` row missing → exit 3. Add via `agent_registry` seed migration.

## 7. SLAs per Loop Step

| Step | Target latency |
|------|----------------|
| LOG (tool call → agent_events) | < 100 ms |
| REVIEW (tick emitted → review() called) | < 15 minutes (SC1) |
| IMPROVE (lesson → canary verdict) | < 5 minutes |
| Escalation → digest | < 24 hours after 3rd unresolved round |

## 8. On-Call Flowchart

- `/admin/agents` Overview tile red (coverage drops) → check
  `agent_events WHERE action='error' AND agent_name=<x>` last hour.
- Listener not receiving messages → verify `DATABASE_URL_SESSION` set to
  port 5432; see research §Pitfall 2.
- Graduation predicate keeps failing → inspect predicate SQL; may need updating
  if schema drifted.
- `paused_abort` event spamming → another operator paused the agent; check
  `agent_registry.lifecycle_state`.
```

**File 4: `fee_crawler/tests/test_exception_digest.py`**

```python
import pytest
from fee_crawler.commands.exception_digest import build_digest


@pytest.mark.asyncio
async def test_empty_digest_has_all_three_sections(db_schema):
    d = await build_digest(since_hours=24)
    assert "## 1. Improve Rejected" in d
    assert "## 2. Escalated Handshakes" in d
    assert "## 3. Q2 Exception Samples" in d
    # Empty state renders "_none_"
    assert "_none_" in d


@pytest.mark.asyncio
async def test_digest_surfaces_improve_rejected(db_schema):
    schema, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status, input_payload)
               VALUES ('knox','improve','_agent_base','_improve','improve_rejected',
                       '{"reason":"canary_regression"}'::JSONB)"""
        )
    d = await build_digest(since_hours=24)
    assert "## 1. Improve Rejected (1" in d or "## 1. Improve Rejected" in d
    assert "knox" in d
    assert "canary_regression" in d


@pytest.mark.asyncio
async def test_digest_surfaces_escalated(db_schema):
    schema, pool = db_schema
    import uuid
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_messages
                 (sender_agent, recipient_agent, intent, correlation_id, payload, round_number, state)
               VALUES ('darwin','knox','challenge',$1::UUID,'{}'::JSONB,3,'escalated')""",
            str(uuid.uuid4()),
        )
    d = await build_digest(since_hours=24)
    assert "## 2. Escalated Handshakes" in d
    assert "darwin" in d or "knox" in d
```
  </action>
  <verify>
    <automated>pytest fee_crawler/tests/test_exception_digest.py -x -v</automated>
  </verify>
  <acceptance_criteria>
    - File `fee_crawler/commands/exception_digest.py` exists with `build_digest`, `run`, `main`
    - File `.planning/runbooks/agent-bootstrap.md` exists containing sections "## 1. Overview", "## 2. Lifecycle Semantics", "## 3. Graduation", "## 4. Rollback", "## 5. Exception Review SLA", "## 6. Failure Modes", "## 7. SLAs", "## 8. On-Call"
    - Runbook mentions "48 hours" SLA and `python -m fee_crawler agent-graduate` command
    - `grep -n "exception-digest" fee_crawler/__main__.py` returns at least 1 match
    - `pytest fee_crawler/tests/test_exception_digest.py -x -v` exits 0
    - `python -m fee_crawler exception-digest --help` prints argparse usage
  </acceptance_criteria>
  <done>Digest CLI + runbook + 3 tests green; CLI dispatch works end-to-end.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Exercise the Q1→Q2 graduation flow against a real predicate pass</name>
  <what-built>
`agent-graduate` CLI + `exception-digest` CLI + runbook. SC5 from ROADMAP: "a developer can read the runbook and advance an agent from Q1 to Q2 by meeting a named, measurable graduation bar."
  </what-built>
  <how-to-verify>
    1. Read `.planning/runbooks/agent-bootstrap.md` — confirm it is readable and all 8 sections present.
    2. Run `python -m fee_crawler agent-graduate knox --to paused` against local DB — confirm exit 0 and DB state flips.
    3. Run `python -m fee_crawler agent-graduate knox --to q1_validation` — confirm state flips back (via the noop path or via paused→q1 which is untyped — if predicate missing, exit 4 is acceptable. Document.).
    4. Run `python -m fee_crawler exception-digest` — confirm 3-section markdown prints to stdout.
    5. Attempt `python -m fee_crawler agent-graduate knox --to q2_high_confidence` without seeded data — confirm exit 5 AND state unchanged.
    6. Confirm the runbook's "48 hours" SLA language is prominent under §5.
  </how-to-verify>
  <resume-signal>Type "approved" if all 6 steps succeed. Describe which step failed otherwise.</resume-signal>
  <action>Checkpoint task — see <how-to-verify> or <context> for operator steps. Execution is manual; no autonomous action required.</action>
  <verify>
    <automated>echo 'checkpoint: human sign-off required per resume-signal'</automated>
  </verify>
  <done>Operator types the resume-signal string (e.g., 'approved') to unblock.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Operator CLI → UPDATE agent_registry | requires DATABASE_URL; asyncpg parameterized |
| predicate SQL execution | fixed strings; no user input; service-role |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-62B-11-01 | Tampering | SQL injection via agent_name in predicate | mitigate | Per research Pitfall 6: PREDICATES keyed on (agent_name, from, to) tuple; predicate value is a FIXED string with no interpolation. `agent_name` passes into `conn.fetchval(predicate)` WITHOUT composing it into the SQL text. Test `test_predicates_are_fixed_strings` asserts no `%s`/`{}` placeholders. |
| T-62B-11-02 | Elevation of Privilege | Any user runs agent-graduate | mitigate | CLI requires DATABASE_URL (service-role credentials). Shell access to the host IS the auth. SEC-04 (Phase 68) later adds dedicated Postgres role. Documented in runbook §6. |
| T-62B-11-03 | Repudiation | Graduation flip without audit | mitigate | CLI writes success/failure to stdout + exit codes; every paused agent writes `agent_events action='paused_abort'`. Successful graduation currently UPDATEs only — add a complementary agent_events row in follow-up (tracked in summary). |
| T-62B-11-04 | Information Disclosure | Digest exposes fee-level data | accept | Admin-only consumer; output is markdown or stdout to operator shell; not published externally. |
</threat_model>

<verification>
- All 8 bootstrap tests pass
- All 3 digest tests pass
- Manual CLI exercises complete
- Runbook present with all sections
</verification>

<success_criteria>
- [ ] agent-graduate CLI works + respects predicate
- [ ] Paused agent run_turn aborts
- [ ] Exception digest lists all 3 sources
- [ ] Runbook at .planning/runbooks/agent-bootstrap.md with 8 sections
- [ ] SC5 reachable: operator can graduate Knox Q1→Q2 with real fees_raw data
</success_criteria>

<output>
After completion, create `.planning/phases/62B-agent-foundation-runtime-layer/62B-11-SUMMARY.md` documenting: the PREDICATES dict structure, the lifecycle branch integration with AgentBase._wrap_with_context, any follow-up items (e.g., agent_events row on successful graduation).
</output>
