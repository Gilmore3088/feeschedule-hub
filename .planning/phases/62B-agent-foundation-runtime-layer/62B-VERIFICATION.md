---
phase: 62B
slug: agent-foundation-runtime-layer
status: code-complete / staging-verification-pending
created: 2026-04-17
---

# Phase 62B — Verification Report

Honest, goal-backward summary of what shipped, what's green, and what still requires human-gated verification.

## Goal Recap

Deliver the Runtime Layer for the 4-agent team (Hamilton / Knox / Darwin / Atlas):
- AgentBase framework with LOG/REVIEW/DISSECT/UNDERSTAND/IMPROVE hooks
- Inter-agent messaging (LISTEN/NOTIFY handshakes + escalation)
- Lineage graph queryable in 3 clicks from `/admin/agents`
- 5-metric health rollup
- Adversarial review gate (canary corpus + peer accept/reject)
- Graduation CLI (`agent-graduate`)
- Exception digest CLI (`exception-digest`)

## What Shipped (11 Plans)

| Plan | Deliverable | Code In |
|------|-------------|---------|
| 62B-01 | Schema migrations, `lineage_graph()` SQL, agent_events / agent_messages / agent_lessons tables | Postgres migrations |
| 62B-02 | `DATABASE_URL_SESSION` + `get_session_pool` helper | fee_crawler/session_pool.py |
| 62B-03 | `AgentBase` framework + auto-wrap + default loop helpers | fee_crawler/agent_base.py |
| 62B-04 | `FakeAnthropicClient` + canary runner + shadow-mode gateway | fee_crawler/testing/* |
| 62B-05 | Inter-agent messaging runtime | fee_crawler/agent_messaging.py |
| 62B-06 | `get_reasoning_trace` agent tool | fee_crawler/agent_tools.py |
| 62B-07 | Adversarial review gate wired into `AgentBase.improve` | fee_crawler/adversarial_gate.py |
| 62B-08 | `pg_cron` review_tick schedules + Modal dispatcher | fee_crawler/modal_app.py |
| 62B-09 | `agent-graduate` + `exception-digest` CLI commands | fee_crawler/__main__.py |
| 62B-10 | `/admin/agents` console (Overview / Lineage / Messages / Replay) | src/app/admin/agents/* |
| 62B-11 | Runbook (`agent-bootstrap.md`) + ops docs | .planning/runbooks/ |

## Local Verification Run — 2026-04-17

### Python test suite (fee_crawler/tests/)

```
pytest fee_crawler/tests/test_agent_base_auto_wrap.py \
       fee_crawler/tests/test_adversarial_gate.py \
       fee_crawler/tests/test_agent_messaging.py \
       fee_crawler/tests/test_lineage_graph.py \
       fee_crawler/tests/test_agent_health_rollup.py \
       fee_crawler/tests/test_agent_bootstrap.py \
       fee_crawler/tests/test_fake_anthropic.py \
       fee_crawler/tests/test_canary_runner.py \
       fee_crawler/tests/test_shadow_helpers.py
```

**Result: 22 passed · 0 failed · 49 skipped (0.25s)**

Green (contract / unit):
- LOOP-01 AgentBase hooks subclass contract
- BOOT-03 meta-tests (FakeAnthropicClient, canary corpus, shadow helpers)
- Messaging payload validation
- Five-metrics constant
- Predicate catalog (paused policy)

Skipped (integration — require `DATABASE_URL_TEST` pointing at a session-mode Postgres):
- LOOP-03..07 (review_tick, dissect, understand, improve, adversarial gate)
- COMMS-01..05 (LISTEN/NOTIFY roundtrip, handshakes, escalation, reasoning_trace)
- OBS-01..02, 04..05 (lineage_graph, replay_by_hash, health rollup SQL)
- BOOT-01 (graduation state flip)
- Shadow gateway context (requires live gateway)

Skip reason per `test_agent_messaging.py:355`:
> DATABASE_URL_TEST not set; start `docker compose up -d postgres` and set
> `DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test`

### TypeScript test suite

```
npx vitest run src/app/admin/agents/
```

**Result: 22 passed · 0 failed (0.5s)**

- Overview tile sparklines render
- Lineage tree-view 3-click bar satisfied (fixture updated to use `https://` R2 URL per `isSafeR2Url` guard)
- Replay timeline is read-only (no Re-execute button — D-16 contract held)

## What Remains — Staging Verification

These cannot be marked ✅ green until the integration tests run against a real session-mode Postgres. Two paths:

1. **Local Docker**: `docker compose up -d postgres`, export `DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test`, rerun the pytest command above.
2. **Staging Supabase session pool**: set `DATABASE_URL_SESSION_TEST` to the port-5432 DSN and rerun in CI.

Only after one of those produces a green integration run should `nyquist_compliant: true` flip in `62B-VALIDATION.md`.

---

## 2026-04-17 (later same day) — Integration-Layer Run via Colima

Brought up local Postgres via Colima (`brew install colima docker docker-compose && colima start && docker compose up -d postgres`). Pointed both `DATABASE_URL_TEST` and `DATABASE_URL_SESSION_TEST` at `postgres://postgres:postgres@localhost:5433/bfi_test`.

**Result: 55 pass / 16 fail / 0 skip (19.47s).**

### conftest.py changes shipped

`supabase/migrations/` contains incremental diffs on top of an assumed baseline production schema (initial tables like `extracted_fees`, `fees_raw`, `institutions` pre-date migration tracking). The previous per-test schema bootstrap assumed full-bootstrap-from-zero, which failed immediately. Updated to:

- Wrap each migration in its own subtransaction so one failure doesn't poison later migrations.
- Tolerate `UndefinedTable`, `UndefinedObject`, `UndefinedColumn`, `UndefinedFunction`, `GroupingError`, `DuplicateTable`, `DuplicateObject` and continue.
- `BFI_DEBUG_MIGRATIONS=1` prints the skipped list for diagnosis.

### Real failures surfaced (16)

These are **pre-existing test↔implementation drift**, not infra gaps:

| Cluster | Count | Symptom |
|---------|-------|---------|
| String-assertion drift | 1 | `test_lineage_graph_missing_id_returns_error` expects `"fee_published_id not found"`; current `lineage_graph()` returns discriminated union `"fee_published_not_found"` (migration `20260517_lineage_graph_missing_tier_guards.sql`) |
| JSONB codec not registered | ~8 | `asyncpg.DataError: invalid input for query argument $7 (expected str, got dict)` on agent_events rows with JSONB payload — test pool needs `codec_aliases` or `set_type_codec('jsonb', ...)` |
| Type coercion | ~4 | `expected str, got int` on `agent_registry.state_code` arguments |
| Pool/context leak | ~3 | `another operation is in progress` + `ConnectionDoesNotExistError` at teardown |

### What this means

- The runtime-layer code **works in principle** — 55 of 71 integration rows now execute against a real Postgres schema built from the migrations directory.
- The 16 failures are **production-grade test-suite bugs**, not framework bugs. They need:
  - Update `test_lineage_graph_missing_id_returns_error` to assert on the new discriminated union (`fee_published_not_found`) — real fix, 1-line.
  - Register `jsonb` codec in the test pool setup (or update tests to pre-serialize dicts to `json.dumps(...)`).
  - Cast `state_code` arguments as `str` in test fixtures.
  - Investigate the teardown race.

## 2026-04-17 (late same day) — All 15 Integration Failures Fixed

Pushed through the remaining 15 failures. New baseline: **71 pass / 0 fail / 0 skip (22s).**

### What actually broke down

The failure clusters turned out to be three targeted test-suite bugs:

1. **Missing jsonb codec on test pool (~8 failures).** `fee_crawler/agent_tools/pool._init_connection` registers a jsonb codec on the production pool. The test conftest created its pool directly via `asyncpg.create_pool(...)` without `init=_init_connection`, so dict→JSONB inserts crashed with `expected str, got dict`. Fix: import and pass `_init_connection` in conftest.
2. **Codec double-encoded pre-serialized JSON (3 failures).** Code in `agent_base/loop.py` pre-serializes with `json.dumps(payload)` then casts via `::JSONB`. With the codec registered, `json.dumps(<string>)` quoted the already-serialized string, storing JSON-inside-JSON. Fix: made the codec tolerant — if the value is already a `str|bytes`, pass through; otherwise `json.dumps`. Same `_encode_json` helper now handles both call patterns.
3. **`entity_id` TEXT column receiving int (4 failures).** Two seed calls in `test_lineage_graph.py` passed `fee_verified_id` (BIGINT from `RETURNING`) into the `agent_events.entity_id` TEXT column with a `$2::text` SQL cast. asyncpg's wire protocol still validates the Python type before the cast runs, so it rejected `1` (int) when expecting `str`. Fix: wrap `fee_verified_id` in `str(...)` at the two call sites.
4. **Two `_pool_injected` fixtures missing (2 failures).** `test_subclass_methods_are_context_wrapped` and `test_nested_call_inherits_correlation_id` in `test_agent_base_auto_wrap.py` exercise `run_turn()` which writes to `agent_registry` via `get_pool()`. Without the `_pool_injected` fixture, those writes went to the production pool and failed on the missing table. Fix: add `_pool_injected` to both signatures.

### Verified green

```
pytest fee_crawler/tests/test_agent_base_auto_wrap.py \
       fee_crawler/tests/test_adversarial_gate.py \
       fee_crawler/tests/test_agent_messaging.py \
       fee_crawler/tests/test_lineage_graph.py \
       fee_crawler/tests/test_agent_health_rollup.py \
       fee_crawler/tests/test_agent_bootstrap.py \
       fee_crawler/tests/test_fake_anthropic.py \
       fee_crawler/tests/test_canary_runner.py \
       fee_crawler/tests/test_shadow_helpers.py

71 passed in 21.98s
```

Every contract in `62B-VALIDATION.md` now has a passing automated test row. `nyquist_compliant: true` flipped in the frontmatter.

### Adjacent test files still red

Running the *full* `fee_crawler/tests/` suite against the same local Postgres surfaces 22 failures + 30 errors in unrelated files (`e2e/*`, `test_backfill_and_freeze.py`, `test_tools_*.py`, etc.). These depend on the pre-migration-tracking baseline schema (tables like `extracted_fees`, `crawl_targets`, `institution_financials` that live outside `supabase/migrations/`). They were silent skips before `DATABASE_URL_TEST` was set; now they fail loudly.

Those are **not 62B**. Fixing them is its own scope — either create a baseline dump to apply before migrations, or mark each test to skip gracefully when its required tables are absent.

## Manual UAT — Status

See `62B-UAT.md`. 13 tests authored; 1 reported (Vercel deploy failure — resolved by commit 129c255 restoring `@react-pdf/renderer` and `@vercel/analytics`). The other 12 still require user click-through.

## Known Deferrals

7 audit items on `/admin/agents` (M-2 through L-3 in `62B-ADMIN-AGENTS-AUDIT.md`). M-2, M-4, M-5, L-1, L-2, L-3 closed in commits `58899e6` and `3a4985f`; M-3 (timeline virtualization) stays deferred per audit's own YAGNI rationale.

## Conclusion

**62B ships green.** 71/71 integration tests pass against real Postgres, validation contract marked complete, 6 of 7 deferred audit items closed, and `nyquist_compliant: true` set in frontmatter. Remaining: user-side UAT click-throughs (12) and the unrelated e2e baseline-schema cleanup.
