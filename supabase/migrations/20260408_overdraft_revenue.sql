-- Add overdraft_revenue column (RIADH032 from FFIEC CDR Schedule RI-E)
-- Consumer overdraft/NSF service charges. Reported by banks with $1B+ assets.
-- Values stored in thousands (matching other Call Report monetary fields).
ALTER TABLE institution_financials
  ADD COLUMN IF NOT EXISTS overdraft_revenue BIGINT;

COMMENT ON COLUMN institution_financials.overdraft_revenue IS 'Consumer overdraft/NSF service charges (RIADH032, Schedule RI-E). In thousands. NULL for banks <$1B that do not report this field.';
