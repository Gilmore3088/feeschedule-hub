-- Ingestion Engine — compatibility view: extracted_fees shape over the engine tier
-- Plan: docs/architecture/backend-ui-inventory.md §3 (resolved decision 3)
--
-- THE WIRE that connects the engine to the product. ~18 files in
-- src/lib/crawler-db/* plus public api/v1 + reports read the FROZEN extracted_fees.
-- This view presents the live published tier (fees_published_current) in exactly
-- the column shape those readers expect, so the query layer can be repointed with
-- a single FROM swap and a parity check — no per-query rewrites.
--
-- Cutover: run a parity check (extracted_fees vs this view) on a sample, then
-- point src/lib/crawler-db reads at extracted_fees_compat, then drop extracted_fees.

CREATE OR REPLACE VIEW extracted_fees_compat AS
SELECT
    fp.id                                   AS id,
    NULL::bigint                            AS crawl_result_id,
    fp.institution_id::bigint               AS crawl_target_id,
    fp.fee_name                             AS fee_name,
    fp.amount::double precision             AS amount,
    fp.frequency                            AS frequency,
    fr.conditions                           AS conditions,        -- via lineage
    fp.extraction_confidence::double precision AS extraction_confidence,
    'approved'                              AS review_status,     -- published == approved
    b.activated_at                          AS created_at,
    '[]'::jsonb                             AS validation_flags,
    COALESCE(tx.fee_family, 'Other Fees')   AS fee_family,
    fp.canonical_fee_key                    AS fee_category,      -- identity for base cats
    NULL::text                              AS account_product_type,
    'engine'                                AS source,
    'engine'                                AS extracted_by,
    -- extras available to new callers (ignored by legacy readers):
    fp.canonical_fee_key                    AS canonical_fee_key,
    fp.source_url                           AS source_url,
    fp.document_r2_key                      AS document_r2_key,
    fp.batch_id                             AS batch_id
FROM fees_published_engine fp
JOIN publish_batches b        ON b.batch_id = fp.batch_id AND b.status = 'active'
LEFT JOIN fee_taxonomy_ref tx ON tx.canonical_fee_key = fp.canonical_fee_key
LEFT JOIN fees_verified v     ON v.fee_verified_id = fp.lineage_ref
LEFT JOIN fees_raw fr         ON fr.fee_raw_id = v.fee_raw_id;

COMMENT ON VIEW extracted_fees_compat IS
    'Compatibility view: the live published tier in extracted_fees column shape. '
    'Repoint src/lib/crawler-db reads here (after a parity check) to connect the '
    'ingestion engine to the product, then drop the frozen extracted_fees table.';
