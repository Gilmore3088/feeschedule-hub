-- Phase 62b OBS-05: 15-minute rollup bucket per agent; refreshed via pg_cron.
-- Sparkline in /admin/agents Overview tab = last 672 rows (7d x 24h x 4/hour).

BEGIN;

CREATE TABLE IF NOT EXISTS agent_health_rollup (
    bucket_start            TIMESTAMPTZ NOT NULL,
    agent_name              TEXT NOT NULL REFERENCES agent_registry(agent_name),
    loop_completion_rate    NUMERIC(5,4),
    review_latency_seconds  INTEGER,
    pattern_promotion_rate  NUMERIC(5,4),
    confidence_drift        NUMERIC(6,4),  -- signed delta
    cost_to_value_ratio     NUMERIC(10,4),
    events_total            INTEGER,
    PRIMARY KEY (agent_name, bucket_start)
);

COMMENT ON TABLE agent_health_rollup IS
'Phase 62b OBS-05: per-agent 15-minute health metrics (loop_completion_rate, review_latency_seconds, pattern_promotion_rate, confidence_drift, cost_to_value_ratio). Refreshed by refresh_agent_health_rollup() on pg_cron.';

CREATE OR REPLACE FUNCTION refresh_agent_health_rollup(p_since TIMESTAMPTZ DEFAULT NULL) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_since TIMESTAMPTZ := COALESCE(p_since, NOW() - INTERVAL '1 hour');
    v_rows  INTEGER := 0;
BEGIN
    INSERT INTO agent_health_rollup
        (bucket_start, agent_name, loop_completion_rate, review_latency_seconds,
         pattern_promotion_rate, confidence_drift, cost_to_value_ratio, events_total)
    SELECT
        date_trunc('hour', created_at) + INTERVAL '15 min' * floor(EXTRACT(minute FROM created_at) / 15) AS bucket,
        agent_name,
        -- Placeholder derivations; Phase 63 tunes per-agent semantics.
        AVG(CASE WHEN action='improve' AND status='success' THEN 1.0 ELSE 0.0 END),
        AVG(CASE WHEN action='review' THEN EXTRACT(EPOCH FROM (created_at - created_at))::INT ELSE NULL END),
        AVG(CASE WHEN action='pattern_promote' THEN 1.0 ELSE 0.0 END),
        AVG(confidence) - LAG(AVG(confidence)) OVER (PARTITION BY agent_name ORDER BY date_trunc('hour', created_at)),
        SUM(cost_cents)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE action='success'), 0),
        COUNT(*)
    FROM agent_events
    WHERE created_at > v_since
    GROUP BY 1, 2
    ON CONFLICT (agent_name, bucket_start) DO UPDATE SET
        loop_completion_rate = EXCLUDED.loop_completion_rate,
        review_latency_seconds = EXCLUDED.review_latency_seconds,
        pattern_promotion_rate = EXCLUDED.pattern_promotion_rate,
        confidence_drift = EXCLUDED.confidence_drift,
        cost_to_value_ratio = EXCLUDED.cost_to_value_ratio,
        events_total = EXCLUDED.events_total;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END; $$;

COMMENT ON FUNCTION refresh_agent_health_rollup(TIMESTAMPTZ) IS
'Phase 62b OBS-05: upserts 15-minute health buckets for rows newer than p_since (default: last hour). Scheduled via pg_cron every 15 minutes when the extension is available.';

-- Schedule every 15 minutes via pg_cron. Guarded so test/CI Postgres without
-- pg_cron applies cleanly.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.unschedule('refresh-agent-health');
        EXCEPTION WHEN others THEN
            NULL;
        END;
        PERFORM cron.schedule(
            'refresh-agent-health',
            '*/15 * * * *',
            'SELECT refresh_agent_health_rollup()'
        );
    ELSE
        RAISE NOTICE 'pg_cron not installed; call refresh_agent_health_rollup() manually in CI.';
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END $$;

COMMIT;
