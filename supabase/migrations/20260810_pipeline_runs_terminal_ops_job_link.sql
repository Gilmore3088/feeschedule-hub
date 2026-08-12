-- Link resumable pipeline checkpoints to the canonical execution envelope.
ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS ops_job_id BIGINT;

-- Backfill only unambiguous historical pipeline starts within the same minute.
UPDATE pipeline_runs AS pipeline
   SET ops_job_id = (
     SELECT ops.id
       FROM ops_jobs AS ops
      WHERE ops.command = 'pipeline'
        AND ops.started_at IS NOT NULL
        AND ABS(EXTRACT(EPOCH FROM (ops.started_at - pipeline.started_at))) < 30
      ORDER BY ABS(EXTRACT(EPOCH FROM (ops.started_at - pipeline.started_at)))
      LIMIT 1
   )
 WHERE pipeline.ops_job_id IS NULL
   AND pipeline.started_at IS NOT NULL;

-- Reconcile checkpoints whose canonical envelope already reached a terminal state.
UPDATE pipeline_runs AS pipeline
   SET status = CASE ops.status
                  WHEN 'completed' THEN 'completed'
                  WHEN 'cancelled' THEN 'cancelled'
                  WHEN 'timed_out' THEN 'timed_out'
                  ELSE 'failed'
                END,
       completed_at = COALESCE(pipeline.completed_at, ops.completed_at, NOW()),
       finished_at = COALESCE(pipeline.finished_at, ops.completed_at, NOW()),
       error_msg = COALESCE(pipeline.error_msg, ops.error_summary),
       error = COALESCE(pipeline.error, ops.error_summary)
  FROM ops_jobs AS ops
 WHERE pipeline.ops_job_id = ops.id
   AND pipeline.status IN ('queued', 'running')
   AND ops.status IN ('completed', 'failed', 'cancelled', 'timed_out');

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_runs_ops_job_id_unique
  ON pipeline_runs (ops_job_id)
  WHERE ops_job_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pipeline_runs_ops_job_id_fkey'
       AND conrelid = 'pipeline_runs'::REGCLASS
  ) THEN
    ALTER TABLE pipeline_runs
      ADD CONSTRAINT pipeline_runs_ops_job_id_fkey
      FOREIGN KEY (ops_job_id) REFERENCES ops_jobs(id);
  END IF;
END $$;
