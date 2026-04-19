-- Roadmap #6 follow-up: thread batch_id through promote_to_tier3.
--
-- fees_published got a nullable batch_id column in 20260419_fees_published_rollback.sql
-- but nothing was writing to it. This migration:
--   1. Drops the 2-arg promote_to_tier3 signature (introduced in 20260510 and
--      re-tightened in 20260420_promote_to_tier3_tighten_search.sql).
--   2. Recreates it with a third parameter `p_batch_id TEXT DEFAULT NULL`,
--      copying the 20260420 tightened body verbatim plus the batch_id insert.
--
-- Why DROP + CREATE and not CREATE OR REPLACE?
--   PostgreSQL's CREATE OR REPLACE FUNCTION cannot change the parameter list
--   — it would create a second overload, which in turn breaks every caller
--   that does `SELECT promote_to_tier3(x, y)` (ambiguous). A clean DROP + CREATE
--   makes the 3-arg form the only one. Callers that pre-date this migration
--   (e.g. scripts/verify-62b-migrations.mjs) still call with 2 args and hit
--   the default — no breakage.
--
-- Idempotency: `DROP FUNCTION IF EXISTS` + `CREATE OR REPLACE FUNCTION`.
-- Safe to re-run.
--
-- Assertions (expected behaviour):
--   * promote_to_tier3(fvid, adv_event_id)             -> batch_id = NULL in fees_published.
--   * promote_to_tier3(fvid, adv_event_id, 'drain-x')  -> batch_id = 'drain-x' in fees_published.
--   * Handshake semantics (shared-correlation + 30d + grandfather) unchanged.
--
-- DOWN (manual reversal — restores 20260420_promote_to_tier3_tighten_search.sql):
--   BEGIN;
--     DROP FUNCTION IF EXISTS promote_to_tier3(BIGINT, UUID, TEXT);
--     -- Re-run supabase/migrations/20260420_promote_to_tier3_tighten_search.sql
--     -- to restore the 2-arg form.
--   COMMIT;

BEGIN;

DROP FUNCTION IF EXISTS promote_to_tier3(BIGINT, UUID);

CREATE OR REPLACE FUNCTION promote_to_tier3(
    p_fee_verified_id       BIGINT,
    p_adversarial_event_id  UUID,
    p_batch_id              TEXT DEFAULT NULL
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
        fee_name, amount, frequency, variant_type,
        batch_id
    ) VALUES (
        v_verified.fee_verified_id, v_verified.institution_id, v_verified.canonical_fee_key,
        v_verified.source_url, v_verified.document_r2_key, v_verified.extraction_confidence,
        NULL,  -- filled in by 62b downstream when fees_raw.agent_event_id walk is wired
        v_verified.verified_by_agent_event_id, p_adversarial_event_id,
        v_verified.fee_name, v_verified.amount, v_verified.frequency, v_verified.variant_type,
        p_batch_id
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
            'grandfathered', v_grandfathered,
            'batch_id', p_batch_id
        )
    );

    RETURN v_published_id;
END;
$$;

COMMENT ON FUNCTION promote_to_tier3(BIGINT, UUID, TEXT) IS
    'Phase 62b V4 Access Control + Reliability #6/#8: requires darwin+knox accept messages under a shared correlation_id within 30 days (grandfather with NOTICE for legacy cross-correlation). Accepts an optional batch_id to tag the resulting fees_published row for rollback-publish grouping. NULL batch_id is legal and matches pre-rollback behaviour (rows are then not eligible for batch rollback).';

COMMIT;
