-- Phase 62b OBS-05 fix: the refresh_agent_health_rollup function from
-- migration 20260509 referenced date_trunc('hour', created_at) inside a
-- window function's ORDER BY, but that expression is not a GROUP BY
-- column (the GROUP BY uses the 15-min bucket). Postgres raises
-- "column agent_events.created_at must appear in the GROUP BY clause
-- or be used in an aggregate function" at call time.
--
-- Fix: reference the same 15-min bucket expression used in SELECT/GROUP BY
-- inside the LAG() window's ORDER BY. Function body is otherwise identical.

BEGIN;

CREATE OR REPLACE FUNCTION refresh_agent_health_rollup(p_since TIMESTAMPTZ DEFAULT NULL)
RETURNS INTEGER
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
        AVG(CASE WHEN action='improve' AND status='success' THEN 1.0 ELSE 0.0 END),
        AVG(CASE WHEN action='review' THEN EXTRACT(EPOCH FROM (created_at - created_at))::INT ELSE NULL END),
        AVG(CASE WHEN action='pattern_promote' THEN 1.0 ELSE 0.0 END),
        AVG(confidence) - LAG(AVG(confidence)) OVER (
            PARTITION BY agent_name
            ORDER BY date_trunc('hour', created_at) + INTERVAL '15 min' * floor(EXTRACT(minute FROM created_at) / 15)
        ),
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

COMMIT;
