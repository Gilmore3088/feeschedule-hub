-- Phase 62b LOOP-05: knowledge table written by AgentBase.understand().

BEGIN;

CREATE TABLE IF NOT EXISTS agent_lessons (
    lesson_id           BIGSERIAL PRIMARY KEY,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    agent_name          TEXT NOT NULL REFERENCES agent_registry(agent_name),
    lesson_name         TEXT NOT NULL,
    description         TEXT NOT NULL,
    evidence_refs       JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence          NUMERIC(5,4),
    superseded_by       BIGINT REFERENCES agent_lessons(lesson_id),
    source_event_id     UUID,
    UNIQUE (agent_name, lesson_name)
);

CREATE INDEX IF NOT EXISTS agent_lessons_agent_idx
    ON agent_lessons (agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_lessons_active_idx
    ON agent_lessons (agent_name) WHERE superseded_by IS NULL;

COMMENT ON TABLE agent_lessons IS
'Phase 62b LOOP-05: named, generalizable lessons produced by AgentBase.understand(). Superseded rows preserved for audit.';

COMMIT;
