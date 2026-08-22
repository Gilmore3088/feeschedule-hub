-- ============================================================================
-- Why do 104,370 raw observations produce only 6,401 verified rows?
-- READ-ONLY diagnostic. Nothing is modified.
--
-- Darwin's `canonicalHintFrom()` reads the canonical key from exactly two
-- places, and nowhere else:
--
--   1. an entry in `outlier_flags` shaped `canonical_hint:<key>`
--   2. failing that, a `canonical_hint=<key>` substring inside `conditions`
--
-- and then requires the value to be in CANONICAL_KEY_MAP. No hint, no
-- verification — `verificationSkipReason` returns "Missing or invalid canonical
-- hint" before anything else is considered.
--
-- April 2026 loaded 103,529 raw rows as the v10 migration of legacy data. If
-- that migration did not write the hint in one of those two shapes, every one of
-- those rows is permanently unverifiable, and that single incompatibility is the
-- entire 94% wall. Query 1 answers it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. THE HEADLINE. How many raw rows carry a hint Darwin can actually read?
-- ---------------------------------------------------------------------------
SELECT
  date_trunc('month', created_at)::date                                   AS month,
  count(*)                                                                AS raw_rows,
  count(*) FILTER (
    WHERE outlier_flags::jsonb @> '[]'::jsonb
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(outlier_flags::jsonb) f
        WHERE f LIKE 'canonical_hint:%'
      )
  )                                                                       AS hint_in_flags,
  count(*) FILTER (WHERE conditions ~* 'canonical_hint=[a-z0-9_]+')       AS hint_in_conditions,
  count(*) FILTER (
    WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(outlier_flags::jsonb) = 'array'
               THEN outlier_flags::jsonb ELSE '[]'::jsonb END) f
        WHERE f LIKE 'canonical_hint:%'
      )
      AND (conditions IS NULL OR conditions !~* 'canonical_hint=[a-z0-9_]+')
  )                                                                       AS no_readable_hint
FROM raw_fee_observations
GROUP BY 1
ORDER BY 1;

-- Expected shape if the hypothesis holds: `no_readable_hint` is ~103,529 for
-- April and near zero for June onward. That would mean the wall is a migration
-- format mismatch, and the fix is a backfill rather than any change to Darwin.


-- ---------------------------------------------------------------------------
-- 2. Is the key present but in a DIFFERENT column? If the migration wrote a
--    canonical key somewhere Darwin does not look, the backfill is trivial.
-- ---------------------------------------------------------------------------
SELECT
  count(*)                                                       AS april_rows,
  count(*) FILTER (WHERE outlier_flags IS NULL)                  AS null_flags,
  count(*) FILTER (WHERE jsonb_typeof(
    CASE WHEN outlier_flags IS NULL THEN 'null'::jsonb
         ELSE outlier_flags::jsonb END) <> 'array')              AS flags_not_an_array,
  count(*) FILTER (WHERE conditions IS NOT NULL)                 AS has_conditions
FROM raw_fee_observations
WHERE created_at < '2026-05-01';

-- Sample the actual shape so the backfill is written against reality, not a guess.
SELECT fee_raw_id, fee_name, amount, frequency,
       left(coalesce(conditions, ''), 120) AS conditions_head,
       outlier_flags
FROM raw_fee_observations
WHERE created_at < '2026-05-01'
ORDER BY fee_raw_id
LIMIT 25;


-- ---------------------------------------------------------------------------
-- 3. The archive already holds the answer for most of these.
--    `historical_fee_observation_archive.canonical_fee_key` is 87.8% populated.
--    How many raw rows could inherit a key from the archive on (institution,
--    fee_name, amount)?
-- ---------------------------------------------------------------------------
SELECT
  count(*)                                                  AS raw_rows_matchable,
  count(DISTINCT r.institution_id)                          AS institutions,
  count(DISTINCT a.canonical_fee_key)                       AS distinct_keys
FROM raw_fee_observations r
JOIN historical_fee_observation_archive a
  ON a.institution_id = r.institution_id
 AND lower(btrim(a.fee_name)) = lower(btrim(r.fee_name))
 AND a.amount IS NOT DISTINCT FROM r.amount
WHERE a.canonical_fee_key IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 4. Where verification actually stops, for rows that DO have a hint.
--    Reproduces `verificationSkipReason` in SQL so the funnel is attributable
--    to a specific condition rather than a single aggregate number.
-- ---------------------------------------------------------------------------
WITH hinted AS (
  SELECT r.*,
         (SELECT substring(f from 'canonical_hint:(.*)')
            FROM jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(coalesce(r.outlier_flags, '[]')::jsonb) = 'array'
                   THEN r.outlier_flags::jsonb ELSE '[]'::jsonb END) f
           WHERE f LIKE 'canonical_hint:%' LIMIT 1) AS hint
  FROM raw_fee_observations r
)
SELECT
  CASE
    WHEN hint IS NULL                        THEN '1. no canonical hint'
    WHEN btrim(coalesce(fee_name, '')) = ''  THEN '2. missing fee name'
    WHEN amount IS NULL                      THEN '3. null amount'
    WHEN amount <= 0                         THEN '4. zero or negative amount'
    WHEN amount > 2500                       THEN '5. above the old global ceiling'
    ELSE                                          '6. eligible — should verify'
  END                        AS stop_reason,
  count(*)                   AS rows,
  count(DISTINCT institution_id) AS institutions
FROM hinted
GROUP BY 1
ORDER BY 1;

-- Bucket 6 is the number that matters: raw rows that pass every gate and should
-- already be verified. If it is far above the 6,401 verified rows that exist,
-- the blockage is throughput (Darwin is not being run at scale), not validity.


-- ---------------------------------------------------------------------------
-- 5. Throughput check. Has Darwin actually been run recently?
-- ---------------------------------------------------------------------------
SELECT date_trunc('month', created_at)::date AS month,
       count(*)                              AS verified_rows,
       count(DISTINCT institution_id)        AS institutions
FROM verified_fee_observations
GROUP BY 1
ORDER BY 1;
