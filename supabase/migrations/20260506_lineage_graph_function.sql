-- Phase 62b OBS-01 / OBS-02: lineage_graph(fee_published_id) returns the full
-- Tier 3 → Tier 2 → Tier 1 → crawl → R2 chain as a nested JSON tree. Walks
-- agent_events via parent_event_id (up to 10 hops; archived parents terminate silently).

BEGIN;

CREATE OR REPLACE FUNCTION lineage_graph(p_fee_published_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_published     fees_published%ROWTYPE;
    v_verified      fees_verified%ROWTYPE;
    v_raw           fees_raw%ROWTYPE;
    v_event_chain   JSONB;
BEGIN
    SELECT * INTO v_published FROM fees_published WHERE fee_published_id = p_fee_published_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'fee_published_id not found');
    END IF;

    SELECT * INTO v_verified FROM fees_verified WHERE fee_verified_id = v_published.lineage_ref;
    SELECT * INTO v_raw FROM fees_raw WHERE fee_raw_id = v_verified.fee_raw_id;

    -- Walk agent_events chain from Knox extract event upward, up to 10 hops.
    WITH RECURSIVE chain AS (
        SELECT event_id, parent_event_id, agent_name, action, tool_name, created_at, 0 AS depth
          FROM agent_events
         WHERE event_id = v_raw.agent_event_id

        UNION ALL

        SELECT e.event_id, e.parent_event_id, e.agent_name, e.action, e.tool_name, e.created_at, c.depth + 1
          FROM agent_events e
          JOIN chain c ON e.event_id = c.parent_event_id
         WHERE c.depth < 10
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'event_id', event_id,
            'agent_name', agent_name,
            'action', action,
            'tool_name', tool_name,
            'created_at', created_at,
            'depth', depth
        ) ORDER BY depth
    ) INTO v_event_chain FROM chain;

    RETURN jsonb_build_object(
        'tier_3', jsonb_build_object(
            'level', 3,
            'row', to_jsonb(v_published),
            'children', jsonb_build_array(
                jsonb_build_object(
                    'tier_2', jsonb_build_object(
                        'level', 2,
                        'row', to_jsonb(v_verified),
                        'children', jsonb_build_array(
                            jsonb_build_object(
                                'tier_1', jsonb_build_object(
                                    'level', 1,
                                    'row', to_jsonb(v_raw),
                                    'r2_key', v_raw.document_r2_key,
                                    'source_url', v_raw.source_url,
                                    'event_chain', COALESCE(v_event_chain, '[]'::jsonb)
                                )
                            )
                        )
                    )
                )
            )
        )
    );
END; $$;

COMMENT ON FUNCTION lineage_graph(BIGINT) IS
'Phase 62b OBS-01/02: returns full Tier 3 -> Tier 2 -> Tier 1 lineage + agent_events chain as JSON tree. Walks parent_event_id up to 10 hops (archived parents terminate silently).';

COMMIT;
