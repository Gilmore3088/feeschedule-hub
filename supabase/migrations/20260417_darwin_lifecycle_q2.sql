-- Darwin v1 slice: permit auto-promote at confidence >= 0.90.
-- Transitions darwin from q1_validation (human approval per output) to
-- q2_high_confidence (auto-commit >= 0.85 + 5% digest sample). Policy
-- cadence (5% digest) enforced by the Darwin policy active at that time.
--
-- Reversible: UPDATE agent_registry SET lifecycle_state='q1_validation' WHERE agent_name='darwin';

BEGIN;

UPDATE agent_registry
SET lifecycle_state = 'q2_high_confidence'
WHERE agent_name = 'darwin';

COMMIT;
