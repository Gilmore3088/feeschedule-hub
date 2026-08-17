-- Make crawl telemetry independently reconcilable without guessing from start time.
ALTER TABLE crawl_runs
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;

UPDATE crawl_runs
   SET heartbeat_at = completed_at
 WHERE heartbeat_at IS NULL
   AND completed_at IS NOT NULL;
