-- Studio data pack: one institution -> full report JSON.
-- Usage: psql "$DATABASE_URL" -v inst=860 -t -A -f pull-data.sql > packs/860.json
-- Peer cohort = same charter_type + same asset_size_tier, all institutions with
-- published data in that category (methodology per .claude/skills/fee-benchmarking).
-- Reads published_fee_catalog + institution_sources only.
WITH featured AS (
  SELECT unnest(ARRAY[
    'monthly_maintenance','overdraft','nsf','atm_non_network','card_foreign_txn',
    'wire_domestic_outgoing','stop_payment','wire_intl_outgoing','wire_domestic_incoming',
    'cashiers_check','od_protection_transfer','paper_statement','minimum_balance',
    'card_replacement','deposited_item_return'
  ]) AS k
),
target AS (
  SELECT id, institution_name, charter_type, asset_size_tier, fed_district,
         state_code, city, asset_size
  FROM institution_sources WHERE id = :inst
),
-- one representative amount per institution+category (min positive amount = the
-- headline consumer-facing figure; matches conservative-read methodology)
inst_fees AS (
  SELECT institution_id, canonical_fee_key,
         min(amount) FILTER (WHERE amount >= 0) AS amount
  FROM published_fee_catalog
  WHERE canonical_fee_key IN (SELECT k FROM featured) AND amount IS NOT NULL
  GROUP BY 1, 2
),
cohort AS (
  SELECT f.canonical_fee_key, f.institution_id, f.amount
  FROM inst_fees f
  JOIN institution_sources s ON s.id = f.institution_id
  JOIN target t ON s.charter_type = t.charter_type
              AND s.asset_size_tier = t.asset_size_tier
),
peer_stats AS (
  SELECT canonical_fee_key,
         percentile_cont(0.25) WITHIN GROUP (ORDER BY amount) AS p25,
         percentile_cont(0.50) WITHIN GROUP (ORDER BY amount) AS median,
         percentile_cont(0.75) WITHIN GROUP (ORDER BY amount) AS p75,
         min(amount) AS min, max(amount) AS max,
         count(*) AS n
  FROM cohort GROUP BY 1
),
national AS (
  SELECT f.canonical_fee_key,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY f.amount) AS median
  FROM inst_fees f
  JOIN institution_sources s ON s.id = f.institution_id
  JOIN target t ON s.charter_type = t.charter_type
  GROUP BY 1
),
target_fees AS (
  SELECT c.canonical_fee_key, c.amount,
         (SELECT count(*) FROM cohort c2
          WHERE c2.canonical_fee_key = c.canonical_fee_key AND c2.amount <= c.amount)::float
         / nullif((SELECT count(*) FROM cohort c3
          WHERE c3.canonical_fee_key = c.canonical_fee_key), 0) * 100 AS pctile
  FROM cohort c WHERE c.institution_id = :inst
),
fee_rows AS (
  SELECT fk.k AS category,
         tf.amount AS their_value,
         round(tf.pctile::numeric, 0) AS percentile,
         round(ps.p25::numeric, 2) AS peer_p25,
         round(ps.median::numeric, 2) AS peer_median,
         round(ps.p75::numeric, 2) AS peer_p75,
         round(ps.min::numeric, 2) AS peer_min,
         round(ps.max::numeric, 2) AS peer_max,
         ps.n AS peer_count,
         round(n.median::numeric, 2) AS national_median,
         CASE
           WHEN tf.amount IS NULL AND ps.n >= 8 THEN 'data_gap'
           WHEN tf.amount IS NULL THEN NULL
           WHEN ps.median > 0 AND tf.amount > 2 * ps.median THEN 'extreme_outlier'
           WHEN tf.amount > ps.p75 + 1.5 * (ps.p75 - ps.p25) THEN 'statistical_outlier'
           WHEN tf.amount = 0 AND ps.median > 0 THEN 'waived'
           ELSE NULL
         END AS flag
  FROM featured fk
  LEFT JOIN target_fees tf ON tf.canonical_fee_key = fk.k
  LEFT JOIN peer_stats ps ON ps.canonical_fee_key = fk.k
  LEFT JOIN national n ON n.canonical_fee_key = fk.k
),
peer_table AS (
  SELECT s.institution_name, s.city, s.state_code,
         jsonb_object_agg(c.canonical_fee_key, c.amount) AS fees,
         count(*) AS n_cats
  FROM cohort c JOIN institution_sources s ON s.id = c.institution_id
  WHERE c.institution_id != :inst
  GROUP BY s.id, s.institution_name, s.city, s.state_code
  ORDER BY n_cats DESC LIMIT 8
)
SELECT jsonb_build_object(
  'institution', (SELECT to_jsonb(t) FROM target t),
  'fees', (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.category) FROM fee_rows f),
  'peers', (SELECT jsonb_agg(to_jsonb(p)) FROM peer_table p),
  'meta', jsonb_build_object(
     'pull_date', now()::date,
     'cohort', (SELECT charter_type || ' / ' || asset_size_tier FROM target),
     'cohort_size', (SELECT count(DISTINCT institution_id) FROM cohort),
     'source', 'published_fee_catalog (verified pipeline)'
  )
);
