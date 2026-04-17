-- Phase 56: classification_cache for LLM fallback results (D-03)
-- One row per unique normalized fee name. Prevents repeat Haiku API calls.
-- Same fee name string never triggers a second LLM call.
--
-- Idempotent: uses IF NOT EXISTS for table and all indexes.
-- canonical_fee_key is nullable — low-confidence results write NULL,
-- indicating the fee name could not be reliably classified.

CREATE TABLE IF NOT EXISTS classification_cache (
    normalized_name TEXT PRIMARY KEY,
    canonical_fee_key TEXT,
    confidence FLOAT NOT NULL,
    model TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by canonical_fee_key (e.g., "find all names classified as overdraft")
CREATE INDEX IF NOT EXISTS idx_classification_cache_key
    ON classification_cache(canonical_fee_key)
    WHERE canonical_fee_key IS NOT NULL;

-- Index for finding low-confidence entries that may need re-classification
CREATE INDEX IF NOT EXISTS idx_classification_cache_low_conf
    ON classification_cache(confidence)
    WHERE confidence < 0.90;

COMMENT ON TABLE classification_cache IS
    'LLM classification results for fee names with no alias match. '
    'Prevents repeated Haiku API calls for the same normalized fee name.';

COMMENT ON COLUMN classification_cache.normalized_name IS
    'Cleaned fee name used as cache key. Produced by normalize_fee_name() in fee_analysis.py.';

COMMENT ON COLUMN classification_cache.canonical_fee_key IS
    'LLM-suggested canonical key, validated against CANONICAL_KEY_MAP. '
    'NULL means the LLM could not classify the fee with sufficient confidence.';

COMMENT ON COLUMN classification_cache.confidence IS
    'LLM confidence score (0.0-1.0). Below 0.90 routes to human review per D-02.';

COMMENT ON COLUMN classification_cache.model IS
    'Model used for classification (e.g., claude-haiku-4-5-20251001). '
    'Allows cache invalidation when model changes.';
