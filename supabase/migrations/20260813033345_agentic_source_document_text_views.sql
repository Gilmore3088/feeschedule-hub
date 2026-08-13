-- Add semantic source-document and source-text boundaries while the physical
-- crawler-era storage columns are phased out.

CREATE OR REPLACE VIEW public.source_documents
WITH (security_invoker = true)
AS
SELECT
  id,
  crawl_run_id,
  crawl_target_id,
  status,
  document_url,
  document_path,
  content_hash,
  fees_extracted,
  error_message,
  crawled_at,
  status_code,
  crawl_run_id AS source_collection_run_id,
  crawl_target_id AS institution_id
FROM public.crawl_results;

COMMENT ON VIEW public.source_documents IS
  'Agentic semantic boundary over collected source documents while historical crawl_results storage is phased out.';
COMMENT ON COLUMN public.source_documents.source_collection_run_id IS
  'Semantic alias for the collection run that produced this source document.';
COMMENT ON COLUMN public.source_documents.institution_id IS
  'Semantic alias for the institution/source row this document belongs to.';

CREATE OR REPLACE VIEW public.agent_source_texts
WITH (security_invoker = true)
AS
SELECT
  id,
  agent_run_id,
  crawl_result_id AS source_document_id,
  crawl_target_id AS institution_id,
  source_url,
  document_type,
  content_type,
  source_hash,
  status,
  normalized_text,
  text_hash,
  char_count,
  error_message,
  created_at,
  updated_at,
  crawl_result_id,
  crawl_target_id
FROM public.agent_document_texts;

REVOKE ALL ON public.agent_source_texts FROM anon, authenticated;

COMMENT ON VIEW public.agent_source_texts IS
  'Agentic semantic boundary over Rosetta text artifacts while agent_document_texts physical columns are phased out.';
COMMENT ON COLUMN public.agent_source_texts.source_document_id IS
  'Semantic alias for the fetched source document read by Rosetta.';
COMMENT ON COLUMN public.agent_source_texts.institution_id IS
  'Semantic alias for the institution/source row this text artifact belongs to.';
