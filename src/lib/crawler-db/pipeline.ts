import { sql } from "./connection";

/** Institutions with more than this many consecutive failures are considered "failing" */
export const FAILURE_THRESHOLD = 3;
/** Days since last crawl before an institution is considered "stale" */
export const STALE_DAYS = 90;

export interface CoverageGap {
  id: number;
  institution_name: string;
  state_code: string | null;
  charter_type: string;
  asset_size: number | null;
  website_url: string | null;
  fee_schedule_url: string | null;
  last_crawl_at: string | null;
  consecutive_failures: number;
  fee_count: number;
  status: "no_url" | "no_fees" | "failing" | "stale";
  last_error: string | null;
}

export interface PipelineStats {
  total_institutions: number;
  with_website: number;
  with_fee_url: number;
  with_fees: number;
  with_approved: number;
  stale_count: number;
  failing_count: number;
}

export interface RecentCrawl {
  id: number;
  crawl_target_id: number;
  institution_name: string;
  status: string;
  fees_extracted: number;
  crawled_at: string;
  error_message: string | null;
}

const SORT_COLUMNS: Record<string, string> = {
  asset_size: "ct.asset_size",
  institution: "ct.institution_name",
  state: "ct.state_code",
  failures: "ct.consecutive_failures",
  last_crawl: "ct.last_crawl_at",
};

export async function getPipelineStats(): Promise<PipelineStats> {
  // Consolidate crawl_targets counts into 1 query
  const [ct] = await sql.unsafe(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN website_url IS NOT NULL AND website_url != '' THEN 1 ELSE 0 END) as with_website,
      SUM(CASE WHEN fee_schedule_url IS NOT NULL AND fee_schedule_url != '' THEN 1 ELSE 0 END) as with_fee_url,
      SUM(CASE WHEN fee_schedule_url IS NOT NULL AND (last_crawl_at < NOW() - INTERVAL '${STALE_DAYS} days' OR last_crawl_at IS NULL) THEN 1 ELSE 0 END) as stale,
      SUM(CASE WHEN consecutive_failures > $1 THEN 1 ELSE 0 END) as failing
    FROM crawl_targets`,
    [FAILURE_THRESHOLD]
  ) as { total: number; with_website: number; with_fee_url: number; stale: number; failing: number }[];

  // Consolidate extracted_fees counts into 1 query
  const [ef] = await sql<{ with_fees: number; with_approved: number }[]>`
    SELECT
      COUNT(DISTINCT CASE WHEN review_status != 'rejected' THEN crawl_target_id END) as with_fees,
      COUNT(DISTINCT CASE WHEN review_status = 'approved' THEN crawl_target_id END) as with_approved
    FROM extracted_fees`;

  return {
    total_institutions: ct.total,
    with_website: ct.with_website,
    with_fee_url: ct.with_fee_url,
    with_fees: ef.with_fees,
    with_approved: ef.with_approved,
    stale_count: ct.stale,
    failing_count: ct.failing,
  };
}

/** Consolidated pipeline stage data -- replaces 12+ individual COUNT queries */
export interface PipelineStageCounts {
  total: number;
  hasWebsite: number;
  hasUrl: number;
  withFees: number;
  needCrawl: number;
  failedCrawl: number;
  totalFees: number;
  categorized: number;
  approved: number;
  staged: number;
  flagged: number;
  rejected: number;
  stateGaps: { state_code: string; count: number }[];
}

export async function getPipelineStageCounts(): Promise<PipelineStageCounts> {
  // 1 query for all crawl_targets counts
  const [ct] = await sql<{ total: number; has_website: number; has_url: number; failed_crawl: number }[]>`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN website_url IS NOT NULL AND website_url != '' THEN 1 ELSE 0 END) as has_website,
      SUM(CASE WHEN fee_schedule_url IS NOT NULL AND fee_schedule_url != '' THEN 1 ELSE 0 END) as has_url,
      SUM(CASE WHEN fee_schedule_url IS NOT NULL AND consecutive_failures >= 5 THEN 1 ELSE 0 END) as failed_crawl
    FROM crawl_targets`;

  // 1 query for all extracted_fees counts
  const [ef] = await sql<{ with_fees: number; total_fees: number; categorized: number; approved: number; staged: number; flagged: number; rejected: number }[]>`
    SELECT
      COUNT(DISTINCT CASE WHEN review_status != 'rejected' THEN crawl_target_id END) as with_fees,
      SUM(CASE WHEN review_status != 'rejected' THEN 1 ELSE 0 END) as total_fees,
      SUM(CASE WHEN fee_category IS NOT NULL AND fee_category != '' AND review_status != 'rejected' THEN 1 ELSE 0 END) as categorized,
      SUM(CASE WHEN review_status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN review_status = 'staged' THEN 1 ELSE 0 END) as staged,
      SUM(CASE WHEN review_status = 'flagged' THEN 1 ELSE 0 END) as flagged,
      SUM(CASE WHEN review_status = 'rejected' THEN 1 ELSE 0 END) as rejected
    FROM extracted_fees`;

  // Need crawl count
  const [nc] = await sql<{ c: number }[]>`
    SELECT COUNT(*) as c FROM crawl_targets ct
    WHERE ct.fee_schedule_url IS NOT NULL AND ct.fee_schedule_url != ''
    AND NOT EXISTS (SELECT 1 FROM extracted_fees ef WHERE ef.crawl_target_id = ct.id AND ef.review_status != 'rejected')
    AND ct.consecutive_failures < 5`;

  // Top state gaps
  const stateGaps = await sql<{ state_code: string; count: number }[]>`
    SELECT ct.state_code, COUNT(*) as count FROM crawl_targets ct
    WHERE ct.fee_schedule_url IS NOT NULL AND ct.fee_schedule_url != ''
    AND NOT EXISTS (SELECT 1 FROM extracted_fees ef WHERE ef.crawl_target_id = ct.id AND ef.review_status != 'rejected')
    AND ct.consecutive_failures < 5
    GROUP BY ct.state_code ORDER BY count DESC LIMIT 6`;

  return {
    total: ct.total,
    hasWebsite: ct.has_website,
    hasUrl: ct.has_url,
    withFees: ef.with_fees,
    needCrawl: nc.c,
    failedCrawl: ct.failed_crawl,
    totalFees: ef.total_fees,
    categorized: ef.categorized,
    approved: ef.approved,
    staged: ef.staged,
    flagged: ef.flagged,
    rejected: ef.rejected,
    stateGaps: stateGaps as { state_code: string; count: number }[],
  };
}

export interface CoverageSnapshot {
  snapshot_date: string;
  total_institutions: number;
  with_fee_url: number;
  with_fees: number;
  with_approved: number;
  total_fees: number;
  approved_fees: number;
}

export async function getCoverageSnapshots(limit: number = 30): Promise<CoverageSnapshot[]> {
  try {
    return await sql`
      SELECT snapshot_date, total_institutions, with_fee_url, with_fees, with_approved, total_fees, approved_fees
      FROM coverage_snapshots
      ORDER BY snapshot_date DESC
      LIMIT ${limit}` as CoverageSnapshot[];
  } catch {
    return [];
  }
}

export async function getCoverageGaps(opts: {
  status?: string;
  charter?: string;
  state?: string;
  search?: string;
  sort?: string;
  dir?: string;
  limit?: number;
  offset?: number;
}): Promise<{ institutions: CoverageGap[]; total: number }> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  // Status filter
  if (opts.status === "no_url") {
    conditions.push("ct.fee_schedule_url IS NULL");
  } else if (opts.status === "failing") {
    conditions.push(`ct.consecutive_failures > ${FAILURE_THRESHOLD}`);
  } else if (opts.status === "stale") {
    conditions.push("ct.fee_schedule_url IS NOT NULL");
    conditions.push("(ct.last_crawl_at < NOW() - INTERVAL '90 days' OR ct.last_crawl_at IS NULL)");
  } else if (opts.status === "no_fees") {
    conditions.push("ct.fee_schedule_url IS NOT NULL");
    conditions.push("ct.id NOT IN (SELECT DISTINCT crawl_target_id FROM extracted_fees WHERE review_status != 'rejected')");
  }

  // Default: exclude institutions that already have fees
  if (!opts.status) {
    conditions.push("ct.id NOT IN (SELECT DISTINCT crawl_target_id FROM extracted_fees WHERE review_status != 'rejected')");
  }

  if (opts.charter) {
    conditions.push(`ct.charter_type = $${paramIdx++}`);
    params.push(opts.charter);
  }
  if (opts.state) {
    conditions.push(`ct.state_code = $${paramIdx++}`);
    params.push(opts.state);
  }
  if (opts.search) {
    conditions.push(`ct.institution_name ILIKE $${paramIdx++}`);
    params.push(`%${opts.search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortCol = SORT_COLUMNS[opts.sort || "asset_size"] || "ct.asset_size";
  const sortDir = opts.dir === "asc" ? "ASC" : "DESC";
  const limit = opts.limit || 50;
  const offset = opts.offset || 0;

  const [countRow] = await sql.unsafe(
    `SELECT COUNT(*) as c FROM crawl_targets ct ${where}`,
    params
  ) as { c: number }[];

  const rows = await sql.unsafe(
    `SELECT ct.id, ct.institution_name, ct.state_code, ct.charter_type,
           ct.asset_size, ct.website_url, ct.fee_schedule_url,
           ct.last_crawl_at, ct.consecutive_failures,
           COALESCE(fc.fee_count, 0) as fee_count,
           lr.error_message as last_error
    FROM crawl_targets ct
    LEFT JOIN (
      SELECT crawl_target_id, COUNT(*) as fee_count
      FROM extracted_fees WHERE review_status != 'rejected'
      GROUP BY crawl_target_id
    ) fc ON ct.id = fc.crawl_target_id
    LEFT JOIN (
      SELECT crawl_target_id, error_message,
             ROW_NUMBER() OVER (PARTITION BY crawl_target_id ORDER BY crawled_at DESC) as rn
      FROM crawl_results WHERE status = 'failed'
    ) lr ON ct.id = lr.crawl_target_id AND lr.rn = 1
    ${where}
    ORDER BY ${sortCol} ${sortDir} NULLS LAST
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset]
  ) as (CoverageGap & { fee_count: number })[];

  const institutions = rows.map((r) => ({
    ...r,
    status: computeStatus(r),
  }));

  return { institutions, total: countRow.c };
}

function computeStatus(r: { fee_schedule_url: string | null; fee_count: number; consecutive_failures: number; last_crawl_at: string | null }): CoverageGap["status"] {
  if (!r.fee_schedule_url) return "no_url";
  if (r.consecutive_failures > FAILURE_THRESHOLD) return "failing";
  if (r.fee_count === 0) return "no_fees";
  return "stale";
}

export async function getRecentCrawls(limit = 20): Promise<RecentCrawl[]> {
  return await sql`
    SELECT cr.id, cr.crawl_target_id, ct.institution_name,
           cr.status, cr.fees_extracted, cr.crawled_at, cr.error_message
    FROM crawl_results cr
    JOIN crawl_targets ct ON cr.crawl_target_id = ct.id
    ORDER BY cr.crawled_at DESC
    LIMIT ${limit}` as RecentCrawl[];
}

export async function getDistinctStates(): Promise<string[]> {
  const rows = await sql<{ state_code: string }[]>`
    SELECT DISTINCT state_code FROM crawl_targets WHERE state_code IS NOT NULL ORDER BY state_code`;
  return rows.map((r) => r.state_code);
}
