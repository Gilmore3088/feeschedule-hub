-- Phase 62a — TIER-01, TIER-02, TIER-03
-- Three-tier fee tables (Raw/Verified/Published) with heavy lineage denormalization per D-02.
-- Parallel to legacy extracted_fees (frozen for writes in plan 62A-12, reads preserved for Phase 66).

-- ========================================================================
-- TIER 1: Raw — Knox state agents append here; immutable amount/content.
-- ========================================================================
CREATE TABLE IF NOT EXISTS fees_raw (
    fee_raw_id              BIGSERIAL PRIMARY KEY,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Lineage (denormalized; required where the data supports it)
    institution_id          INTEGER NOT NULL,  -- FK to crawl_targets.id NOT enforced here because crawl_targets may be seeded/rewritten independently
    crawl_event_id          INTEGER,            -- crawl_results.id (optional for migration_v10 rows)
    document_r2_key         TEXT,
    source_url              TEXT,
    extraction_confidence   NUMERIC(5,4),
    agent_event_id          UUID NOT NULL,      -- Knox's extract event (sentinel uuid for migration_v10 rows)

    -- Content
    fee_name                TEXT NOT NULL,
    amount                  NUMERIC(12,2),
    frequency               TEXT,
    conditions              TEXT,

    -- Control
    outlier_flags           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Darwin can tag without re-promoting
    source                  TEXT NOT NULL DEFAULT 'knox'
                            CHECK (source IN ('knox','migration_v10','manual_import'))
);

COMMENT ON TABLE fees_raw IS 'Phase 62a TIER-01 Raw: append-only fees from Knox state agents + one-shot migration backfill (plan 62A-12). Immutable amount fields; outlier_flags may be updated.';
COMMENT ON COLUMN fees_raw.agent_event_id IS 'Logical FK to agent_events.event_id; sentinel 00000000-0000-0000-0000-000000000000 for migration_v10 rows pre-v10.0.';

CREATE INDEX IF NOT EXISTS fees_raw_institution_time_idx
    ON fees_raw (institution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fees_raw_agent_event_idx
    ON fees_raw (agent_event_id);
-- Partial index for lineage-missing (KNOX-09 remediation queue)
CREATE INDEX IF NOT EXISTS fees_raw_lineage_missing_idx
    ON fees_raw (institution_id) WHERE outlier_flags ? 'lineage_missing';
CREATE INDEX IF NOT EXISTS fees_raw_source_idx
    ON fees_raw (source, created_at DESC);

-- ========================================================================
-- TIER 2: Verified — Darwin-verified; canonical_fee_key NOT NULL enforced.
-- ========================================================================
CREATE TABLE IF NOT EXISTS fees_verified (
    fee_verified_id             BIGSERIAL PRIMARY KEY,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Lineage back to Tier 1
    fee_raw_id                  BIGINT NOT NULL REFERENCES fees_raw(fee_raw_id),

    -- Denormalized from Tier 1 (for OBS-02 one-query trace)
    institution_id              INTEGER NOT NULL,
    source_url                  TEXT,
    document_r2_key             TEXT,
    extraction_confidence       NUMERIC(5,4),

    -- Tier 2-specific
    canonical_fee_key           TEXT NOT NULL,   -- Phase 55 foundation MANDATORY at Tier 2
    variant_type                TEXT,
    outlier_flags               JSONB NOT NULL DEFAULT '[]'::jsonb,
    verified_by_agent_event_id  UUID NOT NULL,   -- Darwin's verification event

    -- Content snapshot from Tier 1 (immutable)
    fee_name                    TEXT NOT NULL,
    amount                      NUMERIC(12,2),
    frequency                   TEXT,

    review_status               TEXT NOT NULL DEFAULT 'verified'
                                CHECK (review_status IN ('verified','challenged','rejected','approved'))
);

COMMENT ON TABLE fees_verified IS 'Phase 62a TIER-02 Business: Darwin-verified fees; canonical_fee_key NOT NULL. Promoted from fees_raw via promote_to_tier2().';

CREATE INDEX IF NOT EXISTS fees_verified_canonical_institution_idx
    ON fees_verified (canonical_fee_key, institution_id);
CREATE INDEX IF NOT EXISTS fees_verified_raw_idx
    ON fees_verified (fee_raw_id);
CREATE INDEX IF NOT EXISTS fees_verified_status_idx
    ON fees_verified (review_status, created_at DESC);

-- ========================================================================
-- TIER 3: Published — adversarial-gated, Hamilton-consumable. INSERT-only (no UPDATE/DELETE).
-- ========================================================================
CREATE TABLE IF NOT EXISTS fees_published (
    fee_published_id                    BIGSERIAL PRIMARY KEY,
    published_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Lineage chain (denormalized; one-query trace)
    lineage_ref                         BIGINT NOT NULL REFERENCES fees_verified(fee_verified_id),
    institution_id                      INTEGER NOT NULL,
    canonical_fee_key                   TEXT NOT NULL,
    source_url                          TEXT,
    document_r2_key                     TEXT,
    extraction_confidence               NUMERIC(5,4),
    agent_event_id                      UUID,        -- Knox's original extract event
    verified_by_agent_event_id          UUID,        -- Darwin's verification event
    published_by_adversarial_event_id   UUID NOT NULL,  -- Handshake event from 62b

    -- Content (immutable once published)
    fee_name                            TEXT NOT NULL,
    amount                              NUMERIC(12,2),
    frequency                           TEXT,
    variant_type                        TEXT,
    coverage_tier                       TEXT
                                        CHECK (coverage_tier IN ('strong','provisional','insufficient') OR coverage_tier IS NULL)
);

COMMENT ON TABLE fees_published IS 'Phase 62a TIER-03 Presentation: adversarial-gated, Hamilton-consumable. INSERT-only by design; no UPDATE/DELETE tools in 62a. Phase 66 Hamilton refactor reads here.';

CREATE INDEX IF NOT EXISTS fees_published_canonical_institution_idx
    ON fees_published (canonical_fee_key, institution_id);
CREATE INDEX IF NOT EXISTS fees_published_institution_time_idx
    ON fees_published (institution_id, published_at DESC);
CREATE INDEX IF NOT EXISTS fees_published_lineage_idx
    ON fees_published (lineage_ref);
