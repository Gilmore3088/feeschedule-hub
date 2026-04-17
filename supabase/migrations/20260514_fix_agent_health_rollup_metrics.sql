-- Phase 62b follow-up: fix two correctness bugs in refresh_agent_health_rollup()
-- that were introduced in 20260509 and carried over into 20260513.
--
-- WR-01: review_latency_seconds computed EXTRACT(EPOCH FROM (created_at - created_at))
--        which is always 0 (same column minus itself). Rewrite to join each review
--        row to its parent via parent_event_id and measure the true latency between
--        parent creation and the review. Rows without a parent contribute NULL.
--
-- WR-02: cost_to_value_ratio denominator filtered COUNT(*) FILTER (WHERE action='success').
--        action is a verb (extract, review, improve, dissect, ...); 'success' is a
--        status value. The filter never matched, denominator was always 0, NULLIF
--        collapsed to NULL. Rewrite to filter on status='success' so the ratio has
--        the intended meaning: cost per successful action.
--
-- This migration is CREATE OR REPLACE-only; it does not touch agent_health_rollup
-- schema or pg_cron scheduling (already installed by 20260509).

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
        date_trunc('hour', e.created_at)
            + INTERVAL '15 min' * floor(EXTRACT(minute FROM e.created_at) / 15) AS bucket,
        e.agent_name,
        AVG(CASE WHEN e.action = 'improve' AND e.status = 'success' THEN 1.0 ELSE 0.0 END),
        -- WR-01 fix: true latency between parent event and review event.
        -- parent_event_id is a logical FK (cross-partition), so the LEFT JOIN may
        -- return NULL for orphaned rows; AVG() ignores NULLs, matching the
        -- "insufficient data" semantics consumers already expect.
        AVG(
            CASE
                WHEN e.action = 'review' AND p.created_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (e.created_at - p.created_at))::INT
                ELSE NULL
            END
        ),
        AVG(CASE WHEN e.action = 'pattern_promote' THEN 1.0 ELSE 0.0 END),
        AVG(e.confidence) - LAG(AVG(e.confidence)) OVER (
            PARTITION BY e.agent_name
            ORDER BY date_trunc('hour', e.created_at)
                + INTERVAL '15 min' * floor(EXTRACT(minute FROM e.created_at) / 15)
        ),
        -- WR-02 fix: filter the denominator on status='success' (the actual
        -- success signal) rather than action='success' (a non-existent verb).
        SUM(e.cost_cents)::NUMERIC
            / NULLIF(COUNT(*) FILTER (WHERE e.status = 'success'), 0),
        COUNT(*)
    FROM agent_events e
    LEFT JOIN agent_events p ON p.event_id = e.parent_event_id
    WHERE e.created_at > v_since
    GROUP BY 1, 2
    ON CONFLICT (agent_name, bucket_start) DO UPDATE SET
        loop_completion_rate   = EXCLUDED.loop_completion_rate,
        review_latency_seconds = EXCLUDED.review_latency_seconds,
        pattern_promotion_rate = EXCLUDED.pattern_promotion_rate,
        confidence_drift       = EXCLUDED.confidence_drift,
        cost_to_value_ratio    = EXCLUDED.cost_to_value_ratio,
        events_total           = EXCLUDED.events_total;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END; $$;

COMMENT ON FUNCTION refresh_agent_health_rollup(TIMESTAMPTZ) IS
'Phase 62b OBS-05 (v3): review_latency_seconds now measures parent->review epoch delta; cost_to_value_ratio filters denominator on status=success. Still scheduled every 15 min by 20260509.';

COMMIT;
