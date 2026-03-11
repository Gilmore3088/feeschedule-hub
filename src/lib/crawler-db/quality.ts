import { getDb } from "./connection";

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

export function getCoverageFunnel(): CoverageFunnel {
  const db = getDb();
  try {
    const total = (db.prepare("SELECT COUNT(*) as cnt FROM crawl_targets").get() as { cnt: number }).cnt;
    const withWebsite = (db.prepare("SELECT COUNT(*) as cnt FROM crawl_targets WHERE website_url IS NOT NULL").get() as { cnt: number }).cnt;
    const withFeeUrl = (db.prepare("SELECT COUNT(*) as cnt FROM crawl_targets WHERE fee_schedule_url IS NOT NULL").get() as { cnt: number }).cnt;
    const withFees = (db.prepare("SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM extracted_fees").get() as { cnt: number }).cnt;
    const withApproved = (db.prepare("SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM extracted_fees WHERE review_status = 'approved'").get() as { cnt: number }).cnt;

    return {
      total_institutions: total,
      with_website: withWebsite,
      with_fee_url: withFeeUrl,
      with_fees: withFees,
      with_approved: withApproved,
    };
  } finally {
    db.close();
  }
}

export function getTopUncategorized(limit = 20): UncategorizedFee[] {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT fee_name, COUNT(*) as count
      FROM extracted_fees
      WHERE fee_category IS NULL
      GROUP BY fee_name
      ORDER BY count DESC
      LIMIT ?
    `).all(limit) as UncategorizedFee[];
  } finally {
    db.close();
  }
}

export function getStaleInstitutions(daysSince = 90, limit = 20): StaleInstitution[] {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT
        id, institution_name, state_code, last_crawl_at,
        CAST(julianday('now') - julianday(last_crawl_at) AS INTEGER) as days_stale
      FROM crawl_targets
      WHERE fee_schedule_url IS NOT NULL
        AND last_crawl_at IS NOT NULL
        AND julianday('now') - julianday(last_crawl_at) > ?
      ORDER BY days_stale DESC
      LIMIT ?
    `).all(daysSince, limit) as StaleInstitution[];
  } finally {
    db.close();
  }
}

export function getRecentCrawlRuns(limit = 10): CrawlRunSummary[] {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT
        id, started_at, targets_crawled, targets_succeeded,
        targets_failed, targets_unchanged, fees_extracted
      FROM crawl_runs
      WHERE status = 'completed'
      ORDER BY started_at DESC
      LIMIT ?
    `).all(limit) as Omit<CrawlRunSummary, "success_rate">[];

    return rows.map((r) => ({
      ...r,
      success_rate: r.targets_crawled > 0
        ? Math.round((r.targets_succeeded / r.targets_crawled) * 100)
        : 0,
    }));
  } finally {
    db.close();
  }
}

export function getDiscoveryMethodStats(): DiscoveryMethodStats[] {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT
        discovery_method,
        COUNT(*) as total_attempts,
        SUM(CASE WHEN result = 'found' THEN 1 ELSE 0 END) as found_count
      FROM discovery_cache
      GROUP BY discovery_method
      ORDER BY total_attempts DESC
    `).all() as { discovery_method: string; total_attempts: number; found_count: number }[];

    return rows.map((r) => ({
      ...r,
      success_rate: r.total_attempts > 0
        ? Math.round((r.found_count / r.total_attempts) * 100)
        : 0,
    }));
  } finally {
    db.close();
  }
}

export function getFailureReasons(limit = 10): FailureReasonStats[] {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT
        COALESCE(failure_reason, 'unknown') as failure_reason,
        COUNT(*) as count
      FROM crawl_targets
      WHERE failure_reason IS NOT NULL
      GROUP BY failure_reason
      ORDER BY count DESC
      LIMIT ?
    `).all(limit) as FailureReasonStats[];
  } finally {
    db.close();
  }
}

export function getTierCoverage(): TierCoverage[] {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT
        COALESCE(t.asset_size_tier, 'unknown') as asset_size_tier,
        COUNT(*) as total,
        COUNT(DISTINCT e.crawl_target_id) as with_fees,
        ROUND(COUNT(DISTINCT e.crawl_target_id) * 100.0 / MAX(COUNT(*), 1), 1) as coverage_pct
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
    `).all() as TierCoverage[];
  } finally {
    db.close();
  }
}

export function getDistrictCoverage(): DistrictCoverage[] {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT
        t.fed_district,
        COUNT(*) as total,
        COUNT(DISTINCT e.crawl_target_id) as with_fees,
        ROUND(COUNT(DISTINCT e.crawl_target_id) * 100.0 / MAX(COUNT(*), 1), 1) as coverage_pct
      FROM crawl_targets t
      LEFT JOIN extracted_fees e ON e.crawl_target_id = t.id
      WHERE t.fed_district IS NOT NULL
      GROUP BY t.fed_district
      ORDER BY t.fed_district
    `).all() as DistrictCoverage[];
  } finally {
    db.close();
  }
}
