import { sql } from "./connection";
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

export async function getCrawlHealth(): Promise<CrawlHealth> {
  const [lastRun] = await sql<{ completed_at: string | null; status: string }[]>`
    SELECT completed_at, status FROM crawl_runs
    ORDER BY started_at DESC LIMIT 1`;

  const [recent] = await sql<{ total: number; succeeded: number }[]>`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as succeeded
    FROM crawl_results
    WHERE crawled_at > NOW() - INTERVAL '1 day'`;

  const [confidence] = await sql<{ avg_conf: number | null }[]>`
    SELECT AVG(extraction_confidence) as avg_conf
    FROM extracted_fees
    WHERE created_at > NOW() - INTERVAL '1 day'`;

  const [failing] = await sql<{ cnt: number }[]>`
    SELECT COUNT(*) as cnt FROM crawl_targets
    WHERE consecutive_failures > 3`;

  const [runs7d] = await sql<{ cnt: number }[]>`
    SELECT COUNT(*) as cnt FROM crawl_runs
    WHERE started_at > NOW() - INTERVAL '7 days'`;

  return {
    last_run_at: lastRun?.completed_at ?? null,
    last_run_status: lastRun?.status ?? null,
    success_rate_24h:
      Number(recent.total) > 0 ? Number(recent.succeeded) / Number(recent.total) : 0,
    avg_confidence: Number(confidence.avg_conf ?? 0),
    institutions_failing: Number(failing.cnt),
    total_crawled_24h: Number(recent.total),
    crawl_runs_7d: Number(runs7d.cnt),
  };
}

export interface StuckReviewItems {
  flagged_over_14d: number;
  staged_over_30d: number;
}

export async function getStuckReviewItems(): Promise<StuckReviewItems> {
  const [flagged] = await sql<{ cnt: number }[]>`
    SELECT COUNT(*) as cnt FROM extracted_fees
    WHERE review_status = 'flagged'
      AND created_at < NOW() - INTERVAL '14 days'`;

  const [staged] = await sql<{ cnt: number }[]>`
    SELECT COUNT(*) as cnt FROM extracted_fees
    WHERE review_status = 'staged'
      AND created_at < NOW() - INTERVAL '30 days'`;

  return {
    flagged_over_14d: Number(flagged.cnt),
    staged_over_30d: Number(staged.cnt),
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

export async function getDistrictMetrics(filters?: {
  charter_type?: string;
  asset_tiers?: string[];
}): Promise<DistrictMetric[]> {
  const conditions = ["ct.fed_district IS NOT NULL"];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (filters?.charter_type) {
    conditions.push(`ct.charter_type = $${paramIdx++}`);
    params.push(filters.charter_type);
  }
  if (filters?.asset_tiers && filters.asset_tiers.length > 0) {
    const placeholders = filters.asset_tiers.map(() => `$${paramIdx++}`).join(",");
    conditions.push(`ct.asset_size_tier IN (${placeholders})`);
    params.push(...filters.asset_tiers);
  }

  const where = conditions.join(" AND ");

  const rows = await sql.unsafe(
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
     ORDER BY ct.fed_district`,
    params
  ) as {
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

  return rows.map((r) => {
    const instCount = Number(r.institution_count);
    const feeUrlCount = Number(r.with_fee_url);
    const totalFees = Number(r.total_fees);
    const flaggedCount = Number(r.flagged_count);
    return {
      district: Number(r.district),
      name: districtNames[Number(r.district)] ?? `District ${r.district}`,
      institution_count: instCount,
      with_fee_url: feeUrlCount,
      fee_url_pct: instCount > 0 ? feeUrlCount / instCount : 0,
      total_fees: totalFees,
      flagged_count: flaggedCount,
      flag_rate: totalFees > 0 ? flaggedCount / totalFees : 0,
      avg_confidence: Number(r.avg_confidence ?? 0),
    };
  });
}

export interface PeerFilteredStats {
  total_institutions: number;
  with_website: number;
  with_fee_url: number;
  total_fees: number;
  banks: number;
  credit_unions: number;
}

export async function getPeerFilteredStats(filters: {
  charter_type?: string;
  asset_tiers?: string[];
  fed_districts?: number[];
}): Promise<PeerFilteredStats> {
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

  const where =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const [row] = await sql.unsafe(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN ct.website_url IS NOT NULL THEN 1 ELSE 0 END) as with_website,
            SUM(CASE WHEN ct.fee_schedule_url IS NOT NULL THEN 1 ELSE 0 END) as with_fee_url,
            SUM(CASE WHEN ct.charter_type = 'bank' THEN 1 ELSE 0 END) as banks,
            SUM(CASE WHEN ct.charter_type = 'credit_union' THEN 1 ELSE 0 END) as credit_unions
     FROM crawl_targets ct
     ${where}`,
    params
  ) as { total: number; with_website: number; with_fee_url: number; banks: number; credit_unions: number }[];

  const [feeRow] = await sql.unsafe(
    `SELECT COUNT(*) as cnt
     FROM extracted_fees ef
     JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
     ${where}`,
    params
  ) as { cnt: number }[];

  return {
    total_institutions: Number(row.total),
    with_website: Number(row.with_website),
    with_fee_url: Number(row.with_fee_url),
    total_fees: Number(feeRow.cnt),
    banks: Number(row.banks),
    credit_unions: Number(row.credit_unions),
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

export async function getVolatileCategories(
  filters?: {
    charter_type?: string;
    asset_tiers?: string[];
    fed_districts?: number[];
  },
  limit = 10
): Promise<VolatileCategory[]> {
  const conditions = ["ef.fee_category IS NOT NULL"];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (filters?.charter_type) {
    conditions.push(`ct.charter_type = $${paramIdx++}`);
    params.push(filters.charter_type);
  }
  if (filters?.asset_tiers && filters.asset_tiers.length > 0) {
    const placeholders = filters.asset_tiers.map(() => `$${paramIdx++}`).join(",");
    conditions.push(`ct.asset_size_tier IN (${placeholders})`);
    params.push(...filters.asset_tiers);
  }
  if (filters?.fed_districts && filters.fed_districts.length > 0) {
    const placeholders = filters.fed_districts.map(() => `$${paramIdx++}`).join(",");
    conditions.push(`ct.fed_district IN (${placeholders})`);
    params.push(...filters.fed_districts);
  }

  const where = conditions.join(" AND ");

  // Step 1: Get category-level aggregates via SQL (bounded by category count)
  const catRows = await sql.unsafe(
    `SELECT ef.fee_category,
            COUNT(DISTINCT ef.crawl_target_id) as institution_count,
            COUNT(*) as total_count,
            SUM(CASE WHEN ef.review_status = 'flagged' THEN 1 ELSE 0 END) as flagged_count
     FROM extracted_fees ef
     JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
     WHERE ${where}
     GROUP BY ef.fee_category
     HAVING COUNT(CASE WHEN ef.amount > 0 THEN 1 END) >= 3`,
    params
  ) as {
    fee_category: string;
    institution_count: number;
    total_count: number;
    flagged_count: number;
  }[];

  // Step 2: Fetch amounts only for qualifying categories (for percentile computation)
  const categoryNames = catRows.map((r) => r.fee_category);
  if (categoryNames.length === 0) return [];

  const catPlaceholders = categoryNames.map((_, i) => `$${paramIdx + i}`).join(",");
  const amountRows = await sql.unsafe(
    `SELECT ef.fee_category, ef.amount
     FROM extracted_fees ef
     JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
     WHERE ${where} AND ef.fee_category IN (${catPlaceholders}) AND ef.amount > 0`,
    [...params, ...categoryNames]
  ) as {
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
      institution_count: Number(cat.institution_count),
      min_amount: stats.min,
      max_amount: stats.max,
      median_amount: stats.median,
      p25_amount: stats.p25,
      p75_amount: stats.p75,
      iqr,
      range_width,
      flagged_count: Number(cat.flagged_count),
      flag_rate: Number(cat.total_count) > 0 ? Number(cat.flagged_count) / Number(cat.total_count) : 0,
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

export async function getRiskOutliers(filters?: {
  charter_type?: string;
  asset_tiers?: string[];
  fed_districts?: number[];
}): Promise<RiskOutlierData> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (filters?.charter_type) {
    conditions.push(`ct.charter_type = $${paramIdx++}`);
    params.push(filters.charter_type);
  }
  if (filters?.asset_tiers && filters.asset_tiers.length > 0) {
    const placeholders = filters.asset_tiers.map(() => `$${paramIdx++}`).join(",");
    conditions.push(`ct.asset_size_tier IN (${placeholders})`);
    params.push(...filters.asset_tiers);
  }
  if (filters?.fed_districts && filters.fed_districts.length > 0) {
    const placeholders = filters.fed_districts.map(() => `$${paramIdx++}`).join(",");
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
  const flagged = await sql.unsafe(
    `SELECT ef.fee_category,
            SUM(CASE WHEN ef.review_status = 'flagged' THEN 1 ELSE 0 END) as flagged_count,
            COUNT(*) as total_count
     FROM extracted_fees ef
     JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
     ${efWhere}
     GROUP BY ef.fee_category
     HAVING SUM(CASE WHEN ef.review_status = 'flagged' THEN 1 ELSE 0 END) > 0
     ORDER BY flagged_count DESC
     LIMIT 5`,
    params
  ) as {
    fee_category: string;
    flagged_count: number;
    total_count: number;
  }[];

  // Repeated failures
  const failures = await sql.unsafe(
    `SELECT ct.id, ct.institution_name, ct.consecutive_failures, ct.last_crawl_at
     FROM crawl_targets ct
     ${ctWhere ? ctWhere + " AND" : "WHERE"} ct.consecutive_failures > 3
     ORDER BY ct.consecutive_failures DESC
     LIMIT 10`,
    params
  ) as {
    id: number;
    institution_name: string;
    consecutive_failures: number;
    last_crawl_at: string | null;
  }[];

  // Extreme outliers: fees > 3x the category median
  // First get category medians
  const catRows = await sql.unsafe(
    `SELECT ef.fee_category, ef.amount
     FROM extracted_fees ef
     JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
     ${efWhere}
     AND ef.amount IS NOT NULL AND ef.amount > 0`,
    params
  ) as { fee_category: string; amount: number }[];

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

  // Re-query top outliers with institution info
  const outlierFees = await sql.unsafe(
    `SELECT ef.id, ef.fee_name, ef.amount, ef.fee_category,
            ct.institution_name, ef.crawl_target_id
     FROM extracted_fees ef
     JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
     ${efWhere}
     AND ef.amount IS NOT NULL
     ORDER BY ef.amount DESC
     LIMIT 10`,
    params
  ) as {
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
    top_flagged_categories: flagged.map(f => ({
      ...f,
      flagged_count: Number(f.flagged_count),
      total_count: Number(f.total_count),
    })),
    repeated_failures: failures.map(f => ({
      ...f,
      consecutive_failures: Number(f.consecutive_failures),
    })),
    extreme_outlier_fees: extremeOutliers.slice(0, 5),
  };
}

export interface DailyTrend {
  date: string;
  institutions: number;
  fees_extracted: number;
  fee_urls: number;
}

export async function getDailyTrends(days = 14): Promise<DailyTrend[]> {
  return await sql.unsafe(
    `SELECT cr.crawled_at::date as date,
            COUNT(DISTINCT cr.crawl_target_id) as institutions,
            SUM(cr.fees_extracted) as fees_extracted,
            COUNT(DISTINCT CASE WHEN cr.fees_extracted > 0 THEN cr.crawl_target_id END) as fee_urls
     FROM crawl_results cr
     WHERE cr.crawled_at > NOW() - INTERVAL '1 day' * $1
     GROUP BY cr.crawled_at::date
     ORDER BY date ASC`,
    [days]
  ) as DailyTrend[];
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

export async function getRecentCrawlActivity(
  filters?: {
    charter_type?: string;
    asset_tiers?: string[];
    fed_districts?: number[];
  },
  limit = 20
): Promise<RecentCrawlResult[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (filters?.charter_type) {
    conditions.push(`ct.charter_type = $${paramIdx++}`);
    params.push(filters.charter_type);
  }
  if (filters?.asset_tiers && filters.asset_tiers.length > 0) {
    const placeholders = filters.asset_tiers.map(() => `$${paramIdx++}`).join(",");
    conditions.push(`ct.asset_size_tier IN (${placeholders})`);
    params.push(...filters.asset_tiers);
  }
  if (filters?.fed_districts && filters.fed_districts.length > 0) {
    const placeholders = filters.fed_districts.map(() => `$${paramIdx++}`).join(",");
    conditions.push(`ct.fed_district IN (${placeholders})`);
    params.push(...filters.fed_districts);
  }

  const where =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  return await sql.unsafe(
    `SELECT cr.crawl_target_id, ct.institution_name, ct.charter_type,
            ct.state_code, ct.asset_size_tier, ct.fed_district,
            cr.status, cr.fees_extracted, cr.crawled_at,
            conf.extraction_confidence
     FROM crawl_results cr
     JOIN crawl_targets ct ON cr.crawl_target_id = ct.id
     LEFT JOIN (
       SELECT crawl_result_id, AVG(extraction_confidence) as extraction_confidence
       FROM extracted_fees
       GROUP BY crawl_result_id
     ) conf ON conf.crawl_result_id = cr.id
     ${where}
     ORDER BY cr.crawled_at DESC
     LIMIT $${paramIdx}`,
    [...params, limit]
  ) as RecentCrawlResult[];
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

export async function getRecentReviews(limit = 15): Promise<RecentReviewAction[]> {
  return await sql`
    SELECT fr.fee_id, ef.fee_name, ef.fee_category,
           ct.institution_name, ef.crawl_target_id,
           fr.action, fr.username, fr.previous_status, fr.new_status,
           fr.created_at
    FROM fee_reviews fr
    JOIN extracted_fees ef ON fr.fee_id = ef.id
    JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
    ORDER BY fr.created_at DESC
    LIMIT ${limit}` as RecentReviewAction[];
}
