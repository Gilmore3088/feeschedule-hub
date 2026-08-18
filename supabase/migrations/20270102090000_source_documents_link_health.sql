SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

ALTER TABLE public.source_documents
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_status integer,
  ADD COLUMN IF NOT EXISTS archived_r2_key text;

COMMENT ON COLUMN public.source_documents.last_checked_at IS
  'Timestamp of the most recent Magellan link-check HEAD request against document_url.';
COMMENT ON COLUMN public.source_documents.last_status IS
  'HTTP status code from the most recent Magellan link-check HEAD request, or NULL if the check could not reach the URL.';
COMMENT ON COLUMN public.source_documents.archived_r2_key IS
  'R2 object key for an archived copy of the source document, offered when the live link stops resolving.';

CREATE INDEX IF NOT EXISTS source_documents_last_checked_at_idx
  ON public.source_documents (last_checked_at NULLS FIRST);

COMMIT;
