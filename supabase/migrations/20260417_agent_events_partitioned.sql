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
        -- Best-effort unschedule of any prior job with the same name; ignore if absent.
        BEGIN
            PERFORM cron.unschedule('maintain-agent-events');
        EXCEPTION WHEN others THEN
            -- no-op if job was not previously scheduled or unschedule signature differs
            NULL;
        END;
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
