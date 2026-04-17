-- Phase 62b D-20 + LOOP-07: canary regression run reports.

BEGIN;

CREATE TABLE IF NOT EXISTS canary_runs (
    run_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name              TEXT NOT NULL REFERENCES agent_registry(agent_name),
    corpus_version          TEXT NOT NULL,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at             TIMESTAMPTZ,
    status                  TEXT NOT NULL CHECK (status IN ('running','passed','failed','error')),
    is_baseline             BOOLEAN NOT NULL DEFAULT FALSE,
    coverage                NUMERIC(5,4),
    confidence_mean         NUMERIC(5,4),
    extraction_count        INTEGER,
    coverage_delta          NUMERIC(5,4),
    confidence_delta        NUMERIC(5,4),
    extraction_count_delta  INTEGER,
    verdict                 TEXT,
    report_payload          JSONB,
    baseline_run_id         UUID REFERENCES canary_runs(run_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS canary_runs_baseline_idx
    ON canary_runs (agent_name, corpus_version) WHERE is_baseline;

CREATE INDEX IF NOT EXISTS canary_runs_agent_version_idx
    ON canary_runs (agent_name, corpus_version, started_at DESC);

COMMENT ON TABLE canary_runs IS
'Phase 62b LOOP-07 + D-20: per-agent canary regression runs. First run per (agent, corpus_version) is baseline; subsequent runs compare coverage/confidence/count deltas >= 0.';

COMMIT;
