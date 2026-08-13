---
phase: 62A-agent-foundation-data-layer
plan: 05
subsystem: infra
tags: [asyncpg, pydantic, postgres, supabase, audit, agent-gateway, codegen, typescript]

# Dependency graph
requires:
  - phase: 62A-01
    provides: Postgres docker-compose + pytest db_schema fixture + xfail test stubs
  - phase: 62A-02
    provides: agent_events + agent_auth_log partitioned migrations
  - phase: 62A-03
    provides: fees_raw / fees_verified / fees_published tier tables
  - phase: 62A-04
    provides: agent_registry + agent_budgets (with knox/darwin/hamilton/atlas + 51 state agent seeds) + agent_messages + institution_dossiers
provides:
  - with_agent_tool async context manager — the sole sanctioned write path for every Plans 62A-09..12 CRUD tool
  - asyncpg pool singleton with Supabase transaction-pooler-compatible config (statement_cache_size=0)
  - Pydantic schemas package skeleton (schemas/_base.py + schemas/__init__.py) ready for disjoint per-domain modules
  - @agent_tool decorator + TOOL_REGISTRY dict used by Plans 62A-09..13 for registration and coverage
  - Budget enforcement with env-var override + budget_halt event emission + BudgetExceeded exception
  - pydantic2ts codegen pipeline (scripts/gen-agent-tool-types.sh) + src/lib/agent-tools barrel
affects:
  - 62A-06 (tier promotion — optionally uses the gateway inside Darwin SQL-callable wrapper)
  - 62A-07 (fee CRUD tools — registers tools via @agent_tool, wraps writes in with_agent_tool)
  - 62A-08 (crawl CRUD tools — same)
  - 62A-09 (Hamilton CRUD tools — same)
  - 62A-10 (peer-research + agent-infra CRUD tools — same)
  - 62A-11 (legacy fee_reviews + admin action bridging — rewraps existing server actions through the gateway)
  - 62A-12 (SQLite removal + fee_crawler.db rewrite — consumes the same asyncpg pool)
  - 62A-13 (MCP server + SC coverage tests — imports TOOL_REGISTRY for read tool surface)

# Tech tracking
tech-stack:
  added:
    - asyncpg (pool singleton pattern for Modal + Supavisor)
    - pydantic-to-typescript (CLI codegen, Python → TS)
    - Pydantic v2 (source of truth for tool schemas)
  patterns:
    - "Gateway = single transactional wrapper around agent_events + target write + agent_auth_log + budget accounting"
    - "Schemas as a Python package (one module per domain) so parallel plans write disjoint files"
    - "ContextVar-backed agent_context to propagate correlation_id/cost_cents without threading parameters"
    - "pool injection via kwarg (pool=...) so per-test schema fixtures bypass the module singleton"

key-files:
  created:
    - fee_crawler/agent_tools/__init__.py
    - fee_crawler/agent_tools/pool.py
    - fee_crawler/agent_tools/schemas/__init__.py
    - fee_crawler/agent_tools/schemas/_base.py
    - fee_crawler/agent_tools/registry.py
    - fee_crawler/agent_tools/context.py
    - fee_crawler/agent_tools/budget.py
    - fee_crawler/agent_tools/gateway.py
    - scripts/gen-agent-tool-types.sh
    - src/lib/agent-tools/index.ts
    - src/lib/agent-tools/types.generated.ts
  modified:
    - fee_crawler/tests/test_agent_gateway.py
    - fee_crawler/tests/test_agent_auth_log.py
    - fee_crawler/tests/test_sc5_budget_halt.py

key-decisions:
  - "Schemas ship as a Python package (schemas/_base.py + schemas/__init__.py) so Plans 62A-07..10 each drop a disjoint per-domain module — zero shared-file writes during Wave 2 parallel execution."
  - "Gateway takes an optional pool= kwarg so the per-test db_schema fixture can bypass the module singleton; production callers leave it unset and get the asyncpg pool via get_pool()."
  - "Budget enforcement reads env override (ATLAS_AGENT_BUDGET_<AGENT>_CENTS) first, then agent_budgets row (tightest window). On breach the gateway INSERTs a budget_halt agent_events row and flips agent_budgets.halted_at in the same transaction before raising BudgetExceeded."
  - "reasoning_hash is server-computed inside the gateway (sha256(prompt \\x1f output)); callers cannot supply it — mitigates T-62A05-02 and T-62A05-03."
  - "Per D-12, input_payload/output_payload are truncated to a 64KB JSON pointer ({oversize, size, sha256, r2_key: null}) before insert; 62b compactor fills r2_key."
  - "_dumps_or_none wraps every JSONB binding to avoid dependence on the per-connection codec (tests that bootstrap via a raw asyncpg.connect don't run init hooks)."
  - "pydantic2ts codegen pipeline lives in scripts/gen-agent-tool-types.sh; CHECK_MODE=1 flips it to CI validation. Plan 62A-05 ships the four shared base types only; per-domain types arrive after Plans 07..10 add their schema modules and the script is rerun."

patterns-established:
  - "with_agent_tool(*, tool_name, entity, entity_id, action, agent_name, reasoning_prompt, reasoning_output, input_payload, pool=None): every write CRUD tool in Plans 62A-09..12 uses this exact shape."
  - "Pool injection pattern: fee_crawler/agent_tools/pool.py exposes get_pool() singleton + open_pool_from_dsn(dsn, server_settings=...) for per-schema tests."
  - "Budget halt event shape: agent_events row with action='budget_halt', tool_name='_gateway', entity='_budget', status='budget_halt', input_payload={spent, limit, source}."
  - "Tool registry decorator: @agent_tool(name, entity, action, input_schema=None, output_schema=None, description='') — populates TOOL_REGISTRY with ToolMeta dataclass."

requirements-completed: [AGENT-02, AGENT-04]

# Metrics
duration: 42min
completed: 2026-04-16
---

# Phase 62A Plan 05: Agent-Tool Gateway Summary

**Transactional agent-tool gateway (`with_agent_tool`) with budget halt + pydantic2ts codegen — the single sanctioned write path for every downstream CRUD tool in Plans 62A-09..12.**

## Performance

- **Duration:** ~42 min
- **Started:** 2026-04-16T16:25:00Z
- **Completed:** 2026-04-16T17:07:00Z
- **Tasks:** 3
- **Files created:** 11
- **Files modified:** 3

## Accomplishments

- `with_agent_tool` async context manager: single transaction that (1) validates agent_registry + is_active, (2) runs the budget check with env-override-first hierarchy, (3) inserts the pending `agent_events` row, (4) snapshots `before_value` for UPDATE/DELETE, (5) yields `(conn, event_id)` to the caller for the target-table write, (6) snapshots `after_value`, (7) inserts `agent_auth_log`, (8) flips `agent_events.status='success'` with cost, (9) accounts the spend on `agent_budgets`. Exception anywhere in steps 1–9 rolls the whole tx back — no partial audit state.
- Budget enforcement respects the `ATLAS_AGENT_BUDGET_<AGENT>_CENTS` env-var kill-switch ahead of the `agent_budgets` row. Breach writes a `budget_halt` event + sets `halted_at` on the budget row + raises `BudgetExceeded` with `{agent_name, spent, limit, source}` — all inside the same transaction.
- Pydantic schemas package ships as a directory (`schemas/_base.py` + conditional re-exports in `schemas/__init__.py`), so Plans 62A-07..10 can each own a disjoint per-domain file (`fees.py`, `crawl.py`, `hamilton.py`, `peer_research.py`, `agent_infra.py`) without touching shared code.
- `@agent_tool(...)` decorator + `TOOL_REGISTRY` module-level dict provide the registration surface Plan 62A-13's coverage test and MCP read-tool export depend on.
- `pool.open_pool_from_dsn(dsn, server_settings=...)` helper lets the per-test `db_schema` fixture route gateway traffic to an isolated schema without touching the module singleton.
- `scripts/gen-agent-tool-types.sh` + `src/lib/agent-tools/{index,types.generated}.ts` stand up the Python → TypeScript codegen pipeline; CHECK_MODE=1 flips the script into CI validation mode.

## Task Commits

Each task committed atomically:

1. **Task 1 + Task 2: agent_tools package (pool/schemas/registry/context/gateway/budget)** - `74bdec6` (feat)
2. **Task 2 contract tests (gateway + auth_log + budget_halt)** - `f371b58` (test)
3. **Task 3: pydantic2ts codegen + TS barrel + generated base types** - `1fd4a7c` (feat)

(Tasks 1 and 2 were committed together because they form the same coherent runtime artifact — the gateway is useless without the pool/context/registry scaffolding, and splitting would have produced an import-error-only interim commit. Tests shipped in a follow-up commit so the code-only change was reviewable first.)

## Files Created/Modified

- `fee_crawler/agent_tools/__init__.py` — public surface re-exports
- `fee_crawler/agent_tools/pool.py` — asyncpg singleton + `open_pool_from_dsn` helper for per-schema tests
- `fee_crawler/agent_tools/schemas/_base.py` — `BaseToolInput`, `BaseToolOutput`, `AgentEventRef`, `AgentName` enum
- `fee_crawler/agent_tools/schemas/__init__.py` — re-export surface with `try/except ImportError` wrappers for every future per-domain module
- `fee_crawler/agent_tools/registry.py` — `@agent_tool` decorator, `TOOL_REGISTRY`, `entities_covered()`, `reset_registry_for_testing()`
- `fee_crawler/agent_tools/context.py` — `with_agent_context` + `get_agent_context` ContextVar wrapper
- `fee_crawler/agent_tools/budget.py` — `BudgetExceeded`, `check_budget`, `account_budget`, `_write_budget_halt`
- `fee_crawler/agent_tools/gateway.py` — `with_agent_tool` async context manager + `AgentUnknown` + `_truncate_payload` + `_snapshot_row`
- `scripts/gen-agent-tool-types.sh` — pydantic2ts wrapper with AUTO-GENERATED header + CHECK_MODE=1 CI gate
- `src/lib/agent-tools/index.ts` — barrel export
- `src/lib/agent-tools/types.generated.ts` — four shared base interfaces (BaseToolInput, BaseToolOutput, AgentEventRef, AgentName)
- `fee_crawler/tests/test_agent_gateway.py` — 4 tests (pending-then-success, rollback, unknown agent, inactive agent)
- `fee_crawler/tests/test_agent_auth_log.py` — +1 test (before/after capture); schema column probe retained
- `fee_crawler/tests/test_sc5_budget_halt.py` — 1 real test for SC5 env-var halt path

## Decisions Made

See `key-decisions` in the frontmatter above. Notable new ones made during implementation:

- **Tasks 1+2 committed together.** The PLAN's "Task 1 scaffolding without gateway" would commit a state where `fee_crawler/agent_tools/__init__.py` imports from a non-existent `gateway.py`. Committing them in one unit keeps every commit green for `python -c "from fee_crawler.agent_tools import ..."`.
- **`_dumps_or_none` for JSONB binds.** The test fixture bootstraps via a raw `asyncpg.connect` (no `init` hook), so the JSONB codec isn't registered when migrations run. Rather than depend on a codec that may or may not be present, the gateway JSON-stringifies payloads before binding to `$N::JSONB` — idempotent whether or not a codec is registered.
- **`open_pool_from_dsn` helper** lives in `pool.py` instead of forcing tests to call `asyncpg.create_pool` directly; it enforces `statement_cache_size=0` + the JSONB codec even for per-schema test pools.
- **`reset_registry_for_testing()` exported from `registry.py`.** Downstream Plan 62A-09..13 tests will want to isolate registrations; shipping the helper with the decorator avoids every test file re-implementing it.

## Deviations from Plan

Rule-classified as follows. All minor; no Rule 4 (architectural) deviations occurred.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Combined Task 1 + Task 2 into a single commit.**
- **Found during:** Task 1 commit staging
- **Issue:** The package-level `fee_crawler/agent_tools/__init__.py` imports `with_agent_tool` and `AgentUnknown` from `gateway.py`, and `BudgetExceeded` from `budget.py`. Committing the Task 1 scaffold without `gateway.py`/`budget.py` would break `python -c "from fee_crawler.agent_tools import ..."` — every subsequent commit would fail the success-criteria import assertion.
- **Fix:** Ship all eight Python files in one `feat` commit; land tests in a follow-up `test` commit. Downstream reviewability preserved — the package commit is a pure code drop, tests are isolated.
- **Files modified:** n/a (structural change to commit boundaries, not files)
- **Verification:** `python -c "from fee_crawler.agent_tools import with_agent_tool, agent_tool, TOOL_REGISTRY, BudgetExceeded, AgentUnknown"` succeeds after commit 74bdec6.
- **Committed in:** 74bdec6

**2. [Rule 2 - Missing Critical] Added `_dumps_or_none` helper so JSONB binds survive without a per-connection codec.**
- **Found during:** Task 2 (gateway implementation)
- **Issue:** conftest.db_schema bootstraps migrations through a raw `asyncpg.connect` that does NOT run the pool's `init=_init_connection` hook. If the gateway relied on the codec, INSERTs would fail during tests with `asyncpg.DataError: JSONB expects str`.
- **Fix:** `gateway.py:_dumps_or_none(payload)` JSON-stringifies every JSONB bind, and `_snapshot_row` handles both dict (codec present) and str (codec absent) forms when reading `to_jsonb(t.*)`.
- **Files modified:** `fee_crawler/agent_tools/gateway.py`, `fee_crawler/agent_tools/budget.py`
- **Verification:** Tests collect cleanly; the bind pattern matches the existing `src/lib/fee-actions.ts` style (string-first JSONB).
- **Committed in:** 74bdec6

**3. [Rule 2 - Missing Critical] `BudgetExceeded` re-exported from `fee_crawler/agent_tools/__init__.py`, imported from `budget.py`.**
- **Found during:** Task 1 wiring
- **Issue:** The plan suggests `BudgetExceeded` lives in gateway.py, but it belongs in `budget.py` alongside the check + account functions (better cohesion). The package's public surface still exposes both `BudgetExceeded` and `AgentUnknown`.
- **Fix:** Define `BudgetExceeded` in `budget.py`, re-export from `__init__.py` alongside `AgentUnknown` (defined in `gateway.py`).
- **Files modified:** `fee_crawler/agent_tools/__init__.py`, `fee_crawler/agent_tools/budget.py`, `fee_crawler/agent_tools/gateway.py`
- **Verification:** `python -c "from fee_crawler.agent_tools import BudgetExceeded, AgentUnknown"` succeeds. `grep -c "BudgetExceeded" budget.py gateway.py __init__.py` returns 10 (well above the `>=3` threshold).
- **Committed in:** 74bdec6

**4. [Rule 2 - Missing Critical] `open_pool_from_dsn` helper + `pool=None` kwarg on `with_agent_tool`.**
- **Found during:** Task 2 test planning
- **Issue:** Per-test schemas bind traffic via `server_settings={"search_path": "<schema>, public"}` — the module-level `get_pool()` singleton has no way to switch schemas at acquire time. Without a DI path, tests would pollute each other or hit production DATABASE_URL by accident.
- **Fix:** Added `open_pool_from_dsn(dsn, server_settings=...)` to `pool.py` (the per-test fixture already uses this shape via `asyncpg.create_pool` directly, this just wraps it uniformly with statement_cache_size=0 + JSONB codec). `with_agent_tool(..., pool=None)` falls back to `get_pool()` when omitted so production callers don't change.
- **Files modified:** `fee_crawler/agent_tools/pool.py`, `fee_crawler/agent_tools/gateway.py`
- **Verification:** All 7 tests collect cleanly; SC5 + auth-log + gateway tests pass the pool= kwarg when calling with_agent_tool.
- **Committed in:** 74bdec6, f371b58

**5. [Rule 2 - Missing Critical] `reset_registry_for_testing()` helper exported from `registry.py`.**
- **Found during:** Task 1 scaffolding
- **Issue:** Downstream tests (Plans 62A-09..13) will register tools and then need to tear them down to avoid leaking state across test files. Without a sanctioned teardown, each plan would grow its own `TOOL_REGISTRY.clear()` helper.
- **Fix:** Ship the teardown helper now.
- **Files modified:** `fee_crawler/agent_tools/registry.py`
- **Verification:** `grep -c "def reset_registry_for_testing" fee_crawler/agent_tools/registry.py` = 1.
- **Committed in:** 74bdec6

---

**Total deviations:** 5 auto-fixed (1 blocking, 4 missing-critical)
**Impact on plan:** All deviations shore up the scaffolding the PLAN asked for. No new features, no scope creep. The commit-boundary fix is the only structural change; it produces a green-at-every-commit history.

## Issues Encountered

- **No local Postgres binary.** `docker`, `pg_ctl`, `postgres`, and `psql` are all absent from this worktree's PATH. `pytest` runs skip all 7 gateway tests when `DATABASE_URL_TEST` is unset — this is by design (conftest.py skips loudly, refuses supabase.co / pooler. hosts). The CI workflow shipped by Plan 62A-01 (`.github/workflows/pg-tests.yml`) provides the Postgres service container that runs them for real. Local verification here was limited to:
  - `pytest --collect-only` — 7 tests collected (up from 3 xfailed stubs).
  - `pytest -v` — 7 tests SKIPPED (expected without DATABASE_URL_TEST).
  - Python module imports — all public API importable.
  - `npx tsc --noEmit --strict` on `src/lib/agent-tools/index.ts` — passes.

- **No `pydantic2ts` available locally.** Plan explicitly anticipated this and permitted the hand-written placeholder TS file. `src/lib/agent-tools/types.generated.ts` keeps the AUTO-GENERATED header and the four shared interfaces; the next developer with `pydantic-to-typescript` installed regenerates by running `bash scripts/gen-agent-tool-types.sh`.

## Known Stubs

None. Per-domain schema modules are intentionally NOT in this plan's scope — Plans 62A-07..10 own them, and `schemas/__init__.py` has a clean `try/except ImportError` slot for each one. This is architecture, not a stub.

## User Setup Required

None — all infrastructure (Postgres container config, pytest fixture, migrations) already lives in the repo from Plans 62A-01..04. Once `DATABASE_URL_TEST` is set (e.g., by running `docker compose up -d postgres`), the contract tests run unmodified.

## Self-Check: PASSED

Files verified to exist:

- `fee_crawler/agent_tools/__init__.py` — FOUND
- `fee_crawler/agent_tools/pool.py` — FOUND
- `fee_crawler/agent_tools/schemas/__init__.py` — FOUND
- `fee_crawler/agent_tools/schemas/_base.py` — FOUND
- `fee_crawler/agent_tools/registry.py` — FOUND
- `fee_crawler/agent_tools/context.py` — FOUND
- `fee_crawler/agent_tools/budget.py` — FOUND
- `fee_crawler/agent_tools/gateway.py` — FOUND
- `scripts/gen-agent-tool-types.sh` — FOUND (executable)
- `src/lib/agent-tools/index.ts` — FOUND
- `src/lib/agent-tools/types.generated.ts` — FOUND

Commits verified to exist (`git log --oneline`):

- `74bdec6` — FOUND (Task 1+2 package)
- `f371b58` — FOUND (Task 2 tests)
- `1fd4a7c` — FOUND (Task 3 codegen)

Acceptance-criteria greps (all pass):

- `grep -c "async def with_agent_tool" fee_crawler/agent_tools/gateway.py` = 1 (≥1 required) — PASS
- `grep -c "INSERT INTO agent_events" fee_crawler/agent_tools/gateway.py` = 1 (≥1 required) — PASS
- `grep -c "INSERT INTO agent_auth_log" fee_crawler/agent_tools/gateway.py` = 1 (=1 required) — PASS
- `grep -c "ATLAS_AGENT_BUDGET_" fee_crawler/agent_tools/budget.py` = 4 (≥1 required) — PASS
- `grep -c "BudgetExceeded" budget.py gateway.py __init__.py` = 10 (≥3 required) — PASS
- `grep -c "statement_cache_size=0" fee_crawler/agent_tools/pool.py` = 5 (≥2 required) — PASS
- `grep -c "class BaseToolInput|class BaseToolOutput|class AgentEventRef" schemas/_base.py` = 3 (=3 required) — PASS
- `grep -c "from ._base import" schemas/__init__.py` = 1 (≥1 required) — PASS
- `grep -c "try:" schemas/__init__.py` = 5 (≥5 required) — PASS
- `grep -c "except ImportError:" schemas/__init__.py` = 5 (≥5 required) — PASS
- xfail-removed test files have 0 `xfail` references.
- `pytest --collect-only` reports 7 tests collected (was 3 xfails).

## Next Phase Readiness

Wave 2 (Plans 62A-06..12) unblocked. Each plan drops its own per-domain schema module under `fee_crawler/agent_tools/schemas/` and registers tools via `@agent_tool(...)` that wrap their writes inside `async with with_agent_tool(...)`. The gateway's `pool=` injection point means Wave 2 plans also inherit the per-test schema fixture for free — every write-CRUD contract test can run against a disposable schema.

**Specific readiness gates for Wave 2:**

- **62A-07 (fees CRUD)**: drops `schemas/fees.py`; writes `approve_fee_raw`, `promote_to_tier2_tool`, etc. via `with_agent_tool(entity='fees_raw', action='update', pk_column='fee_raw_id', ...)`. The `pk_column` hook is already wired.
- **62A-09 (Hamilton CRUD)**: drops `schemas/hamilton.py`; wraps hamilton_scenarios/hamilton_watchlists/hamilton_saved_analyses etc. Costs flow via `with_agent_context(cost_cents=...)` around the turn.
- **62A-13 (MCP + SC coverage)**: imports `TOOL_REGISTRY` directly and asserts `len(entities_covered()) >= 33`.

No blockers for downstream plans.

---
*Phase: 62A-agent-foundation-data-layer*
*Plan: 05 — agent-tool gateway + pydantic2ts codegen*
*Completed: 2026-04-16*
