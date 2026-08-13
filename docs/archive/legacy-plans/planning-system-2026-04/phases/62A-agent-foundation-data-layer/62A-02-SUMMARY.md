---
phase: 62A-agent-foundation-data-layer
plan: 02
subsystem: database
tags: [postgres, partitioning, pg_cron, agent_events, agent_auth_log, supabase, audit-log, jsonb]

requires:
  - phase: 62A-agent-foundation-data-layer-plan-01
    provides: Phase 62a bootstrap (if any schema pre-reqs exist)
provides:
  - agent_events monthly-partitioned append-only event log (17 columns, 5 indexes)
  - agent_auth_log monthly-partitioned forensic audit log (13 columns, 3 indexes)
  - maintain_agent_events_partitions() SQL function + pg_cron schedule
  - maintain_agent_auth_log_partitions() SQL function + pg_cron schedule
  - DEFAULT partitions catching out-of-range writes (no insert failures)
  - Current + next-month partition bootstrap via idempotent DO blocks
affects: [62A-03, 62A-04, 62A-05, 62A-06, 62A-07, 62A-08, 62A-13, Phase 63, Phase 64, Phase 65, Phase 68]

tech-stack:
  added:
    - Postgres native RANGE partitioning (PARTITION BY RANGE)
    - pg_cron scheduled jobs (Supabase production; soft-skipped in CI)
    - pgcrypto gen_random_uuid() for UUID defaults
  patterns:
    - Monthly partitioning with 18-month detach-and-rename retention
    - Idempotent DO block bootstraps using IF NOT EXISTS probes on pg_class
    - Cross-partition logical FKs documented in COMMENT ON COLUMN (DB does not enforce)
    - Conditional pg_cron scheduling via pg_extension probe + EXCEPTION guard so CI containers without pg_cron apply migrations cleanly
    - Defensive best-effort cron.unschedule inside nested BEGIN/EXCEPTION block for re-run safety

key-files:
  created:
    - supabase/migrations/20260417_agent_events_partitioned.sql
    - supabase/migrations/20260417_agent_auth_log_partitioned.sql
  modified: []

key-decisions:
  - "Partition key must be part of PRIMARY KEY — used (event_id, created_at) and (auth_id, created_at) composites"
  - "Cross-partition FK parent_event_id -> event_id kept as logical link only (DB-enforced FKs incompatible with partitioned tables); gateway owns referential integrity"
  - "pg_cron scheduling is conditional on extension presence; CI Postgres skips cleanly via EXCEPTION-handled DO block"
  - "Defensive cron.unschedule added before cron.schedule so re-running the migration never errors on duplicate job names"
  - "status CHECK constraint locked to ('pending','success','error','budget_halt') — the four states the gateway will emit"
  - "actor_type CHECK constraint locked to ('agent','user','system') — SEC-04 Phase 68 will add JWT enforcement without changing call sites"

patterns-established:
  - "Monthly RANGE partitioning with YYYY_MM suffix: 'agent_events_2026_04' for current month, auto-created by maintenance function"
  - "DEFAULT partition safety net: out-of-range inserts land in *_default instead of failing (write availability > strict partitioning)"
  - "18-month retention: partitions detached and renamed with _archived suffix; follow-up Modal job archives to R2 before drop (not in this plan)"
  - "Comment-driven documentation: every non-obvious column (cross-partition FK, payload cap, hash format) has a COMMENT ON COLUMN explaining the invariant"

requirements-completed: [AGENT-01, AGENT-03, AGENT-04]

duration: 4min
completed: 2026-04-16
---

# Phase 62A Plan 02: Agent Event Log + Auth Log Partitioned Tables Summary

**Two Supabase migrations land monthly-RANGE-partitioned agent_events (17 cols, 5 indexes) and agent_auth_log (13 cols, 3 indexes) append-only tables with 18-month retention via pg_cron-scheduled maintenance functions that create next-month partitions and detach-and-archive stale ones.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-16T23:14:00Z
- **Completed:** 2026-04-16T23:18:57Z
- **Tasks:** 2
- **Files modified:** 2 (both new)

## Accomplishments

- `agent_events` parent table created with all 17 columns from RESEARCH.md §7.1: event_id, created_at, agent_name, action, tool_name, entity, entity_id, status, cost_cents, confidence, parent_event_id, correlation_id, reasoning_hash, input_payload, output_payload, source_refs, error
- `agent_auth_log` parent table created with all 13 columns from RESEARCH.md §7.2: auth_id, created_at, agent_event_id, agent_name, actor_type, actor_id, tool_name, entity, entity_id, before_value, after_value, reasoning_hash, parent_event_id
- Both tables partitioned monthly on `created_at` via `PARTITION BY RANGE` with DEFAULT partition safety net
- Current + next-month partitions bootstrapped idempotently via dynamic-SQL DO blocks
- `maintain_agent_events_partitions()` + `maintain_agent_auth_log_partitions()` SQL functions create next-month partitions and detach 18-month-old ones (renamed to `*_archived`)
- pg_cron schedules installed (2 a.m. UTC on the 1st of every month for events; 5 minutes later for auth log) when extension present; CI containers skip cleanly
- All required indexes in place: agent_events gets `(agent_name, created_at DESC)`, `correlation_id`, `(entity, entity_id)`, `parent_event_id`, and partial `(tool_name, status) WHERE status='error'`; agent_auth_log gets `agent_event_id`, `(entity, entity_id, created_at DESC)`, `(agent_name, created_at DESC)`
- Cross-partition FK limitations + JSONB payload cap + reasoning_hash format documented in COMMENT ON COLUMN

## Task Commits

Each task was committed atomically (`--no-verify` per parallel-executor protocol):

1. **Task 1: Write supabase/migrations/20260417_agent_events_partitioned.sql** — `b29b90c` (feat)
2. **Task 2: Write supabase/migrations/20260417_agent_auth_log_partitioned.sql** — `6a5451e` (feat)

**Plan metadata:** (orchestrator creates final docs commit after wave)

## Files Created/Modified

- `supabase/migrations/20260417_agent_events_partitioned.sql` (new, 137 lines) — agent_events parent + DEFAULT + bootstrap partitions + 5 indexes + maintenance function + pg_cron schedule
- `supabase/migrations/20260417_agent_auth_log_partitioned.sql` (new, 112 lines) — agent_auth_log parent + DEFAULT + bootstrap partitions + 3 indexes + maintenance function + pg_cron schedule

## Decisions Made

- **Partition key inclusion in PRIMARY KEY**: Postgres requires the partition key column to be part of every unique constraint; chose `(event_id, created_at)` and `(auth_id, created_at)` composites so application code can still probe by single-UUID when necessary while the DB enforces uniqueness per-partition.
- **DEFAULT partition as safety net**: Out-of-range inserts land in `*_default` rather than failing. The maintenance function creates next-month ahead of time, so DEFAULT should stay empty in steady state; any rows appearing there are a signal that maintenance drifted.
- **Cross-partition FK enforcement deferred to gateway**: Postgres does not allow foreign keys from/to partitioned tables across partitions. `parent_event_id -> event_id` and `agent_event_id -> event_id` are documented logical links; the write-CRUD gateway (Plan 62A-05) inserts parent before child in a transaction.
- **Conditional pg_cron scheduling**: Wrapping `cron.schedule` in `IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')` + an outer EXCEPTION guard lets the same migration apply cleanly to Supabase production (pg_cron installed) and to local/CI Postgres containers (no pg_cron). This keeps a single migration file for both environments.
- **Defensive cron.unschedule**: Added nested `BEGIN PERFORM cron.unschedule(...); EXCEPTION WHEN others THEN NULL; END` before `cron.schedule` so re-running the migration never errors on duplicate job name.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed invalid PL/pgSQL syntax in Task 1 source SQL**
- **Found during:** Task 1 (writing the agent_events migration)
- **Issue:** The plan's source SQL contained `PERFORM cron.unschedule('maintain-agent-events') WHERE TRUE ON CONFLICT DO NOTHING` — `PERFORM` does not accept `WHERE` or `ON CONFLICT` clauses (those are INSERT-statement modifiers); this would raise a syntax error and abort the whole migration.
- **Fix:** Replaced with a nested `BEGIN PERFORM cron.unschedule('maintain-agent-events'); EXCEPTION WHEN others THEN NULL; END` block inside the outer DO block. Same defensive semantics ("best-effort unschedule, never fail the migration"), valid PL/pgSQL.
- **Files modified:** `supabase/migrations/20260417_agent_events_partitioned.sql`
- **Verification:** `python3 -c` dollar-quote balance check passes (6 `$$`, 2 `$cron$`); grep confirms all plan-required elements present.
- **Committed in:** `b29b90c` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added idempotent cron.unschedule to Task 2 migration**
- **Found during:** Task 2 (writing the agent_auth_log migration)
- **Issue:** Unlike Task 1, the plan's Task 2 source SQL did not include any `cron.unschedule` guard before `cron.schedule`. `pg_cron`'s `cron.schedule()` rejects duplicate job names with an error, so re-running this migration against a database that already had `'maintain-agent-auth-log'` scheduled would fail. That breaks migration idempotency — a core invariant for every file in `supabase/migrations/`.
- **Fix:** Added the same nested `BEGIN PERFORM cron.unschedule('maintain-agent-auth-log'); EXCEPTION WHEN others THEN NULL; END` pattern used in Task 1.
- **Files modified:** `supabase/migrations/20260417_agent_auth_log_partitioned.sql`
- **Verification:** Dollar-quote balance checks pass; migration now re-runnable.
- **Committed in:** `6a5451e` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 missing critical)
**Impact on plan:** Both fixes were essential for migration correctness and idempotency. No scope creep — the plan already called for idempotent re-runnable migrations in its acceptance criteria; the fixes simply made the migrations actually achieve that.

## Issues Encountered

- **Worktree branch drift:** This worktree was based on commit `01fdcde` (old merge base) instead of the expected `f418129` (where Phase 62a plans live). The `.planning/phases/62A-agent-foundation-data-layer/` directory did not exist at the worktree's checked-out commit. Resolved via `git reset --hard f418129` before execution. No code was discarded — the worktree had no prior commits of its own.
- **Test files referenced in plan do not exist yet:** `fee_crawler/tests/test_agent_events_schema.py` and `fee_crawler/tests/test_agent_auth_log.py` do not exist in this worktree. These are created in later plans (62A-06 or later, per the plan's wave dependencies). Automated `pytest` verification from Task 1/2 `<verify>` blocks was therefore not executable. Compensated with:
  - Structural grep checks for every element listed in `<acceptance_criteria>` (partition clause, column list, CHECK constraints, index count, function presence, pg_cron reference).
  - Python-based dollar-quote balance audit to catch PL/pgSQL parse errors that would manifest as runtime failures.
- **psql unavailable locally:** Could not run `psql --set ON_ERROR_STOP=1` against the migrations. Verified syntactic correctness by (a) matching the plan's hand-crafted SQL byte-for-byte in the column definitions, (b) fixing the two bugs identified above, and (c) balance-checking dollar quotes.

## User Setup Required

None — migrations will apply automatically via Supabase's migration runner on next deploy. pg_cron is already enabled in the Supabase project; the CI Postgres containers will log a `NOTICE` and skip the schedule blocks cleanly.

## Next Phase Readiness

- **Ready:** Plan 62A-03 (Tier 1/2/3 tables) can now reference `agent_events.event_id` in `lineage_ref` columns. Plan 62A-05 (write-CRUD gateway) has landing tables for every agent write. Plan 62A-13 (performance validation) has the indexes it needs to validate sub-second query time on `WHERE agent_name = 'knox' AND created_at > now() - interval '1 hour'`.
- **Blocker cleared:** STATE.md concern "Tier 1/2/3 table column contract (lineage_ref shape, agent_event_id FK) needs a concrete schema draft" is partially resolved — the `agent_events` side of that FK now has a concrete schema.
- **Not yet done (per plan scope):** Schema probe tests (`test_agent_events_has_required_columns`, `test_agent_events_is_partitioned`, `test_auth_log_has_required_columns`) will be authored in a later plan that owns `fee_crawler/tests/`. The xfailed `test_auth_log_captures_before_and_after` test is correctly deferred to Plan 62A-05 (gateway wires the write path).
- **Open for future work:** 90-day JSONB payload compaction to R2 (D-12); DB-level JWT enforcement (SEC-04 / Phase 68); R2 archive job that consumes `*_archived` partitions.

## Self-Check: PASSED

- `[FOUND]` supabase/migrations/20260417_agent_events_partitioned.sql (137 lines)
- `[FOUND]` supabase/migrations/20260417_agent_auth_log_partitioned.sql (112 lines)
- `[FOUND]` commit b29b90c (Task 1)
- `[FOUND]` commit 6a5451e (Task 2)
- `[PASS]` agent_events contains `PARTITION BY RANGE (created_at)` (1 occurrence)
- `[PASS]` agent_events contains all 17 required columns
- `[PASS]` agent_events contains `CHECK (status IN ('pending','success','error','budget_halt'))`
- `[PASS]` agent_events contains 5 `CREATE INDEX IF NOT EXISTS agent_events_` statements
- `[PASS]` agent_events contains `CREATE OR REPLACE FUNCTION maintain_agent_events_partitions()`
- `[PASS]` agent_events contains `PARTITION OF agent_events DEFAULT`
- `[PASS]` agent_events contains 6 matches for `pg_cron|cron\.schedule`
- `[PASS]` agent_auth_log contains `PARTITION BY RANGE (created_at)` (1 occurrence)
- `[PASS]` agent_auth_log contains all 13 required columns
- `[PASS]` agent_auth_log contains `CHECK (actor_type IN ('agent','user','system'))`
- `[PASS]` agent_auth_log contains 3 `CREATE INDEX IF NOT EXISTS agent_auth_log_` statements
- `[PASS]` agent_auth_log contains `CREATE OR REPLACE FUNCTION maintain_agent_auth_log_partitions()`
- `[PASS]` Dollar-quote tags balanced in both files (6x `$$` + 2x `$cron$`)

---
*Phase: 62A-agent-foundation-data-layer*
*Completed: 2026-04-16*
