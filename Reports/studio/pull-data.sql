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
),
-- complete published schedule (appendix): every distinct published fee line
all_fees AS (
  SELECT DISTINCT ON (lower(fee_name), amount)
         fee_name, amount, frequency, conditions
  FROM published_fee_catalog
  WHERE institution_id = :inst AND amount IS NOT NULL
  ORDER BY lower(fee_name), amount
),
-- Call Report financials (FDIC/NCUA public data): latest snapshot + last full year
fin_latest AS (
  SELECT * FROM institution_financial_records
  WHERE institution_id = :inst AND source IN ('fdic','ncua')
  ORDER BY report_date DESC LIMIT 1
),
fin_year AS (
  SELECT * FROM institution_financial_records
  WHERE institution_id = :inst AND source IN ('fdic','ncua')
    AND extract(month FROM report_date::date) = 12
  ORDER BY report_date DESC LIMIT 1
),
-- cohort financial benchmarks: latest Dec-31 record per same charter+tier institution
fin_cohort AS (
  SELECT DISTINCT ON (r.institution_id) r.institution_id, r.service_charge_income,
         r.total_assets, r.roa, r.efficiency_ratio,
         CASE WHEN r.total_assets > 0
              THEN r.service_charge_income::float / r.total_assets ELSE NULL END AS sc_per_assets
  FROM institution_financial_records r
  JOIN institution_sources s ON s.id = r.institution_id
  JOIN target t ON s.charter_type = t.charter_type
              AND s.asset_size_tier = t.asset_size_tier
  WHERE r.source IN ('fdic','ncua') AND extract(month FROM r.report_date::date) = 12
  ORDER BY r.institution_id, r.report_date DESC
),
fin_cohort_stats AS (
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY sc_per_assets) AS sc_per_assets_median,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY roa) AS roa_median,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY efficiency_ratio) AS efficiency_median,
         count(*) AS n
  FROM fin_cohort WHERE sc_per_assets IS NOT NULL
),
-- Fee-economics metrics (per fee-revenue-correlation skill):
-- dependency = SC / (SC + other noninterest income); intensity = SC / assets (bps);
-- fee_to_net_income via full-year ROA-derived net income.
fin_cohort_full AS (
  SELECT DISTINCT ON (r.institution_id) r.institution_id,
         r.service_charge_income AS sc, r.total_assets,
         CASE WHEN r.service_charge_income + coalesce(r.other_noninterest_income,0) > 0
              THEN r.service_charge_income::float
                   / (r.service_charge_income + r.other_noninterest_income)
         END AS dependency,
         CASE WHEN r.total_assets > 0
              THEN r.service_charge_income::float / r.total_assets * 10000 END AS intensity_bps,
         CASE WHEN r.roa IS NOT NULL AND r.roa != 0 AND r.total_assets > 0
              THEN r.service_charge_income::float / (r.roa/100.0 * r.total_assets)
         END AS fee_to_ni
  FROM institution_financial_records r
  JOIN institution_sources s ON s.id = r.institution_id
  JOIN target t ON s.charter_type = t.charter_type AND s.asset_size_tier = t.asset_size_tier
  WHERE r.source IN ('fdic','ncua') AND extract(month FROM r.report_date::date) = 12
  ORDER BY r.institution_id, r.report_date DESC
),
fee_econ AS (
  SELECT
    (SELECT to_jsonb(x) FROM fin_cohort_full x WHERE x.institution_id = :inst) AS mine,
    (SELECT jsonb_build_object(
      'dependency_p25', percentile_cont(0.25) WITHIN GROUP (ORDER BY dependency),
      'dependency_median', percentile_cont(0.5) WITHIN GROUP (ORDER BY dependency),
      'dependency_p75', percentile_cont(0.75) WITHIN GROUP (ORDER BY dependency),
      'intensity_p25', percentile_cont(0.25) WITHIN GROUP (ORDER BY intensity_bps),
      'intensity_median', percentile_cont(0.5) WITHIN GROUP (ORDER BY intensity_bps),
      'intensity_p75', percentile_cont(0.75) WITHIN GROUP (ORDER BY intensity_bps),
      'fee_to_ni_median', percentile_cont(0.5) WITHIN GROUP (ORDER BY fee_to_ni),
      'sc_median', percentile_cont(0.5) WITHIN GROUP (ORDER BY sc),
      'n', count(*)) FROM fin_cohort_full WHERE intensity_bps IS NOT NULL) AS cohort,
    (SELECT round(100.0 * count(*) FILTER (WHERE c.intensity_bps <=
        (SELECT intensity_bps FROM fin_cohort_full WHERE institution_id = :inst))
        / nullif(count(*),0), 0)
     FROM fin_cohort_full c WHERE c.intensity_bps IS NOT NULL) AS intensity_pctile,
    (SELECT round(100.0 * count(*) FILTER (WHERE c.dependency <=
        (SELECT dependency FROM fin_cohort_full WHERE institution_id = :inst))
        / nullif(count(*),0), 0)
     FROM fin_cohort_full c WHERE c.dependency IS NOT NULL) AS dependency_pctile
),
-- 3-year fee-revenue trend (year-end filings)
fin_history AS (
  SELECT report_date, service_charge_income,
         CASE WHEN total_assets > 0
              THEN round((service_charge_income::float / total_assets * 10000)::numeric, 1)
         END AS intensity_bps
  FROM institution_financial_records
  WHERE institution_id = :inst AND source IN ('fdic','ncua')
    AND extract(month FROM report_date::date) = 12
  ORDER BY report_date DESC LIMIT 3
),
-- deposit market presence (FDIC Summary of Deposits), when available
deposits AS (
  SELECT count(*) AS branch_rows, sum(NULLIF(deposits, 0)) AS total_branch_deposits,
         count(DISTINCT county_fips) AS counties, max(year) AS sod_year
  FROM institution_branch_deposits WHERE institution_id = :inst AND year = (SELECT max(year) FROM institution_branch_deposits WHERE institution_id = :inst)
),
-- provenance: the actual source documents the fees were extracted from
sources AS (
  SELECT coalesce(document_url, source_url) AS url, count(*) AS n_fees
  FROM published_fee_catalog
  WHERE institution_id = :inst AND coalesce(document_url, source_url) IS NOT NULL
  GROUP BY 1 ORDER BY n_fees DESC LIMIT 6
)
SELECT jsonb_build_object(
  'institution', (SELECT to_jsonb(t) FROM target t),
  'fees', (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.category) FROM fee_rows f),
  'peers', (SELECT jsonb_agg(to_jsonb(p)) FROM peer_table p),
  'all_fees', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.fee_name) FROM all_fees a),
  'sources', (SELECT jsonb_agg(to_jsonb(s)) FROM sources s),
  'financials', jsonb_build_object(
     'latest', (SELECT jsonb_build_object('report_date', report_date, 'source', source,
        'total_assets', total_assets, 'total_deposits', total_deposits,
        'branch_count', branch_count, 'employee_count', employee_count,
        'member_count', member_count, 'roa', round(roa::numeric,2),
        'efficiency_ratio', round(efficiency_ratio::numeric,1)) FROM fin_latest),
     'last_full_year', (SELECT jsonb_build_object('report_date', report_date,
        'service_charge_income', service_charge_income,
        'fee_income_ratio', fee_income_ratio,
        'sc_per_assets', CASE WHEN total_assets > 0
           THEN round((service_charge_income::float/total_assets)::numeric, 5) END)
        FROM fin_year),
     'cohort', (SELECT jsonb_build_object(
        'sc_per_assets_median', round(sc_per_assets_median::numeric, 5),
        'roa_median', round(roa_median::numeric, 2),
        'efficiency_median', round(efficiency_median::numeric, 1),
        'n', n) FROM fin_cohort_stats)
  ),
  'deposits', (SELECT to_jsonb(d) FROM deposits d),
  'fee_econ', (SELECT jsonb_build_object('mine', mine, 'cohort', cohort,
      'intensity_pctile', intensity_pctile, 'dependency_pctile', dependency_pctile)
      FROM fee_econ),
  'fin_history', (SELECT jsonb_agg(to_jsonb(h) ORDER BY h.report_date) FROM fin_history h),
  'meta', jsonb_build_object(
     'pull_date', now()::date,
     'cohort', (SELECT charter_type || ' / ' || asset_size_tier FROM target),
     'cohort_size', (SELECT count(DISTINCT institution_id) FROM cohort),
     'source', 'published_fee_catalog (verified pipeline)'
  )
);
