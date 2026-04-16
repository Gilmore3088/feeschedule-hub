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

COMMENT ON FUNCTION maintain_agent_auth_log_partitions() IS
    'Phase 62a: creates next month partition + detaches 18-month-old partitions to *_archived. Scheduled via pg_cron in production; called manually in CI.';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Best-effort unschedule of any prior job with the same name; ignore if absent.
        BEGIN
            PERFORM cron.unschedule('maintain-agent-auth-log');
        EXCEPTION WHEN others THEN
            NULL;
        END;
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
