-- Phase 62b V4 Access Control: tighten promote_to_tier3 from the 62a notice
-- stub to a hard RAISE EXCEPTION unless BOTH darwin AND knox have posted intent='accept'
-- messages in agent_messages referencing the same fee_verified_id in payload.
--
-- Column list for fees_published MUST match supabase/migrations/20260420_fees_tier_tables.sql
-- (lineage_ref, institution_id, canonical_fee_key, source_url, document_r2_key,
--  extraction_confidence, agent_event_id, verified_by_agent_event_id,
--  published_by_adversarial_event_id, fee_name, amount, frequency, variant_type).

BEGIN;

CREATE OR REPLACE FUNCTION promote_to_tier3(
    p_fee_verified_id       BIGINT,
    p_adversarial_event_id  UUID
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_verified      fees_verified%ROWTYPE;
    v_darwin_accept BOOLEAN;
    v_knox_accept   BOOLEAN;
    v_published_id  BIGINT;
BEGIN
    SELECT * INTO v_verified FROM fees_verified WHERE fee_verified_id = p_fee_verified_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'promote_to_tier3: fees_verified.fee_verified_id=% not found', p_fee_verified_id;
    END IF;

    -- Adversarial handshake: require an intent='accept' message from BOTH darwin AND knox
    -- referencing the fee_verified_id in payload. 62b V4: hard fail, not notice.
    SELECT EXISTS (
        SELECT 1 FROM agent_messages
         WHERE sender_agent = 'darwin' AND intent = 'accept'
           AND payload->>'fee_verified_id' = p_fee_verified_id::text
    ) INTO v_darwin_accept;

    SELECT EXISTS (
        SELECT 1 FROM agent_messages
         WHERE sender_agent = 'knox' AND intent = 'accept'
           AND payload->>'fee_verified_id' = p_fee_verified_id::text
    ) INTO v_knox_accept;

    IF NOT (v_darwin_accept AND v_knox_accept) THEN
        RAISE EXCEPTION 'promote_to_tier3: adversarial handshake incomplete for fee_verified_id=% (darwin_accept=% knox_accept=%)',
            p_fee_verified_id, v_darwin_accept, v_knox_accept;
    END IF;

    INSERT INTO fees_published (
        lineage_ref, institution_id, canonical_fee_key,
        source_url, document_r2_key, extraction_confidence,
        agent_event_id, verified_by_agent_event_id, published_by_adversarial_event_id,
        fee_name, amount, frequency, variant_type
    ) VALUES (
        v_verified.fee_verified_id, v_verified.institution_id, v_verified.canonical_fee_key,
        v_verified.source_url, v_verified.document_r2_key, v_verified.extraction_confidence,
        NULL,  -- filled in by 62b downstream when fees_raw.agent_event_id walk is wired
        v_verified.verified_by_agent_event_id, p_adversarial_event_id,
        v_verified.fee_name, v_verified.amount, v_verified.frequency, v_verified.variant_type
    ) RETURNING fee_published_id INTO v_published_id;

    INSERT INTO agent_events (
        agent_name, action, tool_name, entity, entity_id, status,
        parent_event_id, input_payload
    ) VALUES (
        '_adversarial', 'promote_to_tier3', 'promote_to_tier3', 'fees_published',
        v_published_id::TEXT, 'success',
        p_adversarial_event_id,
        jsonb_build_object('fee_verified_id', p_fee_verified_id)
    );

    RETURN v_published_id;
END;
$$;

COMMENT ON FUNCTION promote_to_tier3(BIGINT, UUID) IS
    'Phase 62b V4 Access Control: tightened from the 62a handshake-permissive stub to a hard RAISE EXCEPTION. Requires both darwin+knox intent=accept messages in agent_messages referencing the fee_verified_id in payload.';

COMMIT;
