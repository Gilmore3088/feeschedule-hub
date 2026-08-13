---
phase: 62A-agent-foundation-data-layer
plan: 03
subsystem: database
tags: [postgres, supabase, plpgsql, fees, tier-schema, agent-events, canonical-fee-key]

# Dependency graph
requires:
  - phase: 55-canonical-taxonomy
    provides: canonical_fee_key column + CANONICAL_KEY_MAP (enforced NOT NULL at Tier 2)
  - phase: 62A-02
    provides: agent_events table (INSERT target for promotion functions)
  - phase: 62A-04
    provides: agent_messages table (SELECT target for adversarial handshake check)
provides:
  - "fees_raw table (Tier 1) with denormalized lineage (source_url, document_r2_key, extraction_confidence, agent_event_id, crawl_event_id, institution_id)"
  - "fees_verified table (Tier 2) with canonical_fee_key NOT NULL + variant_type + outlier_flags jsonb + verified_by_agent_event_id"
  - "fees_published table (Tier 3) with lineage_ref FK + published_by_adversarial_event_id + full denormalized trace"
  - "promote_to_tier2() SQL function — Darwin-only gate, logs agent_events, FOR UPDATE row lock"
  - "promote_to_tier3() SQL function stub — RAISE NOTICE on missing handshake (62b tightens to RAISE EXCEPTION)"
affects:
  - 62A-06 (Darwin-only test integration)
  - 62A-09 (write-CRUD tools for fees_raw, fees_verified, fees_published)
  - 62A-12 (legacy extracted_fees freeze + backfill to fees_raw)
  - 62A-13 (SC3 tier schema contract test)
  - 62b (adversarial handshake protocol wiring)
  - 63 (Knox state agents writing fees_raw)
  - 64 (Darwin verification writing fees_verified)
  - 66 (Hamilton refactor reading fees_published)

# Tech tracking
tech-stack:
  added: [plpgsql tier promotion functions, BIGSERIAL tier PKs]
  patterns:
    - "Denormalized lineage columns at every tier — OBS-02 one-query full trace"
    - "SQL function gate + RAISE EXCEPTION for agent identity enforcement (TIER-04)"
    - "RAISE NOTICE stub pattern for 62a→62b contract tightening (TIER-05)"
    - "FOR UPDATE row lock inside promotion function to prevent duplicate promotion"
    - "Gateway-opens-transaction pattern: promotion function INSERTs agent_events in same tx"

key-files:
  created:
    - "supabase/migrations/20260418_fees_tier_tables.sql"
    - "supabase/migrations/20260418_tier_promotion_functions.sql"
  modified: []

key-decisions:
  - "Phase 55 canonical_fee_key enforced NOT NULL at Tier 2 (Phase 55 foundation contract)"
  - "institution_id intentionally NOT FK-constrained to crawl_targets (crawl_targets may be deleted/rewritten; application-layer integrity via gateway)"
  - "promote_to_tier3 in 62a uses RAISE NOTICE (not RAISE EXCEPTION) on missing adversarial handshake so 62a integration tests exercise the insert path; 62b replaces with RAISE EXCEPTION"
  - "promote_to_tier2 does INSERT INTO agent_events inline (gateway opens tx before function call; same-tx guarantee)"
  - "Partial index fees_raw_lineage_missing_idx filters on `outlier_flags ? 'lineage_missing'` for KNOX-09 remediation queue"

patterns-established:
  - "Tier-aware promotion gating: SQL-function-as-only-write-path with role check in function body. SEC-04 (Phase 68) adds Postgres role + JWT without changing call sites."
  - "Denormalize lineage at every tier: source_url, document_r2_key, extraction_confidence ride along Tier 2 and Tier 3, so Hamilton's 'trace to source in 3 clicks' (OBS-03) becomes a single SELECT on fees_published."
  - "62a→62b stub contract: 62a ships the function signature + permissive body; 62b tightens the body without changing the interface."

requirements-completed:
  - TIER-01
  - TIER-02
  - TIER-03
  - TIER-04
  - TIER-05

# Metrics
duration: 2min
completed: 2026-04-16
---

# Phase 62A Plan 03: Three-Tier Fee Schema + Promotion Functions Summary

**Three-tier fees schema (Raw/Verified/Published) with denormalized lineage on every row, Darwin-gated Tier 1→2 promotion SQL function, and 62a stub for Tier 2→3 adversarial gate.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-16T23:17:52Z
- **Completed:** 2026-04-16T23:19:34Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- Three-tier fee tables landed (fees_raw, fees_verified, fees_published) per D-01/D-02 with full denormalized lineage columns — OBS-02 "one-query full trace" is now a single SELECT.
- canonical_fee_key enforced NOT NULL at Tier 2 — Phase 55 foundation contract locked into the Business tier schema.
- FK chain fees_raw → fees_verified → fees_published enforced at the DB level via REFERENCES.
- 10 supporting indexes, including a partial index (`fees_raw_lineage_missing_idx`) pre-wiring the KNOX-09 remediation queue.
- `promote_to_tier2()` SQL function: Darwin-only gate via `IF p_agent_name IS DISTINCT FROM 'darwin' THEN RAISE EXCEPTION USING ERRCODE = 'insufficient_privilege'`; `FOR UPDATE` row lock; inline `INSERT INTO agent_events` in the same transaction.
- `promote_to_tier3()` SQL function stub: checks `agent_messages` for a resolved handshake; `RAISE NOTICE` on miss for 62a bootstrap (62b tightens to `RAISE EXCEPTION`); inserts fees_published with full denormalized lineage and logs under `_adversarial` actor.

## Task Commits

Each task was committed atomically:

1. **Task 1: Three-tier fee tables migration** — `16374ea` (feat)
2. **Task 2: Tier promotion SQL functions** — `781d639` (feat)

## Files Created/Modified

- `supabase/migrations/20260418_fees_tier_tables.sql` — TIER-01/02/03 tables + 10 indexes + table/column comments
- `supabase/migrations/20260418_tier_promotion_functions.sql` — TIER-04 (Darwin-only) + TIER-05 (stub) SQL functions

## Decisions Made

- Followed plan exactly as written. All column names, types, constraints, index definitions, and function bodies match the specification in `62A-03-PLAN.md` tasks 1–2 verbatim.
- Verified all grep-based acceptance criteria pass on the created files (see Self-Check below).

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- **Pytest verification deferred to downstream plans.** The plan's `<verify>` block calls out `pytest fee_crawler/tests/test_tier_schemas.py` etc., but those test files are created by Plan 62A-01 (conftest.py + test stubs) and require the agent_events table from Plan 62A-02 and agent_messages from Plan 62A-04. Since Plan 62A-03 runs in Wave 0 in parallel with 62A-01/02/04, none of those dependencies are present in this worktree. The plan's acceptance criteria explicitly notes: *"test_adversarial_gate_exists needs agent_messages table — delivered Plan 62A-04 — mark as xfail if run before 62A-04 merges, or run after 62A-04"*. Grep-based acceptance criteria all pass; integration verification happens after Wave 0 merge.
- **Worktree base rewind.** The worktree HEAD was at `01fdcde` (pre-62A planning); expected base was `f418129ec3558276c986d5a8e830fd942fa3e142` (post-62A planning). Clean `git reset --hard f418129` brought the phase directory into the worktree. No local changes were lost.

## User Setup Required

None — no external service configuration required. The migrations will be applied via the standard `supabase db push` flow at deploy time (covered by manual-only verification in 62A-VALIDATION.md).

## Next Phase Readiness

- **62A-06** (Darwin-only integration test) can now exercise `promote_to_tier2` against a live schema fixture.
- **62A-09** (write-CRUD tool layer) has concrete Tier 1/2/3 targets to wrap.
- **62A-12** (legacy freeze + backfill) has `fees_raw` as the backfill destination.
- **62A-13** (SC3 tier schema contract) has the tables to probe.
- **62b** will replace the `RAISE NOTICE` in `promote_to_tier3` with a `RAISE EXCEPTION` once Darwin/Knox handshake logic lands; the function signature and call sites remain stable.
- **No blockers identified.**

## Self-Check: PASSED

### File existence

- FOUND: `supabase/migrations/20260418_fees_tier_tables.sql`
- FOUND: `supabase/migrations/20260418_tier_promotion_functions.sql`
- FOUND: `.planning/phases/62A-agent-foundation-data-layer/62A-03-SUMMARY.md`

### Commit existence

- FOUND: `16374ea` (Task 1: three-tier fee tables)
- FOUND: `781d639` (Task 2: tier promotion SQL functions)

### Grep-based acceptance checks (all PASS)

- `fees_tier_tables.sql` contains `CREATE TABLE IF NOT EXISTS fees_raw`, `CREATE TABLE IF NOT EXISTS fees_verified`, `CREATE TABLE IF NOT EXISTS fees_published`
- `fees_verified` row declares `canonical_fee_key           TEXT NOT NULL`
- `fees_verified.fee_raw_id` declares `BIGINT NOT NULL REFERENCES fees_raw(fee_raw_id)`
- `fees_published.lineage_ref` declares `BIGINT NOT NULL REFERENCES fees_verified(fee_verified_id)`
- `fees_published.published_by_adversarial_event_id` declares `UUID NOT NULL`
- 10 `CREATE INDEX IF NOT EXISTS fees_*` lines (≥ 10 required)
- `tier_promotion_functions.sql` contains `CREATE OR REPLACE FUNCTION promote_to_tier2(` and `CREATE OR REPLACE FUNCTION promote_to_tier3(`
- `IF p_agent_name IS DISTINCT FROM 'darwin'` appears exactly 1 time
- `INSERT INTO agent_events` appears exactly 2 times
- `RAISE NOTICE` present on adversarial-handshake-missing path (62b replaces with RAISE EXCEPTION)

---
*Phase: 62A-agent-foundation-data-layer*
*Plan: 03*
*Completed: 2026-04-16*
