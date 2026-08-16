-- Studio coverage query: institutions viable for a consulting report.
-- Viable = >=12 of the 15 featured (spotlight+core) categories published.
-- Reads published_fee_catalog only (repo hard rule).
WITH featured AS (
  SELECT unnest(ARRAY[
    'monthly_maintenance','overdraft','nsf','atm_non_network','card_foreign_txn',
    'wire_domestic_outgoing','stop_payment','wire_intl_outgoing','wire_domestic_incoming',
    'cashiers_check','od_protection_transfer','paper_statement','minimum_balance',
    'card_replacement','deposited_item_return'
  ]) AS k
),
cov AS (
  SELECT institution_id, count(DISTINCT canonical_fee_key) AS n_featured
  FROM published_fee_catalog
  WHERE canonical_fee_key IN (SELECT k FROM featured)
  GROUP BY institution_id
  HAVING count(DISTINCT canonical_fee_key) >= 12
)
SELECT s.id, s.institution_name, s.charter_type, s.asset_size_tier,
       s.fed_district, s.state_code, s.city, cov.n_featured
FROM cov
JOIN institution_sources s ON s.id = cov.institution_id
ORDER BY s.fed_district, s.charter_type, s.asset_size_tier, cov.n_featured DESC;
