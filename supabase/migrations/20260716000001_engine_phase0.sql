-- Ingestion Engine — Phase 0 foundations
-- Plan: docs/architecture/ingestion-engine-plan.md §4.1, §4.2, §6.3
--
-- Extends the existing `jobs` queue with sharding/provenance/heartbeat columns,
-- adds content-addressed `documents`, and adds `engine_runs` (try/finally run
-- tracking that replaces the silent-cron crawl_runs freshness path).
--
-- All statements idempotent (IF NOT EXISTS) so the migration is safe to re-apply.

-- ---------------------------------------------------------------------------
-- T0.3 — extend the existing jobs queue
-- ---------------------------------------------------------------------------
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS state_code    CHAR(2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS run_id        BIGINT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parent_job_id BIGINT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS heartbeat_at  TIMESTAMPTZ;

-- Claim index: covers the hot SELECT ... FOR UPDATE SKIP LOCKED path.
CREATE INDEX IF NOT EXISTS jobs_claim_idx
    ON jobs (queue, priority DESC, run_at)
    WHERE status = 'pending';

-- Reaper index: finds stale `running` jobs by heartbeat age.
CREATE INDEX IF NOT EXISTS jobs_reaper_idx
    ON jobs (heartbeat_at)
    WHERE status = 'running';

-- Per-cycle / per-state observability.
CREATE INDEX IF NOT EXISTS jobs_run_state_idx
    ON jobs (run_id, state_code);

-- ---------------------------------------------------------------------------
-- T0.4 — content-addressed documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id                BIGSERIAL PRIMARY KEY,
    crawl_target_id   BIGINT      NOT NULL,
    state_code        CHAR(2)     NOT NULL,
    source_url        TEXT        NOT NULL,
    content_sha256    TEXT        NOT NULL,   -- hash of NORMALIZED text (the change-gate)
    raw_sha256        TEXT        NOT NULL,   -- hash of raw bytes
    r2_key            TEXT        NOT NULL,   -- content-addressed: documents/<raw_sha256>
    http_status       INT,
    render_mode       TEXT,                   -- http | browser
    doc_type          TEXT,                   -- pdf | html | js
    byte_size         BIGINT,
    fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id            BIGINT,
    -- An unchanged document (same normalized content for the same target) is a
    -- no-op insert; the change-gate relies on this uniqueness.
    UNIQUE (crawl_target_id, content_sha256)
);

CREATE INDEX IF NOT EXISTS documents_target_time_idx
    ON documents (crawl_target_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS documents_raw_sha_idx
    ON documents (raw_sha256);
CREATE INDEX IF NOT EXISTS documents_run_idx
    ON documents (run_id);

COMMENT ON TABLE documents IS
    'Content-addressed document snapshots. Bytes live in R2 keyed by raw_sha256; '
    'content_sha256 (normalized text) drives the change-gate. Every fees_raw row '
    'traces to one of these for full provenance.';

-- ---------------------------------------------------------------------------
-- T0.5 — engine_runs (try/finally run tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engine_runs (
    id             BIGSERIAL PRIMARY KEY,
    kind           TEXT        NOT NULL,   -- state | national | worker-pool
    state_code     CHAR(2),                -- NULL for national/global runs
    cycle          BIGINT,                 -- logical cycle number
    status         TEXT        NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running', 'completed', 'failed')),
    stats          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    error          TEXT,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    heartbeat_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS engine_runs_state_idx
    ON engine_runs (state_code, started_at DESC);
CREATE INDEX IF NOT EXISTS engine_runs_reaper_idx
    ON engine_runs (heartbeat_at)
    WHERE status = 'running';

COMMENT ON TABLE engine_runs IS
    'One row per (kind, state, cycle). Written in try/finally: always transitions '
    'to completed/failed on exit. A reaper fails rows stuck running past timeout so '
    'freshness dashboards can never show a dead run as healthy.';
