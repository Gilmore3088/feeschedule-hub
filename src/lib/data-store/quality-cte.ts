/**
 * Shared fee-tier count CTE used by both the institution directory
 * (`search.ts`) and the public institution profile (`core.ts`) so the two
 * surfaces always agree on published/provisional counts and the most recent
 * source document status for an institution.
 *
 * `published_fee_count` counts `published_fee_catalog` rows with
 * `review_status = 'approved'`. `catalog_provisional_fee_count` alone is
 * always zero for the catalog view (it only ever holds approved rows), so
 * callers must add `verified_unpublished_fee_count` and
 * `raw_unverified_fee_count` to get the true provisional/under-review
 * backlog behind a published count of zero.
 */
export const SEARCH_QUALITY_CTE = `
  WITH catalog_counts AS (
    SELECT
      institution_id,
      COUNT(*) FILTER (WHERE review_status = 'approved')::int AS published_fee_count,
      COUNT(*) FILTER (WHERE review_status <> 'approved' AND review_status <> 'rejected')::int AS catalog_provisional_fee_count,
      COUNT(*) FILTER (WHERE review_status <> 'rejected')::int AS visible_fee_count
    FROM published_fee_catalog
    GROUP BY institution_id
  ),
  verified_unpublished_counts AS (
    SELECT
      fv.institution_id,
      COUNT(*)::int AS verified_unpublished_fee_count
    FROM verified_fee_observations fv
    WHERE fv.review_status <> 'rejected'
      AND NOT EXISTS (
        SELECT 1
        FROM published_fee_catalog pfc
        WHERE pfc.fee_verified_id = fv.fee_verified_id
          AND pfc.review_status <> 'rejected'
      )
    GROUP BY fv.institution_id
  ),
  raw_unverified_counts AS (
    SELECT
      fr.institution_id,
      COUNT(*)::int AS raw_unverified_fee_count
    FROM raw_fee_observations fr
    WHERE NOT EXISTS (
      SELECT 1
      FROM verified_fee_observations fv
      WHERE fv.fee_raw_id = fr.fee_raw_id
        AND fv.review_status <> 'rejected'
    )
    GROUP BY fr.institution_id
  ),
  latest_docs AS (
    SELECT DISTINCT ON (institution_id)
      institution_id,
      status AS latest_source_status,
      COALESCE(fees_extracted, 0)::int AS latest_extracted_fee_count,
      error_message AS latest_source_error,
      crawled_at AS latest_source_collected_at
    FROM source_documents
    ORDER BY institution_id, crawled_at DESC NULLS LAST, id DESC
  )
`;
