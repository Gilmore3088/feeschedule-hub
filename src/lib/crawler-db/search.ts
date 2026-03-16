import { getDb } from "./connection";

export interface InstitutionSearchResult {
  id: number;
  institution_name: string;
  city: string | null;
  state_code: string | null;
  charter_type: string | null;
  asset_size_tier: string | null;
  fee_count: number;
}

export function searchInstitutions(params: {
  query?: string;
  state_code?: string;
  charter_type?: string;
  page?: number;
  pageSize?: number;
}): { rows: InstitutionSearchResult[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const queryParams: (string | number)[] = [];

  if (params.query && params.query.trim().length >= 2) {
    conditions.push("ct.institution_name LIKE ?");
    queryParams.push(`%${params.query.trim()}%`);
  }
  if (params.state_code) {
    conditions.push("ct.state_code = ?");
    queryParams.push(params.state_code);
  }
  if (params.charter_type) {
    conditions.push("ct.charter_type = ?");
    queryParams.push(params.charter_type);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;
  const offset = (page - 1) * pageSize;

  const countRow = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM crawl_targets ct ${where}`
    )
    .get(...queryParams) as { cnt: number };

  const rows = db
    .prepare(
      `SELECT ct.id, ct.institution_name, ct.city, ct.state_code,
              ct.charter_type, ct.asset_size_tier,
              (SELECT COUNT(*) FROM extracted_fees ef WHERE ef.crawl_target_id = ct.id AND ef.review_status != 'rejected') as fee_count
       FROM crawl_targets ct
       ${where}
       ORDER BY ct.institution_name ASC
       LIMIT ? OFFSET ?`
    )
    .all(...queryParams, pageSize, offset) as InstitutionSearchResult[];

  return { rows, total: countRow.cnt };
}

export function autocompleteInstitutions(query: string, limit = 8): InstitutionSearchResult[] {
  if (!query || query.trim().length < 2) return [];
  const db = getDb();
  return db
    .prepare(
      `SELECT ct.id, ct.institution_name, ct.city, ct.state_code,
              ct.charter_type, ct.asset_size_tier,
              (SELECT COUNT(*) FROM extracted_fees ef WHERE ef.crawl_target_id = ct.id AND ef.review_status != 'rejected') as fee_count
       FROM crawl_targets ct
       WHERE ct.institution_name LIKE ?
       ORDER BY fee_count DESC, ct.institution_name ASC
       LIMIT ?`
    )
    .all(`%${query.trim()}%`, limit) as InstitutionSearchResult[];
}
