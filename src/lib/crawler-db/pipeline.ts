import { getDb } from "./connection";

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

export function getPipelineStats(): PipelineStats {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as c FROM crawl_targets").get() as { c: number }).c;
  const withWebsite = (db.prepare("SELECT COUNT(*) as c FROM crawl_targets WHERE website_url IS NOT NULL").get() as { c: number }).c;
  const withFeeUrl = (db.prepare("SELECT COUNT(*) as c FROM crawl_targets WHERE fee_schedule_url IS NOT NULL").get() as { c: number }).c;
  const withFees = (db.prepare("SELECT COUNT(DISTINCT crawl_target_id) as c FROM extracted_fees WHERE review_status != 'rejected'").get() as { c: number }).c;
  const withApproved = (db.prepare("SELECT COUNT(DISTINCT crawl_target_id) as c FROM extracted_fees WHERE review_status = 'approved'").get() as { c: number }).c;
  const stale = (db.prepare("SELECT COUNT(*) as c FROM crawl_targets WHERE fee_schedule_url IS NOT NULL AND (last_crawl_at < datetime('now', '-90 days') OR last_crawl_at IS NULL)").get() as { c: number }).c;
  const failing = (db.prepare("SELECT COUNT(*) as c FROM crawl_targets WHERE consecutive_failures > 3").get() as { c: number }).c;

  return { total_institutions: total, with_website: withWebsite, with_fee_url: withFeeUrl, with_fees: withFees, with_approved: withApproved, stale_count: stale, failing_count: failing };
}

export function getCoverageGaps(opts: {
  status?: string;
  charter?: string;
  state?: string;
  search?: string;
  sort?: string;
  dir?: string;
  limit?: number;
  offset?: number;
}): { institutions: CoverageGap[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  // Status filter
  if (opts.status === "no_url") {
    conditions.push("ct.fee_schedule_url IS NULL");
  } else if (opts.status === "failing") {
    conditions.push("ct.consecutive_failures > 3");
  } else if (opts.status === "stale") {
    conditions.push("ct.fee_schedule_url IS NOT NULL");
    conditions.push("(ct.last_crawl_at < datetime('now', '-90 days') OR ct.last_crawl_at IS NULL)");
  } else if (opts.status === "no_fees") {
    conditions.push("ct.fee_schedule_url IS NOT NULL");
    conditions.push("ct.id NOT IN (SELECT DISTINCT crawl_target_id FROM extracted_fees WHERE review_status != 'rejected')");
  }

  // Default: exclude institutions that already have fees
  if (!opts.status) {
    conditions.push("ct.id NOT IN (SELECT DISTINCT crawl_target_id FROM extracted_fees WHERE review_status != 'rejected')");
  }

  if (opts.charter) {
    conditions.push("ct.charter_type = ?");
    params.push(opts.charter);
  }
  if (opts.state) {
    conditions.push("ct.state_code = ?");
    params.push(opts.state);
  }
  if (opts.search) {
    conditions.push("ct.institution_name LIKE ?");
    params.push(`%${opts.search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortCol = SORT_COLUMNS[opts.sort || "asset_size"] || "ct.asset_size";
  const sortDir = opts.dir === "asc" ? "ASC" : "DESC";
  const limit = opts.limit || 50;
  const offset = opts.offset || 0;

  const countRow = db.prepare(`SELECT COUNT(*) as c FROM crawl_targets ct ${where}`).get(...params) as { c: number };

  const rows = db.prepare(`
    SELECT ct.id, ct.institution_name, ct.state_code, ct.charter_type,
           ct.asset_size, ct.website_url, ct.fee_schedule_url,
           ct.last_crawl_at, ct.consecutive_failures,
           COALESCE(fc.fee_count, 0) as fee_count
    FROM crawl_targets ct
    LEFT JOIN (
      SELECT crawl_target_id, COUNT(*) as fee_count
      FROM extracted_fees WHERE review_status != 'rejected'
      GROUP BY crawl_target_id
    ) fc ON ct.id = fc.crawl_target_id
    ${where}
    ORDER BY ${sortCol} ${sortDir} NULLS LAST
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as (CoverageGap & { fee_count: number })[];

  const institutions = rows.map((r) => ({
    ...r,
    status: computeStatus(r),
  }));

  return { institutions, total: countRow.c };
}

function computeStatus(r: { fee_schedule_url: string | null; fee_count: number; consecutive_failures: number; last_crawl_at: string | null }): CoverageGap["status"] {
  if (!r.fee_schedule_url) return "no_url";
  if (r.consecutive_failures > 3) return "failing";
  if (r.fee_count === 0) return "no_fees";
  return "stale";
}

export function getRecentCrawls(limit = 20): RecentCrawl[] {
  const db = getDb();
  return db.prepare(`
    SELECT cr.id, cr.crawl_target_id, ct.institution_name,
           cr.status, cr.fees_extracted, cr.crawled_at, cr.error_message
    FROM crawl_results cr
    JOIN crawl_targets ct ON cr.crawl_target_id = ct.id
    ORDER BY cr.crawled_at DESC
    LIMIT ?
  `).all(limit) as RecentCrawl[];
}

export function getDistinctStates(): string[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT DISTINCT state_code FROM crawl_targets WHERE state_code IS NOT NULL ORDER BY state_code"
  ).all() as { state_code: string }[];
  return rows.map((r) => r.state_code);
}
