-- Phase 62b follow-up (WR-06): lineage_graph() silently returned an empty
-- shape when the Tier-2 or Tier-1 row referenced by a published fee was
-- missing (a genuine data-integrity breach). The TS consumer then rendered
-- "No lineage found" -- indistinguishable from a bad fee_published_id.
--
-- This migration adds IF NOT FOUND guards after each SELECT INTO and
-- returns a discriminated { error: ..., ... } payload so callers can tell
-- a missing fee apart from a broken lineage chain.

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
        RETURN jsonb_build_object(
            'error', 'fee_published_not_found',
            'fee_published_id', p_fee_published_id
        );
    END IF;

    SELECT * INTO v_verified FROM fees_verified WHERE fee_verified_id = v_published.lineage_ref;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'error', 'tier_2_missing',
            'fee_published_id', p_fee_published_id,
            'lineage_ref', v_published.lineage_ref
        );
    END IF;

    SELECT * INTO v_raw FROM fees_raw WHERE fee_raw_id = v_verified.fee_raw_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'error', 'tier_1_missing',
            'fee_published_id', p_fee_published_id,
            'fee_verified_id', v_verified.fee_verified_id,
            'fee_raw_id', v_verified.fee_raw_id
        );
    END IF;

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
'Phase 62b OBS-01/02 (v2, WR-06 fix): returns Tier 3 -> 2 -> 1 lineage + event chain. Returns discriminated {error: fee_published_not_found | tier_2_missing | tier_1_missing} when rows are missing so callers can distinguish bad IDs from broken lineage.';

COMMIT;
