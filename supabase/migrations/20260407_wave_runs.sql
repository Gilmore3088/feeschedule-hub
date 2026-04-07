-- Migration: wave_runs + wave_state_runs tables
-- Phase 19-01: Wave Orchestrator — Wave data layer
-- Decision refs: D-02 (coverage-gap ranking), D-05 (DB persistence for resume)

-- ─── wave_runs ────────────────────────────────────────────────────────────────
-- Tracks a single orchestrated crawl wave: list of states, progress counters,
-- and status. D-05: DB persistence supports resume-from-failure.

CREATE TABLE IF NOT EXISTS wave_runs (
  id               SERIAL PRIMARY KEY,
  states           TEXT[]      NOT NULL,           -- e.g. ARRAY['WY','MT','TX']
  wave_size        INTEGER     NOT NULL,
  total_states     INTEGER     NOT NULL,
  completed_states INTEGER     DEFAULT 0,
  failed_states    INTEGER     DEFAULT 0,
  status           TEXT        DEFAULT 'pending',  -- pending | running | complete | failed
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  campaign_id      TEXT,                           -- optional grouping for multi-wave campaigns

  CONSTRAINT wave_runs_status_check
    CHECK (status IN ('pending', 'running', 'complete', 'failed'))
);

-- Index for efficient status queries
CREATE INDEX IF NOT EXISTS wave_runs_status_created_at_idx
  ON wave_runs (status, created_at);

CREATE INDEX IF NOT EXISTS wave_runs_campaign_id_idx
  ON wave_runs (campaign_id)
  WHERE campaign_id IS NOT NULL;

-- ─── wave_state_runs ──────────────────────────────────────────────────────────
-- Tracks individual state execution within a wave. agent_run_id links back to
-- the state agent's agent_runs row when complete.

CREATE TABLE IF NOT EXISTS wave_state_runs (
  id            SERIAL PRIMARY KEY,
  wave_run_id   INTEGER     NOT NULL REFERENCES wave_runs(id),
  state_code    TEXT        NOT NULL,
  status        TEXT        DEFAULT 'pending',  -- pending | running | complete | failed | skipped
  agent_run_id  INTEGER,                        -- FK to agent_runs.id when complete
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  error         TEXT,

  UNIQUE(wave_run_id, state_code),

  CONSTRAINT wave_state_runs_status_check
    CHECK (status IN ('pending', 'running', 'complete', 'failed', 'skipped'))
);

-- Index for get_incomplete_states queries
CREATE INDEX IF NOT EXISTS wave_state_runs_wave_status_idx
  ON wave_state_runs (wave_run_id, status);
