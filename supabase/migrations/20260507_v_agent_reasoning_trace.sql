-- Phase 62b COMMS-05: flat ordered timeline per correlation_id. Read-only tool
-- get_reasoning_trace(correlation_id) queries this view.

BEGIN;

CREATE OR REPLACE VIEW v_agent_reasoning_trace AS
SELECT
    'event' AS kind,
    e.correlation_id,
    e.created_at,
    e.agent_name,
    e.action AS intent_or_action,
    e.tool_name,
    e.entity,
    e.input_payload AS payload,
    e.event_id::TEXT AS row_id
FROM agent_events e
UNION ALL
SELECT
    'message' AS kind,
    m.correlation_id,
    m.created_at,
    m.sender_agent AS agent_name,
    m.intent AS intent_or_action,
    NULL::TEXT AS tool_name,
    m.recipient_agent AS entity,
    m.payload,
    m.message_id::TEXT AS row_id
FROM agent_messages m
ORDER BY created_at;

COMMENT ON VIEW v_agent_reasoning_trace IS
'Phase 62b COMMS-05: flat ordered timeline per correlation_id. Read-only tool get_reasoning_trace(correlation_id) queries this.';

COMMIT;
