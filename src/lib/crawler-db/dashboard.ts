import { getDb } from "./connection";
import { computePercentile, computeStats } from "./fees";

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
}

export interface LandingPageStats {
  total_institutions: number;
  institutions_with_fees: number;
  total_categories: number;
}

export function getLandingPageStats(): LandingPageStats {
  const db = getDb();
  const institutions = db
    .prepare("SELECT COUNT(*) as cnt FROM crawl_targets")
    .get() as { cnt: number };

  const withFees = db
    .prepare(
      `SELECT COUNT(DISTINCT crawl_target_id) as cnt
       FROM extracted_fees
       WHERE review_status IN ('approved', 'staged')`
    )
    .get() as { cnt: number };

  const categories = db
    .prepare(
      `SELECT COUNT(DISTINCT fee_category) as cnt
       FROM extracted_fees
       WHERE fee_category IS NOT NULL`
    )
    .get() as { cnt: number };

  return {
    total_institutions: institutions.cnt,
    institutions_with_fees: withFees.cnt,
    total_categories: categories.cnt,
  };
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
      `SELECT MAX(crawled_at) as last_at FROM crawl_results`
    )
    .get() as { last_at: string | null };

  const fee = db
    .prepare(
      `SELECT MAX(created_at) as last_at, COUNT(*) as total
       FROM extracted_fees
       WHERE review_status != 'rejected'`
    )
    .get() as { last_at: string | null; total: number };

  return {
    last_crawl_at: crawl.last_at,
    last_fee_extracted_at: fee.last_at,
    total_observations: fee.total,
  };
}

export interface StuckReviewItems {
  flagged_over_14d: number;
  staged_over_30d: number;
}

export function getStuckReviewItems(): StuckReviewItems {
  const db = getDb();
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
  asset_tiers?: string[];
}): DistrictMetric[] {
  const db = getDb();
  const conditions = ["ct.fed_district IS NOT NULL"];
  const params: (string | number)[] = [];

  if (filters?.charter_type) {
    conditions.push("ct.charter_type = ?");
    params.push(filters.charter_type);
  }
  if (filters?.asset_tiers && filters.asset_tiers.length > 0) {
    const placeholders = filters.asset_tiers.map(() => "?").join(",");
    conditions.push(`ct.asset_size_tier IN (${placeholders})`);
    params.push(...filters.asset_tiers);
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
  asset_tiers?: string[];
  fed_districts?: number[];
}): PeerFilteredStats {
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
    asset_tiers?: string[];
    fed_districts?: number[];
  },
  limit = 10
): VolatileCategory[] {
  const db = getDb();
  const conditions = ["ef.fee_category IS NOT NULL"];
  const params: (string | number)[] = [];

  if (filters?.charter_type) {
    conditions.push("ct.charter_type = ?");
    params.push(filters.charter_type);
  }
  if (filters?.asset_tiers && filters.asset_tiers.length > 0) {
    const placeholders = filters.asset_tiers.map(() => "?").join(",");
    conditions.push(`ct.asset_size_tier IN (${placeholders})`);
    params.push(...filters.asset_tiers);
  }
  if (filters?.fed_districts && filters.fed_districts.length > 0) {
    const placeholders = filters.fed_districts.map(() => "?").join(",");
    conditions.push(`ct.fed_district IN (${placeholders})`);
    params.push(...filters.fed_districts);
  }

  const where = conditions.join(" AND ");

  const catRows = db
    .prepare(
      `SELECT ef.fee_category,
              COUNT(DISTINCT ef.crawl_target_id) as institution_count,
              COUNT(*) as total_count,
              SUM(CASE WHEN ef.review_status = 'flagged' THEN 1 ELSE 0 END) as flagged_count
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ${where}
       GROUP BY ef.fee_category
       HAVING COUNT(CASE WHEN ef.amount > 0 THEN 1 END) >= 3`
    )
    .all(...params) as {
    fee_category: string;
    institution_count: number;
    total_count: number;
    flagged_count: number;
  }[];

  const categoryNames = catRows.map((r) => r.fee_category);
  if (categoryNames.length === 0) return [];

  const catPlaceholders = categoryNames.map(() => "?").join(",");
  const amountRows = db
    .prepare(
      `SELECT ef.fee_category, ef.amount
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ${where} AND ef.fee_category IN (${catPlaceholders}) AND ef.amount > 0`
    )
    .all(...params, ...categoryNames) as {
    fee_category: string;
    amount: number;
  }[];

  const amountsByCategory = new Map<string, number[]>();
  for (const row of amountRows) {
    if (!amountsByCategory.has(row.fee_category)) {
      amountsByCategory.set(row.fee_category, []);
    }
    amountsByCategory.get(row.fee_category)!.push(row.amount);
  }

  const results: VolatileCategory[] = [];
  for (const cat of catRows) {
    const amounts = amountsByCategory.get(cat.fee_category) ?? [];
    if (amounts.length < 3) continue;
    const stats = computeStats(amounts);
    const iqr =
      stats.p75 !== null && stats.p25 !== null
        ? Math.round((stats.p75 - stats.p25) * 100) / 100
        : null;
    const range_width =
      stats.max !== null && stats.min !== null
        ? Math.round((stats.max - stats.min) * 100) / 100
        : null;
    results.push({
      fee_category: cat.fee_category,
      institution_count: cat.institution_count,
      min_amount: stats.min,
      max_amount: stats.max,
      median_amount: stats.median,
      p25_amount: stats.p25,
      p75_amount: stats.p75,
      iqr,
      range_width,
      flagged_count: cat.flagged_count,
      flag_rate: cat.total_count > 0 ? cat.flagged_count / cat.total_count : 0,
    });
  }

  results.sort((a, b) => (b.iqr ?? 0) - (a.iqr ?? 0));
  return results.slice(0, limit);
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
  asset_tiers?: string[];
  fed_districts?: number[];
}): RiskOutlierData {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.charter_type) {
    conditions.push("ct.charter_type = ?");
    params.push(filters.charter_type);
  }
  if (filters?.asset_tiers && filters.asset_tiers.length > 0) {
    const placeholders = filters.asset_tiers.map(() => "?").join(",");
    conditions.push(`ct.asset_size_tier IN (${placeholders})`);
    params.push(...filters.asset_tiers);
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
}

export interface DailyTrend {
  date: string;
  institutions: number;
  fees_extracted: number;
  fee_urls: number;
}

export function getDailyTrends(days = 14): DailyTrend[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT date(cr.crawled_at) as date,
              COUNT(DISTINCT cr.crawl_target_id) as institutions,
              SUM(cr.fees_extracted) as fees_extracted,
              COUNT(DISTINCT CASE WHEN cr.fees_extracted > 0 THEN cr.crawl_target_id END) as fee_urls
       FROM crawl_results cr
       WHERE cr.crawled_at > datetime('now', '-' || ? || ' days')
       GROUP BY date(cr.crawled_at)
       ORDER BY date ASC`
    )
    .all(days) as DailyTrend[];
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
    asset_tiers?: string[];
    fed_districts?: number[];
  },
  limit = 20
): RecentCrawlResult[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.charter_type) {
    conditions.push("ct.charter_type = ?");
    params.push(filters.charter_type);
  }
  if (filters?.asset_tiers && filters.asset_tiers.length > 0) {
    const placeholders = filters.asset_tiers.map(() => "?").join(",");
    conditions.push(`ct.asset_size_tier IN (${placeholders})`);
    params.push(...filters.asset_tiers);
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
}
