-- Phase 62b follow-up — seed budgets for Atlas + the state fleet.
--
-- Atlas now has real code (fee_crawler/agents/atlas/) and acts as the
-- orchestrator: every-minute Modal dispatcher invokes
-- dispatch_state_fleet which records decisions under agent_name='atlas'
-- via the gateway. Needs a budget row or the gateway rejects calls.
--
-- Each of the 51 state agents (state_al..state_dc) was seeded with a
-- per_cycle budget in 20260422; this migration adds a per_day budget so
-- the gateway can enforce a real daily ceiling on per-state spend.
-- Atlas's dispatch decisions are budget-cheap themselves (one event per
-- state per day); the real cost is incurred by the state_xx agents'
-- extract_batch runs.
--
-- Defaults (tune after observing real spend):
--   atlas         : $1/day   — just dispatch decisions, no LLM
--   state_xx ×51  : $2/day   — ~50 extractions/state at 4¢ each = $2 cap

DO $$
BEGIN
    -- Atlas — make sure it has a per_day budget so dispatch_state_fleet
    -- doesn't hit BudgetExceeded on its event-only writes.
    IF EXISTS (SELECT 1 FROM agent_registry WHERE agent_name = 'atlas') THEN
        INSERT INTO agent_budgets (agent_name, budget_window, limit_cents, spent_cents, window_started_at)
        VALUES ('atlas', 'per_day', 100, 0, NOW())
        ON CONFLICT (agent_name, budget_window) DO NOTHING;
    END IF;
END $$;

-- Per-state per_day budgets. INSERT … SELECT directly from agent_registry
-- so we only seed budgets for state agents that actually exist (matches
-- whatever subset is in this environment).
INSERT INTO agent_budgets (agent_name, budget_window, limit_cents, spent_cents, window_started_at)
SELECT agent_name, 'per_day', 200, 0, NOW()
  FROM agent_registry
 WHERE role = 'state_agent'
ON CONFLICT (agent_name, budget_window) DO NOTHING;
