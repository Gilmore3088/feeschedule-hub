-- Phase 62b OBS-05 (plan 62B-09): seed agent_health_rollup with the last 24
-- hours of aggregated data so the /admin/agents Overview tab renders non-empty
-- before Phase 63 traffic materializes. Without this, a fresh production
-- deploy would show a blank tile grid until pg_cron's *15-minute schedule
-- accumulated enough events.
--
-- Safe to re-apply: refresh_agent_health_rollup() upserts via
-- ON CONFLICT (agent_name, bucket_start) DO UPDATE; replaying the seed just
-- re-computes the same buckets.
--
-- Guarded with a DO block so the migration applies cleanly in test/CI schemas
-- where the refresh function may not yet exist (e.g., when migrations are
-- applied out of order by a partial-schema fixture).

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'refresh_agent_health_rollup') THEN
        PERFORM refresh_agent_health_rollup(NOW() - INTERVAL '24 hours');
    ELSE
        RAISE NOTICE
            'refresh_agent_health_rollup not found; skipping seed '
            '(expected during partial test-schema setup).';
    END IF;
END $$;

COMMIT;
