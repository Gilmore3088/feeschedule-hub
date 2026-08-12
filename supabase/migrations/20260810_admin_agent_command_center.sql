-- Canonical execution envelope for the agent-first admin command center.
-- Domain-specific run tables remain intact; ops_jobs owns remote execution.

ALTER TABLE ops_jobs
  ADD COLUMN IF NOT EXISTS agent_name TEXT REFERENCES agent_registry(agent_name),
  ADD COLUMN IF NOT EXISTS parent_job_id BIGINT REFERENCES ops_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trigger_source TEXT NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS modal_call_id TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ops_jobs_agent_name_fkey'
       AND conrelid = 'ops_jobs'::regclass
  ) THEN
    ALTER TABLE ops_jobs
      ADD CONSTRAINT ops_jobs_agent_name_fkey
      FOREIGN KEY (agent_name) REFERENCES agent_registry(agent_name);
  END IF;
END$$;

UPDATE ops_jobs SET status = 'failed' WHERE status = 'crashed';

ALTER TABLE ops_jobs DROP CONSTRAINT IF EXISTS ops_jobs_status_check;
ALTER TABLE ops_jobs
  ADD CONSTRAINT ops_jobs_status_check CHECK (status IN (
    'queued', 'running', 'completed', 'failed',
    'cancel_requested', 'cancelled', 'timed_out'
  ));

ALTER TABLE ops_jobs DROP CONSTRAINT IF EXISTS ops_jobs_trigger_source_check;
ALTER TABLE ops_jobs
  ADD CONSTRAINT ops_jobs_trigger_source_check CHECK (trigger_source IN (
    'schedule', 'admin', 'api', 'agent'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS ops_jobs_active_idempotency_idx
  ON ops_jobs (idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND status IN ('queued', 'running', 'cancel_requested');

CREATE INDEX IF NOT EXISTS ops_jobs_agent_created_idx
  ON ops_jobs (agent_name, created_at DESC);

CREATE INDEX IF NOT EXISTS ops_jobs_modal_call_idx
  ON ops_jobs (modal_call_id)
  WHERE modal_call_id IS NOT NULL;

ALTER TABLE report_jobs
  ADD COLUMN IF NOT EXISTS ops_job_id BIGINT REFERENCES ops_jobs(id),
  ADD COLUMN IF NOT EXISTS modal_call_id TEXT,
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

ALTER TABLE report_jobs DROP CONSTRAINT IF EXISTS report_jobs_status_check;
ALTER TABLE report_jobs
  ADD CONSTRAINT report_jobs_status_check CHECK (status IN (
    'pending', 'assembling', 'rendering', 'complete', 'failed',
    'cancel_requested', 'cancelled'
  ));

INSERT INTO agent_registry
  (agent_name, display_name, description, role, parent_agent)
VALUES
  ('magellan', 'Magellan',
   'Discovery and collection agent; finds fee schedules and coordinates URL rescue.',
   'data', 'atlas')
ON CONFLICT (agent_name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    role = EXCLUDED.role,
    parent_agent = EXCLUDED.parent_agent;

UPDATE agent_registry
SET parent_agent = 'atlas',
    description = CASE agent_name
      WHEN 'darwin' THEN 'Classification agent; canonicalizes fee data and prepares it for adversarial review.'
      WHEN 'knox' THEN 'Adversarial review agent; gates verified fees before publication.'
      WHEN 'hamilton' THEN 'Research analyst; reads published data and synthesizes reports.'
      ELSE description
    END
WHERE agent_name IN ('darwin', 'knox', 'hamilton');

UPDATE agent_registry
SET description = 'Root coordinator; schedules agent work, enforces execution safety, and routes remediation.'
WHERE agent_name = 'atlas';
