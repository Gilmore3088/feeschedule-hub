-- Phase 62a — D-04 one-shot backfill: extracted_fees -> fees_raw.
-- Runs AFTER 20260418_fees_tier_tables.sql (which creates fees_raw).
-- Idempotent via the dedup index below; safe to re-run.
--
-- Strategy:
--   * Copy every non-rejected extracted_fees row into fees_raw with source='migration_v10'.
--   * LEFT JOIN crawl_results for best-effort lineage (document_url / document_path).
--   * Rows with NULL document_url get outlier_flags containing 'lineage_missing',
--     so Atlas (Phase 65) can route these institutions to Knox for re-discovery.
--   * agent_event_id uses the zero-uuid sentinel to mark pre-v10 provenance.
--
-- Safety:
--   * Wrapped in a DO block with to_regclass guards so the migration applies
--     cleanly in fresh test schemas where the legacy tables don't exist (CI).
--   * The INSERT runs via EXECUTE so Postgres doesn't parse-check columns that
--     may be absent in CI schemas.
--   * Row count of ~18K (prod) runs in <5s on Postgres 15 given the existing
--     indexes. Accepted per T-62A06-03.

-- Dedup index: identifies a backfill row by (source, crawl_event_id, fee_name).
-- Partial (WHERE source='migration_v10') so prod/Knox rows don't collide.
-- This index always runs because fees_raw exists after plan 62A-03.
CREATE UNIQUE INDEX IF NOT EXISTS fees_raw_backfill_dedup_idx
    ON fees_raw (source, crawl_event_id, fee_name)
    WHERE source = 'migration_v10';

DO $$
DECLARE
    v_total           BIGINT := 0;
    v_lineage_missing BIGINT := 0;
BEGIN
    IF to_regclass('extracted_fees') IS NULL OR to_regclass('crawl_results') IS NULL THEN
        RAISE NOTICE 'Legacy tables not present; skipping backfill (dev/CI schema).';
        RETURN;
    END IF;

    EXECUTE $sql$
        INSERT INTO fees_raw (
            institution_id, crawl_event_id, source_url, document_r2_key,
            extraction_confidence, agent_event_id,
            fee_name, amount, frequency, conditions,
            outlier_flags, source
        )
        SELECT
            ef.crawl_target_id,
            ef.crawl_result_id,
            cr.document_url,
            cr.document_path,
            ef.extraction_confidence,
            '00000000-0000-0000-0000-000000000000'::uuid,
            ef.fee_name,
            ef.amount,
            ef.frequency,
            ef.conditions,
            CASE
                WHEN cr.document_url IS NULL THEN '["lineage_missing"]'::jsonb
                ELSE '[]'::jsonb
            END,
            'migration_v10'
        FROM extracted_fees ef
        LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id
        WHERE ef.review_status IS DISTINCT FROM 'rejected'
        ON CONFLICT (source, crawl_event_id, fee_name)
            WHERE source = 'migration_v10'
            DO NOTHING
    $sql$;

    SELECT COUNT(*) INTO v_total
      FROM fees_raw WHERE source = 'migration_v10';
    SELECT COUNT(*) INTO v_lineage_missing
      FROM fees_raw
      WHERE source = 'migration_v10'
        AND outlier_flags ? 'lineage_missing';

    RAISE NOTICE 'Backfill complete: % total rows, % flagged lineage_missing',
        v_total, v_lineage_missing;
END $$;
