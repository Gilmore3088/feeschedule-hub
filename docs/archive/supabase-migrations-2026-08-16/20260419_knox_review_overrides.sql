-- Roadmap #7: Knox review UI
-- knox_overrides: human review decisions on Knox rejection messages.
--
-- Each row captures one reviewer's verdict on a single Knox intent='reject'
-- agent_messages row. The source Knox rejection is referenced by message_id
-- (agent_messages.message_id) so we never mutate the original audit record.
--
-- decision = 'confirm'  : human agrees with Knox; no re-promotion.
-- decision = 'override' : human disagrees; the application tier is expected to
--                         reopen the adversarial handshake for the referenced
--                         fee_verified_id. The migration does NOT write to
--                         fees_published — the override is a SIGNAL that the
--                         server action layer translates into a new knox
--                         'accept' agent_messages row when (and only when) a
--                         resolved darwin 'accept' already exists. If darwin
--                         has not accepted, the override is recorded here and
--                         picked up by the next Knox retuning pass. This
--                         preserves the 62b V4 handshake contract in
--                         supabase/migrations/20260510_promote_to_tier3_tighten.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS knox_overrides (
    id                BIGSERIAL PRIMARY KEY,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rejection_msg_id  UUID        NOT NULL REFERENCES agent_messages(message_id),
    fee_verified_id   BIGINT,
    decision          TEXT        NOT NULL CHECK (decision IN ('confirm', 'override')),
    reviewer_id       INTEGER     NOT NULL REFERENCES users(id),
    note              TEXT,
    promoted_fee_published_id BIGINT REFERENCES fees_published(fee_published_id)
);

COMMENT ON TABLE  knox_overrides IS
    'Roadmap #7 Knox review UI: human verdicts on Knox rejection messages. '
    'Append-only from the UI; one row per reviewer-action on a given rejection_msg_id. '
    'override decisions feed future Knox rule tuning.';
COMMENT ON COLUMN knox_overrides.rejection_msg_id IS
    'FK to agent_messages.message_id (the Knox intent=reject row being reviewed).';
COMMENT ON COLUMN knox_overrides.fee_verified_id IS
    'Denormalized from agent_messages.payload->>fee_verified_id at decision time.';
COMMENT ON COLUMN knox_overrides.promoted_fee_published_id IS
    'If the override successfully drove a fees_published insert, the resulting id.';

-- Pending-queue listing: unreviewed Knox rejections = agent_messages rows with
-- intent='reject', sender='knox', with no matching knox_overrides row.
CREATE INDEX IF NOT EXISTS knox_overrides_rejection_msg_idx
    ON knox_overrides (rejection_msg_id);

CREATE INDEX IF NOT EXISTS knox_overrides_fee_verified_idx
    ON knox_overrides (fee_verified_id) WHERE fee_verified_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS knox_overrides_reviewer_time_idx
    ON knox_overrides (reviewer_id, created_at DESC);

-- One verdict per rejection. Reopens would require a new rejection_msg_id.
CREATE UNIQUE INDEX IF NOT EXISTS knox_overrides_rejection_msg_unique
    ON knox_overrides (rejection_msg_id);

COMMIT;
