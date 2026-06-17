-- Register the `discoverer` agent (Stage 1 of the pipeline, previously
-- ran as a plain Modal subprocess with no agent identity / audit / budget).
--
-- New module fee_crawler/agents/discoverer/ wraps discovery_worker.run()
-- in an agentic shell that writes session_start / session_end agent_events
-- rows and debits agent_budgets after each run. Gateway-style pre-flight
-- checks require this agent be present + is_active before any run.

INSERT INTO agent_registry (agent_name, display_name, description, role, parent_agent)
VALUES (
    'discoverer',
    'Discoverer',
    'Stage 1 URL discovery: sweeps crawl_targets with no fee_schedule_url. '
    'Wraps the legacy discovery_worker queue processor with agent-identity '
    'audit (session_start/session_end events) + budget enforcement. Runs '
    'nightly at 02:00 UTC via the run_discovery Modal cron.',
    'data',
    NULL
)
ON CONFLICT (agent_name) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        description  = EXCLUDED.description,
        role         = EXCLUDED.role,
        is_active    = TRUE;

-- Per-day budget: ~200 jobs/run at 1¢/job estimate = $2/run; cap at $5/day
-- to absorb retry storms without unbounded spend.
INSERT INTO agent_budgets (agent_name, budget_window, limit_cents, spent_cents, window_started_at)
VALUES
    ('discoverer', 'per_day', 500, 0, NOW())
ON CONFLICT (agent_name, budget_window) DO NOTHING;
