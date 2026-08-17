-- Agentic semantic source views.
--
-- The physical tables still keep historical crawl_* names while the agent
-- write paths are migrated. These views provide the current read boundary for
-- institution sources, source documents, and collection runs.

CREATE OR REPLACE VIEW public.institution_sources
WITH (security_invoker = true) AS
SELECT *
FROM public.crawl_targets;

COMMENT ON VIEW public.institution_sources IS
  'Agentic semantic boundary over institution source records while legacy crawl_targets storage is phased out.';

CREATE OR REPLACE VIEW public.source_documents
WITH (security_invoker = true) AS
SELECT *
FROM public.crawl_results;

COMMENT ON VIEW public.source_documents IS
  'Agentic semantic boundary over collected source documents while legacy crawl_results storage is phased out.';

CREATE OR REPLACE VIEW public.source_collection_runs
WITH (security_invoker = true) AS
SELECT *
FROM public.crawl_runs;

COMMENT ON VIEW public.source_collection_runs IS
  'Agentic semantic boundary over source collection runs while legacy crawl_runs storage is phased out.';
