-- Phase 62a — AGENT-05 (entity #33)
-- agent_registry: source of truth for agent identity + hierarchy.
-- agent_budgets: per-agent cost quotas (per_cycle | per_batch | per_report | per_day | per_month).

-- ========================================================================
-- agent_registry
-- ========================================================================
CREATE TABLE IF NOT EXISTS agent_registry (
    agent_name      TEXT PRIMARY KEY,
    display_name    TEXT NOT NULL,
    description     TEXT,
    role            TEXT NOT NULL CHECK (role IN (
                      'supervisor','data','classifier','orchestrator','analyst','state_agent'
                    )),
    parent_agent    TEXT REFERENCES agent_registry(agent_name),
    state_code      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (role = 'state_agent' AND state_code IS NOT NULL AND length(state_code) = 2)
        OR (role <> 'state_agent' AND state_code IS NULL)
    )
);

COMMENT ON TABLE agent_registry IS 'Phase 62a AGENT-05: canonical agent identity table. 4 top-level + 51 state agents seeded.';
COMMENT ON COLUMN agent_registry.role IS 'state_agent is the only role permitted to have state_code; all others must have state_code IS NULL.';

-- ========================================================================
-- agent_budgets
-- ========================================================================
CREATE TABLE IF NOT EXISTS agent_budgets (
    agent_name         TEXT NOT NULL REFERENCES agent_registry(agent_name) ON DELETE CASCADE,
    budget_window      TEXT NOT NULL CHECK (budget_window IN (
                         'per_cycle','per_batch','per_report','per_day','per_month'
                       )),
    limit_cents        INTEGER NOT NULL CHECK (limit_cents >= 0),
    spent_cents        INTEGER NOT NULL DEFAULT 0 CHECK (spent_cents >= 0),
    window_started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    halted_at          TIMESTAMPTZ,
    halted_reason      TEXT,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (agent_name, budget_window)
);

COMMENT ON TABLE agent_budgets IS 'Phase 62a AGENT-05: per-agent cost quota. Gateway reads limit_cents (env override > this row > config.yaml fallback); gateway writes spent_cents + halted_at. Direct UPDATE tools forbidden — only gateway internals.';

CREATE INDEX IF NOT EXISTS agent_budgets_halted_idx
    ON agent_budgets (halted_at) WHERE halted_at IS NOT NULL;

-- ========================================================================
-- Seed top-level agents
-- ========================================================================
INSERT INTO agent_registry (agent_name, display_name, description, role, parent_agent) VALUES
    ('hamilton', 'Hamilton', 'Research analyst; reads Tier 3; synthesizes reports.', 'analyst', NULL),
    ('knox',     'Knox',     'Supervisor of state-agent fleet; coordinates crawl rollups; promotes cross-state patterns to national knowledge.', 'supervisor', NULL),
    ('darwin',   'Darwin',   'Classifier + verifier; promotes fees_raw -> fees_verified; challenges Knox via agent_messages.', 'classifier', NULL),
    ('atlas',    'Atlas',    'Orchestrator; schedules wave runs; enforces cost budgets; routes remediation.', 'orchestrator', NULL)
ON CONFLICT (agent_name) DO NOTHING;

-- ========================================================================
-- Seed 51 state agents (50 states + DC) as children of Knox.
-- ========================================================================
DO $$
DECLARE
    state_codes TEXT[] := ARRAY[
        'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
        'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
        'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
        'VA','WA','WV','WI','WY','DC'
    ];
    c TEXT;
BEGIN
    FOREACH c IN ARRAY state_codes LOOP
        INSERT INTO agent_registry (agent_name, display_name, role, parent_agent, state_code) VALUES
            ('state_' || lower(c), 'State Agent ' || c, 'state_agent', 'knox', c)
        ON CONFLICT (agent_name) DO NOTHING;
    END LOOP;
END $$;

-- ========================================================================
-- Seed default budgets (config.yaml fallback; operator can override via UPDATE).
-- ========================================================================
INSERT INTO agent_budgets (agent_name, budget_window, limit_cents) VALUES
    ('knox',     'per_cycle',  50000),  -- $500 per quarterly cycle
    ('darwin',   'per_batch',  10000),  -- $100 per verification batch
    ('hamilton', 'per_report',  1000),  -- $10 per generated report
    ('atlas',    'per_month',  10000)   -- $100 per month of orchestration
ON CONFLICT (agent_name, budget_window) DO NOTHING;

-- Per-state-agent default budget: $50 per cycle, applied only if not already set.
DO $$
DECLARE
    c TEXT;
BEGIN
    FOR c IN SELECT agent_name FROM agent_registry WHERE role = 'state_agent' LOOP
        INSERT INTO agent_budgets (agent_name, budget_window, limit_cents) VALUES (c, 'per_cycle', 5000)
        ON CONFLICT (agent_name, budget_window) DO NOTHING;
    END LOOP;
END $$;
