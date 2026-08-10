-- Ingestion Engine — Phase 1: tie extracted fees to content-addressed documents
-- Plan: docs/architecture/ingestion-engine-plan.md §4.4, T1.3
--
-- fees_raw already carries source_url / document_r2_key / extraction_confidence.
-- Add a hard link to the documents snapshot plus the char span the extractor
-- returned, so every fee highlights back to exact source text and every run is
-- attributable to an extractor_version. Nullable + IF NOT EXISTS so the legacy
-- backfill rows are unaffected.

ALTER TABLE fees_raw ADD COLUMN IF NOT EXISTS document_id       BIGINT;
ALTER TABLE fees_raw ADD COLUMN IF NOT EXISTS char_start        INT;
ALTER TABLE fees_raw ADD COLUMN IF NOT EXISTS char_end          INT;
ALTER TABLE fees_raw ADD COLUMN IF NOT EXISTS extractor_version TEXT;

CREATE INDEX IF NOT EXISTS fees_raw_document_idx ON fees_raw (document_id);

-- FK is added only when the documents table exists (it does post-Phase-0). Guard
-- so this migration is safe to apply against a schema that hasn't yet run
-- Phase 0 in isolation.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = current_schema() AND table_name = 'documents')
       AND NOT EXISTS (
           SELECT 1 FROM information_schema.table_constraints
           WHERE constraint_name = 'fees_raw_document_id_fkey'
             AND table_schema = current_schema())
    THEN
        ALTER TABLE fees_raw
            ADD CONSTRAINT fees_raw_document_id_fkey
            FOREIGN KEY (document_id) REFERENCES documents(id);
    END IF;
END $$;
