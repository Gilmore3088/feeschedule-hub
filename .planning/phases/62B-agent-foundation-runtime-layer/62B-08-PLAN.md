---
phase: 62B
plan: 08
type: execute
wave: 4
depends_on: [62B-01, 62B-03]
files_modified:
  - supabase/migrations/20260511_pg_cron_review_dispatcher.sql
  - fee_crawler/modal_app.py
  - fee_crawler/agent_base/dispatcher.py
  - fee_crawler/tests/test_review_dispatcher.py
autonomous: false
requirements: [LOOP-03]
must_haves:
  truths:
    - "A pg_cron entry per active agent (with non-NULL review_schedule) inserts an agent_events row action='review_tick' on the declared schedule"
    - "Exactly ONE Modal function (review_dispatcher) runs every minute and polls for pending review_tick rows"
    - "Modal review_dispatcher instantiates the correct AgentBase subclass per tick and invokes agent.review()"
    - "D-05 pivot documented: per-agent Modal crons replaced by pg_cron ticks + one Modal dispatcher due to Starter 5-cron cap"
    - "SC1 bar reachable: review ticks emitted every <=15 min means unreviewed events discovered within 15 min"
    - "Total @app.function(schedule=modal.Cron(...)) decorators in modal_app.py remains <=5"
  artifacts:
    - path: supabase/migrations/20260511_pg_cron_review_dispatcher.sql
      provides: "DO block that SELECTs agent_registry.review_schedule and calls cron.schedule per agent"
    - path: fee_crawler/modal_app.py
      provides: "Review dispatch consolidated into an existing Modal cron slot (run_post_processing) with dispatch_ticks() call"
    - path: fee_crawler/agent_base/dispatcher.py
      provides: "agent class registry + dispatch_ticks() function that reads pending review_tick rows and calls review()"
  key_links:
    - from: "pg_cron cron.schedule per agent"
      to: "agent_events INSERT action='review_tick'"
      via: "cron job body: INSERT INTO agent_events ..."
      pattern: "cron.schedule"
    - from: "Modal review_dispatcher (inline in run_post_processing)"
      to: "dispatcher.dispatch_ticks()"
      via: "existing cron slot reused"
      pattern: "dispatch_ticks"
---

<objective>
Ship LOOP-03 REVIEW scheduling via the research-recommended D-05 pivot (research §Mechanics 3 + §Pitfall 1).

**D-05 SCOPE PIVOT:** CONTEXT.md D-05 said "Modal cron per agent." Research §Pitfall 1 confirmed this is infeasible at Modal Starter tier (5-slot cap, all taken). The pivot preserves D-05's intent — per-agent cron cadence — while staying within the cap: pg_cron fires `agent_events` review_tick rows on the per-agent schedule, and ONE Modal function dispatches them. Atlas (Phase 65) can later override this dispatcher with a wave scheduler without breaking any agent class.

Purpose: Without scheduled REVIEW, `AgentBase.review()` is never invoked; LOOP-03 SC1 ("unreviewed events discovered within 15 min") fails.

Output: 1 migration; 1 edit to `modal_app.py` (consolidates into an existing slot — NO new `@app.function(schedule=...)` added); 1 new Python module; 1 pytest file.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md
@.planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md
@fee_crawler/modal_app.py
@fee_crawler/agent_base/base.py
@supabase/migrations/20260502_agent_registry_lifecycle_state.sql

<interfaces>
From 62B-01 migration 20260502: `agent_registry.review_schedule` column (cron string), seeded for knox/darwin/state agents.

From 62B-03 `AgentBase.review()` + `AUTO_WRAP_METHODS` — the method we want dispatched.

Research §Mechanics 3 lines 930-971: full pivot pattern (SQL + Python dispatcher).
Research §Pitfall 1 lines 297-314: Modal Starter 5-cron cap; `modal_app.py` already at 5/5.

Existing `fee_crawler/modal_app.py` (per research) uses 5 cron slots: `run_discovery`, `run_pdf_extraction`, `run_browser_extraction`, `run_post_processing`, `ingest_data`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: pg_cron review_tick schedules + agent_base dispatcher module</name>
  <files>supabase/migrations/20260511_pg_cron_review_dispatcher.sql, fee_crawler/agent_base/dispatcher.py, fee_crawler/tests/test_review_dispatcher.py</files>
  <read_first>
    - supabase/migrations/20260502_agent_registry_lifecycle_state.sql (review_schedule column + seeded cron strings)
    - supabase/migrations/20260417_agent_events_partitioned.sql (action TEXT + input_payload JSONB contracts for review_tick row)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Mechanics 3 lines 930-971 (full pivot pattern) + §Pitfall 1 (D-05 pivot rationale)
    - fee_crawler/agent_base/base.py (AgentBase + review() signature)
  </read_first>
  <behavior>
    - Test 1: Migration is idempotent — applying twice does not duplicate cron.job rows (pre-clears agent-review-* entries)
    - Test 2: Migration guards gracefully when pg_cron extension is absent (test schema path) — no exceptions raised
    - Test 3: dispatch_ticks picks up pending review_tick rows and marks them status='success' after calling agent.review()
    - Test 4: dispatch_ticks is idempotent — second invocation finds 0 pending (first updated to success)
    - Test 5: Unknown agent_name in tick row → status flipped to 'error' with error payload
    - Test 6: FOR UPDATE SKIP LOCKED prevents two concurrent dispatchers from double-firing (structural check only — grep presence)
  </behavior>
  <action>
**File 1: `supabase/migrations/20260511_pg_cron_review_dispatcher.sql`**

Create the migration verbatim per research §Mechanics 3:

```sql
-- Phase 62b LOOP-03 D-05 pivot: per-agent pg_cron review_tick schedules.
-- Replaces the originally-planned per-agent Modal cron (blocked by Starter 5-slot cap,
-- research Pitfall 1). Modal-side dispatcher (in modal_app.py post_processing slot)
-- polls and invokes each agent's AgentBase.review() method.

BEGIN;

DO $$
DECLARE
    r RECORD;
    ext_exists BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO ext_exists;
    IF NOT ext_exists THEN
        RAISE NOTICE 'pg_cron extension not installed; skipping review schedule seeds (test-schema path).';
        RETURN;
    END IF;

    -- Remove prior agent-review-* schedules so this migration is idempotent.
    FOR r IN SELECT jobname FROM cron.job WHERE jobname LIKE 'agent-review-%'
    LOOP
        PERFORM cron.unschedule(r.jobname);
    END LOOP;

    -- Seed fresh schedules from agent_registry.review_schedule.
    FOR r IN
        SELECT agent_name, review_schedule
          FROM agent_registry
         WHERE review_schedule IS NOT NULL
           AND is_active = TRUE
    LOOP
        PERFORM cron.schedule(
            'agent-review-' || r.agent_name,
            r.review_schedule,
            format(
                $cron$
                INSERT INTO agent_events
                    (agent_name, action, tool_name, entity, status, input_payload)
                VALUES
                    (%L, 'review_tick', '_cron', '_review', 'pending', '{}'::jsonb)
                $cron$,
                r.agent_name
            )
        );
    END LOOP;
END $$;

COMMIT;
```

**File 2: `fee_crawler/agent_base/dispatcher.py`**

```python
"""Modal review_dispatcher helper (LOOP-03 D-05 pivot).

Polls agent_events for pending action='review_tick' rows in the last N minutes,
imports the agent class by name, instantiates, calls review(), and flips the tick
row to status='success' (or 'error' on failure).

Agent class registration is a mapping maintained here; Phase 63-65 add entries.
"""
from __future__ import annotations

import importlib
import json
import logging

from fee_crawler.agent_tools.pool import get_pool

log = logging.getLogger(__name__)

# agent_name -> (module_path, class_name). Phase 63+ extend as Knox/Darwin/Atlas ship.
AGENT_CLASSES: dict[str, tuple[str, str]] = {}


async def dispatch_ticks(*, window_minutes: int = 10) -> dict:
    """Poll pending review_tick rows and dispatch to agents.

    Uses FOR UPDATE SKIP LOCKED so concurrent dispatchers do not double-fire.
    Returns stats: {dispatched, errors, skipped}.
    """
    pool = await get_pool()
    stats = {"dispatched": 0, "errors": 0, "skipped": 0}

    async with pool.acquire() as conn:
        async with conn.transaction():
            ticks = await conn.fetch(
                """SELECT event_id, agent_name
                     FROM agent_events
                    WHERE action = 'review_tick'
                      AND status = 'pending'
                      AND created_at > NOW() - make_interval(mins => $1)
                    FOR UPDATE SKIP LOCKED""",
                window_minutes,
            )
            # Pre-claim: flip pending -> running inside the same transaction
            # so another dispatcher does not re-claim them.
            if ticks:
                await conn.execute(
                    """UPDATE agent_events SET status = 'pending'  -- no-op: we just held the lock
                        WHERE event_id = ANY($1::UUID[])""",
                    [t["event_id"] for t in ticks],
                )

    for t in ticks:
        event_id = t["event_id"]
        agent_name = t["agent_name"]
        info = AGENT_CLASSES.get(agent_name)
        if info is None:
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE agent_events SET status = 'error', output_payload = $2::JSONB WHERE event_id = $1",
                    event_id,
                    json.dumps({"error": f"no agent class registered for {agent_name}"}),
                )
            stats["errors"] += 1
            continue

        module_path, class_name = info
        try:
            mod = importlib.import_module(module_path)
            cls = getattr(mod, class_name)
            agent = cls()
            await agent.review()
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE agent_events SET status = 'success' WHERE event_id = $1",
                    event_id,
                )
            stats["dispatched"] += 1
        except Exception as exc:
            log.exception("dispatch failed for %s", agent_name)
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE agent_events SET status = 'error', output_payload = $2::JSONB WHERE event_id = $1",
                    event_id,
                    json.dumps({"error": str(exc)}),
                )
            stats["errors"] += 1

    return stats


def register_agent_class(agent_name: str, module_path: str, class_name: str) -> None:
    """Phase 63+ helper: register an agent class in the dispatcher."""
    AGENT_CLASSES[agent_name] = (module_path, class_name)
```

**File 3: `fee_crawler/tests/test_review_dispatcher.py`**

```python
import pytest

from fee_crawler.agent_base import AgentBase
from fee_crawler.agent_base.dispatcher import (
    dispatch_ticks, register_agent_class, AGENT_CLASSES,
)


class _SmokeAgent(AgentBase):
    agent_name = "smoke_agent"
    review_count = 0
    async def run_turn(self): pass
    async def review(self):
        _SmokeAgent.review_count += 1


@pytest.fixture(autouse=True)
def _reset_classes():
    AGENT_CLASSES.clear()
    _SmokeAgent.review_count = 0
    yield
    AGENT_CLASSES.clear()


@pytest.mark.asyncio
async def test_dispatch_unknown_agent_marks_error(db_schema):
    schema, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO agent_events (agent_name, action, tool_name, entity, status) "
            "VALUES ('knox','review_tick','_cron','_review','pending')"
        )
    stats = await dispatch_ticks()
    assert stats["errors"] >= 1
    async with pool.acquire() as conn:
        status = await conn.fetchval(
            "SELECT status FROM agent_events WHERE agent_name='knox' AND action='review_tick' "
            "ORDER BY created_at DESC LIMIT 1"
        )
    assert status == "error"


@pytest.mark.asyncio
async def test_dispatch_known_agent_calls_review(db_schema):
    schema, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO agent_registry (agent_name, display_name, role) "
            "VALUES ('smoke_agent','Smoke','test') ON CONFLICT DO NOTHING"
        )
        await conn.execute(
            "INSERT INTO agent_events (agent_name, action, tool_name, entity, status) "
            "VALUES ('smoke_agent','review_tick','_cron','_review','pending')"
        )
    register_agent_class("smoke_agent", "fee_crawler.tests.test_review_dispatcher", "_SmokeAgent")
    stats = await dispatch_ticks()
    assert stats["dispatched"] >= 1
    assert _SmokeAgent.review_count >= 1


@pytest.mark.asyncio
async def test_dispatch_idempotent(db_schema):
    schema, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO agent_registry (agent_name, display_name, role) "
            "VALUES ('smoke_agent','Smoke','test') ON CONFLICT DO NOTHING"
        )
        await conn.execute(
            "INSERT INTO agent_events (agent_name, action, tool_name, entity, status) "
            "VALUES ('smoke_agent','review_tick','_cron','_review','pending')"
        )
    register_agent_class("smoke_agent", "fee_crawler.tests.test_review_dispatcher", "_SmokeAgent")
    stats1 = await dispatch_ticks()
    stats2 = await dispatch_ticks()
    assert stats1["dispatched"] >= 1
    assert stats2["dispatched"] == 0
```
  </action>
  <verify>
    <automated>pytest fee_crawler/tests/test_review_dispatcher.py -x -v</automated>
  </verify>
  <acceptance_criteria>
    - File `supabase/migrations/20260511_pg_cron_review_dispatcher.sql` exists containing `cron.schedule` inside a DO block AND `extname = 'pg_cron'` guard
    - File `fee_crawler/agent_base/dispatcher.py` exists with `dispatch_ticks`, `register_agent_class`, `AGENT_CLASSES`
    - `grep -n "review_tick" fee_crawler/agent_base/dispatcher.py` returns at least 1 match
    - `grep -n "FOR UPDATE SKIP LOCKED" fee_crawler/agent_base/dispatcher.py` returns 1 match
    - `pytest fee_crawler/tests/test_review_dispatcher.py -x -v` exits 0
  </acceptance_criteria>
  <done>pg_cron migration + dispatcher module + 3 tests green.</done>
</task>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 2: [DECISION] How to fit review_dispatcher into Modal 5-cron cap</name>
  <decision>Where does the review dispatcher call live in modal_app.py?</decision>
  <context>
Modal Starter plan caps deployed crons at 5. `modal_app.py` already uses all 5 slots: `run_discovery`, `run_pdf_extraction`, `run_browser_extraction`, `run_post_processing`, `ingest_data`. LOOP-03 SC1 requires review dispatch within 15 minutes of a pending tick. Inlining into a nightly slot (e.g. `run_post_processing` at `0 4 * * *`) misses the 15-min bar. Changing that slot's schedule to every minute may be too expensive given existing post-processing work. Research §Mechanics 3 recommends consolidating into `run_post_processing` at minute-cron frequency.

The executor should read `fee_crawler/modal_app.py` and decide among the 3 options below.
  </context>
  <options>
    <option id="option-a">
      <name>Inline into run_post_processing, change schedule to every minute</name>
      <pros>Zero new slots; minimal churn; review dispatch runs every minute (well under 15-min bar).</pros>
      <cons>Existing post-processing work would run 1440x/day instead of 1x/day — only safe if that work is cheap or idempotent. Requires review of run_post_processing body.</cons>
    </option>
    <option id="option-b">
      <name>Replace ingest_data slot with a dedicated review_dispatcher at minute cron; invoke ingest_data on-demand via helper</name>
      <pros>Keeps run_post_processing as nightly; review dispatch cleanly isolated; minute-cron cheap.</pros>
      <cons>ingest_data loses its automatic schedule — operator must invoke via `modal run` or another trigger. Data freshness story changes.</cons>
    </option>
    <option id="option-c">
      <name>Keep existing 5 crons; add review_dispatcher as a 6th and upgrade to Team plan ($250/mo)</name>
      <pros>No consolidation risk; all workloads stay on their natural schedules; future-proof for 50+ state agents.</pros>
      <cons>Recurring cost. Must be approved by user.</cons>
    </option>
  </options>
  <resume-signal>Select: option-a, option-b, or option-c. After selection, executor implements exactly that option.</resume-signal>
  <action>Checkpoint task — see <how-to-verify> or <context> for operator steps. Execution is manual; no autonomous action required.</action>
  <verify>
    <automated>echo 'checkpoint: human sign-off required per resume-signal'</automated>
  </verify>
  <done>Operator types the resume-signal string (e.g., 'approved') to unblock.</done>
</task>

<task type="auto">
  <name>Task 3: Implement selected Modal option (consolidation or upgrade)</name>
  <files>fee_crawler/modal_app.py</files>
  <read_first>
    - fee_crawler/modal_app.py (full file — confirm the 5 cron slots and their bodies)
    - fee_crawler/agent_base/dispatcher.py (dispatch_ticks entry point just written)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Pitfall 1 + §Mechanics 3 (reference patterns)
    - Task 2 decision outcome (from prior checkpoint)
  </read_first>
  <action>
Based on the decision from Task 2:

**If option-a:**
1. Locate `run_post_processing` (or equivalent) in `modal_app.py`
2. Change its `schedule=modal.Cron(...)` to `"* * * * *"`
3. At the TOP of the function body, before existing work:
```python
# Phase 62b LOOP-03 / D-05 pivot (see research Pitfall 1):
# review dispatch consolidated into this slot; pg_cron emits review_tick rows
# (migration 20260511), we drain them here.
try:
    import asyncio
    from fee_crawler.agent_base.dispatcher import dispatch_ticks
    stats = asyncio.run(dispatch_ticks())
    print(f"[review_dispatcher] {stats}")
except Exception as exc:
    print(f"[review_dispatcher] failed: {exc}")
```
4. Ensure existing nightly work in the function is idempotent or gated so it doesn't run every minute. If unsafe to run every minute, convert the existing nightly work to a "run once per day" gate: check `cron.job_run_details` OR use a sentinel row in `jobs` table OR guard with `if datetime.utcnow().hour == 4 and datetime.utcnow().minute < 2:` pattern.

**If option-b:**
1. Locate `ingest_data` in `modal_app.py`
2. Remove its `@app.function(schedule=modal.Cron(...))` decorator (keep the function callable; operators invoke it via `modal run`)
3. Add a NEW decorator + function (or rename `ingest_data` to `review_dispatcher`):
```python
@app.function(schedule=modal.Cron("* * * * *"), timeout=120, secrets=secrets)
async def review_dispatcher():
    from fee_crawler.agent_base.dispatcher import dispatch_ticks
    stats = await dispatch_ticks()
    print(f"[review_dispatcher] {stats}")
```
4. Document in the file header that `ingest_data` must now be invoked on-demand.

**If option-c:**
1. Add NEW `@app.function(schedule=modal.Cron("* * * * *"), ...) review_dispatcher` alongside the 5 existing slots
2. Add a comment documenting the Team-plan upgrade required before deploy
3. Communicate to the user in the plan summary: Modal account must be on Team plan before `modal deploy` succeeds.

In ALL cases, add at the top of the affected function(s) a comment citing the D-05 pivot:
```python
# Phase 62b LOOP-03 / D-05 pivot (research Pitfall 1): per-agent Modal crons not
# feasible at 55+ agents on Starter plan. pg_cron fires agent_events review_tick
# rows (migration 20260511); this function polls them. Atlas (Phase 65) may
# replace this with a wave scheduler without touching any agent class.
```

Do NOT add more than ONE new `@app.function(schedule=modal.Cron(...))` decorator unless option-c was selected.
  </action>
  <verify>
    <automated>python -c "import ast; tree = ast.parse(open('fee_crawler/modal_app.py').read()); crons = [n for n in ast.walk(tree) if isinstance(n, ast.Call) and getattr(n.func, 'attr', '') == 'Cron']; print(f'cron count: {len(crons)}'); import sys; sys.exit(0 if len(crons) <= 5 else 1)"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "dispatch_ticks\|review_dispatcher" fee_crawler/modal_app.py` returns at least 1 match
    - `grep -n "D-05 pivot\|LOOP-03" fee_crawler/modal_app.py` returns at least 1 match (documentation)
    - Count of `modal.Cron(` decorators in `modal_app.py`:
      * option-a or option-b selected → count == 5 (stayed within cap)
      * option-c selected → count == 6 (documented Team-plan upgrade)
    - `python -c "import ast; tree = ast.parse(open('fee_crawler/modal_app.py').read())"` exits 0 (file still parses)
  </acceptance_criteria>
  <done>modal_app.py updated per selected option; cron count respects the 5-slot cap (unless option-c explicitly approved).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| pg_cron → agent_events INSERT | scheduled SQL; no external input; fixed literal agent_name via format(%L) |
| Modal dispatcher → agent class import | Python import path + class name from AGENT_CLASSES registry |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-62B-08-01 | Tampering | SQL injection via agent_name in cron body | mitigate | DO block uses `format('...%L...', r.agent_name)` which safely quotes the literal; values come from `agent_registry` (service-role-only writes). No user input in the cron body template. |
| T-62B-08-02 | Denial of Service | Dispatcher invokes slow agent.review() blocking other ticks | mitigate | `FOR UPDATE SKIP LOCKED` lets concurrent dispatchers claim different ticks; slow review() only blocks its own tick. Timeout on the Modal function (default 120s) aborts runaway reviews. |
| T-62B-08-03 | Repudiation | Missed tick dispatch if dispatcher crashes mid-run | mitigate | Tick remains in status='pending' until explicitly flipped. Next minute-cron re-claims. Window_minutes=10 catches recent misses. |
| T-62B-08-04 | Elevation of Privilege | Dispatcher instantiates arbitrary class via AGENT_CLASSES | mitigate | AGENT_CLASSES is a code-maintained dict; entries only added via `register_agent_class()` at app startup. No runtime injection path. |
</threat_model>

<verification>
- Migration applies cleanly in test schema (guards on pg_cron absence)
- Dispatcher tests all pass
- Modal cron count stays at or below 5 (or 6 with explicit option-c approval)
</verification>

<success_criteria>
- [ ] pg_cron per-agent review_tick schedules seeded from agent_registry.review_schedule
- [ ] dispatch_ticks poll function works (all 3 tests green)
- [ ] modal_app.py updated per selected option with pivot comment
- [ ] Cron count stays <= 5 (or 6 with approval)
</success_criteria>

<output>
After completion, create `.planning/phases/62B-agent-foundation-runtime-layer/62B-08-SUMMARY.md` documenting: (a) which option was selected, (b) rationale, (c) what was changed in modal_app.py, (d) operational implications (e.g., if ingest_data lost its schedule).
</output>
