-- Ingestion Engine — Phase 2: structured per-state knowledge
-- Plan: docs/architecture/ingestion-engine-plan.md §4.3, §6.2
--
-- Replaces the freeform knowledge/states/*.md as the SOURCE OF TRUTH with two
-- queryable tables. The markdown becomes a generated export. This is what makes
-- each state cycle compound: institution_hints drives next-cycle dispatch;
-- state_run_notes gives per-state trend visibility.
--
-- Idempotent (IF NOT EXISTS).

-- Durable, queryable, per-institution learned facts. Read before dispatch.
CREATE TABLE IF NOT EXISTS institution_hints (
    crawl_target_id   BIGINT PRIMARY KEY,
    state_code        CHAR(2) NOT NULL,
    known_fee_url     TEXT,                        -- skip re-discovery
    render_mode       TEXT,                        -- http | browser (skip escalation)
    doc_type          TEXT,                        -- pdf | html | js
    needs_ocr         BOOLEAN NOT NULL DEFAULT FALSE,
    fee_name_aliases  JSONB   NOT NULL DEFAULT '{}'::jsonb,  -- local name -> canonical hint
    last_good_run_id  BIGINT,
    fail_streak       INT     NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS institution_hints_state_idx
    ON institution_hints (state_code);

COMMENT ON TABLE institution_hints IS
    'Per-institution learned facts written by the state supervisor. Drives next '
    'cycle: known_fee_url skips discovery, render_mode skips fetch escalation, '
    'needs_ocr routes read straight to OCR, aliases sharpen extraction.';

-- Per-state, per-cycle rollup notes (the "Run #N" log, structured + queryable).
CREATE TABLE IF NOT EXISTS state_run_notes (
    id            BIGSERIAL PRIMARY KEY,
    state_code    CHAR(2) NOT NULL,
    run_id        BIGINT  NOT NULL,
    discovered    INT NOT NULL DEFAULT 0,
    extracted     INT NOT NULL DEFAULT 0,
    failed        INT NOT NULL DEFAULT 0,
    patterns      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- structured learnings this cycle
    promoted      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- candidates for national.md
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS state_run_notes_state_idx
    ON state_run_notes (state_code, run_id DESC);

COMMENT ON TABLE state_run_notes IS
    'One row per (state, cycle). The queryable form of knowledge/states/*.md '
    '"Run #N" entries; markdown is regenerated from these rows.';
