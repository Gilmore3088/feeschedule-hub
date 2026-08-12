BEGIN;

ALTER TABLE automation_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_control_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_api_usage_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE automation_control
  FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE automation_control_audit
  FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE ai_api_usage_events
  FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON SEQUENCE automation_control_audit_id_seq
  FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE ai_api_usage_events_id_seq
  FROM anon, authenticated;

COMMIT;
