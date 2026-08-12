BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO agent_registry
  (agent_name, display_name, description, role, parent_agent)
VALUES
  ('rosetta', 'Rosetta',
   'Document reading agent; normalizes PDFs, HTML, and OCR artifacts before fee extraction.',
   'data', 'atlas')
ON CONFLICT (agent_name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    role = EXCLUDED.role,
    parent_agent = EXCLUDED.parent_agent;

-- The older Scout/state-agent path created agent_runs at runtime. Formalize the
-- table in migrations, then extend it into the durable run envelope used by the
-- agentic admin experience.
CREATE TABLE IF NOT EXISTS agent_runs (
  id                 SERIAL PRIMARY KEY,
  state_code         TEXT,
  status             TEXT NOT NULL DEFAULT 'running',
  started_at         TIMESTAMPTZ DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  total_institutions INTEGER DEFAULT 0,
  discovered         INTEGER DEFAULT 0,
  classified         INTEGER DEFAULT 0,
  extracted          INTEGER DEFAULT 0,
  validated          INTEGER DEFAULT 0,
  failed             INTEGER DEFAULT 0,
  current_stage      TEXT,
  current_institution TEXT
);

CREATE TABLE IF NOT EXISTS agent_run_results (
  id              SERIAL PRIMARY KEY,
  agent_run_id    INTEGER REFERENCES agent_runs(id),
  crawl_target_id INTEGER NOT NULL,
  stage           TEXT NOT NULL,
  status          TEXT NOT NULL,
  detail          JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_runs
  ALTER COLUMN state_code DROP NOT NULL,
  ALTER COLUMN started_at SET DEFAULT NOW(),
  ALTER COLUMN started_at SET NOT NULL,
  ALTER COLUMN total_institutions SET DEFAULT 0,
  ALTER COLUMN total_institutions SET NOT NULL,
  ALTER COLUMN discovered SET DEFAULT 0,
  ALTER COLUMN discovered SET NOT NULL,
  ALTER COLUMN classified SET DEFAULT 0,
  ALTER COLUMN classified SET NOT NULL,
  ALTER COLUMN extracted SET DEFAULT 0,
  ALTER COLUMN extracted SET NOT NULL,
  ALTER COLUMN validated SET DEFAULT 0,
  ALTER COLUMN validated SET NOT NULL,
  ALTER COLUMN failed SET DEFAULT 0,
  ALTER COLUMN failed SET NOT NULL;

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS agent_name TEXT REFERENCES agent_registry(agent_name),
  ADD COLUMN IF NOT EXISTS run_kind TEXT NOT NULL DEFAULT 'state_agent',
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS params_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS trigger_source TEXT NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS triggered_by TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS backend TEXT NOT NULL DEFAULT 'agentic_v1',
  ADD COLUMN IF NOT EXISTS progress_current INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_total INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_summary TEXT,
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE report_jobs
  ADD COLUMN IF NOT EXISTS agent_run_id INTEGER REFERENCES agent_runs(id);

UPDATE agent_runs
   SET agent_name = COALESCE(agent_name, CASE WHEN state_code IS NOT NULL THEN 'knox' ELSE 'atlas' END),
       run_kind = COALESCE(run_kind, CASE WHEN state_code IS NOT NULL THEN 'state_agent' ELSE 'workflow' END),
       title = COALESCE(title, CASE WHEN state_code IS NOT NULL THEN 'State agent run ' || state_code ELSE 'Agent run' END),
       triggered_by = COALESCE(triggered_by, 'system'),
       backend = COALESCE(backend, 'agentic_v1'),
       params_json = COALESCE(params_json, '{}'::JSONB),
       progress_current = COALESCE(progress_current, discovered + classified + extracted + validated),
       progress_total = COALESCE(progress_total, total_institutions),
       updated_at = COALESCE(updated_at, completed_at, started_at, NOW());

ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_run_kind_check;
ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_run_kind_check CHECK (run_kind IN (
    'workflow',
    'workflow_lane',
    'state_agent',
    'report',
    'manual_repair',
    'dry_run'
  ));

ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_status_check;
ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_status_check CHECK (status IN (
    'queued',
    'running',
    'blocked',
    'complete',
    'completed',
    'failed',
    'cancel_requested',
    'cancelled'
  ));

ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_trigger_source_check;
ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_trigger_source_check CHECK (trigger_source IN (
    'schedule',
    'admin',
    'api',
    'agent'
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'agent_runs_agent_name_fkey'
       AND conrelid = 'agent_runs'::regclass
  ) THEN
    ALTER TABLE agent_runs
      ADD CONSTRAINT agent_runs_agent_name_fkey
      FOREIGN KEY (agent_name) REFERENCES agent_registry(agent_name);
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS agent_runs_active_idempotency_idx
  ON agent_runs (idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND status IN ('queued', 'running', 'cancel_requested');

CREATE INDEX IF NOT EXISTS agent_runs_status_started_idx
  ON agent_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS agent_runs_agent_started_idx
  ON agent_runs (agent_name, started_at DESC);

CREATE INDEX IF NOT EXISTS agent_runs_correlation_idx
  ON agent_runs (correlation_id);

CREATE INDEX IF NOT EXISTS idx_agent_run_results_run
  ON agent_run_results (agent_run_id);

CREATE TABLE IF NOT EXISTS agent_run_steps (
  id             BIGSERIAL PRIMARY KEY,
  agent_run_id   INTEGER NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_key       TEXT NOT NULL,
  agent_name     TEXT NOT NULL REFERENCES agent_registry(agent_name),
  title          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'queued',
  sequence       INTEGER NOT NULL DEFAULT 0,
  summary        TEXT,
  input_payload  JSONB NOT NULL DEFAULT '{}'::JSONB,
  output_payload JSONB,
  error_summary  TEXT,
  queued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_run_id, step_key),
  CONSTRAINT agent_run_steps_status_check CHECK (status IN (
    'queued',
    'running',
    'blocked',
    'completed',
    'failed',
    'cancel_requested',
    'cancelled',
    'skipped'
  ))
);

CREATE INDEX IF NOT EXISTS agent_run_steps_run_sequence_idx
  ON agent_run_steps (agent_run_id, sequence);

CREATE INDEX IF NOT EXISTS agent_run_steps_agent_status_idx
  ON agent_run_steps (agent_name, status, queued_at DESC);

CREATE TABLE IF NOT EXISTS agent_run_events (
  id             BIGSERIAL PRIMARY KEY,
  agent_run_id   INTEGER NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_id        BIGINT REFERENCES agent_run_steps(id) ON DELETE SET NULL,
  event_type     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'info',
  message        TEXT NOT NULL,
  detail         JSONB NOT NULL DEFAULT '{}'::JSONB,
  cost_microusd  BIGINT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_run_events_status_check CHECK (status IN (
    'info',
    'queued',
    'running',
    'blocked',
    'completed',
    'failed',
    'skipped',
    'cancel_requested',
    'cancelled',
    'budget_halt'
  ))
);

CREATE INDEX IF NOT EXISTS agent_run_events_run_time_idx
  ON agent_run_events (agent_run_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS agent_run_events_type_idx
  ON agent_run_events (event_type, created_at DESC);

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_run_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_run_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE agent_runs FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE agent_run_results FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE agent_run_steps FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE agent_run_events FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON SEQUENCE agent_runs_id_seq FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE agent_run_results_id_seq FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE agent_run_steps_id_seq FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE agent_run_events_id_seq FROM anon, authenticated;

COMMENT ON TABLE agent_runs IS
'Durable agentic run envelope. Extends the older state-agent table so Atlas/Magellan/Darwin/Knox/Hamilton launches are visible without ops_jobs or Modal call ids.';

COMMENT ON TABLE agent_run_steps IS
'Per-run step ledger for the agentic backend. Each Atlas workflow lane has visible owner/status/progress before any worker implementation starts.';

COMMENT ON TABLE agent_run_events IS
'Append-only visible event stream for agentic run progress. This is the admin live-status source, separate from legacy ops_jobs output tails.';

COMMIT;
