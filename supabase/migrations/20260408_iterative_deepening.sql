-- Migration: iterative deepening columns
-- Phase 20-01: Iterative Deepening — strategy tier foundation
-- Decision refs: D-07 (extend agent_runs), D-10 (pass tracking), ITER-01/02

-- ─── agent_runs: pass tracking columns ───────────────────────────────────────
-- Each pass creates a new agent_runs row; pass_number and strategy allow
-- querying pass history per state without a separate table.

ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS pass_number INTEGER DEFAULT 1;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS strategy TEXT DEFAULT 'tier1';

-- Index for efficient multi-pass queries per state
CREATE INDEX IF NOT EXISTS agent_runs_state_pass_idx
  ON agent_runs (state_code, pass_number);

-- ─── wave_state_runs: resume support ─────────────────────────────────────────
-- last_completed_pass tracks which pass succeeded so resume_wave() can
-- restart from pass N+1 instead of re-running all passes. (D-09 pitfall #5)

ALTER TABLE wave_state_runs ADD COLUMN IF NOT EXISTS last_completed_pass INTEGER DEFAULT 0;
