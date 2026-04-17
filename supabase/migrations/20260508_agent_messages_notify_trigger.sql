-- Phase 62b D-10 + Pitfall 4: per-recipient NOTIFY channel. Trigger fires on
-- INSERT into agent_messages and sends message_id (UUID, 36 bytes) on channel
-- 'agent_msg_<recipient_agent>'. Listener SELECTs full row (payload stays in DB).

BEGIN;

CREATE OR REPLACE FUNCTION agent_messages_notify() RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'agent_msg_' || NEW.recipient_agent,
        NEW.message_id::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_messages_notify_trigger ON agent_messages;
CREATE TRIGGER agent_messages_notify_trigger
    AFTER INSERT ON agent_messages
    FOR EACH ROW EXECUTE FUNCTION agent_messages_notify();

COMMENT ON FUNCTION agent_messages_notify() IS
'Phase 62b D-10 + Pitfall 4: NOTIFY carries message_id UUID only (36 bytes, well under 8000-byte pg_notify cap). Listener SELECTs full row.';

COMMIT;
