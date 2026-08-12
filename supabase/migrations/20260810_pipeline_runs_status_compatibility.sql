-- Allow both the historical envelope values and canonical Atlas checkpoint states.
ALTER TABLE pipeline_runs
  DROP CONSTRAINT IF EXISTS pipeline_runs_status_check,
  DROP CONSTRAINT IF EXISTS pipeline_runs_trigger_source_check;

ALTER TABLE pipeline_runs
  ALTER COLUMN trigger_source SET DEFAULT 'manual',
  ADD CONSTRAINT pipeline_runs_status_check CHECK (
    status IN (
      'queued', 'running', 'succeeded', 'completed', 'partial', 'failed',
      'canceled', 'cancelled', 'timed_out'
    )
  ),
  ADD CONSTRAINT pipeline_runs_trigger_source_check CHECK (
    trigger_source IN ('manual', 'cron', 'schedule', 'admin', 'api', 'agent')
  );
