-- Restore the source identity contract used by NCUA and FFIEC ingestion.
ALTER TABLE institution_financials
  ALTER COLUMN crawl_target_id DROP NOT NULL;

ALTER TABLE institution_financials
  ADD COLUMN IF NOT EXISTS source_cert_number TEXT;

UPDATE institution_financials AS financial
   SET source_cert_number = target.cert_number
  FROM crawl_targets AS target
 WHERE financial.crawl_target_id = target.id
   AND financial.source_cert_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_financials_unmatched
  ON institution_financials(source_cert_number, report_date, source)
  WHERE crawl_target_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_financials_cert
  ON institution_financials(source_cert_number);
