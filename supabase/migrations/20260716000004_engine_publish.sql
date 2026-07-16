-- Ingestion Engine — Phase 3: national roll-up + atomic publish
-- Plan: docs/architecture/ingestion-engine-plan.md §6.4
--
-- Versioned publish: each roll-up builds a new batch of deduped rows; a single
-- transaction flips which batch is `active`. Readers join to the active batch,
-- so they see either the old snapshot or the new one — never a partial index.
-- This is the atomic-publish guarantee. fees_published_engine is the engine's
-- published surface; the app's read is repointed here at cutover.

CREATE TABLE IF NOT EXISTS publish_batches (
    batch_id     BIGSERIAL PRIMARY KEY,
    status       TEXT NOT NULL DEFAULT 'staging'
                 CHECK (status IN ('staging', 'active', 'superseded', 'rejected')),
    row_count    INT NOT NULL DEFAULT 0,
    validation   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ
);

-- Only one active batch at a time (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS publish_batches_one_active
    ON publish_batches ((status)) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS fees_published_engine (
    id                     BIGSERIAL PRIMARY KEY,
    batch_id               BIGINT NOT NULL REFERENCES publish_batches(batch_id),
    institution_id         INTEGER NOT NULL,
    canonical_fee_key      TEXT NOT NULL,
    fee_name               TEXT NOT NULL,
    amount                 NUMERIC(12,2),
    frequency              TEXT,
    source_url             TEXT,
    document_r2_key        TEXT,
    extraction_confidence  NUMERIC(5,4),
    lineage_ref            BIGINT,              -- fees_verified.fee_verified_id
    UNIQUE (batch_id, institution_id, canonical_fee_key)
);
CREATE INDEX IF NOT EXISTS fees_published_engine_batch_idx
    ON fees_published_engine (batch_id);
CREATE INDEX IF NOT EXISTS fees_published_engine_lookup_idx
    ON fees_published_engine (canonical_fee_key, institution_id);

-- Convenience view: the current live published set (what the app reads).
CREATE OR REPLACE VIEW fees_published_current AS
    SELECT fp.*
      FROM fees_published_engine fp
      JOIN publish_batches b ON b.batch_id = fp.batch_id AND b.status = 'active';

COMMENT ON TABLE publish_batches IS
    'Versioned publish pointer. Exactly one active batch; the roll-up flips '
    'active in a single transaction so readers never observe a partial index.';
