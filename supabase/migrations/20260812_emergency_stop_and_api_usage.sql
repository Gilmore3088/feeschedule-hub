-- Global automation safety control and provider-call metering.
-- The stop row is intentionally singular so every control plane reads the
-- same state before launching work.

BEGIN;

CREATE TABLE IF NOT EXISTS automation_control (
    control_key TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    reason TEXT,
    changed_by TEXT NOT NULL DEFAULT 'system',
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revision BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT automation_control_key_check
        CHECK (control_key = 'global')
);

INSERT INTO automation_control
    (control_key, enabled, reason, changed_by)
VALUES
    ('global', TRUE, NULL, 'migration')
ON CONFLICT (control_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS automation_control_audit (
    id BIGSERIAL PRIMARY KEY,
    action TEXT NOT NULL CHECK (action IN ('emergency_stop', 'resume')),
    reason TEXT,
    actor TEXT NOT NULL,
    active_job_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS automation_control_audit_created_idx
    ON automation_control_audit (created_at DESC);

CREATE TABLE IF NOT EXISTS ai_api_usage_events (
    id BIGSERIAL PRIMARY KEY,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'blocked')),
    request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count >= 0),
    input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    cache_read_input_tokens BIGINT NOT NULL DEFAULT 0
        CHECK (cache_read_input_tokens >= 0),
    cache_creation_input_tokens BIGINT NOT NULL DEFAULT 0
        CHECK (cache_creation_input_tokens >= 0),
    estimated_cost_microusd BIGINT
        CHECK (estimated_cost_microusd IS NULL OR estimated_cost_microusd >= 0),
    latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
    ops_job_id BIGINT REFERENCES ops_jobs(id) ON DELETE SET NULL,
    error_summary TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_api_usage_created_idx
    ON ai_api_usage_events (created_at DESC);

CREATE INDEX IF NOT EXISTS ai_api_usage_provider_created_idx
    ON ai_api_usage_events (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_api_usage_agent_created_idx
    ON ai_api_usage_events (agent_name, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_api_usage_failures_idx
    ON ai_api_usage_events (created_at DESC)
    WHERE status IN ('failed', 'blocked');

-- State agents are full collection pipelines, not AgentBase.review() workers.
-- Running all 51 every four hours would overlap Atlas/Magellan and can create
-- an uncontrolled volume of provider calls. Keep them operator-visible but
-- remove the obsolete review-tick schedule.
UPDATE agent_registry
   SET review_schedule = NULL
 WHERE role = 'state_agent';

UPDATE agent_events
   SET status = 'success',
       output_payload = jsonb_build_object(
           'skipped', TRUE,
           'reason', 'State collection moved to Atlas/Magellan coordination'
       )
 WHERE action = 'review_tick'
   AND status IN ('pending', 'in_progress')
   AND agent_name LIKE 'state[_]%';

DO $$
DECLARE
    r RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        FOR r IN
            SELECT jobname
              FROM cron.job
             WHERE jobname LIKE 'agent-review-state_%'
        LOOP
            PERFORM cron.unschedule(r.jobname);
        END LOOP;
    END IF;
END $$;

COMMIT;
