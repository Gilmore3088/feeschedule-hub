---
phase: 62B
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260501_agent_events_status_widen.sql
  - supabase/migrations/20260502_agent_registry_lifecycle_state.sql
  - supabase/migrations/20260503_agent_lessons.sql
  - supabase/migrations/20260504_shadow_outputs.sql
  - supabase/migrations/20260505_canary_runs.sql
  - supabase/migrations/20260506_lineage_graph_function.sql
  - supabase/migrations/20260507_v_agent_reasoning_trace.sql
  - supabase/migrations/20260508_agent_messages_notify_trigger.sql
  - supabase/migrations/20260509_agent_health_rollup.sql
  - supabase/migrations/20260510_promote_to_tier3_tighten.sql
  - fee_crawler/tests/test_62b_migrations.py
  - fee_crawler/tests/test_lineage_graph.py
autonomous: false
requirements: [OBS-01, OBS-02]
must_haves:
  truths:
    - "All 10 new 62b migrations apply cleanly against the staging DB"
    - "lineage_graph(fee_published_id) returns a nested JSON tree with tier_3 → tier_2 → tier_1 → event_chain in one call"
    - "agent_events.status CHECK accepts improve_rejected and shadow_diff"
    - "agent_registry has lifecycle_state column (enum q1_validation|q2_high_confidence|q3_autonomy|paused) and review_schedule column"
    - "shadow_outputs, canary_runs, agent_lessons, agent_health_rollup tables exist with FK to agent_registry(agent_name)"
    - "v_agent_reasoning_trace view unions agent_events and agent_messages ordered by created_at"
    - "agent_messages AFTER INSERT trigger fires pg_notify with message_id payload on channel 'agent_msg_<recipient_agent>'"
    - "promote_to_tier3 tightens from RAISE NOTICE to RAISE EXCEPTION unless both darwin and knox accept messages exist for the fee_verified_id"
  artifacts:
    - path: supabase/migrations/20260501_agent_events_status_widen.sql
      provides: "Drops old CHECK constraint, adds new one including improve_rejected + shadow_diff; adds is_shadow boolean column"
    - path: supabase/migrations/20260506_lineage_graph_function.sql
      provides: "lineage_graph(BIGINT) RETURNS JSONB plpgsql function"
    - path: supabase/migrations/20260508_agent_messages_notify_trigger.sql
      provides: "AFTER INSERT trigger on agent_messages calling agent_messages_notify()"
  key_links:
    - from: "lineage_graph() function"
      to: "fees_published → fees_verified → fees_raw → agent_events parent chain"
      via: "SELECT ... INTO rowtype + recursive CTE walking parent_event_id"
      pattern: "WITH RECURSIVE chain AS"
    - from: "agent_messages_notify trigger"
      to: "pg_notify('agent_msg_' || NEW.recipient_agent, NEW.message_id::text)"
      via: "plpgsql trigger function"
      pattern: "PERFORM pg_notify"
---

<objective>
Land all 10 new 62b schema migrations in `supabase/migrations/` and push them to the live Supabase DB. These migrations are the infrastructure all downstream plans (62B-02..62B-11) assume exists. Also ship two pytest files that verify each migration's structural contract and exercise `lineage_graph()` end-to-end.

Purpose: Every subsequent plan in Wave 2+ writes Python/TypeScript against columns/tables/functions declared here. If any migration is missing, wave 2+ execution blocks.

Output: 10 new migration files, 2 new pytest files, live DB updated via `supabase db push`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md
@.planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md
@.planning/phases/62B-agent-foundation-runtime-layer/62B-VALIDATION.md
@.planning/phases/62A-agent-foundation-data-layer/62A-VERIFICATION.md
@supabase/migrations/20260417_agent_events_partitioned.sql
@supabase/migrations/20260419_agent_messages.sql
@supabase/migrations/20260420_fees_tier_tables.sql
@supabase/migrations/20260421_tier_promotion_functions.sql
@supabase/migrations/20260422_agent_registry_and_budgets.sql

<interfaces>
Existing schema this plan builds on (from 62a migrations — do not modify):

From `20260417_agent_events_partitioned.sql`:
- `agent_events.status` CHECK (`'pending'|'success'|'error'|'budget_halt'`) — WIDENING HERE
- `agent_events.event_id UUID PK`, `parent_event_id UUID`, `correlation_id UUID`, `confidence NUMERIC`, `cost_cents INT`, `input_payload JSONB`, `output_payload JSONB`
- index `agent_events (agent_name, created_at DESC)`, `(parent_event_id)`, `(correlation_id)`

From `20260419_agent_messages.sql`:
- `agent_messages (message_id UUID PK, sender_agent TEXT, recipient_agent TEXT, intent TEXT, state TEXT DEFAULT 'open', correlation_id UUID, parent_message_id UUID, parent_event_id UUID, payload JSONB, round_number INT DEFAULT 1, expires_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ, resolved_by_event_id UUID)`
- indexes: `(recipient_agent, state, created_at DESC)`, `(correlation_id)`, `(expires_at)`

From `20260420_fees_tier_tables.sql`:
- `fees_published (fee_published_id BIGSERIAL PK, lineage_ref BIGINT NOT NULL REFERENCES fees_verified(fee_verified_id), ...)`
- `fees_verified (fee_verified_id BIGSERIAL PK, fee_raw_id BIGINT REFERENCES fees_raw(fee_raw_id), canonical_fee_key TEXT NOT NULL, verified_by_agent_event_id UUID, ...)`
- `fees_raw (fee_raw_id BIGSERIAL PK, source_url TEXT, document_r2_key TEXT, extraction_confidence NUMERIC, agent_event_id UUID, ...)`

From `20260422_agent_registry_and_budgets.sql`:
- `agent_registry (agent_name TEXT PK, display_name, description, role, parent_agent, state_code, is_active)` — NO `lifecycle_state` or `review_schedule` yet

From `20260421_tier_promotion_functions.sql`:
- `promote_to_tier3(p_fee_verified_id BIGINT, p_event_id UUID)` currently `RAISE NOTICE 'adversarial handshake not yet wired (62b). Permitting for 62a bootstrap.'` — TIGHTENING HERE
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Ship migrations 20260501..20260505 (agent_events status widening + lifecycle_state + agent_lessons + shadow_outputs + canary_runs)</name>
  <files>supabase/migrations/20260501_agent_events_status_widen.sql, supabase/migrations/20260502_agent_registry_lifecycle_state.sql, supabase/migrations/20260503_agent_lessons.sql, supabase/migrations/20260504_shadow_outputs.sql, supabase/migrations/20260505_canary_runs.sql, fee_crawler/tests/test_62b_migrations.py</files>
  <read_first>
    - supabase/migrations/20260417_agent_events_partitioned.sql (existing status CHECK we're widening — read lines 14-18)
    - supabase/migrations/20260422_agent_registry_and_budgets.sql (existing agent_registry structure)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Mechanics 5 (shadow_outputs schema) and §Mechanics 7 (canary_runs schema) and §Mechanics 8 (lifecycle_state seed)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md D-18..D-22 (lifecycle/shadow/canary decisions)
    - fee_crawler/tests/conftest.py (per-schema test fixture used by new test)
  </read_first>
  <behavior>
    - Test 1: agent_events status CHECK accepts 'improve_rejected' and 'shadow_diff' after migration
    - Test 2: agent_events.is_shadow column exists, default FALSE
    - Test 3: agent_registry.lifecycle_state and agent_registry.review_schedule columns exist; 55 agents present with defaults
    - Test 4: agent_lessons, shadow_outputs, canary_runs tables exist with expected columns + FKs to agent_registry(agent_name)
    - Test 5: canary_runs has UNIQUE partial index on (agent_name, corpus_version) WHERE is_baseline
  </behavior>
  <action>
Create each migration file verbatim (per research §Mechanics 5, 7, 8 and D-18..D-22):

**File 1: `supabase/migrations/20260501_agent_events_status_widen.sql`**
```sql
-- Phase 62b — widens agent_events.status CHECK for improve_rejected (D-08) + shadow_diff (D-21).
-- Adds is_shadow boolean column (D-21) for quick filtering of shadow-mode rows.

BEGIN;

ALTER TABLE agent_events DROP CONSTRAINT IF EXISTS agent_events_status_check;
ALTER TABLE agent_events ADD CONSTRAINT agent_events_status_check
    CHECK (status IN ('pending','success','error','budget_halt','improve_rejected','shadow_diff'));

ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS is_shadow BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS agent_events_shadow_idx
    ON agent_events (is_shadow) WHERE is_shadow;

COMMENT ON COLUMN agent_events.is_shadow IS
'Phase 62b D-21: TRUE when emitted under a shadow_run_id context; business-table writes suppressed to shadow_outputs.';

COMMIT;
```

**File 2: `supabase/migrations/20260502_agent_registry_lifecycle_state.sql`**
```sql
-- Phase 62b BOOT-01 / D-22 / D-05:
--   lifecycle_state enum: q1_validation | q2_high_confidence | q3_autonomy | paused
--   review_schedule: cron string read by pg_cron dispatcher (62B-08)

BEGIN;

ALTER TABLE agent_registry
    ADD COLUMN IF NOT EXISTS lifecycle_state TEXT NOT NULL DEFAULT 'q1_validation'
        CHECK (lifecycle_state IN ('q1_validation','q2_high_confidence','q3_autonomy','paused'));

ALTER TABLE agent_registry
    ADD COLUMN IF NOT EXISTS review_schedule TEXT;

COMMENT ON COLUMN agent_registry.lifecycle_state IS
'Phase 62b BOOT-01: AgentBase reads on turn start. Q1 = hold every output for human approval; Q2 = auto-commit confidence>=0.85 + random 5% to digest; Q3 = autonomy + quarterly sampling; paused = abort turn.';

COMMENT ON COLUMN agent_registry.review_schedule IS
'Phase 62b D-05: cron expression consumed by pg_cron agent-review-<agent_name> jobs (migration 20260510_pg_cron_review_dispatcher in plan 62B-08).';

-- Seed per-role review schedules. Hamilton + Atlas stay NULL (Hamilton is TS caller; Atlas schedules others).
UPDATE agent_registry SET review_schedule = '*/15 * * * *' WHERE agent_name = 'knox';
UPDATE agent_registry SET review_schedule = '0 * * * *'    WHERE agent_name = 'darwin';
UPDATE agent_registry SET review_schedule = '0 */4 * * *'  WHERE role = 'state_agent';

COMMIT;
```

**File 3: `supabase/migrations/20260503_agent_lessons.sql`**
```sql
-- Phase 62b LOOP-05: knowledge table written by AgentBase.understand().

BEGIN;

CREATE TABLE IF NOT EXISTS agent_lessons (
    lesson_id           BIGSERIAL PRIMARY KEY,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    agent_name          TEXT NOT NULL REFERENCES agent_registry(agent_name),
    lesson_name         TEXT NOT NULL,
    description         TEXT NOT NULL,
    evidence_refs       JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence          NUMERIC(5,4),
    superseded_by       BIGINT REFERENCES agent_lessons(lesson_id),
    source_event_id     UUID,
    UNIQUE (agent_name, lesson_name)
);

CREATE INDEX IF NOT EXISTS agent_lessons_agent_idx
    ON agent_lessons (agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_lessons_active_idx
    ON agent_lessons (agent_name) WHERE superseded_by IS NULL;

COMMENT ON TABLE agent_lessons IS
'Phase 62b LOOP-05: named, generalizable lessons produced by AgentBase.understand(). Superseded rows preserved for audit.';

COMMIT;
```

**File 4: `supabase/migrations/20260504_shadow_outputs.sql`**
```sql
-- Phase 62b D-21: shadow-mode redirected business-table writes.

BEGIN;

CREATE TABLE IF NOT EXISTS shadow_outputs (
    shadow_output_id  BIGSERIAL PRIMARY KEY,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    shadow_run_id     UUID NOT NULL,
    agent_name        TEXT NOT NULL REFERENCES agent_registry(agent_name),
    entity            TEXT NOT NULL,
    payload_diff      JSONB NOT NULL,
    agent_event_id    UUID
);

CREATE INDEX IF NOT EXISTS shadow_outputs_run_idx
    ON shadow_outputs (shadow_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shadow_outputs_event_idx
    ON shadow_outputs (agent_event_id) WHERE agent_event_id IS NOT NULL;

COMMENT ON TABLE shadow_outputs IS
'Phase 62b D-21: when agent context has shadow_run_id, gateway routes business-table writes here instead of the target table. Parallel-implementation diff source.';

COMMIT;
```

**File 5: `supabase/migrations/20260505_canary_runs.sql`**
```sql
-- Phase 62b D-20 + LOOP-07: canary regression run reports.

BEGIN;

CREATE TABLE IF NOT EXISTS canary_runs (
    run_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name              TEXT NOT NULL REFERENCES agent_registry(agent_name),
    corpus_version          TEXT NOT NULL,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at             TIMESTAMPTZ,
    status                  TEXT NOT NULL CHECK (status IN ('running','passed','failed','error')),
    is_baseline             BOOLEAN NOT NULL DEFAULT FALSE,
    coverage                NUMERIC(5,4),
    confidence_mean         NUMERIC(5,4),
    extraction_count        INTEGER,
    coverage_delta          NUMERIC(5,4),
    confidence_delta        NUMERIC(5,4),
    extraction_count_delta  INTEGER,
    verdict                 TEXT,
    report_payload          JSONB,
    baseline_run_id         UUID REFERENCES canary_runs(run_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS canary_runs_baseline_idx
    ON canary_runs (agent_name, corpus_version) WHERE is_baseline;

CREATE INDEX IF NOT EXISTS canary_runs_agent_version_idx
    ON canary_runs (agent_name, corpus_version, started_at DESC);

COMMENT ON TABLE canary_runs IS
'Phase 62b LOOP-07 + D-20: per-agent canary regression runs. First run per (agent, corpus_version) is baseline; subsequent runs compare coverage/confidence/count deltas >= 0.';

COMMIT;
```

**Test file: `fee_crawler/tests/test_62b_migrations.py`**
Create a pytest module with tests named:
- `test_agent_events_status_widened` — query `information_schema.check_constraints` for `agent_events_status_check`, assert `improve_rejected` and `shadow_diff` present
- `test_agent_events_is_shadow_column` — query `information_schema.columns`, assert `is_shadow` column exists with default `false`
- `test_agent_registry_lifecycle_state_column` — assert column exists, CHECK includes all 4 values, 55 rows default to `q1_validation`
- `test_agent_registry_review_schedule_seeded` — assert `knox` has `*/15 * * * *`, `darwin` has `0 * * * *`, and at least 51 rows with `role='state_agent'` have `0 */4 * * *`
- `test_agent_lessons_table` — assert columns, UNIQUE (agent_name, lesson_name), FK to agent_registry
- `test_shadow_outputs_table` — assert columns, FK to agent_registry, index shadow_outputs_run_idx exists
- `test_canary_runs_table` — assert columns, UNIQUE partial index on (agent_name, corpus_version) WHERE is_baseline

Use the existing `db_schema` conftest fixture (per `fee_crawler/tests/conftest.py`), apply all migrations 20260417..20260505, then run SQL assertions via `await pool.fetchval(...)` or `await pool.fetch(...)`.

Rules:
- All migrations MUST be wrapped in `BEGIN;` / `COMMIT;` blocks
- All migrations MUST be idempotent (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`)
- No `DROP TABLE` or destructive operations — these are additive
- Reference research §Mechanics 5/7/8 directly; do not invent new columns
  </action>
  <verify>
    <automated>pytest fee_crawler/tests/test_62b_migrations.py -x -v</automated>
  </verify>
  <acceptance_criteria>
    - File `supabase/migrations/20260501_agent_events_status_widen.sql` exists containing literal string `'improve_rejected'` AND literal string `'shadow_diff'` AND `ADD COLUMN IF NOT EXISTS is_shadow BOOLEAN`
    - File `supabase/migrations/20260502_agent_registry_lifecycle_state.sql` exists containing `ADD COLUMN IF NOT EXISTS lifecycle_state` AND `ADD COLUMN IF NOT EXISTS review_schedule` AND seeds `knox` with `*/15 * * * *`
    - File `supabase/migrations/20260503_agent_lessons.sql` exists containing `CREATE TABLE IF NOT EXISTS agent_lessons` AND `REFERENCES agent_registry(agent_name)` AND `UNIQUE (agent_name, lesson_name)`
    - File `supabase/migrations/20260504_shadow_outputs.sql` exists containing `CREATE TABLE IF NOT EXISTS shadow_outputs` AND column `payload_diff JSONB NOT NULL`
    - File `supabase/migrations/20260505_canary_runs.sql` exists containing `CREATE UNIQUE INDEX IF NOT EXISTS canary_runs_baseline_idx` AND `WHERE is_baseline`
    - File `fee_crawler/tests/test_62b_migrations.py` exists with at least 7 test functions (listed in behavior)
    - `pytest fee_crawler/tests/test_62b_migrations.py -x -v` exits 0 against the docker-compose Postgres service (all applied migrations)
  </acceptance_criteria>
  <done>All 5 migrations applied cleanly in test schema; all 7 structural tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Ship migrations 20260506..20260510 (lineage_graph + reasoning_trace view + NOTIFY trigger + agent_health_rollup + promote_to_tier3 tighten)</name>
  <files>supabase/migrations/20260506_lineage_graph_function.sql, supabase/migrations/20260507_v_agent_reasoning_trace.sql, supabase/migrations/20260508_agent_messages_notify_trigger.sql, supabase/migrations/20260509_agent_health_rollup.sql, supabase/migrations/20260510_promote_to_tier3_tighten.sql, fee_crawler/tests/test_lineage_graph.py</files>
  <read_first>
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Code Examples (full lineage_graph SQL starting line 375) and §Mechanics 4 (v_agent_reasoning_trace) and §Mechanics 14 (agent_health_rollup)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Pitfall 4 (NOTIFY 8000-byte cap — payload MUST be message_id only)
    - supabase/migrations/20260421_tier_promotion_functions.sql (current promote_to_tier3 stub — lines 73-128; we REPLACE with tightened version)
    - supabase/migrations/20260420_fees_tier_tables.sql (fees_published/fees_verified/fees_raw column names we reference in lineage_graph)
    - supabase/migrations/20260419_agent_messages.sql (column names recipient_agent, sender_agent, intent — we join on these in trigger and tighten)
    - supabase/migrations/20260417_agent_events_partitioned.sql (parent_event_id and indexes for recursive CTE walk)
  </read_first>
  <behavior>
    - Test 1: lineage_graph(non_existent_id) returns jsonb_build_object('error', ...)
    - Test 2: Seeded fees_published → fees_verified → fees_raw chain produces nested JSON with tier_3, tier_2, tier_1 keys
    - Test 3: lineage_graph JSON tier_1.event_chain contains at least 1 event when fees_raw.agent_event_id points to an agent_events row
    - Test 4: lineage_graph terminates gracefully when parent_event_id points to an archived/missing row (walk stops at null, no error)
    - Test 5: v_agent_reasoning_trace view UNION-ALLs agent_events + agent_messages ordered by created_at
    - Test 6: Inserting into agent_messages with recipient_agent='knox' fires pg_notify — verify via listener helper (or by checking trigger existence)
    - Test 7: promote_to_tier3 RAISES EXCEPTION when no darwin+knox accept messages exist for the fee_verified_id
    - Test 8: promote_to_tier3 succeeds when 2 accept messages from darwin+knox exist with matching correlation_id
  </behavior>
  <action>
**File 1: `supabase/migrations/20260506_lineage_graph_function.sql`**

Copy verbatim the SQL function from RESEARCH.md §Code Examples starting at line 378 (the `CREATE OR REPLACE FUNCTION lineage_graph(p_fee_published_id BIGINT) RETURNS JSONB` block). Wrap in `BEGIN;` / `COMMIT;`. Include the `COMMENT ON FUNCTION` at the end.

**File 2: `supabase/migrations/20260507_v_agent_reasoning_trace.sql`**

Copy verbatim the view definition from RESEARCH.md §Mechanics 4 starting at line 985:
```sql
BEGIN;

CREATE OR REPLACE VIEW v_agent_reasoning_trace AS
SELECT
    'event' AS kind,
    e.correlation_id,
    e.created_at,
    e.agent_name,
    e.action AS intent_or_action,
    e.tool_name,
    e.entity,
    e.input_payload AS payload,
    e.event_id::TEXT AS row_id
FROM agent_events e
UNION ALL
SELECT
    'message' AS kind,
    m.correlation_id,
    m.created_at,
    m.sender_agent AS agent_name,
    m.intent AS intent_or_action,
    NULL::TEXT AS tool_name,
    m.recipient_agent AS entity,
    m.payload,
    m.message_id::TEXT AS row_id
FROM agent_messages m
ORDER BY created_at;

COMMENT ON VIEW v_agent_reasoning_trace IS
'Phase 62b COMMS-05: flat ordered timeline per correlation_id. Read-only tool get_reasoning_trace(correlation_id) queries this.';

COMMIT;
```

**File 3: `supabase/migrations/20260508_agent_messages_notify_trigger.sql`**

Per Pitfall 4 — NOTIFY payload MUST be message_id only:
```sql
BEGIN;

CREATE OR REPLACE FUNCTION agent_messages_notify() RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'agent_msg_' || NEW.recipient_agent,
        NEW.message_id::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_messages_notify_trigger ON agent_messages;
CREATE TRIGGER agent_messages_notify_trigger
    AFTER INSERT ON agent_messages
    FOR EACH ROW EXECUTE FUNCTION agent_messages_notify();

COMMENT ON FUNCTION agent_messages_notify() IS
'Phase 62b D-10 + Pitfall 4: NOTIFY carries message_id UUID only (36 bytes, well under 8000-byte pg_notify cap). Listener SELECTs full row.';

COMMIT;
```

**File 4: `supabase/migrations/20260509_agent_health_rollup.sql`**

Copy verbatim the schema + refresh function + pg_cron registration from RESEARCH.md §Mechanics 14 starting at line 1326. Wrap the full content in a single `BEGIN;` / `COMMIT;`. Keep the `IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron')` guard so test schema without pg_cron applies cleanly.

**File 5: `supabase/migrations/20260510_promote_to_tier3_tighten.sql`**

Per research §Security Domain (V4 Access Control tightening):
```sql
-- Phase 62b: tighten promote_to_tier3 from RAISE NOTICE to RAISE EXCEPTION unless
-- both darwin AND knox accept messages exist for the fee_verified_id.

BEGIN;

CREATE OR REPLACE FUNCTION promote_to_tier3(
    p_fee_verified_id BIGINT,
    p_event_id UUID
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_fee_verified  fees_verified%ROWTYPE;
    v_darwin_accept BOOLEAN;
    v_knox_accept   BOOLEAN;
    v_correlation   UUID;
    v_new_id        BIGINT;
BEGIN
    SELECT * INTO v_fee_verified FROM fees_verified WHERE fee_verified_id = p_fee_verified_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'promote_to_tier3: fees_verified.fee_verified_id=% not found', p_fee_verified_id;
    END IF;

    -- Require matching correlation_id thread with accept from both darwin and knox.
    SELECT EXISTS (
        SELECT 1 FROM agent_messages
         WHERE sender_agent = 'darwin' AND intent = 'accept'
           AND payload->>'fee_verified_id' = p_fee_verified_id::text
    ) INTO v_darwin_accept;

    SELECT EXISTS (
        SELECT 1 FROM agent_messages
         WHERE sender_agent = 'knox' AND intent = 'accept'
           AND payload->>'fee_verified_id' = p_fee_verified_id::text
    ) INTO v_knox_accept;

    IF NOT (v_darwin_accept AND v_knox_accept) THEN
        RAISE EXCEPTION 'promote_to_tier3: adversarial handshake incomplete for fee_verified_id=% (darwin_accept=% knox_accept=%)',
            p_fee_verified_id, v_darwin_accept, v_knox_accept;
    END IF;

    INSERT INTO fees_published (
        lineage_ref, canonical_fee_key, institution_id, amount_cents,
        source_url, document_r2_key, extraction_confidence,
        published_by_adversarial_event_id
    )
    SELECT
        v_fee_verified.fee_verified_id, v_fee_verified.canonical_fee_key,
        v_fee_verified.institution_id, v_fee_verified.amount_cents,
        v_fee_verified.source_url, v_fee_verified.document_r2_key,
        v_fee_verified.extraction_confidence, p_event_id
    RETURNING fee_published_id INTO v_new_id;

    INSERT INTO agent_events (
        agent_name, action, tool_name, entity, entity_id, status,
        parent_event_id, correlation_id, reasoning_hash, input_payload
    )
    SELECT
        '_adversarial', 'promote_to_tier3', 'promote_to_tier3', 'fees_published',
        v_new_id::TEXT, 'success',
        p_event_id, v_correlation, '\x00'::BYTEA,
        jsonb_build_object('fee_verified_id', p_fee_verified_id);

    RETURN v_new_id;
END; $$;

COMMENT ON FUNCTION promote_to_tier3(BIGINT, UUID) IS
'Phase 62b V4 Access Control: tightened from RAISE NOTICE to RAISE EXCEPTION. Requires both darwin+knox intent=accept messages in agent_messages referencing the fee_verified_id in payload.';

COMMIT;
```

NOTE: The exact column list for the `INSERT INTO fees_published` above MUST match the columns defined in `20260420_fees_tier_tables.sql` — adjust if column names differ after reading that file. If any columns are missing from fees_verified, keep them NULL in the insert.

**Test file: `fee_crawler/tests/test_lineage_graph.py`**

Create pytest module with tests covering OBS-01, OBS-02, and the NOTIFY trigger:
- `test_lineage_graph_missing_id_returns_error` — call `SELECT lineage_graph(-1)`, assert `{"error": ...}`
- `test_lineage_graph_single_query_full_trace` — seed `institutions`, `fees_raw`, `fees_verified`, `fees_published` rows (and an `agent_events` row with `event_id` linked by `fees_raw.agent_event_id`), call `SELECT lineage_graph($fee_published_id)`, assert returned JSONB has keys `tier_3 → row.children[0].tier_2 → row.children[0].tier_1 → row.r2_key, source_url, event_chain`
- `test_lineage_graph_archived_parent_terminates_gracefully` — chain with `parent_event_id` pointing to a row that doesn't exist; call function and assert no exception raised, `event_chain` has partial list
- `test_v_agent_reasoning_trace_union` — insert 2 agent_events + 2 agent_messages with same correlation_id, SELECT FROM v_agent_reasoning_trace WHERE correlation_id = $1, assert 4 rows ordered by created_at
- `test_promote_to_tier3_requires_both_handshakes` — call with no agent_messages → expect asyncpg.PostgresError containing "adversarial handshake incomplete"; seed 2 accept rows (darwin + knox) → expect successful BIGINT return
- `test_agent_messages_notify_trigger_exists` — query `pg_trigger` where `tgname = 'agent_messages_notify_trigger'`, assert 1 row

Use fixture `db_schema` from `fee_crawler/tests/conftest.py`.
  </action>
  <verify>
    <automated>pytest fee_crawler/tests/test_lineage_graph.py -x -v</automated>
  </verify>
  <acceptance_criteria>
    - File `supabase/migrations/20260506_lineage_graph_function.sql` exists containing `CREATE OR REPLACE FUNCTION lineage_graph(p_fee_published_id BIGINT) RETURNS JSONB` and `WITH RECURSIVE chain AS`
    - File `supabase/migrations/20260507_v_agent_reasoning_trace.sql` exists containing `CREATE OR REPLACE VIEW v_agent_reasoning_trace` and both `FROM agent_events` and `FROM agent_messages`
    - File `supabase/migrations/20260508_agent_messages_notify_trigger.sql` exists containing `PERFORM pg_notify('agent_msg_' || NEW.recipient_agent, NEW.message_id::text)` and `AFTER INSERT ON agent_messages`
    - File `supabase/migrations/20260509_agent_health_rollup.sql` exists containing `CREATE TABLE IF NOT EXISTS agent_health_rollup` with columns `loop_completion_rate, review_latency_seconds, pattern_promotion_rate, confidence_drift, cost_to_value_ratio`
    - File `supabase/migrations/20260510_promote_to_tier3_tighten.sql` exists containing `RAISE EXCEPTION 'promote_to_tier3: adversarial handshake incomplete` (not `RAISE NOTICE`)
    - `pytest fee_crawler/tests/test_lineage_graph.py -x -v` exits 0
    - `grep -n "RAISE NOTICE" supabase/migrations/20260510_promote_to_tier3_tighten.sql` returns zero matches
  </acceptance_criteria>
  <done>All 5 migrations present; lineage_graph + trace view + trigger + rollup + tightened promote_to_tier3 verified structurally and functionally by pytest.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: [BLOCKING] Push 62b migrations to live Supabase</name>
  <what-built>All 10 new migrations (20260501..20260510) for phase 62b. Build + type checks would pass without the push — schema types come from `src/lib/agent-tools/types.generated.ts` (regenerated from Python schemas), not from the live DB — creating a false-positive verification state. Push is mandatory before Wave 2 begins.</what-built>
  <how-to-verify>
    1. Ensure `SUPABASE_ACCESS_TOKEN` env var is set (CLI token for non-TTY push). If missing, log in first: `supabase login` (interactive) or export token.
    2. Run from repo root: `supabase db push`
    3. On success, run `supabase db execute --file .planning/phases/62B-agent-foundation-runtime-layer/62b-schema-verify.sql` (the executor creates this file before this task — see helper inline below)
    4. Verify live DB:
       - `SELECT string_agg(DISTINCT jsonb_typeof(constraint_to_check), ',') FROM information_schema.check_constraints WHERE constraint_name = 'agent_events_status_check'` — returns evidence that new enum values exist, OR alternate: run `psql $DATABASE_URL -c "INSERT INTO agent_events (agent_name, action, tool_name, entity, status) VALUES ('knox','smoke','_smoke','_smoke','improve_rejected') RETURNING status"` — expect success
       - `SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_registry' AND column_name IN ('lifecycle_state','review_schedule') ORDER BY column_name` — expect 2 rows
       - `SELECT proname FROM pg_proc WHERE proname IN ('lineage_graph','agent_messages_notify','refresh_agent_health_rollup')` — expect 3 rows
       - `SELECT tgname FROM pg_trigger WHERE tgname = 'agent_messages_notify_trigger'` — expect 1 row
       - `SELECT 'ok' FROM information_schema.tables WHERE table_name IN ('agent_lessons','shadow_outputs','canary_runs','agent_health_rollup') HAVING COUNT(*) = 4` — expect 'ok'
    5. Confirm `lineage_graph(-1)` returns `{"error": "fee_published_id not found"}` against live DB.
  </how-to-verify>
  <resume-signal>Type "approved" after `supabase db push` succeeds and all 5 live-DB checks pass. Type "blocked" with the error if push fails (likely cause: interactive prompt needs `SUPABASE_ACCESS_TOKEN` — document and retry).</resume-signal>
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
| live Supabase ← migration push | SQL shipped to managed DB; any bug here becomes a live schema state |
| agents writing → agent_events status | status enum widening exposes new terminal states that downstream queries must handle |
| fees_verified → fees_published promotion | `promote_to_tier3` is the adversarial gate |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-62B-01-01 | Tampering | `promote_to_tier3` handshake bypass | mitigate | Tighten from RAISE NOTICE to RAISE EXCEPTION; require BOTH darwin+knox accept rows in `agent_messages` with matching `fee_verified_id` in payload (migration 20260510). |
| T-62B-01-02 | Information Disclosure | `lineage_graph()` leaking event payloads | accept | Function returns full row `to_jsonb(v_raw)` which includes source_url and R2 key. Admin-only endpoint surface (console plan 62B-10 restricts to admin role); service_role path only. |
| T-62B-01-03 | Repudiation | NOTIFY payload truncation (>8000 bytes) → listener misses messages | mitigate | Trigger sends `NEW.message_id::text` only (36 bytes); listener SELECTs full row. Verified by test + code review on any change to trigger function (research §Pitfall 4). |
| T-62B-01-04 | Tampering | Migration SQL injection via seeded values | mitigate | No user input; all values are fixed SQL literals. Per §Security Domain V5: asyncpg parameterized queries everywhere downstream; migrations use DO blocks with quote-safe identifiers. |
| T-62B-01-05 | Denial of Service | Recursive CTE in `lineage_graph` runaway on bad parent chain | mitigate | Depth capped at 10 hops (`WHERE c.depth < 10`); partition pruning on `agent_events (parent_event_id)` index. Research §R3 documents mitigation path at 10M rows. |
</threat_model>

<verification>
After all 3 tasks complete:
- Every migration file 20260501..20260510 exists and is idempotent
- `pytest fee_crawler/tests/test_62b_migrations.py fee_crawler/tests/test_lineage_graph.py -x -v` exits 0
- `supabase db push` succeeded against live Supabase
- Live DB passes all 5 verification queries in Task 3
</verification>

<success_criteria>
- [ ] 10 migration files present in supabase/migrations/
- [ ] 2 pytest files present and green
- [ ] `supabase db push` executed successfully
- [ ] Live DB has `lineage_graph`, `agent_messages_notify_trigger`, and all 4 new tables
- [ ] `agent_events.status` accepts `improve_rejected` + `shadow_diff` on the live DB
- [ ] `promote_to_tier3` on live DB raises EXCEPTION (not NOTICE) when handshake missing
</success_criteria>

<output>
After completion, create `.planning/phases/62B-agent-foundation-runtime-layer/62B-01-SUMMARY.md` documenting: migrations shipped, pytest pass counts, live-DB push timestamp, and any schema-drift discoveries.
</output>
