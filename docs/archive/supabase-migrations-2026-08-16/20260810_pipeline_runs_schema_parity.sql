-- Restore the resumable Atlas pipeline checkpoint schema in drifted databases.
ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'running',
  ADD COLUMN IF NOT EXISTS last_completed_phase INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_completed_job TEXT,
  ADD COLUMN IF NOT EXISTS config_json JSONB,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_msg TEXT,
  ADD COLUMN IF NOT EXISTS inst_count INT,
  ADD COLUMN IF NOT EXISTS summary_json JSONB;
