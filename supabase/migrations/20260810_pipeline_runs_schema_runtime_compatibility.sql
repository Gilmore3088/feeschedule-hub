-- Reconcile the older pipeline envelope with the resumable Atlas checkpoints.
-- Historical columns stay in place during the first agent-console release.
ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS trigger_source TEXT DEFAULT 'atlas',
  ADD COLUMN IF NOT EXISTS triggered_by TEXT DEFAULT 'pipeline_executor',
  ADD COLUMN IF NOT EXISTS params_json JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS workflow_run_id TEXT,
  ADD COLUMN IF NOT EXISTS stages_total INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stages_done INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

UPDATE pipeline_runs
   SET trigger_source = COALESCE(trigger_source, 'atlas'),
       triggered_by = COALESCE(triggered_by, 'pipeline_executor'),
       params_json = COALESCE(params_json, '{}'::JSONB),
       stages_total = COALESCE(stages_total, 0),
       stages_done = COALESCE(stages_done, 0),
       created_at = COALESCE(created_at, started_at, NOW()),
       started_at = COALESCE(started_at, created_at, NOW());

ALTER TABLE pipeline_runs
  ALTER COLUMN status SET DEFAULT 'running',
  ALTER COLUMN trigger_source SET DEFAULT 'atlas',
  ALTER COLUMN trigger_source SET NOT NULL,
  ALTER COLUMN triggered_by SET DEFAULT 'pipeline_executor',
  ALTER COLUMN triggered_by SET NOT NULL,
  ALTER COLUMN params_json SET DEFAULT '{}'::JSONB,
  ALTER COLUMN params_json SET NOT NULL,
  ALTER COLUMN stages_total SET DEFAULT 0,
  ALTER COLUMN stages_total SET NOT NULL,
  ALTER COLUMN stages_done SET DEFAULT 0,
  ALTER COLUMN stages_done SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN started_at SET DEFAULT NOW(),
  ALTER COLUMN started_at SET NOT NULL;
