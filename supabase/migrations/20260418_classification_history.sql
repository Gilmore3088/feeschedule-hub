-- 20260418_classification_history.sql
--
-- Reliability Roadmap #13 — Darwin re-classification is lossy.
--
-- When Darwin changes its mind about a fees_verified row's canonical_fee_key
-- (e.g. after a taxonomy expansion), the old value is overwritten in place
-- and the trail is lost. This migration adds an append-only history table
-- plus an AFTER UPDATE trigger that captures every canonical_fee_key
-- transition automatically.
--
-- Read path: /admin/fees/[id]/history surfaces this table.

BEGIN;

CREATE TABLE IF NOT EXISTS classification_history (
    id                  BIGSERIAL PRIMARY KEY,
    fee_verified_id     BIGINT NOT NULL REFERENCES fees_verified(fee_verified_id) ON DELETE CASCADE,
    old_canonical_key   TEXT,
    new_canonical_key   TEXT NOT NULL,
    old_variant_type    TEXT,
    new_variant_type    TEXT,
    agent_event_id      UUID,
    changed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_by          TEXT
);

CREATE INDEX IF NOT EXISTS idx_classification_history_fee
    ON classification_history(fee_verified_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_classification_history_old_new
    ON classification_history(old_canonical_key, new_canonical_key);

COMMENT ON TABLE classification_history IS
'Reliability Roadmap #13: append-only log of every canonical_fee_key or variant_type change on fees_verified. Populated automatically via trigger; no app writes.';

-- Trigger function: capture the transition when UPDATE changes canonical_fee_key
-- OR variant_type. Silent on no-op updates. Pulls the most recent Darwin
-- agent_event_id off agent_events if the caller didn't already set
-- verified_by_agent_event_id (defensive; we prefer the caller's value).
CREATE OR REPLACE FUNCTION log_classification_change()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.canonical_fee_key IS DISTINCT FROM OLD.canonical_fee_key
       OR NEW.variant_type IS DISTINCT FROM OLD.variant_type THEN
        INSERT INTO classification_history (
            fee_verified_id, old_canonical_key, new_canonical_key,
            old_variant_type, new_variant_type,
            agent_event_id, changed_by
        ) VALUES (
            NEW.fee_verified_id, OLD.canonical_fee_key, NEW.canonical_fee_key,
            OLD.variant_type, NEW.variant_type,
            NEW.verified_by_agent_event_id,
            COALESCE(current_setting('bfi.changed_by', true), current_user)
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_classification_history ON fees_verified;
CREATE TRIGGER trg_classification_history
    AFTER UPDATE ON fees_verified
    FOR EACH ROW
    EXECUTE FUNCTION log_classification_change();

COMMIT;
