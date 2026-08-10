-- Ingestion Engine — Phase 5: golden-set regression
-- Plan: docs/architecture/ingestion-engine-plan.md T5.2
--
-- A small set of hand-verified institutions with a snapshot of their expected
-- fees. Each cycle re-extracts them and diffs against the snapshot; a mismatch
-- means a model/pipeline regression, attributable by extractor_version. This is
-- the single highest-leverage accuracy control.

CREATE TABLE IF NOT EXISTS golden_institutions (
    crawl_target_id   BIGINT PRIMARY KEY,
    label             TEXT,
    added_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS golden_fees (
    id                BIGSERIAL PRIMARY KEY,
    crawl_target_id   BIGINT NOT NULL REFERENCES golden_institutions(crawl_target_id),
    canonical_fee_key TEXT NOT NULL,
    expected_amount   NUMERIC(12,2),
    tolerance         NUMERIC(12,2) NOT NULL DEFAULT 0,   -- allowed abs diff
    UNIQUE (crawl_target_id, canonical_fee_key)
);

COMMENT ON TABLE golden_fees IS
    'Expected fees for golden institutions. Regression check compares the latest '
    'fees_verified for each golden target against these rows.';
