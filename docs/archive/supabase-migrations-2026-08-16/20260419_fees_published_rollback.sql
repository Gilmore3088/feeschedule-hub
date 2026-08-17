-- Roadmap item #6: fees_published rollback insurance.
--
-- Design: Soft-delete via rolled_back_at + rolled_back_by_batch_id, with a new
-- nullable batch_id column used to group a single Knox/Darwin publish run.
-- Rationale:
--   * fees_published is documented as INSERT-only by design (20260420_fees_tier_tables.sql);
--     hard DELETE would violate that contract and erase the adversarial handshake audit trail.
--   * Soft-delete preserves lineage and is reversible by clearing the rolled_back_at column.
--   * batch_id is additive, nullable, indexed; existing queries continue to work unchanged
--     provided they filter rolled_back_at IS NULL at the call-site (documented in runbook).
--
-- DOWN (manual reversal, if ever needed):
--   BEGIN;
--     DROP INDEX IF EXISTS fees_published_batch_idx;
--     DROP INDEX IF EXISTS fees_published_rolled_back_idx;
--     ALTER TABLE fees_published DROP COLUMN IF EXISTS batch_id;
--     ALTER TABLE fees_published DROP COLUMN IF EXISTS rolled_back_at;
--     ALTER TABLE fees_published DROP COLUMN IF EXISTS rolled_back_by_batch_id;
--     ALTER TABLE fees_published DROP COLUMN IF EXISTS rolled_back_reason;
--     DROP TABLE IF EXISTS fees_published_rollback_log;
--   COMMIT;

BEGIN;

-- ------------------------------------------------------------------
-- 1. Additive columns on fees_published. All idempotent via IF NOT EXISTS.
-- ------------------------------------------------------------------
ALTER TABLE fees_published
    ADD COLUMN IF NOT EXISTS batch_id                TEXT,
    ADD COLUMN IF NOT EXISTS rolled_back_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rolled_back_by_batch_id TEXT,
    ADD COLUMN IF NOT EXISTS rolled_back_reason      TEXT;

COMMENT ON COLUMN fees_published.batch_id IS
    'Logical grouping key for a single publish run (e.g. Knox drain id). Nullable for rows published before this migration. Required for rollback eligibility.';
COMMENT ON COLUMN fees_published.rolled_back_at IS
    'When this row was soft-deleted via rollback-publish. NULL for live rows. Live queries MUST filter rolled_back_at IS NULL.';
COMMENT ON COLUMN fees_published.rolled_back_by_batch_id IS
    'The rollback invocation id that soft-deleted this row (distinct from batch_id being rolled back).';
COMMENT ON COLUMN fees_published.rolled_back_reason IS
    'Free-form operator-supplied reason captured at rollback time.';

-- Index for fast batch-scoped queries during rollback dry-run + execute.
CREATE INDEX IF NOT EXISTS fees_published_batch_idx
    ON fees_published (batch_id)
 WHERE batch_id IS NOT NULL;

-- Partial index so live-data queries that add `WHERE rolled_back_at IS NULL`
-- stay fast on the hot path (the vast majority of rows).
CREATE INDEX IF NOT EXISTS fees_published_live_idx
    ON fees_published (published_at DESC)
 WHERE rolled_back_at IS NULL;

-- ------------------------------------------------------------------
-- 2. Audit table for rollback invocations. One row per CLI invocation
--    (batch_id, operator, timestamp, affected count, dry-run flag).
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fees_published_rollback_log (
    rollback_id        BIGSERIAL PRIMARY KEY,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    batch_id           TEXT NOT NULL,
    rolled_back_by     TEXT NOT NULL,           -- operator identifier (env USER, or agent name)
    affected_count     INTEGER NOT NULL,
    reason             TEXT,
    dry_run            BOOLEAN NOT NULL DEFAULT TRUE,
    category_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    rollback_token     TEXT NOT NULL UNIQUE     -- generated per invocation; used as rolled_back_by_batch_id
);

COMMENT ON TABLE fees_published_rollback_log IS
    'Audit log of fees_published rollback invocations (dry-run + execute). One row per CLI call.';
COMMENT ON COLUMN fees_published_rollback_log.rollback_token IS
    'UUID-like token generated per invocation; matches fees_published.rolled_back_by_batch_id so we can recover "what got rolled back when".';

CREATE INDEX IF NOT EXISTS fees_published_rollback_log_batch_idx
    ON fees_published_rollback_log (batch_id, created_at DESC);

COMMIT;
