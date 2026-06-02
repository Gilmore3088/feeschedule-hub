-- Phase 62 follow-up — make promote_to_tier2 idempotent against the dedup guard.
--
-- 20260525_fees_verified_dedup.sql added a partial UNIQUE index
--   fees_verified_dedup_idx (institution_id, canonical_fee_key, amount, frequency)
--   NULLS NOT DISTINCT WHERE review_status <> 'rejected'
-- and its comment said the promotion path "MUST use ON CONFLICT DO UPDATE ...
-- See fee_crawler/agents/darwin/promote.py" — but that file never existed and
-- promote_to_tier2 kept doing a naive INSERT. Re-verifying an existing
-- (institution, canonical key, amount, frequency) tuple therefore raised a
-- unique_violation that callers swallowed per-row, so re-crawls silently
-- failed to refresh verified fees.
--
-- This re-defines promote_to_tier2 to UPSERT: a re-verification updates the
-- existing active row's lineage/confidence instead of failing. review_status
-- is deliberately NOT overwritten on conflict so a Knox 'challenged'/'approved'
-- decision survives a Darwin re-verify.

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
    -- On a duplicate active (institution, canonical key, amount, frequency)
    -- tuple, refresh lineage/confidence in place rather than raising — this is
    -- the re-verification path the dedup index requires.
    INSERT INTO fees_verified (
        fee_raw_id, institution_id, source_url, document_r2_key,
        extraction_confidence, canonical_fee_key, variant_type, outlier_flags,
        verified_by_agent_event_id, fee_name, amount, frequency, review_status
    ) VALUES (
        v_raw.fee_raw_id, v_raw.institution_id, v_raw.source_url, v_raw.document_r2_key,
        v_raw.extraction_confidence, p_canonical_fee_key, p_variant_type, p_outlier_flags,
        p_verified_by_agent_event_id, v_raw.fee_name, v_raw.amount, v_raw.frequency, 'verified'
    )
    ON CONFLICT (institution_id, canonical_fee_key, amount, frequency)
        WHERE review_status <> 'rejected'
    DO UPDATE SET
        fee_raw_id                 = EXCLUDED.fee_raw_id,
        source_url                 = EXCLUDED.source_url,
        document_r2_key            = EXCLUDED.document_r2_key,
        extraction_confidence      = EXCLUDED.extraction_confidence,
        variant_type               = EXCLUDED.variant_type,
        outlier_flags              = EXCLUDED.outlier_flags,
        verified_by_agent_event_id = EXCLUDED.verified_by_agent_event_id,
        fee_name                   = EXCLUDED.fee_name
    RETURNING fee_verified_id INTO v_verified_id;

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
    'Promotes a fees_raw row to fees_verified (Darwin-only). UPSERTs against '
    'fees_verified_dedup_idx so re-verification refreshes the existing active '
    'row instead of raising unique_violation. Writes an agent_events row in the '
    'same transaction.';
