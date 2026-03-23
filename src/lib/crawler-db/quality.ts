import { sql } from "./connection";

export interface CoverageFunnel {
  total_institutions: number;
  with_website: number;
  with_fee_url: number;
  with_fees: number;
  with_approved: number;
}

export interface UncategorizedFee {
  fee_name: string;
  count: number;
}

export interface StaleInstitution {
  id: number;
  institution_name: string;
  state_code: string | null;
  last_crawl_at: string | null;
  days_stale: number;
}

export interface CrawlRunSummary {
  id: number;
  started_at: string;
  targets_crawled: number;
  targets_succeeded: number;
  targets_failed: number;
  targets_unchanged: number;
  fees_extracted: number;
  success_rate: number;
}

export interface DiscoveryMethodStats {
  discovery_method: string;
  total_attempts: number;
  found_count: number;
  success_rate: number;
}

export interface FailureReasonStats {
  failure_reason: string;
  count: number;
}

export interface TierCoverage {
  asset_size_tier: string;
  total: number;
  with_fees: number;
  coverage_pct: number;
}

export interface DistrictCoverage {
  fed_district: number;
  total: number;
  with_fees: number;
  coverage_pct: number;
}

export async function getCoverageFunnel(): Promise<CoverageFunnel> {
  const [totalRow] = await sql`SELECT COUNT(*) as cnt FROM crawl_targets`;
  const [withWebsiteRow] = await sql`SELECT COUNT(*) as cnt FROM crawl_targets WHERE website_url IS NOT NULL`;
  const [withFeeUrlRow] = await sql`SELECT COUNT(*) as cnt FROM crawl_targets WHERE fee_schedule_url IS NOT NULL`;
  const [withFeesRow] = await sql`SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM extracted_fees`;
  const [withApprovedRow] = await sql`SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM extracted_fees WHERE review_status = 'approved'`;

  return {
    total_institutions: totalRow.cnt,
    with_website: withWebsiteRow.cnt,
    with_fee_url: withFeeUrlRow.cnt,
    with_fees: withFeesRow.cnt,
    with_approved: withApprovedRow.cnt,
  };
}

export async function getTopUncategorized(limit = 20): Promise<UncategorizedFee[]> {
  return await sql`
    SELECT fee_name, COUNT(*) as count
    FROM extracted_fees
    WHERE fee_category IS NULL
    GROUP BY fee_name
    ORDER BY count DESC
    LIMIT ${limit}
  ` as UncategorizedFee[];
}

export async function getStaleInstitutions(daysSince = 90, limit = 20): Promise<StaleInstitution[]> {
  return await sql`
    SELECT
      id, institution_name, state_code, last_crawl_at,
      EXTRACT(DAY FROM NOW() - last_crawl_at)::int as days_stale
    FROM crawl_targets
    WHERE fee_schedule_url IS NOT NULL
      AND last_crawl_at IS NOT NULL
      AND NOW() - last_crawl_at > ${daysSince + ' days'}::interval
    ORDER BY days_stale DESC
    LIMIT ${limit}
  ` as StaleInstitution[];
}

export async function getRecentCrawlRuns(limit = 10): Promise<CrawlRunSummary[]> {
  const rows = await sql`
    SELECT
      id, started_at, targets_crawled, targets_succeeded,
      targets_failed, targets_unchanged, fees_extracted
    FROM crawl_runs
    WHERE status = 'completed'
    ORDER BY started_at DESC
    LIMIT ${limit}
  ` as Omit<CrawlRunSummary, "success_rate">[];

  return rows.map((r) => ({
    ...r,
    success_rate: r.targets_crawled > 0
      ? Math.round((r.targets_succeeded / r.targets_crawled) * 100)
      : 0,
  }));
}

export async function getDiscoveryMethodStats(): Promise<DiscoveryMethodStats[]> {
  try {
    const rows = await sql`
      SELECT
        discovery_method,
        COUNT(*) as total_attempts,
        SUM(CASE WHEN result = 'found' THEN 1 ELSE 0 END) as found_count
      FROM discovery_cache
      GROUP BY discovery_method
      ORDER BY total_attempts DESC
    ` as { discovery_method: string; total_attempts: number; found_count: number }[];

    return rows.map((r) => ({
      ...r,
      success_rate: r.total_attempts > 0
        ? Math.round((r.found_count / r.total_attempts) * 100)
        : 0,
    }));
  } catch {
    return [];
  }
}

export async function getFailureReasons(limit = 10): Promise<FailureReasonStats[]> {
  return await sql`
    SELECT
      COALESCE(failure_reason, 'unknown') as failure_reason,
      COUNT(*) as count
    FROM crawl_targets
    WHERE failure_reason IS NOT NULL
    GROUP BY failure_reason
    ORDER BY count DESC
    LIMIT ${limit}
  ` as FailureReasonStats[];
}

export async function getTierCoverage(): Promise<TierCoverage[]> {
  return await sql`
    SELECT
      COALESCE(t.asset_size_tier, 'unknown') as asset_size_tier,
      COUNT(*) as total,
      COUNT(DISTINCT e.crawl_target_id) as with_fees,
      ROUND(COUNT(DISTINCT e.crawl_target_id) * 100.0 / GREATEST(COUNT(*), 1), 1) as coverage_pct
    FROM crawl_targets t
    LEFT JOIN extracted_fees e ON e.crawl_target_id = t.id
    WHERE t.asset_size_tier IS NOT NULL
    GROUP BY t.asset_size_tier
    ORDER BY
      CASE t.asset_size_tier
        WHEN 'super_regional' THEN 1
        WHEN 'large_regional' THEN 2
        WHEN 'regional' THEN 3
        WHEN 'community_large' THEN 4
        WHEN 'community_mid' THEN 5
        WHEN 'community_small' THEN 6
        ELSE 7
      END
  ` as TierCoverage[];
}

export interface RevenueDiscrepancy {
  id: number;
  institution_name: string;
  state_code: string | null;
  charter_type: string | null;
  service_charge_income: number;
  extracted_fee_total: number;
  ratio: number;
  fee_count: number;
}

export async function getRevenueDiscrepancies(limit = 20): Promise<RevenueDiscrepancy[]> {
  return await sql`
    SELECT
      t.id,
      t.institution_name,
      t.state_code,
      t.charter_type,
      f.service_charge_income,
      COALESCE(e.total_amount, 0) as extracted_fee_total,
      CASE WHEN COALESCE(e.total_amount, 0) > 0
        THEN f.service_charge_income * 1.0 / e.total_amount
        ELSE 999
      END as ratio,
      COALESCE(e.fee_count, 0) as fee_count
    FROM (
      SELECT crawl_target_id, service_charge_income
      FROM institution_financials
      WHERE (crawl_target_id, report_date) IN (
        SELECT crawl_target_id, MAX(report_date)
        FROM institution_financials
        GROUP BY crawl_target_id
      )
    ) f
    JOIN crawl_targets t ON t.id = f.crawl_target_id
    LEFT JOIN (
      SELECT
        crawl_target_id,
        SUM(CASE WHEN amount IS NOT NULL THEN amount * 12 ELSE 0 END) as total_amount,
        COUNT(*) as fee_count
      FROM extracted_fees
      WHERE review_status != 'rejected'
      GROUP BY crawl_target_id
    ) e ON e.crawl_target_id = t.id
    WHERE f.service_charge_income > 100
      AND e.fee_count > 0
      AND (
        f.service_charge_income * 1.0 / NULLIF(e.total_amount, 0) > 10
        OR f.service_charge_income * 1.0 / NULLIF(e.total_amount, 0) < 0.1
      )
    ORDER BY f.service_charge_income DESC
    LIMIT ${limit}
  ` as RevenueDiscrepancy[];
}

export async function getDistrictCoverage(): Promise<DistrictCoverage[]> {
  return await sql`
    SELECT
      t.fed_district,
      COUNT(*) as total,
      COUNT(DISTINCT e.crawl_target_id) as with_fees,
      ROUND(COUNT(DISTINCT e.crawl_target_id) * 100.0 / GREATEST(COUNT(*), 1), 1) as coverage_pct
    FROM crawl_targets t
    LEFT JOIN extracted_fees e ON e.crawl_target_id = t.id
    WHERE t.fed_district IS NOT NULL
    GROUP BY t.fed_district
    ORDER BY t.fed_district
  ` as DistrictCoverage[];
}
