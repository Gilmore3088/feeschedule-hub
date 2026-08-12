BEGIN;

CREATE OR REPLACE VIEW published_fee_observations
WITH (security_invoker = true) AS
SELECT
  fp.fee_published_id::bigint AS id,
  fp.fee_published_id::bigint AS fee_published_id,
  fp.lineage_ref::bigint AS fee_verified_id,
  fv.fee_raw_id::bigint AS fee_raw_id,
  fp.institution_id::integer AS crawl_target_id,
  fp.fee_name,
  fp.amount,
  fp.frequency,
  fr.conditions,
  COALESCE(fp.extraction_confidence, fv.extraction_confidence, fr.extraction_confidence) AS extraction_confidence,
  'approved'::text AS review_status,
  COALESCE(fv.outlier_flags, '[]'::jsonb) AS validation_flags,
  fp.canonical_fee_key AS fee_category,
  fp.canonical_fee_key,
  NULL::text AS fee_family,
  NULL::text AS account_product_type,
  FALSE::boolean AS is_fee_cap,
  fp.variant_type,
  fp.coverage_tier,
  COALESCE(fp.source_url, fv.source_url, fr.source_url) AS source_url,
  fr.source,
  COALESCE(fp.source_url, fv.source_url, fr.source_url) AS document_url,
  COALESCE(fp.document_r2_key, fv.document_r2_key, fr.document_r2_key) AS document_r2_key,
  fr.crawl_event_id::bigint AS crawl_result_id,
  COALESCE(fp.agent_event_id, fr.agent_event_id) AS agent_event_id,
  COALESCE(fp.verified_by_agent_event_id, fv.verified_by_agent_event_id) AS verified_by_agent_event_id,
  fp.published_by_adversarial_event_id,
  fp.batch_id,
  fp.published_at AS created_at,
  fp.published_at AS updated_at
FROM fees_published fp
LEFT JOIN fees_verified fv
  ON fv.fee_verified_id = fp.lineage_ref
LEFT JOIN fees_raw fr
  ON fr.fee_raw_id = fv.fee_raw_id
WHERE fp.rolled_back_at IS NULL;

COMMENT ON VIEW published_fee_observations IS
  'Current read model for product/report/admin consumers. Replaces legacy extracted_fees reads with live Tier-3 fees_published rows shaped for compatibility.';

REVOKE ALL ON published_fee_observations FROM PUBLIC;
REVOKE ALL ON published_fee_observations FROM anon;
REVOKE ALL ON published_fee_observations FROM authenticated;

COMMIT;
