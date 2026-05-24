-- 2026-05-24 cutover support: backwards-compat alias columns on fees_verified.
--
-- The wholesale `extracted_fees → fees_verified` table rename in 28 TS read
-- paths leaves queries referencing the old column names (id, crawl_target_id,
-- validation_flags, fee_category). Rather than churn every query, we expose
-- those names as STORED GENERATED columns that mirror the canonical fields.
--
-- This is purely a read-side compatibility shim. Writes still target the
-- canonical columns. The generated columns can be dropped once every
-- consumer migrates to the canonical names.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='fees_verified' AND column_name='id'
  ) THEN
    EXECUTE 'ALTER TABLE fees_verified
             ADD COLUMN id BIGINT GENERATED ALWAYS AS (fee_verified_id) STORED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='fees_verified' AND column_name='crawl_target_id'
  ) THEN
    EXECUTE 'ALTER TABLE fees_verified
             ADD COLUMN crawl_target_id INTEGER GENERATED ALWAYS AS (institution_id) STORED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='fees_verified' AND column_name='validation_flags'
  ) THEN
    EXECUTE 'ALTER TABLE fees_verified
             ADD COLUMN validation_flags JSONB GENERATED ALWAYS AS (outlier_flags) STORED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='fees_verified' AND column_name='fee_category'
  ) THEN
    EXECUTE 'ALTER TABLE fees_verified
             ADD COLUMN fee_category TEXT GENERATED ALWAYS AS (canonical_fee_key) STORED';
  END IF;
END $$;

COMMENT ON COLUMN fees_verified.id IS 'Compat alias for fee_verified_id (post-2026-05-24 cutover). Drop once all readers migrate.';
COMMENT ON COLUMN fees_verified.crawl_target_id IS 'Compat alias for institution_id.';
COMMENT ON COLUMN fees_verified.validation_flags IS 'Compat alias for outlier_flags.';
COMMENT ON COLUMN fees_verified.fee_category IS 'Compat alias for canonical_fee_key.';
