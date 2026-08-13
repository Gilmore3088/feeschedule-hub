---
phase: 62A
plan: 02
type: execute
wave: 0
depends_on: []
files_modified:
  - supabase/migrations/20260417_agent_events_partitioned.sql
  - supabase/migrations/20260417_agent_auth_log_partitioned.sql
autonomous: true
requirements:
  - AGENT-01
  - AGENT-03
  - AGENT-04
must_haves:
  truths:
    - "Developer can SELECT * FROM agent_events LIMIT 0 without error (table + partitions exist)"
    - "Developer can SELECT * FROM agent_auth_log LIMIT 0 without error"
    - "EXPLAIN on `WHERE agent_name='knox' AND created_at > now() - interval '1 hour'` shows partition pruning to current partition + default"
    - "`test_agent_events_has_required_columns` and `test_agent_events_is_partitioned` pass"
    - "`test_auth_log_has_required_columns` passes"
  artifacts:
    - path: "supabase/migrations/20260417_agent_events_partitioned.sql"
      provides: "agent_events parent table, default partition, current+next month partitions, 5 indexes, maintain_agent_events_partitions() function"
      contains: "PARTITION BY RANGE (created_at)"
    - path: "supabase/migrations/20260417_agent_auth_log_partitioned.sql"
      provides: "agent_auth_log parent, default partition, current+next month, 3 indexes, shared maintenance function"
      contains: "PARTITION BY RANGE (created_at)"
  key_links:
    - from: "supabase/migrations/20260417_agent_events_partitioned.sql"
      to: "pg_cron (Supabase production)"
      via: "cron.schedule() call installing maintenance-function on 1st of month"
      pattern: "cron\\.schedule.*maintain_agent_events_partitions"
    - from: "fee_crawler/tests/test_agent_events_schema.py"
      to: "agent_events partitioned table"
      via: "db_schema fixture applies this migration and probes pg_partitioned_table"
      pattern: "pg_partitioned_table"
---

<objective>
Land the two foundational append-only event-log tables for the agent data layer: `agent_events` (AGENT-01/03) and `agent_auth_log` (AGENT-04), both monthly-RANGE-partitioned on `created_at` with 18-month retention, the full column contract from RESEARCH.md §7.1 and §7.2, all required indexes, and a `maintain_agent_events_partitions()` SQL function that `pg_cron` invokes on the 1st of each month in production. CI/test Postgres (no pg_cron) calls the function manually.

Purpose: Every downstream plan writes to these tables through the gateway. Without the partitioning + indexes landing first, SC1 sub-second query performance is undefined and AGENT-02/05 integration tests have nowhere to insert rows.

Output: Two Supabase migrations that apply cleanly against a fresh schema and against the test fixture; `test_agent_events_schema.py` and `test_agent_auth_log.py` schema probes pass.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md
@.planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md
@.planning/phases/62A-agent-foundation-data-layer/62A-VALIDATION.md
@supabase/migrations/20260410_classification_cache.sql
@supabase/migrations/20260410_snapshot_tables.sql
@fee_crawler/tests/test_agent_events_schema.py
@fee_crawler/tests/test_agent_auth_log.py
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Production DB → agent_events writes | Partition key must match `created_at`; out-of-range writes fall to DEFAULT partition (never fail) |
| pg_cron → maintenance function | Runs as superuser/service role; creates partitions on schedule |
| 18-month retention → archive | Detached partitions renamed `_archived`; no data loss, but data becomes read-only |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-62A02-01 | Denial of Service | agent_events write amplification (10M+ rows/yr if every tool call writes) | medium | mitigate | Partitioning + 18-month retention caps active-partition size; `(agent_name, created_at DESC)` index prevents full scans. Plan 62A-13 verifies sub-second perf |
| T-62A02-02 | Information Disclosure | JSONB payloads contain LLM prompts (may include PII, API keys) | high | mitigate | D-12 compactor (90-day → R2) is future work; 62a caps inline payload to 64KB via application-layer check in gateway (Plan 62A-05). Migration adds comment documenting the cap |
| T-62A02-03 | Tampering | cross-partition FK `parent_event_id → event_id` not enforceable at DB level | medium | accept | Application gateway inserts parent before child; documented in column comment. SEC-04 (Phase 68) adds DB-level constraints via policy |
| T-62A02-04 | Repudiation | `reasoning_hash` BYTEA not cryptographically signed — agent could forge | high | mitigate | Hash is sha256(input_prompt + output); computed server-side in gateway (Plan 62A-05); agent cannot write directly to agent_events (service-role at Modal). SEC-04 adds JWT signing |
| T-62A02-05 | Elevation of Privilege | DEFAULT partition accumulates unbounded if maintenance fails | medium | mitigate | Maintenance function idempotent (`IF NOT EXISTS` on create); `NOTICE` log line on detach. Plan 62A-13 adds a test that invokes the function and asserts next-month partition appears |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Write supabase/migrations/20260417_agent_events_partitioned.sql</name>
  <files>supabase/migrations/20260417_agent_events_partitioned.sql</files>
  <read_first>
    - supabase/migrations/20260410_classification_cache.sql (recent migration style — no transactions, no \echo)
    - supabase/migrations/20260410_snapshot_tables.sql (CREATE TABLE IF NOT EXISTS patterns)
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §1 (partitioning SQL) + §7.1 (agent_events schema)
    - fee_crawler/tests/test_agent_events_schema.py (tells you exactly which columns + indexes are asserted)
  </read_first>
  <action>
Create file `supabase/migrations/20260417_agent_events_partitioned.sql` with exactly this content:

```sql
-- Phase 62a — AGENT-01, AGENT-03
-- agent_events: append-only event log; every agent action writes one row.
-- Monthly RANGE partitioning on created_at; 18-month retention via maintenance function.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Parent (no data stored here; all rows land in a child partition)
CREATE TABLE IF NOT EXISTS agent_events (
    event_id        UUID        NOT NULL DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    agent_name      TEXT        NOT NULL,
    action          TEXT        NOT NULL,
    tool_name       TEXT,
    entity          TEXT,
    entity_id       TEXT,
    status          TEXT        NOT NULL CHECK (status IN ('pending','success','error','budget_halt')),
    cost_cents      INTEGER     NOT NULL DEFAULT 0,
    confidence      NUMERIC(5,4),
    parent_event_id UUID,
    correlation_id  UUID        NOT NULL DEFAULT gen_random_uuid(),
    reasoning_hash  BYTEA,
    input_payload   JSONB,
    output_payload  JSONB,
    source_refs     JSONB,
    error           JSONB,
    -- NOTE: partition key (created_at) must be part of PRIMARY KEY.
    -- parent_event_id -> event_id is a cross-partition logical FK (enforced by gateway, not DB).
    PRIMARY KEY (event_id, created_at)
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE  agent_events IS 'Phase 62a AGENT-01: append-only event log for every agent tool call. Partitioned monthly on created_at with 18-month retention.';
COMMENT ON COLUMN agent_events.parent_event_id IS 'Logical FK to agent_events.event_id; not DB-enforced because cross-partition FKs are not supported.';
COMMENT ON COLUMN agent_events.input_payload  IS 'Inline JSONB capped at 64KB by gateway; oversized payloads land as {r2_key, sha256, size} pointer.';
COMMENT ON COLUMN agent_events.reasoning_hash IS 'sha256(input_prompt || output) computed by gateway; BYTEA length 32.';

-- DEFAULT partition catches late-arriving or out-of-range rows.
CREATE TABLE IF NOT EXISTS agent_events_default PARTITION OF agent_events DEFAULT;

-- Current + next month partitions (bootstrap; maintenance function creates future ones).
-- NOTE: use DO blocks for idempotent dynamic bounds based on current month.
DO $$
DECLARE
    this_month  DATE := date_trunc('month', NOW())::DATE;
    next_month  DATE := (date_trunc('month', NOW()) + INTERVAL '1 month')::DATE;
    after_month DATE := (date_trunc('month', NOW()) + INTERVAL '2 months')::DATE;
    this_name   TEXT := 'agent_events_' || to_char(this_month, 'YYYY_MM');
    next_name   TEXT := 'agent_events_' || to_char(next_month, 'YYYY_MM');
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = this_name) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF agent_events FOR VALUES FROM (%L) TO (%L)',
            this_name, this_month, next_month
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = next_name) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF agent_events FOR VALUES FROM (%L) TO (%L)',
            next_name, next_month, after_month
        );
    END IF;
END $$;

-- Local indexes auto-propagate to every child partition (Postgres 12+).
CREATE INDEX IF NOT EXISTS agent_events_agent_time_idx
    ON agent_events (agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_events_correlation_idx
    ON agent_events (correlation_id);
CREATE INDEX IF NOT EXISTS agent_events_entity_idx
    ON agent_events (entity, entity_id);
CREATE INDEX IF NOT EXISTS agent_events_parent_idx
    ON agent_events (parent_event_id);
CREATE INDEX IF NOT EXISTS agent_events_error_idx
    ON agent_events (tool_name, status) WHERE status = 'error';

-- Maintenance function: creates next month's partition, detaches 18-month-old ones.
CREATE OR REPLACE FUNCTION maintain_agent_events_partitions() RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    next_month     DATE := (date_trunc('month', NOW()) + INTERVAL '1 month')::DATE;
    after_month    DATE := (date_trunc('month', NOW()) + INTERVAL '2 months')::DATE;
    archive_cutoff DATE := (date_trunc('month', NOW()) - INTERVAL '18 months')::DATE;
    next_name      TEXT := 'agent_events_' || to_char(next_month, 'YYYY_MM');
    r              RECORD;
BEGIN
    -- 1. Ensure next month's partition exists.
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = next_name) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF agent_events FOR VALUES FROM (%L) TO (%L)',
            next_name, next_month, after_month
        );
        RAISE NOTICE 'Created partition %', next_name;
    END IF;

    -- 2. Detach + rename partitions older than 18 months. Follow-up Modal job archives to R2 + drops.
    FOR r IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_inherits i ON c.oid = i.inhrelid
        JOIN pg_class p    ON p.oid = i.inhparent
        WHERE p.relname = 'agent_events'
          AND c.relname ~ '^agent_events_\d{4}_\d{2}$'
          AND to_date(substring(c.relname FROM '\d{4}_\d{2}$'), 'YYYY_MM') < archive_cutoff
    LOOP
        EXECUTE format('ALTER TABLE agent_events DETACH PARTITION %I', r.relname);
        EXECUTE format('ALTER TABLE %I RENAME TO %I', r.relname, r.relname || '_archived');
        RAISE NOTICE 'Archived partition %', r.relname;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION maintain_agent_events_partitions() IS
    'Phase 62a: creates next month partition + detaches 18-month-old partitions to *_archived. Scheduled via pg_cron in production; called manually in CI.';

-- pg_cron schedule: only attempt if pg_cron is installed (Supabase production).
-- CI Postgres containers skip this block cleanly via the IF EXISTS probe.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('maintain-agent-events') WHERE TRUE
        ON CONFLICT DO NOTHING;  -- no-op if not previously scheduled
        PERFORM cron.schedule(
            'maintain-agent-events',
            '0 2 1 * *',  -- 02:00 UTC on the 1st of each month
            $cron$SELECT maintain_agent_events_partitions()$cron$
        );
    ELSE
        RAISE NOTICE 'pg_cron not installed; call maintain_agent_events_partitions() manually in CI.';
    END IF;
EXCEPTION WHEN others THEN
    -- If cron schema is missing (local Postgres), swallow and continue.
    RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END $$;
```

Important notes for the executor:
- The `ON CONFLICT DO NOTHING` on `cron.unschedule` is defensive — if `cron.unschedule` doesn't exist (old pg_cron), the EXCEPTION handler catches it.
- The DO $$ ... $$ blocks use the heredoc `$cron$...$cron$` quote tag to avoid conflict with the outer `$$`.
- `CREATE EXTENSION IF NOT EXISTS pgcrypto` is safe on Supabase (already enabled) and on vanilla Postgres 15.
  </action>
  <verify>
    <automated>export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://postgres:postgres@localhost:5433/bfi_test}" && pytest fee_crawler/tests/test_agent_events_schema.py -v --no-header</automated>
  </verify>
  <acceptance_criteria>
    - `supabase/migrations/20260417_agent_events_partitioned.sql` exists
    - File contains `PARTITION BY RANGE (created_at)` exactly once
    - File contains all 17 required columns: `grep -cE "event_id|created_at|agent_name|action|tool_name|entity|entity_id|status|cost_cents|confidence|parent_event_id|correlation_id|reasoning_hash|input_payload|output_payload|source_refs|error" supabase/migrations/20260417_agent_events_partitioned.sql` returns at least 17
    - File contains `CHECK (status IN ('pending','success','error','budget_halt'))`
    - File contains 5 `CREATE INDEX IF NOT EXISTS agent_events_`
    - File contains `CREATE OR REPLACE FUNCTION maintain_agent_events_partitions()`
    - File contains `PARTITION OF agent_events DEFAULT`
    - File contains `pg_cron` reference and `cron.schedule`
    - `pytest fee_crawler/tests/test_agent_events_schema.py` passes all three tests against a fresh schema fixture
  </acceptance_criteria>
  <done>agent_events partitioned table + 5 indexes + maintenance function + pg_cron schedule land in supabase/migrations; schema probe tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Write supabase/migrations/20260417_agent_auth_log_partitioned.sql</name>
  <files>supabase/migrations/20260417_agent_auth_log_partitioned.sql</files>
  <read_first>
    - supabase/migrations/20260417_agent_events_partitioned.sql (sibling migration — mirror structure)
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §7.2 (agent_auth_log schema)
    - fee_crawler/tests/test_agent_auth_log.py (required columns list)
  </read_first>
  <action>
Create file `supabase/migrations/20260417_agent_auth_log_partitioned.sql` with exactly this content:

```sql
-- Phase 62a — AGENT-04
-- agent_auth_log: identity audit for every agent-triggered write to user-facing tables.
-- Same partitioning pattern as agent_events.

CREATE TABLE IF NOT EXISTS agent_auth_log (
    auth_id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    agent_event_id   UUID        NOT NULL,  -- logical FK to agent_events.event_id (cross-partition)
    agent_name       TEXT        NOT NULL,
    actor_type       TEXT        NOT NULL CHECK (actor_type IN ('agent','user','system')),
    actor_id         TEXT,                   -- user.id when actor_type='user', else NULL
    tool_name        TEXT        NOT NULL,
    entity           TEXT        NOT NULL,
    entity_id        TEXT,
    before_value     JSONB,
    after_value      JSONB,
    reasoning_hash   BYTEA,
    parent_event_id  UUID,
    PRIMARY KEY (auth_id, created_at)
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE  agent_auth_log IS 'Phase 62a AGENT-04: full forensic audit per agent write. before_value + after_value JSONB snapshots + reasoning_hash.';
COMMENT ON COLUMN agent_auth_log.agent_event_id IS 'Logical FK to agent_events.event_id; inserted by gateway AFTER the agent_events row lands in the same transaction.';
COMMENT ON COLUMN agent_auth_log.actor_type IS 'agent|user|system. SEC-04 (Phase 68) adds JWT-based enforcement; this phase trusts the gateway.';

CREATE TABLE IF NOT EXISTS agent_auth_log_default PARTITION OF agent_auth_log DEFAULT;

DO $$
DECLARE
    this_month  DATE := date_trunc('month', NOW())::DATE;
    next_month  DATE := (date_trunc('month', NOW()) + INTERVAL '1 month')::DATE;
    after_month DATE := (date_trunc('month', NOW()) + INTERVAL '2 months')::DATE;
    this_name   TEXT := 'agent_auth_log_' || to_char(this_month, 'YYYY_MM');
    next_name   TEXT := 'agent_auth_log_' || to_char(next_month, 'YYYY_MM');
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = this_name) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF agent_auth_log FOR VALUES FROM (%L) TO (%L)',
            this_name, this_month, next_month
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = next_name) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF agent_auth_log FOR VALUES FROM (%L) TO (%L)',
            next_name, next_month, after_month
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS agent_auth_log_event_idx
    ON agent_auth_log (agent_event_id);
CREATE INDEX IF NOT EXISTS agent_auth_log_entity_idx
    ON agent_auth_log (entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_auth_log_agent_time_idx
    ON agent_auth_log (agent_name, created_at DESC);

CREATE OR REPLACE FUNCTION maintain_agent_auth_log_partitions() RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    next_month     DATE := (date_trunc('month', NOW()) + INTERVAL '1 month')::DATE;
    after_month    DATE := (date_trunc('month', NOW()) + INTERVAL '2 months')::DATE;
    archive_cutoff DATE := (date_trunc('month', NOW()) - INTERVAL '18 months')::DATE;
    next_name      TEXT := 'agent_auth_log_' || to_char(next_month, 'YYYY_MM');
    r              RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = next_name) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF agent_auth_log FOR VALUES FROM (%L) TO (%L)',
            next_name, next_month, after_month
        );
        RAISE NOTICE 'Created partition %', next_name;
    END IF;

    FOR r IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_inherits i ON c.oid = i.inhrelid
        JOIN pg_class p    ON p.oid = i.inhparent
        WHERE p.relname = 'agent_auth_log'
          AND c.relname ~ '^agent_auth_log_\d{4}_\d{2}$'
          AND to_date(substring(c.relname FROM '\d{4}_\d{2}$'), 'YYYY_MM') < archive_cutoff
    LOOP
        EXECUTE format('ALTER TABLE agent_auth_log DETACH PARTITION %I', r.relname);
        EXECUTE format('ALTER TABLE %I RENAME TO %I', r.relname, r.relname || '_archived');
        RAISE NOTICE 'Archived partition %', r.relname;
    END LOOP;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'maintain-agent-auth-log',
            '5 2 1 * *',  -- 5 minutes after agent_events job
            $cron$SELECT maintain_agent_auth_log_partitions()$cron$
        );
    ELSE
        RAISE NOTICE 'pg_cron not installed; call maintain_agent_auth_log_partitions() manually in CI.';
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END $$;
```
  </action>
  <verify>
    <automated>export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://postgres:postgres@localhost:5433/bfi_test}" && pytest fee_crawler/tests/test_agent_auth_log.py -v --no-header</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `supabase/migrations/20260417_agent_auth_log_partitioned.sql`
    - Contains `PARTITION BY RANGE (created_at)`
    - Contains all 13 required columns: `grep -cE "auth_id|created_at|agent_event_id|agent_name|actor_type|actor_id|tool_name|entity|entity_id|before_value|after_value|reasoning_hash|parent_event_id" supabase/migrations/20260417_agent_auth_log_partitioned.sql` returns at least 13
    - Contains `CHECK (actor_type IN ('agent','user','system'))`
    - Contains 3 `CREATE INDEX IF NOT EXISTS agent_auth_log_`
    - Contains `CREATE OR REPLACE FUNCTION maintain_agent_auth_log_partitions()`
    - `pytest fee_crawler/tests/test_agent_auth_log.py::test_auth_log_has_required_columns` passes
  </acceptance_criteria>
  <done>agent_auth_log partitioned table + 3 indexes + maintenance function + pg_cron schedule land; test_auth_log_has_required_columns passes.</done>
</task>

</tasks>

<verification>
Run `pytest fee_crawler/tests/test_agent_events_schema.py fee_crawler/tests/test_agent_auth_log.py -v` against a fresh db_schema fixture. Expect: `test_agent_events_has_required_columns`, `test_agent_events_is_partitioned`, `test_agent_events_has_required_indexes`, `test_auth_log_has_required_columns` all PASS. `test_auth_log_captures_before_and_after` remains xfailed (gateway in Plan 62A-05).
</verification>

<success_criteria>
- 2 new migration files exist in supabase/migrations/
- agent_events partitioned table with 17 columns + 5 indexes + DEFAULT + current + next-month partitions
- agent_auth_log partitioned table with 13 columns + 3 indexes + DEFAULT + current + next-month partitions
- Both have `maintain_*_partitions()` SQL functions
- Both have pg_cron.schedule() calls wrapped in EXCEPTION-handled DO blocks (idempotent on CI where pg_cron is absent)
- Schema probe tests pass against db_schema fixture
</success_criteria>

<output>
After completion, create `.planning/phases/62A-agent-foundation-data-layer/62A-02-SUMMARY.md` noting:
- Two migrations landed: agent_events + agent_auth_log both monthly-partitioned
- Requirements AGENT-01, AGENT-03, AGENT-04 (schema portions) satisfied
- pg_cron scheduling conditional on extension presence — production installs scheduled jobs, CI does not (manual call in perf tests)
- Cross-partition FK limitation documented in table comments; gateway (Plan 62A-05) enforces
</output>
