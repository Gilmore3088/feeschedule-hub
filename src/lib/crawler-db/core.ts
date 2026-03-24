import { sql } from "./connection";
import { VALID_US_CODES } from "../us-states";
import type {
  CrawlStats,
  InstitutionSummary,
  ExtractedFee,
  InstitutionDetail,
  ReviewStats,
  ReviewableFee,
  FeeReview,
} from "./types";

export interface PublicStats {
  total_observations: number;
  total_institutions: number;
  total_categories: number;
  total_states: number;
}

export async function getPublicStats(): Promise<PublicStats> {
  try {
    const validCodes = [...VALID_US_CODES];
    const [row] = await sql<PublicStats[]>`
      SELECT
        COUNT(ef.id) as total_observations,
        COUNT(DISTINCT ct.id) as total_institutions,
        COUNT(DISTINCT ef.fee_category) as total_categories,
        COUNT(DISTINCT ct.state_code) as total_states
      FROM crawl_targets ct
      JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
      WHERE ct.state_code IN ${sql(validCodes)}
        AND ef.review_status != 'rejected'`;
    return {
      total_observations: Number(row.total_observations),
      total_institutions: Number(row.total_institutions),
      total_categories: Number(row.total_categories),
      total_states: Number(row.total_states),
    };
  } catch {
    return { total_observations: 0, total_institutions: 0, total_categories: 0, total_states: 0 };
  }
}

export async function getStats(): Promise<CrawlStats> {
  const [total] = await sql<{ cnt: number }[]>`SELECT COUNT(*) as cnt FROM crawl_targets`;
  const [banks] = await sql<{ cnt: number }[]>`SELECT COUNT(*) as cnt FROM crawl_targets WHERE charter_type='bank'`;
  const [cus] = await sql<{ cnt: number }[]>`SELECT COUNT(*) as cnt FROM crawl_targets WHERE charter_type='credit_union'`;
  const [withUrl] = await sql<{ cnt: number }[]>`SELECT COUNT(*) as cnt FROM crawl_targets WHERE website_url IS NOT NULL`;
  const [withFee] = await sql<{ cnt: number }[]>`SELECT COUNT(*) as cnt FROM crawl_targets WHERE fee_schedule_url IS NOT NULL`;
  const [fees] = await sql<{ cnt: number }[]>`SELECT COUNT(*) as cnt FROM extracted_fees`;
  const [runs] = await sql<{ cnt: number }[]>`SELECT COUNT(*) as cnt FROM crawl_runs`;

  return {
    total_institutions: Number(total.cnt),
    banks: Number(banks.cnt),
    credit_unions: Number(cus.cnt),
    with_website: Number(withUrl.cnt),
    with_fee_url: Number(withFee.cnt),
    total_fees: Number(fees.cnt),
    crawl_runs: Number(runs.cnt),
  };
}

export async function getInstitutionsWithFees(): Promise<InstitutionSummary[]> {
  return await sql<InstitutionSummary[]>`
    SELECT ct.id, ct.institution_name, ct.state_code, ct.charter_type,
           ct.asset_size, ct.website_url, ct.fee_schedule_url, ct.document_type,
           COUNT(ef.id) as fee_count
    FROM crawl_targets ct
    LEFT JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
    WHERE ct.fee_schedule_url IS NOT NULL
    GROUP BY ct.id, ct.institution_name, ct.state_code, ct.charter_type,
             ct.asset_size, ct.website_url, ct.fee_schedule_url, ct.document_type
    ORDER BY ct.asset_size DESC NULLS LAST
  `;
}

export async function getFeesByInstitution(targetId: number): Promise<ExtractedFee[]> {
  return await sql<ExtractedFee[]>`
    SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
           ef.extraction_confidence, ef.review_status,
           ct.institution_name, ef.crawl_target_id
    FROM extracted_fees ef
    JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
    WHERE ef.crawl_target_id = ${targetId}
    ORDER BY ef.fee_name
  `;
}

export async function getAllFees(
  limit = 100,
  offset = 0,
  search?: string,
): Promise<{ fees: ExtractedFee[]; total: number }> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (search) {
    conditions.push(
      "(ef.fee_name ILIKE $" + (params.length + 1) +
      " OR ct.institution_name ILIKE $" + (params.length + 2) + ")"
    );
    params.push(`%${search}%`, `%${search}%`);
  }

  const where =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const countResult = await sql.unsafe<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt
     FROM extracted_fees ef
     JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
     ${where}`,
    params,
  );
  const cnt = Number(countResult[0].cnt);

  const feesParams = [...params, limit, offset];
  const fees = await sql.unsafe<ExtractedFee[]>(
    `SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
           ef.extraction_confidence, ef.review_status,
           ct.institution_name, ef.crawl_target_id
    FROM extracted_fees ef
    JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
    ${where}
    ORDER BY ct.institution_name, ef.fee_name
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    feesParams,
  );

  return { fees, total: cnt };
}

export async function getInstitutionsByFilter(filters: {
  charter_type?: string;
  asset_tiers?: string[];
  fed_districts?: number[];
  state_code?: string;
  gap?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: InstitutionDetail[]; total: number }> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (filters.charter_type) {
    conditions.push(`ct.charter_type = $${paramIdx++}`);
    params.push(filters.charter_type);
  }
  if (filters.asset_tiers && filters.asset_tiers.length > 0) {
    const placeholders = filters.asset_tiers.map(() => `$${paramIdx++}`).join(",");
    conditions.push(`ct.asset_size_tier IN (${placeholders})`);
    params.push(...filters.asset_tiers);
  }
  if (filters.fed_districts && filters.fed_districts.length > 0) {
    const placeholders = filters.fed_districts.map(() => `$${paramIdx++}`).join(",");
    conditions.push(`ct.fed_district IN (${placeholders})`);
    params.push(...filters.fed_districts);
  }
  if (filters.state_code) {
    conditions.push(`ct.state_code = $${paramIdx++}`);
    params.push(filters.state_code);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const having = filters.gap ? "HAVING COUNT(ef.id) = 0" : "";

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const offset = (page - 1) * pageSize;

  const countResult = await sql.unsafe<{ cnt: number }[]>(`
    SELECT COUNT(*) as cnt FROM (
      SELECT ct.id
      FROM crawl_targets ct
      LEFT JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
        AND ef.review_status != 'rejected'
      ${where}
      GROUP BY ct.id
      ${having}
    ) sub
  `, params);

  const limitParam = `$${paramIdx++}`;
  const offsetParam = `$${paramIdx++}`;
  const rows = await sql.unsafe<InstitutionDetail[]>(`
    SELECT ct.id, ct.institution_name, ct.state_code, ct.charter_type,
           ct.asset_size, ct.asset_size_tier, ct.fed_district, ct.city,
           ct.website_url, ct.fee_schedule_url,
           COUNT(ef.id) as fee_count
    FROM crawl_targets ct
    LEFT JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
      AND ef.review_status != 'rejected'
    ${where}
    GROUP BY ct.id, ct.institution_name, ct.state_code, ct.charter_type,
             ct.asset_size, ct.asset_size_tier, ct.fed_district, ct.city,
             ct.website_url, ct.fee_schedule_url
    ${having}
    ORDER BY ct.asset_size DESC NULLS LAST
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `, [...params, pageSize, offset]);

  return { rows, total: Number(countResult[0].cnt) };
}

export async function getInstitutionById(id: number): Promise<InstitutionDetail | null> {
  const [row] = await sql<InstitutionDetail[]>`
    SELECT ct.id, ct.institution_name, ct.state_code, ct.charter_type,
           ct.asset_size, ct.asset_size_tier, ct.fed_district, ct.city,
           ct.website_url, ct.fee_schedule_url,
           COUNT(ef.id) as fee_count
    FROM crawl_targets ct
    LEFT JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
    WHERE ct.id = ${id}
    GROUP BY ct.id, ct.institution_name, ct.state_code, ct.charter_type,
             ct.asset_size, ct.asset_size_tier, ct.fed_district, ct.city,
             ct.website_url, ct.fee_schedule_url
  `;
  return row ?? null;
}

export async function getPeerAnalysis(targetId: number): Promise<Record<string, unknown> | null> {
  const [row] = await sql<{ result_json: string | Record<string, unknown> }[]>`
    SELECT result_json FROM analysis_results
    WHERE crawl_target_id = ${targetId} AND analysis_type = 'peer_comparison'
  `;
  if (!row) return null;
  // Postgres JSONB returns parsed object; TEXT returns string
  if (typeof row.result_json === "object") return row.result_json as Record<string, unknown>;
  return JSON.parse(row.result_json);
}

export async function getTierCounts(): Promise<{ tier: string; count: number }[]> {
  const rows = await sql<{ tier: string; count: number }[]>`
    SELECT asset_size_tier as tier, COUNT(*) as count
    FROM crawl_targets
    WHERE asset_size_tier IS NOT NULL
    GROUP BY asset_size_tier
    ORDER BY MIN(asset_size)
  `;
  return rows.map(r => ({ ...r, count: Number(r.count) }));
}

export async function getDistrictCounts(): Promise<{ district: number; count: number }[]> {
  const rows = await sql<{ district: number; count: number }[]>`
    SELECT fed_district as district, COUNT(*) as count
    FROM crawl_targets
    WHERE fed_district IS NOT NULL
    GROUP BY fed_district
    ORDER BY fed_district
  `;
  return rows.map(r => ({ ...r, count: Number(r.count) }));
}

export async function getReviewStats(): Promise<ReviewStats> {
  const rows = await sql<{ review_status: string; cnt: number }[]>`
    SELECT review_status, COUNT(*) as cnt
    FROM extracted_fees
    GROUP BY review_status
  `;

  const stats: ReviewStats = {
    pending: 0,
    staged: 0,
    flagged: 0,
    approved: 0,
    rejected: 0,
  };
  for (const row of rows) {
    if (row.review_status in stats) {
      stats[row.review_status as keyof ReviewStats] = Number(row.cnt);
    }
  }
  return stats;
}

const REVIEW_SORT_COLUMNS: Record<string, string> = {
  institution: "ct.institution_name",
  fee_name: "ef.fee_name",
  amount: "ef.amount",
  frequency: "ef.frequency",
  confidence: "ef.extraction_confidence",
};

export async function getFeesByStatus(
  status: string,
  search?: string,
  limit = 100,
  offset = 0,
  sort?: string,
  dir?: string,
): Promise<{ fees: ReviewableFee[]; total: number }> {
  const conditions = ["ef.review_status = $1"];
  const params: (string | number)[] = [status];
  let paramIdx = 2;

  if (search) {
    conditions.push(`(ef.fee_name ILIKE $${paramIdx++} OR ct.institution_name ILIKE $${paramIdx++})`);
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereClause = conditions.join(" AND ");

  const countResult = await sql.unsafe<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt
     FROM extracted_fees ef
     JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
     WHERE ${whereClause}`,
    params,
  );
  const cnt = Number(countResult[0].cnt);

  const sortCol = (sort && REVIEW_SORT_COLUMNS[sort]) || "ct.institution_name";
  const sortDir = dir === "desc" ? "DESC" : "ASC";
  const secondary = sortCol !== "ct.institution_name"
    ? ", ct.institution_name ASC"
    : ", ef.fee_name ASC";

  const fees = await sql.unsafe<ReviewableFee[]>(
    `SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
            ef.extraction_confidence, ef.review_status, ef.validation_flags,
            ef.fee_category, ct.institution_name, ef.crawl_target_id,
            ct.state_code, ct.charter_type, cr.document_url, ct.fee_schedule_url
     FROM extracted_fees ef
     JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
     LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id
     WHERE ${whereClause}
     ORDER BY ${sortCol} ${sortDir}${secondary}
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset],
  );

  return { fees, total: cnt };
}

export async function getDistinctFeeTypes(): Promise<string[]> {
  const rows = await sql<{ fee_name: string }[]>`
    SELECT DISTINCT fee_name FROM extracted_fees ORDER BY fee_name
  `;
  return rows.map((r) => r.fee_name);
}

export async function getFeeById(feeId: number): Promise<ReviewableFee | null> {
  const [row] = await sql<ReviewableFee[]>`
    SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
            ef.extraction_confidence, ef.review_status, ef.validation_flags,
            ef.fee_category, ct.institution_name, ef.crawl_target_id,
            ct.state_code, ct.charter_type, cr.document_url, ct.fee_schedule_url
     FROM extracted_fees ef
     JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
     LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id
     WHERE ef.id = ${feeId}
  `;
  return row ?? null;
}

export async function getOutlierFlaggedFees(
  limit = 100,
  offset = 0,
  category?: string,
  sort?: string,
  dir?: string,
): Promise<{ fees: ReviewableFee[]; total: number }> {
  const conditions = [
    "ef.review_status IN ('flagged', 'pending', 'staged')",
    `(ef.validation_flags::text LIKE '%statistical_outlier%'
      OR ef.validation_flags::text LIKE '%decimal_error%'
      OR ef.validation_flags::text LIKE '%percentage_confusion%')`,
  ];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (category) {
    conditions.push(`ef.fee_category = $${paramIdx++}`);
    params.push(category);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await sql.unsafe<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt
     FROM extracted_fees ef
     JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
     ${where}`,
    params,
  );
  const cnt = Number(countResult[0].cnt);

  const fees = await sql.unsafe<ReviewableFee[]>(
    `SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
            ef.extraction_confidence, ef.review_status, ef.validation_flags,
            ef.fee_category, ct.institution_name, ef.crawl_target_id,
            ct.state_code, ct.charter_type, cr.document_url, ct.fee_schedule_url
     FROM extracted_fees ef
     JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
     LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id
     ${where}
     ORDER BY ${getSortClause(sort, dir, "ef.extraction_confidence ASC, ef.amount DESC")}
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset],
  );

  return { fees, total: cnt };
}

function getSortClause(sort?: string, dir?: string, fallback = "ef.id DESC"): string {
  const SORT_MAP: Record<string, string> = {
    amount: "ef.amount",
    confidence: "ef.extraction_confidence",
    name: "ef.fee_name",
    institution: "ct.institution_name",
    category: "ef.fee_category",
    state: "ct.state_code",
  };
  const col = sort && SORT_MAP[sort];
  if (!col) return fallback;
  const direction = dir === "asc" ? "ASC" : "DESC";
  return `${col} ${direction} NULLS LAST`;
}

export async function getOutlierCount(): Promise<number> {
  const [row] = await sql<{ cnt: number }[]>`
    SELECT COUNT(*) as cnt
    FROM extracted_fees
    WHERE review_status IN ('flagged', 'pending', 'staged')
      AND (validation_flags::text LIKE '%statistical_outlier%'
           OR validation_flags::text LIKE '%decimal_error%'
           OR validation_flags::text LIKE '%percentage_confusion%')
  `;
  return Number(row.cnt);
}

export interface CategoryMedian {
  median: number;
  p25: number;
  p75: number;
  count: number;
}

export async function getCategoryMedians(): Promise<Record<string, CategoryMedian>> {
  const rows = await sql<{ fee_category: string; amount: number }[]>`
    SELECT fee_category, amount
    FROM extracted_fees
    WHERE fee_category IS NOT NULL
      AND amount IS NOT NULL
      AND amount > 0
      AND review_status != 'rejected'
    ORDER BY fee_category, amount
  `;

  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    if (!grouped.has(row.fee_category)) {
      grouped.set(row.fee_category, []);
    }
    grouped.get(row.fee_category)!.push(Number(row.amount));
  }

  const result: Record<string, CategoryMedian> = {};
  for (const [cat, amounts] of grouped) {
    if (amounts.length < 5) continue;
    const sorted = amounts.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    const q1 = Math.floor(sorted.length / 4);
    const q3 = Math.floor((3 * sorted.length) / 4);
    result[cat] = {
      median,
      p25: sorted[q1],
      p75: sorted[q3],
      count: sorted.length,
    };
  }

  return result;
}

export interface DataFreshness {
  last_crawl_at: string | null;
  last_fee_extracted_at: string | null;
  total_observations: number;
}

export async function getDataFreshness(): Promise<DataFreshness> {
  const [crawl] = await sql<{ last_at: string | null }[]>`
    SELECT MAX(crawled_at) as last_at FROM crawl_results WHERE status = 'success'
  `;

  const [fee] = await sql<{ last_at: string | null }[]>`
    SELECT MAX(created_at) as last_at FROM extracted_fees
  `;

  const [count] = await sql<{ cnt: number }[]>`
    SELECT COUNT(*) as cnt FROM extracted_fees WHERE review_status != 'rejected'
  `;

  return {
    last_crawl_at: crawl?.last_at ?? null,
    last_fee_extracted_at: fee?.last_at ?? null,
    total_observations: Number(count.cnt),
  };
}
