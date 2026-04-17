-- Phase 62b LOOP-03 D-05 pivot: per-agent pg_cron review_tick schedules.
-- Replaces the originally-planned per-agent Modal cron (blocked by Starter 5-slot cap,
-- research Pitfall 1). Modal-side dispatcher (in modal_app.py post_processing slot)
-- polls and invokes each agent's AgentBase.review() method.

BEGIN;

DO $$
DECLARE
    r RECORD;
    ext_exists BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO ext_exists;
    IF NOT ext_exists THEN
        RAISE NOTICE 'pg_cron extension not installed; skipping review schedule seeds (test-schema path).';
        RETURN;
    END IF;

    -- Remove prior agent-review-* schedules so this migration is idempotent.
    FOR r IN SELECT jobname FROM cron.job WHERE jobname LIKE 'agent-review-%'
    LOOP
        PERFORM cron.unschedule(r.jobname);
    END LOOP;

    -- Seed fresh schedules from agent_registry.review_schedule.
    FOR r IN
        SELECT agent_name, review_schedule
          FROM agent_registry
         WHERE review_schedule IS NOT NULL
           AND is_active = TRUE
    LOOP
        PERFORM cron.schedule(
            'agent-review-' || r.agent_name,
            r.review_schedule,
            format(
                $cron$
                INSERT INTO agent_events
                    (agent_name, action, tool_name, entity, status, input_payload)
                VALUES
                    (%L, 'review_tick', '_cron', '_review', 'pending', '{}'::jsonb)
                $cron$,
                r.agent_name
            )
        );
    END LOOP;
END $$;

COMMIT;
