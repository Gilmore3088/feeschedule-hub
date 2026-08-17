-- Phase 62b follow-up (WR-03): widen agent_events_status_check to include
-- 'in_progress'. The dispatcher needs to pre-claim rows inside a single
-- transaction by flipping status='pending' -> 'in_progress', so concurrent
-- dispatchers under FOR UPDATE SKIP LOCKED cannot double-fire agent.review().
--
-- The prior constraint from 20260501 accepts:
--   pending, success, error, budget_halt, improve_rejected, shadow_diff
-- Add 'in_progress' to that set.

BEGIN;

ALTER TABLE agent_events DROP CONSTRAINT IF EXISTS agent_events_status_check;
ALTER TABLE agent_events ADD CONSTRAINT agent_events_status_check
    CHECK (status IN (
        'pending',
        'in_progress',
        'success',
        'error',
        'budget_halt',
        'improve_rejected',
        'shadow_diff'
    ));

COMMENT ON CONSTRAINT agent_events_status_check ON agent_events IS
'Phase 62b WR-03: adds in_progress so the review-tick dispatcher can atomically claim rows via UPDATE ... WHERE status=pending.';

COMMIT;
