-- Phase 58: Allow unmatched institutions in institution_financials (D-10)
-- Enables ingesting ALL FFIEC/NCUA data regardless of crawl_target match.

-- 1. Make crawl_target_id nullable
ALTER TABLE institution_financials ALTER COLUMN crawl_target_id DROP NOT NULL;

-- 2. Add source_cert_number for deduplication of unmatched rows
ALTER TABLE institution_financials ADD COLUMN IF NOT EXISTS source_cert_number TEXT;

-- 3. Backfill source_cert_number from crawl_targets for existing matched rows
UPDATE institution_financials f
SET source_cert_number = ct.cert_number
FROM crawl_targets ct
WHERE f.crawl_target_id = ct.id
  AND f.source_cert_number IS NULL;

-- 4. Partial unique index for unmatched rows (crawl_target_id IS NULL)
-- Postgres UNIQUE constraints treat NULLs as distinct, so the existing
-- UNIQUE(crawl_target_id, report_date, source) won't prevent duplicates
-- when crawl_target_id is NULL. This partial index handles that case.
CREATE UNIQUE INDEX IF NOT EXISTS idx_financials_unmatched
  ON institution_financials(source_cert_number, report_date, source)
  WHERE crawl_target_id IS NULL;

-- 5. Index on source_cert_number for future matching lookups
CREATE INDEX IF NOT EXISTS idx_financials_cert ON institution_financials(source_cert_number);
