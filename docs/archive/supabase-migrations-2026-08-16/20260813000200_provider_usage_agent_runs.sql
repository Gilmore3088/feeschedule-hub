-- Retire the ops_jobs linkage from provider metering and report/pipeline
-- records. Future AI costs and provider failures attach to agent_runs.

BEGIN;

ALTER TABLE ai_api_usage_events
  ADD COLUMN IF NOT EXISTS agent_run_id INTEGER REFERENCES agent_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ai_api_usage_agent_run_idx
  ON ai_api_usage_events (agent_run_id, created_at DESC)
  WHERE agent_run_id IS NOT NULL;

ALTER TABLE ai_api_usage_events
  DROP COLUMN IF EXISTS ops_job_id;

ALTER TABLE report_jobs
  DROP COLUMN IF EXISTS ops_job_id,
  DROP COLUMN IF EXISTS modal_call_id;

DROP INDEX IF EXISTS pipeline_runs_ops_job_id_unique;

ALTER TABLE pipeline_runs
  DROP CONSTRAINT IF EXISTS pipeline_runs_ops_job_id_fkey,
  DROP COLUMN IF EXISTS ops_job_id;

DROP TABLE IF EXISTS ops_jobs;

COMMENT ON COLUMN ai_api_usage_events.agent_run_id IS
'Agentic run associated with this provider call. Replaces retired ops_jobs linkage.';

COMMIT;
