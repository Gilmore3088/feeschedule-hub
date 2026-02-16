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

// ---------------------------------------------------------------------------
// Fee-centric analytics queries
// ---------------------------------------------------------------------------

export interface FeeCategorySummary {
  fee_category: string;
  institution_count: number;
  total_observations: number;
  min_amount: number | null;
  max_amount: number | null;
  avg_amount: number | null;
  median_amount: number | null;
  p25_amount: number | null;
  p75_amount: number | null;
  bank_count: number;
  cu_count: number;
}

export interface FeeInstance {
  id: number;
  institution_name: string;
  crawl_target_id: number;
  amount: number | null;
  frequency: string | null;
  conditions: string | null;
  charter_type: string;
  state_code: string | null;
  asset_size_tier: string | null;
  asset_size: number | null;
  review_status: string;
  extraction_confidence: number;
}

export interface DimensionBreakdown {
  dimension_value: string;
  count: number;
  min_amount: number | null;
  max_amount: number | null;
  avg_amount: number | null;
  median_amount: number | null;
}

export interface FeeChangeEvent {
  institution_name: string;
  previous_amount: number | null;
  new_amount: number | null;
  change_type: string;
  detected_at: string;
}

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

function computeStats(amounts: number[]): {
  min: number | null;
  max: number | null;
  avg: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
} {
  if (amounts.length === 0) {
    return { min: null, max: null, avg: null, median: null, p25: null, p75: null };
  }
  const sorted = [...amounts].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round((sorted.reduce((s, v) => s + v, 0) / sorted.length) * 100) / 100,
    median: Math.round(computePercentile(sorted, 50) * 100) / 100,
    p25: Math.round(computePercentile(sorted, 25) * 100) / 100,
    p75: Math.round(computePercentile(sorted, 75) * 100) / 100,
  };
}

export function getFeeCategorySummaries(): FeeCategorySummary[] {
  const db = getDb();
  try {
    const rows = db
      .prepare(
        `SELECT ef.fee_category,
                COUNT(DISTINCT ef.crawl_target_id) as institution_count,
                COUNT(*) as total_observations,
                ct.charter_type,
                ef.amount
         FROM extracted_fees ef
         JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
         WHERE ef.fee_category IS NOT NULL
         ORDER BY ef.fee_category`
      )
      .all() as {
      fee_category: string;
      institution_count: number;
      total_observations: number;
      charter_type: string;
      amount: number | null;
    }[];

    // Group by fee_category and compute stats
    const grouped = new Map<
      string,
      { amounts: number[]; banks: Set<number>; cus: Set<number>; total: number }
    >();

    // Need raw data - re-query for grouping
    const rawRows = db
      .prepare(
        `SELECT ef.fee_category, ef.amount, ef.crawl_target_id, ct.charter_type
         FROM extracted_fees ef
         JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
         WHERE ef.fee_category IS NOT NULL`
      )
      .all() as {
      fee_category: string;
      amount: number | null;
      crawl_target_id: number;
      charter_type: string;
    }[];

    for (const row of rawRows) {
      if (!grouped.has(row.fee_category)) {
        grouped.set(row.fee_category, { amounts: [], banks: new Set(), cus: new Set(), total: 0 });
      }
      const entry = grouped.get(row.fee_category)!;
      entry.total++;
      if (row.amount !== null && row.amount > 0) {
        entry.amounts.push(row.amount);
      }
      if (row.charter_type === "bank") {
        entry.banks.add(row.crawl_target_id);
      } else {
        entry.cus.add(row.crawl_target_id);
      }
    }

    const results: FeeCategorySummary[] = [];
    for (const [category, data] of grouped.entries()) {
      const stats = computeStats(data.amounts);
      results.push({
        fee_category: category,
        institution_count: new Set([...data.banks, ...data.cus]).size,
        total_observations: data.total,
        bank_count: data.banks.size,
        cu_count: data.cus.size,
        min_amount: stats.min,
        max_amount: stats.max,
        avg_amount: stats.avg,
        median_amount: stats.median,
        p25_amount: stats.p25,
        p75_amount: stats.p75,
      });
    }

    results.sort((a, b) => b.institution_count - a.institution_count);
    return results;
  } finally {
    db.close();
  }
}

export function getFeeCategoryDetail(category: string): {
  fees: FeeInstance[];
  by_charter_type: DimensionBreakdown[];
  by_asset_tier: DimensionBreakdown[];
  by_fed_district: DimensionBreakdown[];
  by_state: DimensionBreakdown[];
  change_events: FeeChangeEvent[];
} {
  const db = getDb();
  try {
    const fees = db
      .prepare(
        `SELECT ef.id, ct.institution_name, ef.crawl_target_id,
                ef.amount, ef.frequency, ef.conditions,
                ct.charter_type, ct.state_code, ct.asset_size_tier,
                ct.asset_size, ef.review_status, ef.extraction_confidence
         FROM extracted_fees ef
         JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
         WHERE ef.fee_category = ?
         ORDER BY ef.amount DESC NULLS LAST`
      )
      .all(category) as FeeInstance[];

    // Compute dimensional breakdowns
    function buildBreakdown(
      dimFn: (f: FeeInstance) => string | null
    ): DimensionBreakdown[] {
      const groups = new Map<string, number[]>();
      for (const fee of fees) {
        const dim = dimFn(fee) ?? "Unknown";
        if (!groups.has(dim)) groups.set(dim, []);
        if (fee.amount !== null && fee.amount > 0) {
          groups.get(dim)!.push(fee.amount);
        }
      }
      const result: DimensionBreakdown[] = [];
      for (const [value, amounts] of groups.entries()) {
        const s = computeStats(amounts);
        result.push({
          dimension_value: value,
          count: amounts.length,
          min_amount: s.min,
          max_amount: s.max,
          avg_amount: s.avg,
          median_amount: s.median,
        });
      }
      return result.sort((a, b) => b.count - a.count);
    }

    const by_charter_type = buildBreakdown((f) => f.charter_type === "bank" ? "Bank" : "Credit Union");
    const by_asset_tier = buildBreakdown((f) => f.asset_size_tier);
    const by_fed_district = buildBreakdown((f) =>
      f.state_code ? `District` : null
    );

    // For fed district, re-query with actual district numbers
    const districtRows = db
      .prepare(
        `SELECT ct.fed_district, ef.amount
         FROM extracted_fees ef
         JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
         WHERE ef.fee_category = ? AND ct.fed_district IS NOT NULL`
      )
      .all(category) as { fed_district: number; amount: number | null }[];

    const districtGroups = new Map<number, number[]>();
    for (const row of districtRows) {
      if (!districtGroups.has(row.fed_district)) districtGroups.set(row.fed_district, []);
      if (row.amount !== null && row.amount > 0) {
        districtGroups.get(row.fed_district)!.push(row.amount);
      }
    }
    const by_fed_district_real: DimensionBreakdown[] = [];
    for (const [district, amounts] of districtGroups.entries()) {
      const s = computeStats(amounts);
      by_fed_district_real.push({
        dimension_value: `District ${district}`,
        count: amounts.length,
        min_amount: s.min,
        max_amount: s.max,
        avg_amount: s.avg,
        median_amount: s.median,
      });
    }
    by_fed_district_real.sort((a, b) => {
      const numA = parseInt(a.dimension_value.replace("District ", ""));
      const numB = parseInt(b.dimension_value.replace("District ", ""));
      return numA - numB;
    });

    const by_state = buildBreakdown((f) => f.state_code);

    // Fee change events
    const change_events = db
      .prepare(
        `SELECT ct.institution_name, fce.previous_amount, fce.new_amount,
                fce.change_type, fce.detected_at
         FROM fee_change_events fce
         JOIN crawl_targets ct ON fce.crawl_target_id = ct.id
         WHERE fce.fee_category = ?
         ORDER BY fce.detected_at DESC
         LIMIT 50`
      )
      .all(category) as FeeChangeEvent[];

    return {
      fees,
      by_charter_type,
      by_asset_tier,
      by_fed_district: by_fed_district_real,
      by_state: by_state.slice(0, 15),
      change_events,
    };
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

// ---------------------------------------------------------------------------
// Dashboard V2 queries
// ---------------------------------------------------------------------------

export interface CrawlHealth {
  last_run_at: string | null;
  last_run_status: string | null;
  success_rate_24h: number;
  avg_confidence: number;
  institutions_failing: number;
  total_crawled_24h: number;
  crawl_runs_7d: number;
}

export function getCrawlHealth(): CrawlHealth {
  const db = getDb();
  try {
    const lastRun = db
      .prepare(
        `SELECT completed_at, status FROM crawl_runs
         ORDER BY started_at DESC LIMIT 1`
      )
      .get() as { completed_at: string | null; status: string } | undefined;

    const recent = db
      .prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as succeeded
         FROM crawl_results
         WHERE crawled_at > datetime('now', '-1 day')`
      )
      .get() as { total: number; succeeded: number };

    const confidence = db
      .prepare(
        `SELECT AVG(extraction_confidence) as avg_conf
         FROM extracted_fees
         WHERE created_at > datetime('now', '-1 day')`
      )
      .get() as { avg_conf: number | null };

    const failing = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM crawl_targets
         WHERE consecutive_failures > 3`
      )
      .get() as { cnt: number };

    const runs7d = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM crawl_runs
         WHERE started_at > datetime('now', '-7 days')`
      )
      .get() as { cnt: number };

    return {
      last_run_at: lastRun?.completed_at ?? null,
      last_run_status: lastRun?.status ?? null,
      success_rate_24h:
        recent.total > 0 ? recent.succeeded / recent.total : 0,
      avg_confidence: confidence.avg_conf ?? 0,
      institutions_failing: failing.cnt,
      total_crawled_24h: recent.total,
      crawl_runs_7d: runs7d.cnt,
    };
  } finally {
    db.close();
  }
}

export interface StuckReviewItems {
  flagged_over_14d: number;
  staged_over_30d: number;
}

export function getStuckReviewItems(): StuckReviewItems {
  const db = getDb();
  try {
    const flagged = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM extracted_fees
         WHERE review_status = 'flagged'
           AND created_at < datetime('now', '-14 days')`
      )
      .get() as { cnt: number };

    const staged = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM extracted_fees
         WHERE review_status = 'staged'
           AND created_at < datetime('now', '-30 days')`
      )
      .get() as { cnt: number };

    return {
      flagged_over_14d: flagged.cnt,
      staged_over_30d: staged.cnt,
    };
  } finally {
    db.close();
  }
}

export interface DistrictMetric {
  district: number;
  name: string;
  institution_count: number;
  with_fee_url: number;
  fee_url_pct: number;
  total_fees: number;
  flagged_count: number;
  flag_rate: number;
  avg_confidence: number;
}

export function getDistrictMetrics(filters?: {
  charter_type?: string;
  asset_tier?: string;
}): DistrictMetric[] {
  const db = getDb();
  try {
    const conditions = ["ct.fed_district IS NOT NULL"];
    const params: (string | number)[] = [];

    if (filters?.charter_type) {
      conditions.push("ct.charter_type = ?");
      params.push(filters.charter_type);
    }
    if (filters?.asset_tier) {
      conditions.push("ct.asset_size_tier = ?");
      params.push(filters.asset_tier);
    }

    const where = conditions.join(" AND ");

    const rows = db
      .prepare(
        `SELECT ct.fed_district as district,
                COUNT(DISTINCT ct.id) as institution_count,
                COUNT(DISTINCT CASE WHEN ct.fee_schedule_url IS NOT NULL THEN ct.id END) as with_fee_url,
                COUNT(ef.id) as total_fees,
                SUM(CASE WHEN ef.review_status = 'flagged' THEN 1 ELSE 0 END) as flagged_count,
                AVG(ef.extraction_confidence) as avg_confidence
         FROM crawl_targets ct
         LEFT JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
         WHERE ${where}
         GROUP BY ct.fed_district
         ORDER BY ct.fed_district`
      )
      .all(...params) as {
      district: number;
      institution_count: number;
      with_fee_url: number;
      total_fees: number;
      flagged_count: number;
      avg_confidence: number | null;
    }[];

    const districtNames: Record<number, string> = {
      1: "Boston", 2: "New York", 3: "Philadelphia", 4: "Cleveland",
      5: "Richmond", 6: "Atlanta", 7: "Chicago", 8: "St. Louis",
      9: "Minneapolis", 10: "Kansas City", 11: "Dallas", 12: "San Francisco",
    };

    return rows.map((r) => ({
      district: r.district,
      name: districtNames[r.district] ?? `District ${r.district}`,
      institution_count: r.institution_count,
      with_fee_url: r.with_fee_url,
      fee_url_pct:
        r.institution_count > 0
          ? r.with_fee_url / r.institution_count
          : 0,
      total_fees: r.total_fees,
      flagged_count: r.flagged_count,
      flag_rate: r.total_fees > 0 ? r.flagged_count / r.total_fees : 0,
      avg_confidence: r.avg_confidence ?? 0,
    }));
  } finally {
    db.close();
  }
}

export interface PeerFilteredStats {
  total_institutions: number;
  with_website: number;
  with_fee_url: number;
  total_fees: number;
  banks: number;
  credit_unions: number;
}

export function getPeerFilteredStats(filters: {
  charter_type?: string;
  asset_tier?: string;
  fed_districts?: number[];
}): PeerFilteredStats {
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
    if (filters.fed_districts && filters.fed_districts.length > 0) {
      const placeholders = filters.fed_districts.map(() => "?").join(",");
      conditions.push(`ct.fed_district IN (${placeholders})`);
      params.push(...filters.fed_districts);
    }

    const where =
      conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const row = db
      .prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN ct.website_url IS NOT NULL THEN 1 ELSE 0 END) as with_website,
                SUM(CASE WHEN ct.fee_schedule_url IS NOT NULL THEN 1 ELSE 0 END) as with_fee_url,
                SUM(CASE WHEN ct.charter_type = 'bank' THEN 1 ELSE 0 END) as banks,
                SUM(CASE WHEN ct.charter_type = 'credit_union' THEN 1 ELSE 0 END) as credit_unions
         FROM crawl_targets ct
         ${where}`
      )
      .get(...params) as {
      total: number;
      with_website: number;
      with_fee_url: number;
      banks: number;
      credit_unions: number;
    };

    const feeRow = db
      .prepare(
        `SELECT COUNT(*) as cnt
         FROM extracted_fees ef
         JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
         ${where}`
      )
      .get(...params) as { cnt: number };

    return {
      total_institutions: row.total,
      with_website: row.with_website,
      with_fee_url: row.with_fee_url,
      total_fees: feeRow.cnt,
      banks: row.banks,
      credit_unions: row.credit_unions,
    };
  } finally {
    db.close();
  }
}

export interface VolatileCategory {
  fee_category: string;
  institution_count: number;
  min_amount: number | null;
  max_amount: number | null;
  median_amount: number | null;
  p25_amount: number | null;
  p75_amount: number | null;
  iqr: number | null;
  range_width: number | null;
  flagged_count: number;
  flag_rate: number;
}

export function getVolatileCategories(
  filters?: {
    charter_type?: string;
    asset_tier?: string;
    fed_districts?: number[];
  },
  limit = 10
): VolatileCategory[] {
  const db = getDb();
  try {
    const conditions = ["ef.fee_category IS NOT NULL"];
    const params: (string | number)[] = [];

    if (filters?.charter_type) {
      conditions.push("ct.charter_type = ?");
      params.push(filters.charter_type);
    }
    if (filters?.asset_tier) {
      conditions.push("ct.asset_size_tier = ?");
      params.push(filters.asset_tier);
    }
    if (filters?.fed_districts && filters.fed_districts.length > 0) {
      const placeholders = filters.fed_districts.map(() => "?").join(",");
      conditions.push(`ct.fed_district IN (${placeholders})`);
      params.push(...filters.fed_districts);
    }

    const where = conditions.join(" AND ");

    const rows = db
      .prepare(
        `SELECT ef.fee_category, ef.amount, ef.crawl_target_id, ef.review_status
         FROM extracted_fees ef
         JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
         WHERE ${where}`
      )
      .all(...params) as {
      fee_category: string;
      amount: number | null;
      crawl_target_id: number;
      review_status: string;
    }[];

    const grouped = new Map<
      string,
      { amounts: number[]; institutions: Set<number>; flagged: number; total: number }
    >();

    for (const row of rows) {
      if (!grouped.has(row.fee_category)) {
        grouped.set(row.fee_category, {
          amounts: [],
          institutions: new Set(),
          flagged: 0,
          total: 0,
        });
      }
      const entry = grouped.get(row.fee_category)!;
      entry.total++;
      entry.institutions.add(row.crawl_target_id);
      if (row.amount !== null && row.amount > 0) {
        entry.amounts.push(row.amount);
      }
      if (row.review_status === "flagged") {
        entry.flagged++;
      }
    }

    const results: VolatileCategory[] = [];
    for (const [category, data] of grouped.entries()) {
      if (data.amounts.length < 3) continue;
      const stats = computeStats(data.amounts);
      const iqr =
        stats.p75 !== null && stats.p25 !== null
          ? Math.round((stats.p75 - stats.p25) * 100) / 100
          : null;
      const range_width =
        stats.max !== null && stats.min !== null
          ? Math.round((stats.max - stats.min) * 100) / 100
          : null;
      results.push({
        fee_category: category,
        institution_count: data.institutions.size,
        min_amount: stats.min,
        max_amount: stats.max,
        median_amount: stats.median,
        p25_amount: stats.p25,
        p75_amount: stats.p75,
        iqr,
        range_width,
        flagged_count: data.flagged,
        flag_rate: data.total > 0 ? data.flagged / data.total : 0,
      });
    }

    results.sort((a, b) => (b.iqr ?? 0) - (a.iqr ?? 0));
    return results.slice(0, limit);
  } finally {
    db.close();
  }
}

export interface RiskOutlierData {
  top_flagged_categories: {
    fee_category: string;
    flagged_count: number;
    total_count: number;
  }[];
  repeated_failures: {
    id: number;
    institution_name: string;
    consecutive_failures: number;
    last_crawl_at: string | null;
  }[];
  extreme_outlier_fees: {
    id: number;
    fee_name: string;
    amount: number;
    institution_name: string;
    crawl_target_id: number;
    fee_category: string | null;
  }[];
}

export function getRiskOutliers(filters?: {
  charter_type?: string;
  asset_tier?: string;
  fed_districts?: number[];
}): RiskOutlierData {
  const db = getDb();
  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.charter_type) {
      conditions.push("ct.charter_type = ?");
      params.push(filters.charter_type);
    }
    if (filters?.asset_tier) {
      conditions.push("ct.asset_size_tier = ?");
      params.push(filters.asset_tier);
    }
    if (filters?.fed_districts && filters.fed_districts.length > 0) {
      const placeholders = filters.fed_districts.map(() => "?").join(",");
      conditions.push(`ct.fed_district IN (${placeholders})`);
      params.push(...filters.fed_districts);
    }

    const ctWhere =
      conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const efWhere =
      conditions.length > 0
        ? "WHERE " + conditions.join(" AND ") + " AND ef.fee_category IS NOT NULL"
        : "WHERE ef.fee_category IS NOT NULL";

    // Top flagged categories
    const flagged = db
      .prepare(
        `SELECT ef.fee_category,
                SUM(CASE WHEN ef.review_status = 'flagged' THEN 1 ELSE 0 END) as flagged_count,
                COUNT(*) as total_count
         FROM extracted_fees ef
         JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
         ${efWhere}
         GROUP BY ef.fee_category
         HAVING flagged_count > 0
         ORDER BY flagged_count DESC
         LIMIT 5`
      )
      .all(...params) as {
      fee_category: string;
      flagged_count: number;
      total_count: number;
    }[];

    // Repeated failures
    const failures = db
      .prepare(
        `SELECT ct.id, ct.institution_name, ct.consecutive_failures, ct.last_crawl_at
         FROM crawl_targets ct
         ${ctWhere ? ctWhere + " AND" : "WHERE"} ct.consecutive_failures > 3
         ORDER BY ct.consecutive_failures DESC
         LIMIT 10`
      )
      .all(...params) as {
      id: number;
      institution_name: string;
      consecutive_failures: number;
      last_crawl_at: string | null;
    }[];

    // Extreme outliers: fees > 3x the category median
    // First get category medians
    const catRows = db
      .prepare(
        `SELECT ef.fee_category, ef.amount
         FROM extracted_fees ef
         JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
         ${efWhere}
         AND ef.amount IS NOT NULL AND ef.amount > 0`
      )
      .all(...params) as { fee_category: string; amount: number }[];

    const catAmounts = new Map<string, number[]>();
    for (const r of catRows) {
      if (!catAmounts.has(r.fee_category)) catAmounts.set(r.fee_category, []);
      catAmounts.get(r.fee_category)!.push(r.amount);
    }

    const catMedians = new Map<string, number>();
    for (const [cat, amounts] of catAmounts.entries()) {
      if (amounts.length >= 3) {
        const sorted = [...amounts].sort((a, b) => a - b);
        catMedians.set(cat, computePercentile(sorted, 50));
      }
    }

    const outliers: RiskOutlierData["extreme_outlier_fees"] = [];
    for (const r of catRows) {
      const median = catMedians.get(r.fee_category);
      if (median && median > 0 && r.amount > median * 3) {
        outliers.push({
          id: 0,
          fee_name: r.fee_category,
          amount: r.amount,
          institution_name: "",
          crawl_target_id: 0,
          fee_category: r.fee_category,
        });
      }
    }

    // Re-query top outliers with institution info
    const outlierFees = db
      .prepare(
        `SELECT ef.id, ef.fee_name, ef.amount, ef.fee_category,
                ct.institution_name, ef.crawl_target_id
         FROM extracted_fees ef
         JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
         ${efWhere}
         AND ef.amount IS NOT NULL
         ORDER BY ef.amount DESC
         LIMIT 10`
      )
      .all(...params) as {
      id: number;
      fee_name: string;
      amount: number;
      fee_category: string | null;
      institution_name: string;
      crawl_target_id: number;
    }[];

    // Filter to actual outliers (>3x median of their category)
    const extremeOutliers = outlierFees.filter((f) => {
      if (!f.fee_category) return false;
      const median = catMedians.get(f.fee_category);
      return median && median > 0 && f.amount > median * 3;
    });

    return {
      top_flagged_categories: flagged,
      repeated_failures: failures,
      extreme_outlier_fees: extremeOutliers.slice(0, 5),
    };
  } finally {
    db.close();
  }
}

export interface RecentCrawlResult {
  crawl_target_id: number;
  institution_name: string;
  charter_type: string;
  state_code: string | null;
  asset_size_tier: string | null;
  fed_district: number | null;
  status: string;
  fees_extracted: number;
  crawled_at: string;
  extraction_confidence: number | null;
}

export function getRecentCrawlActivity(
  filters?: {
    charter_type?: string;
    asset_tier?: string;
    fed_districts?: number[];
  },
  limit = 20
): RecentCrawlResult[] {
  const db = getDb();
  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.charter_type) {
      conditions.push("ct.charter_type = ?");
      params.push(filters.charter_type);
    }
    if (filters?.asset_tier) {
      conditions.push("ct.asset_size_tier = ?");
      params.push(filters.asset_tier);
    }
    if (filters?.fed_districts && filters.fed_districts.length > 0) {
      const placeholders = filters.fed_districts.map(() => "?").join(",");
      conditions.push(`ct.fed_district IN (${placeholders})`);
      params.push(...filters.fed_districts);
    }

    const where =
      conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    return db
      .prepare(
        `SELECT cr.crawl_target_id, ct.institution_name, ct.charter_type,
                ct.state_code, ct.asset_size_tier, ct.fed_district,
                cr.status, cr.fees_extracted, cr.crawled_at,
                (SELECT AVG(ef.extraction_confidence)
                 FROM extracted_fees ef
                 WHERE ef.crawl_result_id = cr.id) as extraction_confidence
         FROM crawl_results cr
         JOIN crawl_targets ct ON cr.crawl_target_id = ct.id
         ${where}
         ORDER BY cr.crawled_at DESC
         LIMIT ?`
      )
      .all(...params, limit) as RecentCrawlResult[];
  } finally {
    db.close();
  }
}

export interface RecentReviewAction {
  fee_id: number;
  fee_name: string;
  fee_category: string | null;
  institution_name: string;
  crawl_target_id: number;
  action: string;
  username: string | null;
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
}

export function getRecentReviews(limit = 15): RecentReviewAction[] {
  const db = getDb();
  try {
    return db
      .prepare(
        `SELECT fr.fee_id, ef.fee_name, ef.fee_category,
                ct.institution_name, ef.crawl_target_id,
                fr.action, fr.username, fr.previous_status, fr.new_status,
                fr.created_at
         FROM fee_reviews fr
         JOIN extracted_fees ef ON fr.fee_id = ef.id
         JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
         ORDER BY fr.created_at DESC
         LIMIT ?`
      )
      .all(limit) as RecentReviewAction[];
  } finally {
    db.close();
  }
}
