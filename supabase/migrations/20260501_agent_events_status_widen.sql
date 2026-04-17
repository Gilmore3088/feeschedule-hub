-- Phase 62b — widens agent_events.status CHECK for improve_rejected (D-08) + shadow_diff (D-21).
-- Adds is_shadow boolean column (D-21) for quick filtering of shadow-mode rows.

BEGIN;

ALTER TABLE agent_events DROP CONSTRAINT IF EXISTS agent_events_status_check;
ALTER TABLE agent_events ADD CONSTRAINT agent_events_status_check
    CHECK (status IN ('pending','success','error','budget_halt','improve_rejected','shadow_diff'));

ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS is_shadow BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS agent_events_shadow_idx
    ON agent_events (is_shadow) WHERE is_shadow;

COMMENT ON COLUMN agent_events.is_shadow IS
'Phase 62b D-21: TRUE when emitted under a shadow_run_id context; business-table writes suppressed to shadow_outputs.';

COMMIT;
