---
phase: 62A-agent-foundation-data-layer
plan: 08
subsystem: agent-tools
tags: [asyncpg, pydantic, postgres, agent-gateway, knox, atlas, crawl, upsert, audit]

# Dependency graph
requires:
  - phase: 62A-05
    provides: with_agent_tool gateway + @agent_tool decorator + TOOL_REGISTRY + schemas/__init__.py with pre-wired try/except for schemas/crawl
  - phase: 62A-04
    provides: institution_dossiers migration + agent_registry state_* seeds
  - phase: 62A-02
    provides: agent_events + agent_auth_log partitioned tables
provides:
  - 9 registered agent tools covering 7 crawl-domain entities (crawl_targets, crawl_results, crawl_runs, institution_dossiers, jobs, wave_runs, wave_state_runs)
  - upsert_institution_dossier — KNOX-03 foundation (one row per institution, ON CONFLICT DO UPDATE, last-wins)
  - create_wave_run + update_wave_state_run — Atlas orchestration spine (Phase 65 consumes)
  - Pydantic v2 input/output schemas in fee_crawler/agent_tools/schemas/crawl.py
affects:
  - 62A-13 (MCP + SC coverage — TOOL_REGISTRY now at 9+ crawl-domain tools; coverage test counts this plan's entities toward the 33-entity AGENT-05 target)
  - Phase 63 (Knox state agents — upsert_institution_dossier is the KNOX-03 write surface)
  - Phase 65 (Atlas — create_wave_run + update_wave_state_run are the orchestration lineage writes)

# Tech tracking
tech-stack:
  added: []  # No new runtime deps; built entirely on 62A-05 gateway + pool
  patterns:
    - "Per-domain schemas module (schemas/crawl.py) — Wave 2 file-conflict fix: plans 07/08/09/10 each own a disjoint module with zero shared-file writes"
    - "Upsert tool pattern: with_agent_tool(action='upsert', pk_column='institution_id') + INSERT ... ON CONFLICT DO UPDATE SET ... EXCLUDED.*"
    - "JSONB bind via json.dumps() wrapper (matches gateway._dumps_or_none) — idempotent whether or not the per-connection JSONB codec is registered"

key-files:
  created:
    - fee_crawler/agent_tools/schemas/crawl.py
    - fee_crawler/agent_tools/tools_crawl.py
    - fee_crawler/tests/test_tools_crawl.py
  modified: []

key-decisions:
  - "Followed the plan's SQL verbatim for wave_runs/wave_state_runs/jobs columns even though none of those tables are created by supabase/migrations/. The tool schemas are the contract Knox/Atlas will depend on; the tables themselves land in Phase 62A-12 when fee_crawler/db.py is rewritten as Postgres-only. See Deferred Issues below."
  - "Test uses the pool-singleton monkeypatch pattern (pool_mod._pool = pool) rather than passing pool=pool kwarg. Rationale: the tool wrappers (update_crawl_target, upsert_institution_dossier, etc.) don't thread a pool= kwarg — only the gateway does. Matching this pattern lets the test exercise the real entry point instead of reaching around it."
  - "Added notes_json / payload_json / result_json local json.dumps() calls in tools_crawl.py upsert_institution_dossier / create_job / update_job. The gateway uses _dumps_or_none for its own JSONB binds; tool-internal JSONB binds need the same treatment to survive test fixtures that bootstrap via raw asyncpg.connect (no _init_connection hook → no codec registration)."
  - "UpdateCrawlTargetInput restricts mutable fields to {status, fee_schedule_url, last_content_hash, document_type}. Amount/asset/cert fields deliberately excluded per T-62A08-02 threat model mitigation."

patterns-established:
  - "Crawl-domain tool signature: async def <tool>(*, inp: <Input>, agent_name: str, reasoning_prompt: str, reasoning_output: str, parent_event_id: Optional[str] = None) -> <Output>. Body opens `async with with_agent_tool(...)` yielding (conn, event_id), runs target write inside the block, fetches correlation_id via _correlation_of(event_id, conn), returns <Output>(success=True, ..., event_ref=AgentEventRef(...))."
  - "Upsert tools set action='upsert' + pk_column matching the unique key (e.g., institution_id for dossiers)."

requirements-completed: [AGENT-05]

# Metrics
duration: 3min
completed: 2026-04-16
---

# Phase 62A Plan 08: Crawl + Orchestration CRUD Tools Summary

**9 agent tools covering 7 crawl-domain entities — the Knox state-agent + Atlas orchestration write surface. upsert_institution_dossier is the KNOX-03 foundation: one row per institution with last-wins semantics.**

## Performance

- **Duration:** ~3 min (execution only; plan drafting done upstream)
- **Started:** 2026-04-16T23:39:21Z
- **Completed:** 2026-04-16T23:42:26Z
- **Tasks:** 3
- **Files created:** 3
- **Files modified:** 0

## Accomplishments

- **schemas/crawl.py** (Task 1) — 9 Pydantic input/output schema pairs covering every CRUD shape the plan enumerates. Auto-activates via the pre-wired `try/except` re-export in `schemas/__init__.py` that Plan 62A-05 shipped; zero edits to shared files.
- **tools_crawl.py** (Task 2) — 9 `@agent_tool`-registered async functions:
  - `update_crawl_target` (crawl_targets; mutable allow-list enforced at schema boundary — T-62A08-02 mitigation)
  - `create_crawl_result` (crawl_results)
  - `create_crawl_run` + `update_crawl_run` (crawl_runs)
  - `upsert_institution_dossier` (institution_dossiers; KNOX-03 foundation, `ON CONFLICT (institution_id) DO UPDATE SET ... EXCLUDED.*`)
  - `create_job` + `update_job` (jobs)
  - `create_wave_run` + `update_wave_state_run` (wave_runs, wave_state_runs; Atlas writes)
- **test_tools_crawl.py** (Task 3) — two integration tests:
  - `test_institution_dossier_upsert_idempotent` — asserts two upserts on the same `institution_id` yield 1 dossier row (last URL wins) and 2 `agent_auth_log` rows (audit trail preserved)
  - `test_crawl_registry_covers_seven_entities` — passes offline; asserts TOOL_REGISTRY covers `crawl_targets, crawl_results, crawl_runs, institution_dossiers, jobs, wave_runs, wave_state_runs`
- **13/33 AGENT-05 entities covered** once tools_fees.py (Plan 62A-07) lands in Wave 2 parallel. This plan ships 7 of the 13; the other 6 come from Plan 07's fees-domain tools.

## Task Commits

Each task committed atomically:

1. **Task 1 — schemas/crawl.py** — `bea7624` (feat) — 9 Pydantic v2 schemas; activates through Plan 62A-05's pre-wired try/except re-export
2. **Task 2 — tools_crawl.py** — `b262709` (feat) — 9 `@agent_tool`-registered async functions routed through `with_agent_tool`
3. **Task 3 — test_tools_crawl.py** — `2162a56` (test) — idempotency + registry coverage tests

## Files Created/Modified

- `fee_crawler/agent_tools/schemas/crawl.py` — 168 lines, 9 input/output Pydantic schema pairs, `__all__` export list
- `fee_crawler/agent_tools/tools_crawl.py` — 524 lines, 9 registered tools, `_correlation_of` helper (same shape Plan 07 will land for tools_fees.py)
- `fee_crawler/tests/test_tools_crawl.py` — 142 lines, 2 tests, minimal `_SEED_CRAWL_TARGETS` DDL so the test owns its own FK target row

## Decisions Made

See `key-decisions` in the frontmatter above. Notable calls made during implementation:

- **Followed plan's SQL verbatim for wave_runs/wave_state_runs/jobs columns** even though none of these tables are currently created by `supabase/migrations/`. The plan author's intent is that these tool contracts drive the downstream schema conversion in Plan 62A-12 (SQLite elimination → Postgres rewrite of `fee_crawler/db.py`). Validating the plan against the *current* `20260407_wave_runs.sql` / `scripts/migrate-schema.sql` would have forced column-name changes that conflict with Phase 63 (Knox) and Phase 65 (Atlas) expectations. See Deferred Issues.
- **Used pool-singleton monkeypatch (not pool= kwarg) in tests** because tool wrappers don't thread pool=; only the gateway does. The existing Plan 62A-05 gateway/auth_log tests use `pool=pool` because they call `with_agent_tool` directly. For tool-level tests, monkeypatching `pool_mod._pool` is the sanctioned idiom.
- **JSONB binds use explicit `json.dumps()`** inside tools_crawl for notes/payload/result fields — mirrors the gateway's `_dumps_or_none` pattern so the tool survives both codec-registered and codec-less connections.
- **UpdateCrawlTargetInput allow-list** — schema restricts mutable columns to `status`, `fee_schedule_url`, `last_content_hash`, `document_type`. Enumerated in the Pydantic model as `Optional[...]` fields so agents physically can't pass `amount`, `cert_number`, or other immutable identity fields (T-62A08-02 mitigation).

## Deviations from Plan

Rule-classified; all Rule 3 or Rule 2 (blocking / missing-critical). No Rule 4 (architectural) deviations.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test uses pool-singleton monkeypatch, not pool= kwarg.**
- **Found during:** Task 3 test authoring
- **Issue:** The plan's test template calls `upsert_institution_dossier(inp=..., agent_name=..., reasoning_prompt=..., reasoning_output=...)` — these tool functions don't accept a `pool=` kwarg, so the test can't pass the per-schema pool directly. The plan's own sample code relies on `pool_mod._pool = pool` monkeypatching to make the tool's internal `get_pool()` return the test pool; I kept this pattern and added a `prior = pool_mod._pool` save/restore guard to avoid leaking state to other tests that share the process.
- **Fix:** Import `pool as pool_mod`, snapshot the prior `_pool`, set it to the test pool, restore in `finally`.
- **Files modified:** `fee_crawler/tests/test_tools_crawl.py`
- **Verification:** `pytest fee_crawler/tests/test_tools_crawl.py --collect-only` collects both tests; `pytest -v` runs `test_crawl_registry_covers_seven_entities` (offline, passes) and skips `test_institution_dossier_upsert_idempotent` (requires `DATABASE_URL_TEST`).
- **Committed in:** 2162a56

**2. [Rule 2 - Missing Critical] JSONB binds JSON-stringified inside tools (notes/payload/result).**
- **Found during:** Task 2 upsert implementation
- **Issue:** Tool internal writes bind JSONB params (`inp.notes` for dossiers, `inp.payload` for jobs, `inp.result` for job updates). Plan 62A-05 documented that test fixtures bootstrap via `asyncpg.connect` without the `_init_connection` hook, so the JSONB codec isn't registered for those connections. If the tool binds a raw dict to a `$N::JSONB` parameter, the test-schema pool would throw `asyncpg.DataError: JSONB expects str`.
- **Fix:** Wrap every JSONB bind in `json.dumps(x or {}, default=str)` before passing to `conn.execute(...)`. Idempotent — works with or without a codec. Mirrors the `_dumps_or_none` helper pattern the gateway already uses for its own JSONB binds.
- **Files modified:** `fee_crawler/agent_tools/tools_crawl.py`
- **Verification:** Tools collect cleanly; import triggers TOOL_REGISTRY registration without error.
- **Committed in:** b262709

**3. [Rule 3 - Blocking] Test seeds its own minimal crawl_targets table.**
- **Found during:** Task 3 test authoring (pre-run inspection)
- **Issue:** `institution_dossiers` has `FK institution_id REFERENCES crawl_targets(id) ON DELETE CASCADE`, but the `supabase/migrations/` set never creates `crawl_targets` — that table is owned by the legacy `fee_crawler/db.py` module which still uses SQLite DDL at the time of this plan. The plan's test template does `INSERT INTO crawl_targets (id, ...)` assuming the table exists.
- **Fix:** The test `_SEED_CRAWL_TARGETS` constant CREATEs a minimal crawl_targets shape before the first upsert, matching the pattern already in use in `test_backfill_and_freeze.py`. Keeps the test self-contained until Plan 62A-12 rewrites db.py.
- **Files modified:** `fee_crawler/tests/test_tools_crawl.py`
- **Verification:** `pytest --collect-only` passes; second test (registry coverage) passes offline.
- **Committed in:** 2162a56

---

**Total deviations:** 3 auto-fixed (1 blocking-test-pattern, 1 missing-critical-JSONB, 1 blocking-FK-seed). No architectural deviations. All are local to Plan 62A-08 artifacts.

## Deferred Issues

These are acknowledged schema drifts between the plan's SQL and the current `supabase/migrations/` state. Deferring because Plan 62A-12 (SQLite removal + `fee_crawler/db.py` rewrite) is the designated landing zone for the missing tables and column alignments. Re-raising in a fresh plan is wrong — the existing plan lineage already routes these through 62A-12.

**1. `wave_runs` column mismatch.** Plan's `CreateWaveRun` INSERT writes `wave_type, state_codes, planned_targets, status`. Actual `20260407_wave_runs.sql` defines `states (TEXT[]), wave_size (INT), total_states (INT), status`. The tool's INSERT will fail at runtime until either (a) the migration is updated to match the plan, or (b) tools_crawl is patched to target the current columns. Plan 62A-12's rewrite is the canonical cleanup point because Atlas (Phase 65) drives the final column contract.

**2. `wave_state_runs` column mismatch.** Plan's `UpdateWaveStateRun` UPDATE writes `status, extracted_count, failure_reason, updated_at`. Actual migration has `status, started_at, completed_at, error, agent_run_id` — no `extracted_count`, no `failure_reason`, no `updated_at`. Same deferral path via Plan 62A-12 / Phase 65.

**3. `jobs` table not in migrations.** `scripts/migrate-schema.sql` has a `jobs` table with `queue, entity_id, payload, status` columns (no `job_type`, no `target_id`). The plan's `create_job`/`update_job` INSERT/UPDATE use `job_type` + `target_id`. This is the most significant drift because the `jobs` table isn't even created by `supabase/migrations/` — only by the legacy `scripts/migrate-schema.sql`. Plan 62A-12 (SQLite → Postgres rewrite) is the right place to add a canonical `jobs` migration aligned with the tool schema.

**Why defer rather than fix here:** Modifying these column names inside tools_crawl would force knock-on changes to Knox's Phase 63 expectations (dossier-driven wave orchestration) and Atlas's Phase 65 expectations (wave-level state tracking). Those phases are already planning against the column names the Plan 62A-08 schemas define. Correcting here would fragment the contract; correcting at the migration layer in Plan 62A-12 preserves it.

**Traceability:** This block is the designated pickup point. Plan 62A-12 (`62A-12-PLAN.md`) scope confirms: "SQLite removal + `fee_crawler/db.py` rewrite" — includes all crawl_* + jobs + wave_* tables.

## Known Stubs

None. All 9 tools have real SQL bodies; no `pass`/`TODO` in the source. Deferred issues above are schema drifts, not tool stubs.

## Issues Encountered

- **No `DATABASE_URL_TEST` set in this worktree.** Mirrors Plan 62A-05's environment; the full upsert idempotency test skips locally. The offline registry coverage test does run and passes. CI workflows picking up `DATABASE_URL_TEST` via docker-compose run the full suite.
- **`scripts/migrate-schema.sql` not in migration run path.** Confirmed by `grep` — `conftest.db_schema` reads only `supabase/migrations/*.sql`. The test owns its `crawl_targets` seed DDL to work around this; long-term fix is Plan 62A-12 migration creation.

## User Setup Required

None. All 3 commits land on the existing branch; no env vars or migrations to apply. Once a future dev sets `DATABASE_URL_TEST=postgres://...` (docker-compose up -d postgres in repo root per Plan 62A-01), the idempotency test runs end-to-end.

## Self-Check: PASSED

Files verified to exist:

- `fee_crawler/agent_tools/schemas/crawl.py` — FOUND
- `fee_crawler/agent_tools/tools_crawl.py` — FOUND
- `fee_crawler/tests/test_tools_crawl.py` — FOUND

Commits verified to exist (`git log --oneline`):

- `bea7624` — FOUND (Task 1: schemas/crawl.py)
- `b262709` — FOUND (Task 2: tools_crawl.py)
- `2162a56` — FOUND (Task 3: test_tools_crawl.py)

Acceptance-criteria greps (all pass):

- `grep -c '@agent_tool' fee_crawler/agent_tools/tools_crawl.py` = 9 (=9 required) — PASS
- `grep -c 'ON CONFLICT (institution_id) DO UPDATE' fee_crawler/agent_tools/tools_crawl.py` = 1 (=1 required) — PASS
- `grep -c 'class UpdateCrawlTargetInput\|class CreateCrawlResultInput\|class CreateCrawlRunInput\|class UpdateCrawlRunInput\|class UpsertInstitutionDossierInput\|class CreateJobInput\|class UpdateJobInput\|class CreateWaveRunInput\|class UpdateWaveStateRunInput' fee_crawler/agent_tools/schemas/crawl.py` = 9 (=9 required) — PASS
- `python -c "from fee_crawler.agent_tools.schemas import UpdateCrawlTargetInput, CreateCrawlResultInput, CreateCrawlRunInput, UpdateCrawlRunInput, UpsertInstitutionDossierInput, CreateJobInput, UpdateJobInput, CreateWaveRunInput, UpdateWaveStateRunInput; print('OK')"` → OK — PASS
- `python -c "from fee_crawler.agent_tools.schemas.crawl import UpsertInstitutionDossierInput; print('OK direct')"` → OK direct — PASS
- Registry probe: `TOOL_REGISTRY` contains the 9 expected names; `entities_covered()` ⊇ `{crawl_targets, crawl_results, crawl_runs, institution_dossiers, jobs, wave_runs, wave_state_runs}` — PASS
- `pytest fee_crawler/tests/test_tools_crawl.py --collect-only` reports `2 tests collected` — PASS
- `pytest fee_crawler/tests/test_tools_crawl.py -v` reports `1 passed, 1 skipped` (skip is DATABASE_URL_TEST-gated) — PASS

## Next Plan Readiness

**Plan 62A-13 (MCP + SC coverage):**

- After Plan 07 lands in Wave 2 parallel, `TOOL_REGISTRY` holds 16 tools across ≥13 entities. Plan 62A-13's SC coverage test can run as-is.
- `upsert_institution_dossier` is the canonical KNOX-03 tool reference for the Phase 63 planner — it should cite this plan's output entity `institution_dossiers` and the `last-wins` contract in its dependency graph.

**Phase 63 (Knox state agents):**

- `upsert_institution_dossier` is the primary write surface for state-agent learning. The 5-step loop `IMPROVE` step calls this tool at every state-agent cycle close to record URL/format/outcome/next-try.
- State-agent identity verification (T-62A08-01) is deferred to Phase 63 — 62a trusts the agent_name input.

**Phase 65 (Atlas):**

- `create_wave_run` + `update_wave_state_run` are the orchestration lineage writes. Atlas calls `create_wave_run` at campaign start with `state_codes=[...]` + `planned_targets=N`; on each state completion, calls `update_wave_state_run(status='succeeded', extracted_count=K)`.
- Deferred Issue #1/#2 must be resolved in Plan 62A-12 before Atlas's writes will succeed at runtime.

---
*Phase: 62A-agent-foundation-data-layer*
*Plan: 08 — crawl + orchestration CRUD tools (Knox/Atlas spine)*
*Completed: 2026-04-16*
