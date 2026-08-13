import { sql } from "./connection";
import {
  classifyInstitutionQuality,
  getPublicInstitutionQualityLabel,
  type InstitutionQualityStatus,
} from "@/lib/institution-quality";

export interface InstitutionSearchResult {
  id: number;
  institution_name: string;
  city: string | null;
  state_code: string | null;
  charter_type: string | null;
  asset_size_tier: string | null;
  asset_size: number | null;
  fee_count: number;
  quality_status: InstitutionQualityStatus;
  quality_label: string;
}

interface InstitutionSearchRow {
  id: number | string;
  institution_name: string;
  city: string | null;
  state_code: string | null;
  charter_type: string | null;
  asset_size_tier: string | null;
  asset_size: number | string | null;
  source: string | null;
  cert_number: string | null;
  website_url: string | null;
  fee_schedule_url: string | null;
  fee_count: number | string;
  latest_source_status: string | null;
  latest_extracted_fee_count: number | string | null;
  latest_source_error: string | null;
  latest_source_collected_at: string | Date | null;
}

const SEARCH_QUALITY_CTE = `
  WITH fee_counts AS (
    SELECT institution_id, COUNT(*) FILTER (WHERE review_status <> 'rejected')::int AS published_fee_count
    FROM published_fee_catalog
    GROUP BY institution_id
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

function dateString(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapInstitutionSearchRow(row: InstitutionSearchRow): InstitutionSearchResult {
  const feeCount = Number(row.fee_count ?? 0);
  const quality = classifyInstitutionQuality({
    source: row.source,
    certNumber: row.cert_number,
    websiteUrl: row.website_url,
    feeScheduleUrl: row.fee_schedule_url,
    publishedFeeCount: feeCount,
    latestSourceStatus: row.latest_source_status,
    latestExtractedFeeCount: Number(row.latest_extracted_fee_count ?? 0),
    latestSourceError: row.latest_source_error,
    latestSourceCollectedAt: dateString(row.latest_source_collected_at),
  });

  return {
    id: Number(row.id),
    institution_name: row.institution_name,
    city: row.city,
    state_code: row.state_code,
    charter_type: row.charter_type,
    asset_size_tier: row.asset_size_tier,
    asset_size: row.asset_size !== null ? Number(row.asset_size) : null,
    fee_count: feeCount,
    quality_status: quality.quality_status,
    quality_label: getPublicInstitutionQualityLabel(quality.quality_signals),
  };
}

export async function searchInstitutions(params: {
  query?: string;
  state_code?: string;
  charter_type?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: InstitutionSearchResult[]; total: number }> {
  const conditions: string[] = [];
  const queryParams: (string | number)[] = [];
  let paramIdx = 0;

  if (params.query && params.query.trim().length >= 2) {
    paramIdx++;
    conditions.push(`ct.institution_name ILIKE $${paramIdx}`);
    queryParams.push(`%${params.query.trim()}%`);
  }
  if (params.state_code) {
    paramIdx++;
    conditions.push(`ct.state_code = $${paramIdx}`);
    queryParams.push(params.state_code);
  }
  if (params.charter_type) {
    paramIdx++;
    conditions.push(`ct.charter_type = $${paramIdx}`);
    queryParams.push(params.charter_type);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;
  const offset = (page - 1) * pageSize;

  const [countRow] = await sql.unsafe(
    `SELECT COUNT(*) as cnt FROM institution_sources ct ${where}`,
    queryParams
  ) as { cnt: number }[];

  paramIdx++;
  const limitParam = paramIdx;
  paramIdx++;
  const offsetParam = paramIdx;

  const rows = await sql.unsafe<InstitutionSearchRow[]>(
    `${SEARCH_QUALITY_CTE}
     SELECT ct.id, ct.institution_name, ct.city, ct.state_code,
            ct.charter_type, ct.asset_size_tier, ct.asset_size,
            ct.source, ct.cert_number, ct.website_url, ct.fee_schedule_url,
            COALESCE(fc.published_fee_count, 0) as fee_count,
            ld.latest_source_status,
            COALESCE(ld.latest_extracted_fee_count, 0) as latest_extracted_fee_count,
            ld.latest_source_error,
            ld.latest_source_collected_at
     FROM institution_sources ct
     LEFT JOIN fee_counts fc ON fc.institution_id = ct.id
     LEFT JOIN latest_docs ld ON ld.institution_id = ct.id
     ${where}
     ORDER BY ct.institution_name ASC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    [...queryParams, pageSize, offset]
  );

  return { rows: rows.map(mapInstitutionSearchRow), total: Number(countRow.cnt) };
}

export async function autocompleteInstitutions(query: string, limit = 8): Promise<InstitutionSearchResult[]> {
  if (!query || query.trim().length < 2) return [];
  const term = query.trim();
  const pattern = `%${term}%`;
  const rows = await sql.unsafe<InstitutionSearchRow[]>(
    `${SEARCH_QUALITY_CTE}
    SELECT ct.id, ct.institution_name, ct.city, ct.state_code,
           ct.charter_type, ct.asset_size_tier, ct.asset_size,
           ct.source, ct.cert_number, ct.website_url, ct.fee_schedule_url,
           COALESCE(fc.published_fee_count, 0) as fee_count,
           ld.latest_source_status,
           COALESCE(ld.latest_extracted_fee_count, 0) as latest_extracted_fee_count,
           ld.latest_source_error,
           ld.latest_source_collected_at
    FROM institution_sources ct
    LEFT JOIN fee_counts fc ON fc.institution_id = ct.id
    LEFT JOIN latest_docs ld ON ld.institution_id = ct.id
    WHERE ct.institution_name ILIKE $1
    ORDER BY
      CASE
        WHEN lower(ct.institution_name) = lower($2) THEN 0
        WHEN lower(ct.institution_name) LIKE lower($2) || '%' THEN 1
        ELSE 2
      END,
      ct.asset_size DESC NULLS LAST,
      COALESCE(fc.published_fee_count, 0) DESC,
      ct.institution_name ASC
    LIMIT $3`,
    [pattern, term, limit],
  );
  return rows.map(mapInstitutionSearchRow);
}
