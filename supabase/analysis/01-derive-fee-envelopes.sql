-- ============================================================================
-- Derive per-key plausibility envelopes from the live published distribution.
-- READ-ONLY. Nothing is modified.
--
-- Purpose: the bands in src/lib/fee-plausibility.ts are currently seeded from
-- the 22 Aug audit summary and widened by judgment. This replaces judgment with
-- the corpus. Run it, review the output, paste the bands back into that file.
--
-- Method: median absolute deviation, not standard deviation. Fee distributions
-- are skewed and already contaminated by the outliers we are trying to catch;
-- MAD is not dragged around by a single $5,000 row the way a mean/stddev band is.
-- ============================================================================

WITH live AS (
  SELECT
    canonical_fee_key,
    amount::numeric AS amount,
    frequency,
    institution_id
  FROM published_fee_catalog
  WHERE amount IS NOT NULL
    AND amount > 0
    AND canonical_fee_key IS NOT NULL
),
stats AS (
  SELECT
    canonical_fee_key,
    count(*)                                                         AS rows,
    count(DISTINCT institution_id)                                   AS institutions,
    min(amount)                                                      AS observed_min,
    max(amount)                                                      AS observed_max,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY amount)             AS median,
    percentile_cont(0.05) WITHIN GROUP (ORDER BY amount)             AS p05,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY amount)             AS p95
  FROM live
  GROUP BY canonical_fee_key
),
mad AS (
  SELECT
    l.canonical_fee_key,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY abs(l.amount - s.median)) AS mad
  FROM live l
  JOIN stats s USING (canonical_fee_key)
  GROUP BY l.canonical_fee_key
)
SELECT
  s.canonical_fee_key,
  s.rows,
  s.institutions,
  s.observed_min,
  s.observed_max,
  round(s.median, 2)  AS median,
  round(m.mad, 2)     AS mad,
  -- Suggested band: median +/- 4 MAD, floored at a sane minimum and never
  -- narrower than the 5th-95th percentile range. Widen deliberately, not by
  -- accident: a band that excludes real fees creates review load forever.
  GREATEST(round(LEAST(s.median - 4 * NULLIF(m.mad, 0), s.p05), 2), 0.10) AS suggest_min,
  round(GREATEST(s.median + 4 * NULLIF(m.mad, 0), s.p95), 2)              AS suggest_max,
  -- How many live rows the suggested band would hold for review.
  (
    SELECT count(*) FROM live l2
    WHERE l2.canonical_fee_key = s.canonical_fee_key
      AND (
        l2.amount < GREATEST(LEAST(s.median - 4 * NULLIF(m.mad, 0), s.p05), 0.10)
        OR l2.amount > GREATEST(s.median + 4 * NULLIF(m.mad, 0), s.p95)
      )
  ) AS rows_flagged,
  -- Low institution counts mean the band is not yet trustworthy. Treat anything
  -- under ~30 institutions as provisional and prefer the hand-set value.
  CASE WHEN s.institutions < 30 THEN 'thin — keep hand-set band' ELSE 'usable' END AS confidence
FROM stats s
JOIN mad m USING (canonical_fee_key)
ORDER BY s.institutions DESC, s.rows DESC;


-- ----------------------------------------------------------------------------
-- Companion: which live rows the CURRENT hand-set bands would hold for review.
-- Run this before deploying the envelope change so the review load is known.
-- Bands mirror src/lib/fee-plausibility.ts; update both together.
-- ----------------------------------------------------------------------------

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
SELECT
  c.canonical_fee_key,
  count(*)                                       AS rows_held,
  count(DISTINCT c.institution_id)               AS institutions_affected,
  min(c.amount)                                  AS min_held,
  max(c.amount)                                  AS max_held,
  b.lo, b.hi
FROM published_fee_catalog c
JOIN bands b ON b.canonical_fee_key = c.canonical_fee_key
WHERE c.amount IS NOT NULL
  AND (c.amount < b.lo OR c.amount > b.hi)
GROUP BY c.canonical_fee_key, b.lo, b.hi
ORDER BY rows_held DESC;
