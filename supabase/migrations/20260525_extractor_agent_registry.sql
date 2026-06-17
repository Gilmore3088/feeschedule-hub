-- Phase 62b follow-up — register the `extractor` agent.
--
-- The new fee_crawler.agents.extractor.extract_batch orchestrator writes
-- fees_raw via create_fee_raw → gateway. Gateway first check (gateway.py
-- contract step 1) validates agent_name against agent_registry.is_active,
-- so the agent must exist before its first run.
--
-- Replaces the legacy `fee_crawler crawl` + state_agent._write_fees path
-- (writes extracted_fees; frozen by 20260425_freeze_extracted_fees_writes.sql).
-- The 3am/4am Modal crons now call the extractor agent directly.

INSERT INTO agent_registry (agent_name, display_name, description, role, parent_agent)
VALUES (
    'extractor',
    'Extractor',
    'Bulk fee extraction: download discovered URLs, run LLM extraction, '
    'insert into fees_raw via gateway. Driven by the run_pdf_extraction '
    '(3am UTC) and run_browser_extraction (4am UTC) Modal crons, plus the '
    'extract_batch_endpoint HTTP trigger.',
    'data',
    NULL
)
ON CONFLICT (agent_name) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        description  = EXCLUDED.description,
        role         = EXCLUDED.role,
        is_active    = TRUE;

-- Seed budgets so the gateway doesn't reject extractor calls. $10/day is
-- the same order of magnitude as Darwin's DARWIN_DAILY_COST_LIMIT_USD
-- ($20). per_batch cap stops a single oversized PDF from burning the slot.
-- Tune via UPDATE agent_budgets SET limit_cents = ... once we have real
-- spend data.
INSERT INTO agent_budgets (agent_name, budget_window, limit_cents, spent_cents, window_started_at)
VALUES
    ('extractor', 'per_day',   1000, 0, NOW()),
    ('extractor', 'per_batch',  500, 0, NOW())
ON CONFLICT (agent_name, budget_window) DO NOTHING;
