-- Phase 62a — KNOX-03 foundation (table empty in 62a; Phase 63 populates).
-- Per-institution strategy memory: what URL was tried, what format, what outcome, what to try next.

CREATE TABLE IF NOT EXISTS institution_dossiers (
    institution_id             INTEGER PRIMARY KEY REFERENCES crawl_targets(id) ON DELETE CASCADE,
    last_url_tried             TEXT,
    last_document_format       TEXT CHECK (last_document_format IN (
                                 'pdf','html','js_rendered','stealth_pass_1','stealth_pass_2','unknown'
                               ) OR last_document_format IS NULL),
    last_strategy              TEXT,
    last_outcome               TEXT CHECK (last_outcome IN (
                                 'success','blocked','404','no_fees','captcha','rate_limited','unknown'
                               ) OR last_outcome IS NULL),
    last_cost_cents            INTEGER NOT NULL DEFAULT 0 CHECK (last_cost_cents >= 0),
    next_try_recommendation    TEXT CHECK (next_try_recommendation IN (
                                 'retry_same','stealth_pass_1','needs_playwright_stealth','skip','rediscover_url'
                               ) OR next_try_recommendation IS NULL),
    notes                      JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_agent_event_id  UUID,
    updated_by_agent           TEXT
);

COMMENT ON TABLE institution_dossiers IS 'Phase 62a KNOX-03: per-institution strategy memory. Empty in 62a; Phase 63 state agents populate via upsert tool.';
COMMENT ON COLUMN institution_dossiers.updated_by_agent_event_id IS 'Logical FK to agent_events.event_id (cross-partition; not DB-enforced).';

CREATE INDEX IF NOT EXISTS institution_dossiers_outcome_idx
    ON institution_dossiers (last_outcome, updated_at DESC);
CREATE INDEX IF NOT EXISTS institution_dossiers_next_try_idx
    ON institution_dossiers (next_try_recommendation) WHERE next_try_recommendation IS NOT NULL;
CREATE INDEX IF NOT EXISTS institution_dossiers_updated_by_agent_idx
    ON institution_dossiers (updated_by_agent, updated_at DESC);
