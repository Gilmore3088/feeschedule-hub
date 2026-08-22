-- ============================================================================
-- The depth worklist: institutions closest to becoming a sellable report.
-- READ-ONLY. Nothing is modified.
--
-- Report viability = at least 12 of the 15 featured categories published.
-- Your best-covered category across the whole 8,750-institution registry is
-- `nsf` at 165 institutions. Breadth cannot produce reports at that density —
-- 6,000 institutions holding 3 categories each yields zero. Depth does.
--
-- This ranks the institutions where the fewest additional categories turn an
-- existing profile into a $300 report, and names exactly which categories are
-- missing for each one.
-- ============================================================================

CREATE TEMP VIEW featured AS
SELECT unnest(ARRAY[
  'monthly_maintenance','overdraft','nsf','atm_non_network','card_foreign_txn',
  'wire_domestic_outgoing','stop_payment','wire_intl_outgoing','wire_domestic_incoming',
  'cashiers_check','od_protection_transfer','paper_statement','minimum_balance',
  'card_replacement','deposited_item_return'
]) AS canonical_fee_key;

-- ---------------------------------------------------------------------------
-- 1. THE WORKLIST. Institutions at 8-11 of 15 — one focused pass from viable.
-- ---------------------------------------------------------------------------
WITH have AS (
  SELECT institution_id, array_agg(DISTINCT canonical_fee_key) AS keys,
         count(DISTINCT canonical_fee_key) AS n
  FROM published_fee_catalog
  WHERE canonical_fee_key IN (SELECT canonical_fee_key FROM featured)
  GROUP BY institution_id
)
SELECT
  s.id,
  s.institution_name,
  s.charter_type,
  s.state_code,
  s.asset_size_tier,
  h.n                                   AS featured_published,
  12 - h.n                              AS categories_short,
  ARRAY(
    SELECT f.canonical_fee_key FROM featured f
    WHERE NOT (f.canonical_fee_key = ANY(h.keys))
    ORDER BY 1
  )                                     AS missing_categories,
  s.fee_schedule_url IS NOT NULL        AS has_document,
  s.last_success_at
FROM have h
JOIN institution_sources s ON s.id = h.institution_id
WHERE h.n BETWEEN 8 AND 11
ORDER BY h.n DESC, s.institution_name;

-- Institutions with `has_document = true` need re-extraction, not discovery.
-- Those are the cheapest reports you will ever add.


-- ---------------------------------------------------------------------------
-- 2. Which categories are the common blockers? Fix the category, not the
--    institution — a missing pattern costs you the same category everywhere.
-- ---------------------------------------------------------------------------
WITH have AS (
  SELECT institution_id, array_agg(DISTINCT canonical_fee_key) AS keys,
         count(DISTINCT canonical_fee_key) AS n
  FROM published_fee_catalog
  WHERE canonical_fee_key IN (SELECT canonical_fee_key FROM featured)
  GROUP BY institution_id
),
near AS (SELECT * FROM have WHERE n BETWEEN 8 AND 11)
SELECT
  f.canonical_fee_key,
  count(*) AS institutions_missing_it,
  round(100.0 * count(*) / (SELECT count(*) FROM near), 1) AS pct_of_near_viable
FROM near n
CROSS JOIN featured f
WHERE NOT (f.canonical_fee_key = ANY(n.keys))
GROUP BY f.canonical_fee_key
ORDER BY institutions_missing_it DESC;

-- A category missing from most near-viable institutions is an extraction gap,
-- not a data gap. Check its FEE_PATTERNS entry before crawling anything.


-- ---------------------------------------------------------------------------
-- 3. Current viable set, for the sales list.
-- ---------------------------------------------------------------------------
WITH have AS (
  SELECT institution_id, count(DISTINCT canonical_fee_key) AS n
  FROM published_fee_catalog
  WHERE canonical_fee_key IN (SELECT canonical_fee_key FROM featured)
  GROUP BY institution_id
)
SELECT s.state_code,
       count(*) FILTER (WHERE h.n >= 12) AS viable,
       count(*) FILTER (WHERE h.n BETWEEN 8 AND 11) AS near_viable,
       count(*) AS institutions_with_any_featured
FROM have h
JOIN institution_sources s ON s.id = h.institution_id
GROUP BY s.state_code
ORDER BY viable DESC, near_viable DESC;


-- ---------------------------------------------------------------------------
-- 4. The archive lever, sized. 2,346 institutions hold approved legacy fees and
--    have nothing published. How many would clear the 12-of-15 bar on
--    promotion alone — and how many of those carry a source document?
-- ---------------------------------------------------------------------------
WITH archive_featured AS (
  SELECT a.institution_id,
         count(DISTINCT a.canonical_fee_key) AS n_featured,
         count(DISTINCT a.canonical_fee_key) FILTER (
           WHERE a.source_document_id IS NOT NULL
         ) AS n_featured_sourced
  FROM historical_fee_observation_archive a
  WHERE a.review_status IN ('approved', 'published')
    AND a.canonical_fee_key IN (SELECT canonical_fee_key FROM featured)
  GROUP BY a.institution_id
),
unpublished AS (
  SELECT af.*
  FROM archive_featured af
  WHERE NOT EXISTS (
    SELECT 1 FROM published_fee_catalog p WHERE p.institution_id = af.institution_id
  )
)
SELECT
  count(*)                                              AS institutions,
  count(*) FILTER (WHERE n_featured >= 12)              AS viable_on_promotion,
  count(*) FILTER (WHERE n_featured_sourced >= 12)      AS viable_with_provenance,
  count(*) FILTER (WHERE n_featured BETWEEN 8 AND 11)   AS near_viable_on_promotion
FROM unpublished;

-- `viable_with_provenance` is the honest number: reports you could sell that
-- survive the provenance gate. `viable_on_promotion` minus that figure is the
-- size of the re-extraction backlog if you want the rest.
