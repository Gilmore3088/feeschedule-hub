-- Pipeline rebuild — Phase 1 control-plane foundation.
--
-- Two clean tables that become the single source of product truth for the
-- pipeline: one row per run, one row per stage per run. The admin control room
-- (/admin/pipeline) reads these. Replaces the fragmented
-- workers_last_run + agent_events + dead ops_jobs view.
--
-- A legacy `pipeline_runs` exists in scripts/migrate-schema.sql for the
-- abandoned fee_crawler/pipeline/executor.py (phase-resume columns:
-- last_completed_phase, last_completed_job, config_json). That executor is dead
-- code. This migration replaces that table with the clean shape, guarding
-- against data loss: if the legacy table holds rows it is renamed, not dropped.

BEGIN;

-- 1. Reconcile any legacy pipeline_runs before creating the clean shape.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'pipeline_runs'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'pipeline_runs'
               AND column_name = 'trigger_source'
        ) THEN
            -- Already the new shape (re-run of this migration). Nothing to do.
            RAISE NOTICE 'pipeline_runs already has the new shape; leaving as-is.';
        ELSIF (SELECT count(*) FROM pipeline_runs) = 0 THEN
            -- Legacy executor-era table, empty. Safe to drop.
            RAISE NOTICE 'Dropping empty legacy pipeline_runs.';
            DROP TABLE pipeline_runs CASCADE;
        ELSE
            -- Legacy table with data — preserve it under a new name rather than
            -- silently destroy rows (data-integrity rule).
            RAISE NOTICE 'Renaming non-empty legacy pipeline_runs to pipeline_runs_legacy_20260603.';
            ALTER TABLE pipeline_runs RENAME TO pipeline_runs_legacy_20260603;
        END IF;
    END IF;
END $$;

-- 2. pipeline_runs — one row per run (product truth).
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id               BIGSERIAL PRIMARY KEY,
    trigger_source   TEXT        NOT NULL CHECK (trigger_source IN ('manual','cron','api')),
    triggered_by     TEXT        NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','running','succeeded','failed','canceled')),
    params_json      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    workflow_run_id  TEXT,
    stages_total     INT         NOT NULL DEFAULT 0,
    stages_done      INT         NOT NULL DEFAULT 0,
    started_at       TIMESTAMPTZ,
    finished_at      TIMESTAMPTZ,
    error            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE pipeline_runs IS
    'Pipeline rebuild Phase 1: one row per pipeline run. Trigger source + status + timings. Read by /admin/pipeline control room.';

-- 3. pipeline_steps — one row per stage per run.
CREATE TABLE IF NOT EXISTS pipeline_steps (
    id           BIGSERIAL PRIMARY KEY,
    run_id       BIGINT      NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
    stage        TEXT        NOT NULL,
    seq          INT         NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','running','succeeded','failed','skipped')),
    rows_in      INT,
    rows_out     INT,
    cost_cents   INT         NOT NULL DEFAULT 0,
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ,
    error        TEXT,
    notes_json   JSONB,
    UNIQUE (run_id, stage)
);

COMMENT ON TABLE pipeline_steps IS
    'Pipeline rebuild Phase 1: one row per stage per run. rows_in/rows_out + status + duration drive the control room step view.';

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_created ON pipeline_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_run    ON pipeline_steps (run_id, seq);

COMMIT;
