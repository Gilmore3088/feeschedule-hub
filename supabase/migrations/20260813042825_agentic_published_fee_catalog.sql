-- Semantic public/admin read model for published fees.
--
-- published_fee_records remains the insertable Hamilton write boundary.
-- This catalog view carries the richer compatibility shape needed by product,
-- analytics, and admin consumers while exposing institution_id as the semantic
-- source identifier.

CREATE OR REPLACE VIEW public.published_fee_catalog
WITH (security_invoker = true)
AS
SELECT
  id,
  fee_published_id,
  fee_verified_id,
  fee_raw_id,
  crawl_target_id AS institution_id,
  crawl_target_id,
  fee_name,
  amount,
  frequency,
  conditions,
  extraction_confidence,
  review_status,
  validation_flags,
  fee_category,
  canonical_fee_key,
  fee_family,
  account_product_type,
  is_fee_cap,
  variant_type,
  coverage_tier,
  source_url,
  source,
  document_url,
  document_r2_key,
  crawl_result_id AS source_document_id,
  crawl_result_id,
  agent_event_id,
  verified_by_agent_event_id,
  published_by_adversarial_event_id,
  batch_id,
  created_at,
  updated_at
FROM public.published_fee_observations;

REVOKE ALL ON public.published_fee_catalog FROM PUBLIC;
REVOKE ALL ON public.published_fee_catalog FROM anon;
REVOKE ALL ON public.published_fee_catalog FROM authenticated;

COMMENT ON VIEW public.published_fee_catalog IS
  'Semantic read catalog for product/admin consumers of Hamilton-published fee records.';
COMMENT ON COLUMN public.published_fee_catalog.institution_id IS
  'Semantic institution/source identifier. Replaces crawler-era crawl_target_id in active consumers.';
COMMENT ON COLUMN public.published_fee_catalog.source_document_id IS
  'Semantic source document identifier. Replaces crawler-era crawl_result_id in active consumers.';
