-- Add per_day budget rows for every agent. Until 2026-05-24 Darwin only had
-- a per_batch row, AND the gateway never debited it because the caller
-- (classifier.py) never propagated cost_cents through with_agent_context.
-- The classifier refactor in the same commit now passes real spend; this
-- migration adds the per_day window so spent_cents has a meaningful ceiling.
--
-- Defaults (conservative; tune via UPDATE after observing real spend):
--   darwin      : $5/day   (Haiku-cheap; 100K rows ≈ $32 → 6 days at this cap)
--   magellan    : $10/day  (LLM-driven URL rescue; more expensive per call)
--   extractor   : $20/day  (PDF + LLM extraction; the biggest spender)
--   hamilton    : $5/day   (analyst reports; episodic, not bulk)
--   knox        : $2/day   (orchestration only)
--   atlas       : $2/day

-- Only seed budgets for agents that exist (the registry is bootstrapped
-- separately; some envs may not yet have magellan/atlas/etc).
DO $$
DECLARE
    seeds CONSTANT TEXT[][] := ARRAY[
        ARRAY['darwin',    '500'],
        ARRAY['magellan', '1000'],
        ARRAY['extractor','2000'],
        ARRAY['hamilton',  '500'],
        ARRAY['knox',      '200'],
        ARRAY['atlas',     '200']
    ];
    s TEXT[];
BEGIN
    FOREACH s SLICE 1 IN ARRAY seeds LOOP
        IF EXISTS (SELECT 1 FROM agent_registry WHERE agent_name = s[1]) THEN
            INSERT INTO agent_budgets (
                agent_name, budget_window, limit_cents, spent_cents, window_started_at
            ) VALUES (
                s[1], 'per_day', s[2]::INTEGER, 0, NOW()
            )
            ON CONFLICT (agent_name, budget_window) DO NOTHING;
        ELSE
            RAISE NOTICE 'Skipping per_day budget for % (not in agent_registry).', s[1];
        END IF;
    END LOOP;
END $$;

-- Reset Darwin's existing per_batch row so the runaway-era window_started_at
-- (2026-04-17) doesn't trick anyone into thinking that's the current period.
UPDATE agent_budgets
   SET spent_cents = 0,
       window_started_at = NOW(),
       halted_at = NULL,
       halted_reason = NULL
 WHERE agent_name = 'darwin'
   AND budget_window = 'per_batch';
