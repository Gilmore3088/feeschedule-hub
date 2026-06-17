-- Audit item #7: pg_notify on ops_jobs INSERT/UPDATE so /admin/ops can stream
-- job status changes via SSE instead of polling every 3s.
--
-- Channel: 'ops_jobs'
-- Payload: small JSON {id, status, command, op} — well under 8000-byte pg_notify cap
-- (research §Pitfall 4). Listener SELECTs the full row if it needs more detail.
--
-- LISTEN requires a session-mode connection (port 5432, DATABASE_URL_SESSION).
-- The transaction-mode pooler at port 6543 does NOT persist LISTEN registrations
-- (research §Pitfall 2).

BEGIN;

CREATE OR REPLACE FUNCTION ops_jobs_notify() RETURNS TRIGGER AS $$
DECLARE
    payload TEXT;
BEGIN
    payload := json_build_object(
        'id', NEW.id,
        'status', NEW.status,
        'command', NEW.command,
        'op', TG_OP
    )::text;
    PERFORM pg_notify('ops_jobs', payload);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ops_jobs_notify_insert ON ops_jobs;
CREATE TRIGGER ops_jobs_notify_insert
    AFTER INSERT ON ops_jobs
    FOR EACH ROW EXECUTE FUNCTION ops_jobs_notify();

DROP TRIGGER IF EXISTS ops_jobs_notify_update ON ops_jobs;
CREATE TRIGGER ops_jobs_notify_update
    AFTER UPDATE OF status, exit_code, completed_at, error_summary ON ops_jobs
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status
          OR OLD.exit_code IS DISTINCT FROM NEW.exit_code
          OR OLD.completed_at IS DISTINCT FROM NEW.completed_at)
    EXECUTE FUNCTION ops_jobs_notify();

COMMENT ON FUNCTION ops_jobs_notify() IS
'Audit #7: fires pg_notify on ops_jobs channel for SSE consumers. Payload kept small (id+status+command+op) — listener re-queries DB for full row.';

COMMIT;

-- Rollback:
--   BEGIN;
--   DROP TRIGGER IF EXISTS ops_jobs_notify_insert ON ops_jobs;
--   DROP TRIGGER IF EXISTS ops_jobs_notify_update ON ops_jobs;
--   DROP FUNCTION IF EXISTS ops_jobs_notify();
--   COMMIT;
