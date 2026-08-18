/**
 * Shared fee-tier count CTE used by the institution directory (`search.ts`),
 * the public institution profile, and the admin institution detail page
 * (`core.ts`) so all three surfaces always agree on published/provisional
 * counts and the most recent source document status for an institution.
 *
 * `published_fee_count` counts `published_fee_catalog` rows with
 * `review_status = 'approved'`. `catalog_provisional_fee_count` alone is
 * always zero for the catalog view (it only ever holds approved rows), so
 * callers must add `verified_unpublished_fee_count` and
 * `raw_unverified_fee_count` to get the true provisional/under-review
 * backlog behind a published count of zero.
 */

export interface BuildQualityCteOptions {
  /** When given, every CTE filters to this one institution instead of aggregating the whole catalog + tier views. */
  institutionId?: number;
}

function assertValidInstitutionId(institutionId: number): void {
  if (!Number.isInteger(institutionId)) {
    throw new Error(`buildQualityCte: institutionId must be a finite integer, got ${String(institutionId)}`);
  }
}

/**
 * Builds the three-CTE fee-tier count block.
 *
 * Unscoped (no `institutionId`): aggregates every institution — used by the
 * directory, where the outer query filters/paginates across all
 * institutions.
 *
 * Scoped (`institutionId` given): every CTE filters to that one
 * institution internally, so a single-institution lookup (the public
 * profile, the admin detail page) never scans/aggregates the full catalog
 * and tier views just to read one row. `institutionId` is validated as a
 * finite integer and embedded as a literal — never a string, so this can't
 * carry SQL syntax — rather than a bind parameter, since this function only
 * returns a plain SQL string to be concatenated by the caller.
 */
export function buildQualityCte({ institutionId }: BuildQualityCteOptions = {}): string {
  const scoped = institutionId !== undefined && institutionId !== null;
  if (scoped) assertValidInstitutionId(institutionId as number);

  const idFilter = scoped ? `institution_id = ${institutionId}` : null;
  const fvIdFilter = scoped ? `fv.institution_id = ${institutionId}` : null;
  const frIdFilter = scoped ? `fr.institution_id = ${institutionId}` : null;

  return `
  WITH catalog_counts AS (
    SELECT
      institution_id,
      COUNT(*) FILTER (WHERE review_status = 'approved')::int AS published_fee_count,
      COUNT(*) FILTER (WHERE review_status <> 'approved' AND review_status <> 'rejected')::int AS catalog_provisional_fee_count,
      COUNT(*) FILTER (WHERE review_status <> 'rejected')::int AS visible_fee_count
    FROM published_fee_catalog
    ${idFilter ? `WHERE ${idFilter}` : ""}
    GROUP BY institution_id
  ),
  verified_unpublished_counts AS (
    SELECT
      fv.institution_id,
      COUNT(*)::int AS verified_unpublished_fee_count
    FROM verified_fee_observations fv
    WHERE fv.review_status <> 'rejected'
      ${fvIdFilter ? `AND ${fvIdFilter}` : ""}
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
    WHERE ${frIdFilter ? `${frIdFilter} AND ` : ""}NOT EXISTS (
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
    ${idFilter ? `WHERE ${idFilter}` : ""}
    ORDER BY institution_id, crawled_at DESC NULLS LAST, id DESC
  )
`;
}

/** Unscoped CTE text, computed once — used by the directory (search.ts), which filters/paginates in its own outer query. */
export const SEARCH_QUALITY_CTE = buildQualityCte();
