-- ============================================================================
-- MIGRATION — review before applying, and apply only through the project
-- migration workflow. Do not run by hand against production.
--
-- Two changes, both from the open items in
-- docs/audits/2026-08-15-catalog-data-quality.md:
--
--   1. `quality_flag` on published_fee_records — quarantine rather than delete
--      the 94 off-taxonomy and ~292 implausible rows, and exclude them from
--      index and benchmark queries. Fully reversible.
--   2. `is_fee_cap` — the column is read by data-store/institution.ts and
--      rendered as a badge in the admin fee table, but published_fee_catalog
--      hardcodes `false AS is_fee_cap` for every row in BOTH migrations that
--      define the view. The concept survived into the UI and got flattened in
--      the read model.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Quarantine column
-- ---------------------------------------------------------------------------

ALTER TABLE public.published_fee_records
  ADD COLUMN IF NOT EXISTS quality_flag        TEXT,
  ADD COLUMN IF NOT EXISTS quality_flag_note   TEXT,
  ADD COLUMN IF NOT EXISTS quality_flagged_at  TIMESTAMPTZ;

ALTER TABLE public.published_fee_records
  ADD CONSTRAINT published_fee_records_quality_flag_check
  CHECK (quality_flag IS NULL OR quality_flag IN (
    'off_taxonomy',        -- canonical key not in fee-taxonomy.ts
    'implausible_amount',  -- outside the per-key envelope
    'null_amount',
    'zero_amount',
    'no_provenance',       -- no source_url
    'suspect_duplicate',
    'manual'
  ));

COMMENT ON COLUMN public.published_fee_records.quality_flag IS
  'Non-null quarantines the row: it stays published and auditable but is '
  'excluded from index, benchmark, median and report queries. Reversible — '
  'set to NULL to restore. Never delete a row to fix a quality problem.';

CREATE INDEX IF NOT EXISTS published_fee_records_quality_flag_idx
  ON public.published_fee_records (quality_flag)
  WHERE quality_flag IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Real is_fee_cap
-- ---------------------------------------------------------------------------

ALTER TABLE public.published_fee_records
  ADD COLUMN IF NOT EXISTS is_fee_cap BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill from the canonical key family. The cap keys are unambiguous; the
-- fee_name heuristic catches legacy rows that predate the key split and are
-- still sitting on `overdraft` / `nsf`.
UPDATE public.published_fee_records
   SET is_fee_cap = TRUE
 WHERE canonical_fee_key IN ('od_daily_cap', 'nsf_daily_cap')
    OR fee_name ~* '\m(maximum|max\.?|cap|capped|not to exceed|no more than)\M';

-- ---------------------------------------------------------------------------
-- 3. Flag the known-bad rows. Counts are from the 22 Aug audit; the predicates
--    recompute them so this is safe to run whenever.
-- ---------------------------------------------------------------------------

-- 3a. Off-taxonomy keys (94 rows / 43 keys at time of writing).
--     Requires public.fee_taxonomy_keys — see section 4.
UPDATE public.published_fee_records p
   SET quality_flag = 'off_taxonomy',
       quality_flag_note = 'canonical_fee_key not present in fee-taxonomy.ts',
       quality_flagged_at = NOW()
 WHERE p.quality_flag IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.fee_taxonomy_keys t
     WHERE t.canonical_fee_key = p.canonical_fee_key
   );

-- 3b. Null and zero amounts (136 + 126).
UPDATE public.published_fee_records
   SET quality_flag = 'null_amount',
       quality_flag_note = 'published with no amount',
       quality_flagged_at = NOW()
 WHERE quality_flag IS NULL AND amount IS NULL;

UPDATE public.published_fee_records
   SET quality_flag = 'zero_amount',
       quality_flag_note = 'published at $0.00 — verify this is a real "no charge" line, not a parse failure',
       quality_flagged_at = NOW()
 WHERE quality_flag IS NULL AND amount = 0;

-- 3c. Implausible amounts, using the same bands as src/lib/fee-plausibility.ts.
--     Keep the two in sync; this VALUES list is the SQL mirror of that file.
WITH bands (canonical_fee_key, lo, hi) AS (
  VALUES
    ('overdraft', 1, 60), ('nsf', 1, 60),
    ('od_daily_cap', 10, 750), ('nsf_daily_cap', 10, 750),
    ('continuous_od', 1, 100), ('od_protection_transfer', 0, 30),
    ('monthly_maintenance', 1, 75), ('minimum_balance', 1, 75),
    ('atm_non_network', 0.5, 10), ('atm_international', 0.5, 15),
    ('card_replacement', 1, 50), ('rush_card', 5, 150),
    ('card_foreign_txn', 0.5, 15),
    ('wire_domestic_outgoing', 5, 75), ('wire_domestic_incoming', 0, 50),
    ('wire_intl_outgoing', 10, 125), ('wire_intl_incoming', 0, 75),
    ('cashiers_check', 1, 40), ('money_order', 0.5, 20),
    ('stop_payment', 5, 60), ('counter_check', 0.25, 20),
    ('paper_statement', 0.5, 15), ('account_research', 5, 100),
    ('safe_deposit_box', 10, 400), ('notary_fee', 1, 30),
    ('deposited_item_return', 1, 50)
)
UPDATE public.published_fee_records p
   SET quality_flag = 'implausible_amount',
       quality_flag_note = format('$%s outside the $%s-$%s band for %s',
                                  p.amount, b.lo, b.hi, p.canonical_fee_key),
       quality_flagged_at = NOW()
  FROM bands b
 WHERE b.canonical_fee_key = p.canonical_fee_key
   AND p.quality_flag IS NULL
   AND p.amount IS NOT NULL
   AND (p.amount < b.lo OR p.amount > b.hi);

-- ---------------------------------------------------------------------------
-- 4. Taxonomy as data, so the check above can be enforced rather than audited.
--    Seed from src/lib/fee-taxonomy.ts FEE_FAMILIES. Keep in sync via CI.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fee_taxonomy_keys (
  canonical_fee_key TEXT PRIMARY KEY,
  family            TEXT NOT NULL,
  is_featured       BOOLEAN NOT NULL DEFAULT FALSE,
  is_cap            BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO public.fee_taxonomy_keys (canonical_fee_key, family, is_featured, is_cap) VALUES
  ('monthly_maintenance','Account Maintenance',TRUE,FALSE),
  ('minimum_balance','Account Maintenance',TRUE,FALSE),
  ('early_closure','Account Maintenance',FALSE,FALSE),
  ('dormant_account','Account Maintenance',FALSE,FALSE),
  ('account_research','Account Maintenance',FALSE,FALSE),
  ('paper_statement','Account Maintenance',TRUE,FALSE),
  ('estatement_fee','Account Maintenance',FALSE,FALSE),
  ('overdraft','Overdraft & NSF',TRUE,FALSE),
  ('nsf','Overdraft & NSF',TRUE,FALSE),
  ('continuous_od','Overdraft & NSF',FALSE,FALSE),
  ('od_protection_transfer','Overdraft & NSF',TRUE,FALSE),
  ('od_line_of_credit','Overdraft & NSF',FALSE,FALSE),
  ('od_daily_cap','Overdraft & NSF',FALSE,TRUE),
  ('nsf_daily_cap','Overdraft & NSF',FALSE,TRUE),
  ('atm_non_network','ATM & Card',TRUE,FALSE),
  ('atm_international','ATM & Card',FALSE,FALSE),
  ('card_replacement','ATM & Card',TRUE,FALSE),
  ('rush_card','ATM & Card',FALSE,FALSE),
  ('card_foreign_txn','ATM & Card',TRUE,FALSE),
  ('card_dispute','ATM & Card',FALSE,FALSE),
  ('wire_domestic_outgoing','Wire Transfers',TRUE,FALSE),
  ('wire_domestic_incoming','Wire Transfers',TRUE,FALSE),
  ('wire_intl_outgoing','Wire Transfers',TRUE,FALSE),
  ('wire_intl_incoming','Wire Transfers',FALSE,FALSE),
  ('cashiers_check','Check Services',TRUE,FALSE),
  ('money_order','Check Services',FALSE,FALSE),
  ('check_printing','Check Services',FALSE,FALSE),
  ('stop_payment','Check Services',TRUE,FALSE),
  ('counter_check','Check Services',FALSE,FALSE),
  ('check_cashing','Check Services',FALSE,FALSE),
  ('check_image','Check Services',FALSE,FALSE),
  ('deposited_item_return','Cash & Deposit',TRUE,FALSE)
ON CONFLICT (canonical_fee_key) DO NOTHING;

COMMENT ON TABLE public.fee_taxonomy_keys IS
  'Database mirror of FEE_FAMILIES in src/lib/fee-taxonomy.ts. Seeded with the '
  'featured set and the overdraft family; extend to all 65 keys, then add a CI '
  'check that fails when code and table diverge.';

COMMIT;


-- ============================================================================
-- SEPARATE STEP — apply only after reviewing what section 3 flagged.
-- Replaces published_fee_catalog so it exposes the real is_fee_cap and excludes
-- quarantined rows. Recreate with the full column list from
-- 20260813060357_physical_source_fee_tier_contracts.sql; the two lines that
-- change are marked.
-- ============================================================================
--
-- CREATE OR REPLACE VIEW public.published_fee_catalog
-- WITH (security_invoker = true) AS
-- SELECT
--   ... unchanged columns ...
--   fp.is_fee_cap,                       -- CHANGED: was `false AS is_fee_cap`
--   ... unchanged columns ...
-- FROM public.published_fee_records fp
-- LEFT JOIN public.verified_fee_observations fv ON fv.fee_verified_id = fp.lineage_ref
-- LEFT JOIN public.raw_fee_observations fr ON fr.fee_raw_id = fv.fee_raw_id
-- WHERE fp.rolled_back_at IS NULL
--   AND fp.quality_flag IS NULL;         -- CHANGED: quarantined rows excluded
--
-- Callers that need the quarantined rows (admin quality screens) should read
-- published_fee_records directly rather than loosening this view.
--
-- And in every benchmark, median, and range query, cap rows must be excluded:
--   WHERE is_fee_cap = FALSE
-- A ceiling is not a price. Mixing them is what widens a fee range.
-- ============================================================================


-- ============================================================================
-- VERIFICATION — run after applying, before trusting anything downstream.
-- ============================================================================
-- SELECT quality_flag, count(*) FROM published_fee_records GROUP BY 1 ORDER BY 2 DESC;
-- SELECT count(*) FILTER (WHERE is_fee_cap) AS caps,
--        count(*) FILTER (WHERE NOT is_fee_cap) AS fees FROM published_fee_records;
-- SELECT canonical_fee_key, min(amount), max(amount),
--        percentile_cont(0.5) WITHIN GROUP (ORDER BY amount) AS median
--   FROM published_fee_catalog
--  WHERE canonical_fee_key IN ('overdraft','nsf','monthly_maintenance')
--  GROUP BY 1;
-- Expect: overdraft and nsf tighten, monthly_maintenance loses its $5,000 max.
