-- Phase 62b BOOT-01 / D-22 / D-05:
--   lifecycle_state enum: q1_validation | q2_high_confidence | q3_autonomy | paused
--   review_schedule: cron string read by pg_cron dispatcher (62B-08)

BEGIN;

ALTER TABLE agent_registry
    ADD COLUMN IF NOT EXISTS lifecycle_state TEXT NOT NULL DEFAULT 'q1_validation'
        CHECK (lifecycle_state IN ('q1_validation','q2_high_confidence','q3_autonomy','paused'));

ALTER TABLE agent_registry
    ADD COLUMN IF NOT EXISTS review_schedule TEXT;

COMMENT ON COLUMN agent_registry.lifecycle_state IS
'Phase 62b BOOT-01: AgentBase reads on turn start. Q1 = hold every output for human approval; Q2 = auto-commit confidence>=0.85 + random 5% to digest; Q3 = autonomy + quarterly sampling; paused = abort turn.';

COMMENT ON COLUMN agent_registry.review_schedule IS
'Phase 62b D-05: cron expression consumed by pg_cron agent-review-<agent_name> jobs (migration 20260510_pg_cron_review_dispatcher in plan 62B-08).';

-- Seed per-role review schedules. Hamilton + Atlas stay NULL (Hamilton is TS caller; Atlas schedules others).
UPDATE agent_registry SET review_schedule = '*/15 * * * *' WHERE agent_name = 'knox';
UPDATE agent_registry SET review_schedule = '0 * * * *'    WHERE agent_name = 'darwin';
UPDATE agent_registry SET review_schedule = '0 */4 * * *'  WHERE role = 'state_agent';

COMMIT;
