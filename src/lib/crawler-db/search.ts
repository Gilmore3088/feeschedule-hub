import { sql } from "./connection";

export interface InstitutionSearchResult {
  id: number;
  institution_name: string;
  city: string | null;
  state_code: string | null;
  charter_type: string | null;
  asset_size_tier: string | null;
  fee_count: number;
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
    `SELECT COUNT(*) as cnt FROM crawl_targets ct ${where}`,
    queryParams
  ) as { cnt: number }[];

  paramIdx++;
  const limitParam = paramIdx;
  paramIdx++;
  const offsetParam = paramIdx;

  const rows = await sql.unsafe(
    `SELECT ct.id, ct.institution_name, ct.city, ct.state_code,
            ct.charter_type, ct.asset_size_tier,
            (SELECT COUNT(*) FROM extracted_fees ef WHERE ef.crawl_target_id = ct.id AND ef.review_status != 'rejected') as fee_count
     FROM crawl_targets ct
     ${where}
     ORDER BY ct.institution_name ASC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    [...queryParams, pageSize, offset]
  ) as InstitutionSearchResult[];

  return { rows, total: Number(countRow.cnt) };
}

export async function autocompleteInstitutions(query: string, limit = 8): Promise<InstitutionSearchResult[]> {
  if (!query || query.trim().length < 2) return [];
  const pattern = `%${query.trim()}%`;
  return await sql`
    SELECT ct.id, ct.institution_name, ct.city, ct.state_code,
           ct.charter_type, ct.asset_size_tier,
           (SELECT COUNT(*) FROM extracted_fees ef WHERE ef.crawl_target_id = ct.id AND ef.review_status != 'rejected') as fee_count
    FROM crawl_targets ct
    WHERE ct.institution_name ILIKE ${pattern}
    ORDER BY fee_count DESC, ct.institution_name ASC
    LIMIT ${limit}
  ` as InstitutionSearchResult[];
}
