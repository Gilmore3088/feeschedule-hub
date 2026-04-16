-- Phase 62a — TIER-04, TIER-05
-- Tier 1 -> Tier 2 promotion function: Darwin-only; logged to agent_events.
-- Tier 2 -> Tier 3 promotion function: stub signature this phase; 62b wires adversarial handshake.

-- ========================================================================
-- promote_to_tier2: Darwin verifies a fees_raw row and inserts fees_verified.
-- ========================================================================
CREATE OR REPLACE FUNCTION promote_to_tier2(
    p_fee_raw_id                  BIGINT,
    p_agent_name                  TEXT,
    p_reasoning_hash              BYTEA,
    p_verified_by_agent_event_id  UUID,
    p_canonical_fee_key           TEXT,
    p_variant_type                TEXT DEFAULT NULL,
    p_outlier_flags               JSONB DEFAULT '[]'::jsonb
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_raw          fees_raw%ROWTYPE;
    v_verified_id  BIGINT;
BEGIN
    -- TIER-04 gate: only Darwin may promote to Tier 2.
    IF p_agent_name IS DISTINCT FROM 'darwin' THEN
        RAISE EXCEPTION 'promote_to_tier2: only darwin may promote (got %)', p_agent_name
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_canonical_fee_key IS NULL OR length(p_canonical_fee_key) = 0 THEN
        RAISE EXCEPTION 'promote_to_tier2: canonical_fee_key required at Tier 2 (Phase 55 contract)';
    END IF;

    -- Load the Tier 1 row (locking it for concurrent-promotion safety).
    SELECT * INTO v_raw FROM fees_raw WHERE fee_raw_id = p_fee_raw_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'promote_to_tier2: fees_raw.fee_raw_id=% not found', p_fee_raw_id;
    END IF;

    -- Insert the verified row with denormalized lineage copied from Tier 1.
    INSERT INTO fees_verified (
        fee_raw_id, institution_id, source_url, document_r2_key,
        extraction_confidence, canonical_fee_key, variant_type, outlier_flags,
        verified_by_agent_event_id, fee_name, amount, frequency, review_status
    ) VALUES (
        v_raw.fee_raw_id, v_raw.institution_id, v_raw.source_url, v_raw.document_r2_key,
        v_raw.extraction_confidence, p_canonical_fee_key, p_variant_type, p_outlier_flags,
        p_verified_by_agent_event_id, v_raw.fee_name, v_raw.amount, v_raw.frequency, 'verified'
    ) RETURNING fee_verified_id INTO v_verified_id;

    -- Log to agent_events. Caller is expected to have already opened a tx via gateway;
    -- this insert is part of the same transaction.
    INSERT INTO agent_events (
        agent_name, action, tool_name, entity, entity_id, status,
        parent_event_id, reasoning_hash,
        input_payload, output_payload
    ) VALUES (
        p_agent_name, 'promote_to_tier2', 'promote_to_tier2', 'fees_verified',
        v_verified_id::TEXT, 'success',
        p_verified_by_agent_event_id, p_reasoning_hash,
        jsonb_build_object('fee_raw_id', p_fee_raw_id, 'canonical_fee_key', p_canonical_fee_key),
        jsonb_build_object('fee_verified_id', v_verified_id)
    );

    RETURN v_verified_id;
END;
$$;

COMMENT ON FUNCTION promote_to_tier2(BIGINT, TEXT, BYTEA, UUID, TEXT, TEXT, JSONB) IS
    'Phase 62a TIER-04: promotes a fees_raw row to fees_verified. Darwin-only; writes an agent_events row in the same transaction.';

-- ========================================================================
-- promote_to_tier3: stub signature; 62b wires Darwin+Knox adversarial handshake.
-- ========================================================================
CREATE OR REPLACE FUNCTION promote_to_tier3(
    p_fee_verified_id       BIGINT,
    p_adversarial_event_id  UUID
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_verified     fees_verified%ROWTYPE;
    v_published_id BIGINT;
    v_handshake_ok BOOLEAN;
BEGIN
    -- TIER-05 gate: require a resolved adversarial message pair. In 62a the check is stubbed —
    -- 62b wires the actual Darwin/Knox handshake lookup against agent_messages.
    SELECT EXISTS (
        SELECT 1 FROM agent_messages
        WHERE correlation_id = (
            SELECT correlation_id FROM agent_events WHERE event_id = p_adversarial_event_id
        )
        AND state = 'resolved'
    ) INTO v_handshake_ok;

    IF NOT v_handshake_ok THEN
        -- Stub behavior: permit promotion for 62a so downstream tests of the tier 3 insert path work.
        -- 62b replaces this `RAISE NOTICE` with a RAISE EXCEPTION enforcing the handshake.
        RAISE NOTICE 'promote_to_tier3: adversarial handshake not yet wired (62b). Permitting for 62a bootstrap.';
    END IF;

    SELECT * INTO v_verified FROM fees_verified WHERE fee_verified_id = p_fee_verified_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'promote_to_tier3: fees_verified.fee_verified_id=% not found', p_fee_verified_id;
    END IF;

    INSERT INTO fees_published (
        lineage_ref, institution_id, canonical_fee_key,
        source_url, document_r2_key, extraction_confidence,
        agent_event_id, verified_by_agent_event_id, published_by_adversarial_event_id,
        fee_name, amount, frequency, variant_type
    ) VALUES (
        v_verified.fee_verified_id, v_verified.institution_id, v_verified.canonical_fee_key,
        v_verified.source_url, v_verified.document_r2_key, v_verified.extraction_confidence,
        NULL,  -- filled in by 62b by walking fee_raw_id -> fees_raw.agent_event_id
        v_verified.verified_by_agent_event_id, p_adversarial_event_id,
        v_verified.fee_name, v_verified.amount, v_verified.frequency, v_verified.variant_type
    ) RETURNING fee_published_id INTO v_published_id;

    INSERT INTO agent_events (
        agent_name, action, tool_name, entity, entity_id, status,
        parent_event_id
    ) VALUES (
        '_adversarial', 'promote_to_tier3', 'promote_to_tier3', 'fees_published',
        v_published_id::TEXT, 'success', p_adversarial_event_id
    );

    RETURN v_published_id;
END;
$$;

COMMENT ON FUNCTION promote_to_tier3(BIGINT, UUID) IS
    'Phase 62a TIER-05 stub: promotes fees_verified -> fees_published. 62b replaces the handshake RAISE NOTICE with a RAISE EXCEPTION when the adversarial check fails.';
