-- Phase 62b D-21: shadow-mode redirected business-table writes.

BEGIN;

CREATE TABLE IF NOT EXISTS shadow_outputs (
    shadow_output_id  BIGSERIAL PRIMARY KEY,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    shadow_run_id     UUID NOT NULL,
    agent_name        TEXT NOT NULL REFERENCES agent_registry(agent_name),
    entity            TEXT NOT NULL,
    payload_diff      JSONB NOT NULL,
    agent_event_id    UUID
);

CREATE INDEX IF NOT EXISTS shadow_outputs_run_idx
    ON shadow_outputs (shadow_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shadow_outputs_event_idx
    ON shadow_outputs (agent_event_id) WHERE agent_event_id IS NOT NULL;

COMMENT ON TABLE shadow_outputs IS
'Phase 62b D-21: when agent context has shadow_run_id, gateway routes business-table writes here instead of the target table. Parallel-implementation diff source.';

COMMIT;
