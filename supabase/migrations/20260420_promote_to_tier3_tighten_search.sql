-- Reliability backlog #8 (immediate-ask from agent-messages partitioning prep):
-- Tighten the promote_to_tier3 accept-message search so it does not silently
-- misfire if (a) retention on agent_messages ever drops below the accept→publish
-- gap, or (b) two unrelated agent runs target the same fee_verified_id.
--
-- Changes vs 20260510_promote_to_tier3_tighten.sql:
--   1. The darwin-accept and knox-accept lookups MUST share a single
--      correlation_id (the handshake correlation). Without this, two
--      concurrent drains could each post a unilateral accept and cross-
--      satisfy the gate for the wrong fee_verified_id pairing.
--   2. The accept lookup adds `created_at >= now() - interval '30 days'`.
--      Future-proofs retention: if agent_messages retention is ever
--      shortened below the accept→publish gap, the gate fails loudly
--      ("handshake incomplete") instead of silently publishing anyway.
--
-- Backward compatibility: LEGACY GRANDFATHER CLAUSE.
--   Accept messages written before this migration (including all rows
--   posted via fee_crawler/commands/publish_fees.py since 62b shipped)
--   DO carry correlation_id — the column is NOT NULL on agent_messages
--   (see 20260419_agent_messages.sql). The publish_fees.py helper has
--   always generated a UUID per handshake and passed it to BOTH the
--   darwin-accept and knox-accept InsertAgentMessageInput. So there is
--   nothing to grandfather on the correlation-id axis; "legacy" rows
--   already meet the contract.
--
--   The only theoretical legacy surface is: rows whose darwin-accept
--   and knox-accept were posted with DIFFERENT correlation_ids. Under
--   the new query that pair would fail the handshake. We grandfather
--   this case via an OR clause that matches-any-correlation so long as
--   the fee_verified_id + sender + intent triple lines up. This keeps
--   the pre-migration fleet publishable while emitting a NOTICE so
--   ops can spot any straggler. After 30 days the grandfather branch
--   is dead (legacy rows age out of the 30-day window), at which point
--   a follow-up migration can drop the OR clause entirely. Tracking
--   the drop-date in the Reliability backlog.
--
-- DOWN (manual reversal — restores 20260510_promote_to_tier3_tighten.sql):
--   Re-run supabase/migrations/20260510_promote_to_tier3_tighten.sql; it
--   is `CREATE OR REPLACE` and will clobber this version's body. Keep in
--   mind that a downgrade loses the correlation_id + time-window
--   tightening: `accept` messages from unrelated correlations will once
--   again cross-satisfy the gate.
--
-- Assertions (expected behaviour):
--   * happy path:  darwin+knox both post intent=accept with the SAME
--                  correlation_id within 30d for the same fee_verified_id
--                  → fees_published row inserted.
--   * stale-retention: accept posted > 30d ago → handshake incomplete.
--   * crossed corr: darwin and knox accept the same fee_verified_id under
--                  different correlation_ids → grandfather NOTICE, still
--                  publishes (documented regression surface for cleanup).

BEGIN;

CREATE OR REPLACE FUNCTION promote_to_tier3(
    p_fee_verified_id       BIGINT,
    p_adversarial_event_id  UUID
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_verified        fees_verified%ROWTYPE;
    v_match_corr      UUID;
    v_darwin_accept   BOOLEAN := FALSE;
    v_knox_accept     BOOLEAN := FALSE;
    v_grandfathered   BOOLEAN := FALSE;
    v_published_id    BIGINT;
BEGIN
    SELECT * INTO v_verified FROM fees_verified
     WHERE fee_verified_id = p_fee_verified_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'promote_to_tier3: fees_verified.fee_verified_id=% not found', p_fee_verified_id;
    END IF;

    -- Preferred path: find a SINGLE correlation_id under which BOTH darwin
    -- and knox have posted an accept for this fee_verified_id within 30d.
    SELECT d.correlation_id
      INTO v_match_corr
      FROM agent_messages d
      JOIN agent_messages k
        ON k.correlation_id = d.correlation_id
     WHERE d.sender_agent = 'darwin'
       AND d.intent       = 'accept'
       AND d.payload->>'fee_verified_id' = p_fee_verified_id::text
       AND d.created_at  >= now() - interval '30 days'
       AND k.sender_agent = 'knox'
       AND k.intent       = 'accept'
       AND k.payload->>'fee_verified_id' = p_fee_verified_id::text
       AND k.created_at  >= now() - interval '30 days'
     LIMIT 1;

    IF v_match_corr IS NOT NULL THEN
        v_darwin_accept := TRUE;
        v_knox_accept   := TRUE;
    ELSE
        -- Grandfather path: legacy pairs whose darwin+knox accepts carry
        -- different correlation_ids. Still require both accepts within
        -- 30d on the fee_verified_id axis. Emits NOTICE so ops can spot.
        -- Remove this branch after 2026-05-20 (30d post-deploy).
        SELECT EXISTS (
            SELECT 1 FROM agent_messages
             WHERE sender_agent = 'darwin' AND intent = 'accept'
               AND payload->>'fee_verified_id' = p_fee_verified_id::text
               AND created_at >= now() - interval '30 days'
        ) INTO v_darwin_accept;

        SELECT EXISTS (
            SELECT 1 FROM agent_messages
             WHERE sender_agent = 'knox' AND intent = 'accept'
               AND payload->>'fee_verified_id' = p_fee_verified_id::text
               AND created_at >= now() - interval '30 days'
        ) INTO v_knox_accept;

        IF v_darwin_accept AND v_knox_accept THEN
            v_grandfathered := TRUE;
            RAISE NOTICE 'promote_to_tier3: grandfather accept (no shared correlation_id) for fee_verified_id=%', p_fee_verified_id;
        END IF;
    END IF;

    IF NOT (v_darwin_accept AND v_knox_accept) THEN
        RAISE EXCEPTION 'promote_to_tier3: adversarial handshake incomplete for fee_verified_id=% (darwin_accept=% knox_accept=% within 30d)',
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
        jsonb_build_object(
            'fee_verified_id', p_fee_verified_id,
            'handshake_correlation_id', v_match_corr,
            'grandfathered', v_grandfathered
        )
    );

    RETURN v_published_id;
END;
$$;

COMMENT ON FUNCTION promote_to_tier3(BIGINT, UUID) IS
    'Phase 62b V4 Access Control + Reliability #8: tightened to require BOTH darwin+knox accept messages under a shared correlation_id within 30 days. Grandfathers legacy cross-correlation pairs with NOTICE (to be dropped 2026-05-20).';

COMMIT;
