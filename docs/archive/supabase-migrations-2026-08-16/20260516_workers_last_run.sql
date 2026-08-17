-- Phase 62b follow-up (WR-05): add workers_last_run table so the every-minute
-- run_post_processing cron can detect and recover from a missed daily-pipeline
-- window. Prior logic fired only when `now.hour == 6 AND now.minute < 2`,
-- which silently skipped 24h of processing on Modal cold-start jitter.
--
-- The table is a singleton keyed by job_name; completed_at records the last
-- successful run. The cron checks "completed_at < today 06:00 UTC" to decide
-- whether the daily pipeline still needs to execute, and widens the window to
-- 06:00-06:10 UTC to absorb normal cron jitter. An explicit catch-up path is
-- out of scope (the LOG WARNING alone is enough for operator observability).

BEGIN;

CREATE TABLE IF NOT EXISTS workers_last_run (
    job_name      TEXT PRIMARY KEY,
    completed_at  TIMESTAMPTZ,
    status        TEXT,
    notes         TEXT
);

COMMENT ON TABLE workers_last_run IS
'Phase 62b WR-05: singleton-per-job marker table so every-minute crons can detect missed daily runs (idempotent guard for run_post_processing etc.).';

COMMIT;
