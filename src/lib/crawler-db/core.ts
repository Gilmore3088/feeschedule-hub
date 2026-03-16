import { getDb } from "./connection";
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

export function getPublicStats(): PublicStats {
  try {
    const db = getDb();
    const validCodes = [...VALID_US_CODES];
    const placeholders = validCodes.map(() => "?").join(",");
    const row = db
      .prepare(
        `SELECT
           COUNT(ef.id) as total_observations,
           COUNT(DISTINCT ct.id) as total_institutions,
           COUNT(DISTINCT ef.fee_category) as total_categories,
           COUNT(DISTINCT ct.state_code) as total_states
         FROM crawl_targets ct
         JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
         WHERE ct.state_code IN (${placeholders})
           AND ef.review_status != 'rejected'`
      )
      .get(...validCodes) as PublicStats;
    return row;
  } catch {
    return { total_observations: 0, total_institutions: 0, total_categories: 0, total_states: 0 };
  }
}

export function getStats(): CrawlStats {
  const db = getDb();
  const total = db.prepare("SELECT COUNT(*) as cnt FROM crawl_targets").get() as { cnt: number };
  const banks = db.prepare("SELECT COUNT(*) as cnt FROM crawl_targets WHERE charter_type='bank'").get() as { cnt: number };
  const cus = db.prepare("SELECT COUNT(*) as cnt FROM crawl_targets WHERE charter_type='credit_union'").get() as { cnt: number };
  const withUrl = db.prepare("SELECT COUNT(*) as cnt FROM crawl_targets WHERE website_url IS NOT NULL").get() as { cnt: number };
  const withFee = db.prepare("SELECT COUNT(*) as cnt FROM crawl_targets WHERE fee_schedule_url IS NOT NULL").get() as { cnt: number };
  const fees = db.prepare("SELECT COUNT(*) as cnt FROM extracted_fees").get() as { cnt: number };
  const runs = db.prepare("SELECT COUNT(*) as cnt FROM crawl_runs").get() as { cnt: number };

  return {
    total_institutions: total.cnt,
    banks: banks.cnt,
    credit_unions: cus.cnt,
    with_website: withUrl.cnt,
    with_fee_url: withFee.cnt,
    total_fees: fees.cnt,
    crawl_runs: runs.cnt,
  };
}

export function getInstitutionsWithFees(): InstitutionSummary[] {
  const db = getDb();
  return db.prepare(`
    SELECT ct.id, ct.institution_name, ct.state_code, ct.charter_type,
           ct.asset_size, ct.website_url, ct.fee_schedule_url, ct.document_type,
           COUNT(ef.id) as fee_count
    FROM crawl_targets ct
    LEFT JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
    WHERE ct.fee_schedule_url IS NOT NULL
    GROUP BY ct.id
    ORDER BY ct.asset_size DESC NULLS LAST
  `).all() as InstitutionSummary[];
}

export function getFeesByInstitution(targetId: number): ExtractedFee[] {
  const db = getDb();
  return db.prepare(`
    SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
           ef.extraction_confidence, ef.review_status,
           ct.institution_name, ef.crawl_target_id
    FROM extracted_fees ef
    JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
    WHERE ef.crawl_target_id = ?
    ORDER BY ef.fee_name
  `).all(targetId) as ExtractedFee[];
}

export function getAllFees(
  limit = 100,
  offset = 0,
  search?: string,
): { fees: ExtractedFee[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (search) {
    conditions.push(
      "(ef.fee_name LIKE ? OR ct.institution_name LIKE ?)"
    );
    params.push(`%${search}%`, `%${search}%`);
  }

  const where =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const { cnt } = db
    .prepare(
      `SELECT COUNT(*) as cnt
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       ${where}`
    )
    .get(...params) as { cnt: number };

  const fees = db
    .prepare(
      `SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
             ef.extraction_confidence, ef.review_status,
             ct.institution_name, ef.crawl_target_id
      FROM extracted_fees ef
      JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
      ${where}
      ORDER BY ct.institution_name, ef.fee_name
      LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as ExtractedFee[];

  return { fees, total: cnt };
}

export function getInstitutionsByFilter(filters: {
  charter_type?: string;
  asset_tiers?: string[];
  fed_districts?: number[];
  state_code?: string;
  gap?: boolean;
  page?: number;
  pageSize?: number;
}): { rows: InstitutionDetail[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.charter_type) {
    conditions.push("ct.charter_type = ?");
    params.push(filters.charter_type);
  }
  if (filters.asset_tiers && filters.asset_tiers.length > 0) {
    const placeholders = filters.asset_tiers.map(() => "?").join(",");
    conditions.push(`ct.asset_size_tier IN (${placeholders})`);
    params.push(...filters.asset_tiers);
  }
  if (filters.fed_districts && filters.fed_districts.length > 0) {
    const placeholders = filters.fed_districts.map(() => "?").join(",");
    conditions.push(`ct.fed_district IN (${placeholders})`);
    params.push(...filters.fed_districts);
  }
  if (filters.state_code) {
    conditions.push("ct.state_code = ?");
    params.push(filters.state_code);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const having = filters.gap ? "HAVING fee_count = 0" : "";

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const offset = (page - 1) * pageSize;

  const countRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM (
      SELECT ct.id, COUNT(ef.id) as fee_count
      FROM crawl_targets ct
      LEFT JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
        AND ef.review_status != 'rejected'
      ${where}
      GROUP BY ct.id
      ${having}
    )
  `).get(...params) as { cnt: number };

  const rows = db.prepare(`
    SELECT ct.id, ct.institution_name, ct.state_code, ct.charter_type,
           ct.asset_size, ct.asset_size_tier, ct.fed_district, ct.city,
           ct.website_url, ct.fee_schedule_url,
           COUNT(ef.id) as fee_count
    FROM crawl_targets ct
    LEFT JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
      AND ef.review_status != 'rejected'
    ${where}
    GROUP BY ct.id
    ${having}
    ORDER BY ct.asset_size DESC NULLS LAST
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as InstitutionDetail[];

  return { rows, total: countRow.cnt };
}

export function getInstitutionById(id: number): InstitutionDetail | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT ct.id, ct.institution_name, ct.state_code, ct.charter_type,
           ct.asset_size, ct.asset_size_tier, ct.fed_district, ct.city,
           COUNT(ef.id) as fee_count
    FROM crawl_targets ct
    LEFT JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
    WHERE ct.id = ?
    GROUP BY ct.id
  `).get(id) as InstitutionDetail | undefined;
  return row ?? null;
}

export function getPeerAnalysis(targetId: number): Record<string, unknown> | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT result_json FROM analysis_results
    WHERE crawl_target_id = ? AND analysis_type = 'peer_comparison'
  `).get(targetId) as { result_json: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.result_json);
}

export function getTierCounts(): { tier: string; count: number }[] {
  const db = getDb();
  return db.prepare(`
    SELECT asset_size_tier as tier, COUNT(*) as count
    FROM crawl_targets
    WHERE asset_size_tier IS NOT NULL
    GROUP BY asset_size_tier
    ORDER BY MIN(asset_size)
  `).all() as { tier: string; count: number }[];
}

export function getDistrictCounts(): { district: number; count: number }[] {
  const db = getDb();
  return db.prepare(`
    SELECT fed_district as district, COUNT(*) as count
    FROM crawl_targets
    WHERE fed_district IS NOT NULL
    GROUP BY fed_district
    ORDER BY fed_district
  `).all() as { district: number; count: number }[];
}

export function getReviewStats(): ReviewStats {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT review_status, COUNT(*) as cnt
       FROM extracted_fees
       GROUP BY review_status`
    )
    .all() as { review_status: string; cnt: number }[];

  const stats: ReviewStats = {
    pending: 0,
    staged: 0,
    flagged: 0,
    approved: 0,
    rejected: 0,
  };
  for (const row of rows) {
    if (row.review_status in stats) {
      stats[row.review_status as keyof ReviewStats] = row.cnt;
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

export function getFeesByStatus(
  status: string,
  search?: string,
  limit = 100,
  offset = 0,
  sort?: string,
  dir?: string,
): { fees: ReviewableFee[]; total: number } {
  const db = getDb();
  const conditions = ["ef.review_status = ?"];
  const params: (string | number)[] = [status];

  if (search) {
    conditions.push("(ef.fee_name LIKE ? OR ct.institution_name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereClause = conditions.join(" AND ");

  const { cnt } = db
    .prepare(
      `SELECT COUNT(*) as cnt
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ${whereClause}`
    )
    .get(...params) as { cnt: number };

  const sortCol = (sort && REVIEW_SORT_COLUMNS[sort]) || "ct.institution_name";
  const sortDir = dir === "desc" ? "DESC" : "ASC";
  const secondary = sortCol !== "ct.institution_name"
    ? ", ct.institution_name ASC"
    : ", ef.fee_name ASC";

  const fees = db
    .prepare(
      `SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
              ef.extraction_confidence, ef.review_status, ef.validation_flags,
              ef.fee_category, ct.institution_name, ef.crawl_target_id,
              ct.state_code, ct.charter_type, cr.document_url
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id
       WHERE ${whereClause}
       ORDER BY ${sortCol} ${sortDir}${secondary}
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as ReviewableFee[];

  return { fees, total: cnt };
}

export function getDistinctFeeTypes(): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT fee_name FROM extracted_fees ORDER BY fee_name`
    )
    .all() as { fee_name: string }[];
  return rows.map((r) => r.fee_name);
}

export function getFeeById(feeId: number): ReviewableFee | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
              ef.extraction_confidence, ef.review_status, ef.validation_flags,
              ef.fee_category, ct.institution_name, ef.crawl_target_id,
              ct.state_code, ct.charter_type, cr.document_url
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id
       WHERE ef.id = ?`
    )
    .get(feeId) as ReviewableFee | undefined;
  return row ?? null;
}

export function getOutlierFlaggedFees(
  limit = 100,
  offset = 0,
  category?: string,
): { fees: ReviewableFee[]; total: number } {
  const db = getDb();
  const conditions = [
    "ef.review_status IN ('flagged', 'pending', 'staged')",
    `(ef.validation_flags LIKE '%statistical_outlier%'
      OR ef.validation_flags LIKE '%decimal_error%'
      OR ef.validation_flags LIKE '%percentage_confusion%')`,
  ];
  const params: (string | number)[] = [];

  if (category) {
    conditions.push("ef.fee_category = ?");
    params.push(category);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const { cnt } = db
    .prepare(
      `SELECT COUNT(*) as cnt
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       ${where}`,
    )
    .get(...params) as { cnt: number };

  const fees = db
    .prepare(
      `SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
              ef.extraction_confidence, ef.review_status, ef.validation_flags,
              ef.fee_category, ct.institution_name, ef.crawl_target_id,
              ct.state_code, ct.charter_type, cr.document_url
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id
       ${where}
       ORDER BY ef.extraction_confidence ASC, ef.amount DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as ReviewableFee[];

  return { fees, total: cnt };
}

export function getOutlierCount(): number {
  const db = getDb();
  const { cnt } = db
    .prepare(
      `SELECT COUNT(*) as cnt
       FROM extracted_fees
       WHERE review_status IN ('flagged', 'pending', 'staged')
         AND (validation_flags LIKE '%statistical_outlier%'
              OR validation_flags LIKE '%decimal_error%'
              OR validation_flags LIKE '%percentage_confusion%')`,
    )
    .get() as { cnt: number };
  return cnt;
}

export interface CategoryMedian {
  median: number;
  p25: number;
  p75: number;
  count: number;
}

export function getCategoryMedians(): Record<string, CategoryMedian> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT fee_category, amount
       FROM extracted_fees
       WHERE fee_category IS NOT NULL
         AND amount IS NOT NULL
         AND amount > 0
         AND review_status != 'rejected'
       ORDER BY fee_category, amount`,
    )
    .all() as { fee_category: string; amount: number }[];

  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    if (!grouped.has(row.fee_category)) {
      grouped.set(row.fee_category, []);
    }
    grouped.get(row.fee_category)!.push(row.amount);
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

export function getDataFreshness(): DataFreshness {
  const db = getDb();

  const crawl = db
    .prepare(
      `SELECT MAX(crawled_at) as last_at FROM crawl_results WHERE status = 'success'`
    )
    .get() as { last_at: string | null } | undefined;

  const fee = db
    .prepare(`SELECT MAX(created_at) as last_at FROM extracted_fees`)
    .get() as { last_at: string | null } | undefined;

  const count = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM extracted_fees WHERE review_status != 'rejected'`
    )
    .get() as { cnt: number };

  return {
    last_crawl_at: crawl?.last_at ?? null,
    last_fee_extracted_at: fee?.last_at ?? null,
    total_observations: count.cnt,
  };
}
