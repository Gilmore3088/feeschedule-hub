-- Phase 62a — AGENT-05 (entity #32), foreshadows COMMS-01..05 (Phase 62b)
-- agent_messages: inter-agent handshake protocol. Empty in 62a; 62b wires send/receive logic.

CREATE TABLE IF NOT EXISTS agent_messages (
    message_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sender_agent          TEXT NOT NULL,
    recipient_agent       TEXT NOT NULL,
    intent                TEXT NOT NULL CHECK (intent IN (
                            'challenge','prove','accept','reject','escalate',
                            'coverage_request','clarify'
                          )),
    state                 TEXT NOT NULL DEFAULT 'open' CHECK (state IN (
                            'open','answered','resolved','escalated','expired'
                          )),
    correlation_id        UUID NOT NULL,
    parent_message_id     UUID REFERENCES agent_messages(message_id),
    parent_event_id       UUID,
    payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
    round_number          INTEGER NOT NULL DEFAULT 1,
    expires_at            TIMESTAMPTZ,
    resolved_at           TIMESTAMPTZ,
    resolved_by_event_id  UUID
);

COMMENT ON TABLE agent_messages IS 'Phase 62a: empty table. Phase 62b wires handshake protocol (Darwin<->Knox challenge/prove/accept/reject, Atlas escalation on N unresolved rounds).';
COMMENT ON COLUMN agent_messages.intent IS 'COMMS-01..05 + coverage_request (HAM-05 demand reflection) + clarify (discretion add).';
COMMENT ON COLUMN agent_messages.round_number IS 'Escalation counter: after N unresolved rounds, Atlas routes to daily digest (ATLAS-04).';

CREATE INDEX IF NOT EXISTS agent_messages_recipient_state_idx
    ON agent_messages (recipient_agent, state, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_messages_correlation_idx
    ON agent_messages (correlation_id);
CREATE INDEX IF NOT EXISTS agent_messages_expires_idx
    ON agent_messages (expires_at) WHERE expires_at IS NOT NULL AND state = 'open';
