import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "crawler.db");

function getDb() {
  const db = new Database(DB_PATH, { readonly: true });
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = normal");
  db.pragma("cache_size = -32000");
  db.pragma("mmap_size = 268435456");
  db.pragma("temp_store = memory");
  return db;
}

export interface InstitutionSummary {
  id: number;
  institution_name: string;
  state_code: string | null;
  charter_type: string;
  asset_size: number | null;
  website_url: string | null;
  fee_schedule_url: string | null;
  document_type: string | null;
  fee_count: number;
}

export interface ExtractedFee {
  id: number;
  fee_name: string;
  amount: number | null;
  frequency: string | null;
  conditions: string | null;
  extraction_confidence: number;
  review_status: string;
  validation_flags: string | null;
  institution_name: string;
  crawl_target_id: number;
}

export interface ReviewableFee extends ExtractedFee {
  state_code: string | null;
  charter_type: string;
}

export interface FeeReview {
  id: number;
  fee_id: number;
  action: string;
  username: string | null;
  previous_status: string | null;
  new_status: string | null;
  previous_values: string | null;
  new_values: string | null;
  notes: string | null;
  created_at: string;
}

export interface ReviewStats {
  pending: number;
  staged: number;
  flagged: number;
  approved: number;
  rejected: number;
}

export interface InstitutionDetail {
  id: number;
  institution_name: string;
  state_code: string | null;
  charter_type: string;
  asset_size: number | null;
  asset_size_tier: string | null;
  fed_district: number | null;
  city: string | null;
  fee_count: number;
}

export interface AnalysisResult {
  id: number;
  crawl_target_id: number;
  analysis_type: string;
  result_json: string;
  computed_at: string;
}

export interface CrawlStats {
  total_institutions: number;
  banks: number;
  credit_unions: number;
  with_website: number;
  with_fee_url: number;
  total_fees: number;
  crawl_runs: number;
}

export function getStats(): CrawlStats {
  const db = getDb();
  try {
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
  } finally {
    db.close();
  }
}

export function getInstitutionsWithFees(): InstitutionSummary[] {
  const db = getDb();
  try {
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
  } finally {
    db.close();
  }
}

export function getFeesByInstitution(targetId: number): ExtractedFee[] {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
             ef.extraction_confidence, ef.review_status,
             ct.institution_name, ef.crawl_target_id
      FROM extracted_fees ef
      JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
      WHERE ef.crawl_target_id = ?
      ORDER BY ef.fee_name
    `).all(targetId) as ExtractedFee[];
  } finally {
    db.close();
  }
}

export function getAllFees(): ExtractedFee[] {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
             ef.extraction_confidence, ef.review_status,
             ct.institution_name, ef.crawl_target_id
      FROM extracted_fees ef
      JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
      ORDER BY ct.institution_name, ef.fee_name
    `).all() as ExtractedFee[];
  } finally {
    db.close();
  }
}

export function getInstitutionsByFilter(filters: {
  charter_type?: string;
  asset_tier?: string;
  fed_district?: number;
  state_code?: string;
}): InstitutionDetail[] {
  const db = getDb();
  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters.charter_type) {
      conditions.push("ct.charter_type = ?");
      params.push(filters.charter_type);
    }
    if (filters.asset_tier) {
      conditions.push("ct.asset_size_tier = ?");
      params.push(filters.asset_tier);
    }
    if (filters.fed_district) {
      conditions.push("ct.fed_district = ?");
      params.push(filters.fed_district);
    }
    if (filters.state_code) {
      conditions.push("ct.state_code = ?");
      params.push(filters.state_code);
    }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    return db.prepare(`
      SELECT ct.id, ct.institution_name, ct.state_code, ct.charter_type,
             ct.asset_size, ct.asset_size_tier, ct.fed_district, ct.city,
             COUNT(ef.id) as fee_count
      FROM crawl_targets ct
      LEFT JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
      ${where}
      GROUP BY ct.id
      ORDER BY ct.asset_size DESC NULLS LAST
      LIMIT 200
    `).all(...params) as InstitutionDetail[];
  } finally {
    db.close();
  }
}

export function getInstitutionById(id: number): InstitutionDetail | null {
  const db = getDb();
  try {
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
  } finally {
    db.close();
  }
}

export function getPeerAnalysis(targetId: number): Record<string, unknown> | null {
  const db = getDb();
  try {
    const row = db.prepare(`
      SELECT result_json FROM analysis_results
      WHERE crawl_target_id = ? AND analysis_type = 'peer_comparison'
    `).get(targetId) as { result_json: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.result_json);
  } finally {
    db.close();
  }
}

export function getTierCounts(): { tier: string; count: number }[] {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT asset_size_tier as tier, COUNT(*) as count
      FROM crawl_targets
      WHERE asset_size_tier IS NOT NULL
      GROUP BY asset_size_tier
      ORDER BY MIN(asset_size)
    `).all() as { tier: string; count: number }[];
  } finally {
    db.close();
  }
}

export function getDistrictCounts(): { district: number; count: number }[] {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT fed_district as district, COUNT(*) as count
      FROM crawl_targets
      WHERE fed_district IS NOT NULL
      GROUP BY fed_district
      ORDER BY fed_district
    `).all() as { district: number; count: number }[];
  } finally {
    db.close();
  }
}

export function getReviewStats(): ReviewStats {
  const db = getDb();
  try {
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
  } finally {
    db.close();
  }
}

export function getFeesByStatus(
  status: string,
  search?: string
): ReviewableFee[] {
  const db = getDb();
  try {
    const conditions = ["ef.review_status = ?"];
    const params: (string | number)[] = [status];

    if (search) {
      conditions.push("ef.fee_name LIKE ?");
      params.push(`%${search}%`);
    }

    return db
      .prepare(
        `SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
                ef.extraction_confidence, ef.review_status, ef.validation_flags,
                ct.institution_name, ef.crawl_target_id,
                ct.state_code, ct.charter_type
         FROM extracted_fees ef
         JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
         WHERE ${conditions.join(" AND ")}
         ORDER BY ct.institution_name, ef.fee_name`
      )
      .all(...params) as ReviewableFee[];
  } finally {
    db.close();
  }
}

export function getDistinctFeeTypes(): string[] {
  const db = getDb();
  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT fee_name FROM extracted_fees ORDER BY fee_name`
      )
      .all() as { fee_name: string }[];
    return rows.map((r) => r.fee_name);
  } finally {
    db.close();
  }
}

export function getFeeById(feeId: number): ReviewableFee | null {
  const db = getDb();
  try {
    const row = db
      .prepare(
        `SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
                ef.extraction_confidence, ef.review_status, ef.validation_flags,
                ct.institution_name, ef.crawl_target_id,
                ct.state_code, ct.charter_type
         FROM extracted_fees ef
         JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
         WHERE ef.id = ?`
      )
      .get(feeId) as ReviewableFee | undefined;
    return row ?? null;
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Financial data queries
// ---------------------------------------------------------------------------

export interface InstitutionFinancial {
  crawl_target_id: number;
  report_date: string;
  source: string;
  total_assets: number | null;
  total_deposits: number | null;
  total_loans: number | null;
  service_charge_income: number | null;
  other_noninterest_income: number | null;
  net_interest_margin: number | null;
  efficiency_ratio: number | null;
  roa: number | null;
  roe: number | null;
  tier1_capital_ratio: number | null;
  branch_count: number | null;
  employee_count: number | null;
  member_count: number | null;
}

export interface FinancialStats {
  fdic_records: number;
  ncua_records: number;
  institutions_with_financials: number;
  complaint_records: number;
  institutions_with_complaints: number;
}

export interface ComplaintSummary {
  product: string;
  complaint_count: number;
}

export function getFinancialStats(): FinancialStats {
  const db = getDb();
  try {
    const fdic = db
      .prepare("SELECT COUNT(*) as cnt FROM institution_financials WHERE source = 'fdic'")
      .get() as { cnt: number };
    const ncua = db
      .prepare("SELECT COUNT(*) as cnt FROM institution_financials WHERE source = 'ncua'")
      .get() as { cnt: number };
    const instFin = db
      .prepare("SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM institution_financials")
      .get() as { cnt: number };
    const complaints = db
      .prepare("SELECT COUNT(*) as cnt FROM institution_complaints")
      .get() as { cnt: number };
    const instComp = db
      .prepare("SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM institution_complaints")
      .get() as { cnt: number };

    return {
      fdic_records: fdic.cnt,
      ncua_records: ncua.cnt,
      institutions_with_financials: instFin.cnt,
      complaint_records: complaints.cnt,
      institutions_with_complaints: instComp.cnt,
    };
  } finally {
    db.close();
  }
}

export function getFinancialsByInstitution(
  targetId: number
): InstitutionFinancial[] {
  const db = getDb();
  try {
    return db
      .prepare(
        `SELECT crawl_target_id, report_date, source,
                total_assets, total_deposits, total_loans,
                service_charge_income, other_noninterest_income,
                net_interest_margin, efficiency_ratio,
                roa, roe, tier1_capital_ratio,
                branch_count, employee_count, member_count
         FROM institution_financials
         WHERE crawl_target_id = ?
         ORDER BY report_date DESC`
      )
      .all(targetId) as InstitutionFinancial[];
  } finally {
    db.close();
  }
}

export function getComplaintsByInstitution(
  targetId: number
): ComplaintSummary[] {
  const db = getDb();
  try {
    return db
      .prepare(
        `SELECT product, complaint_count
         FROM institution_complaints
         WHERE crawl_target_id = ? AND issue = '_total'
         ORDER BY complaint_count DESC`
      )
      .all(targetId) as ComplaintSummary[];
  } finally {
    db.close();
  }
}

export function getAuditTrail(feeId: number): FeeReview[] {
  const db = getDb();
  try {
    return db
      .prepare(
        `SELECT id, fee_id, action, username, previous_status, new_status,
                previous_values, new_values, notes, created_at
         FROM fee_reviews
         WHERE fee_id = ?
         ORDER BY created_at DESC`
      )
      .all(feeId) as FeeReview[];
  } finally {
    db.close();
  }
}
