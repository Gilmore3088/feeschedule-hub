/**
 * Admin dashboard queries — Postgres-native, all primitives out.
 *
 * Every function:
 * - Uses `sql` from connection.ts
 * - Wraps COUNT/SUM with Number()
 * - Converts dates with toDateStr()
 * - Has try/catch with safe fallback (never crashes the page)
 * - Returns plain objects (string | number | boolean only)
 */

import { sql } from "@/lib/crawler-db/connection";
import { toDateStr } from "@/lib/pg-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardStats {
  total_institutions: number;
  with_fees: number;
  with_urls: number;
  coverage_pct: number;
}

export interface ReviewQueueCounts {
  staged: number;
  flagged: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface RecentCrawlRun {
  id: number;
  started_at: string;
  completed_at: string;
  status: string;
  targets_crawled: number;
  targets_succeeded: number;
  fees_extracted: number;
  success_rate: number;
}

export interface RecentReview {
  fee_id: number;
  fee_name: string;
  fee_category: string | null;
  institution_name: string;
  action: string;
  username: string | null;
  created_at: string;
}

export interface StateCoverage {
  state_code: string;
  total: number;
  with_fees: number;
  pct: number;
}

export interface DiscoveryStatusRow {
  status: string;
  count: number;
}

export interface PipelineOverview {
  total_institutions: number;
  with_url: number;
  with_fees: number;
  crawl_runs: number;
}

export interface OpsJob {
  id: number;
  command: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  triggered_by: string | null;
  error_summary: string | null;
}

export interface JobQueueRow {
  queue: string;
  status: string;
  count: number;
}

export interface IntegrityCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
  count: number;
}

export interface CoverageFunnelData {
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

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const [totalRow] = await sql`SELECT COUNT(*) as cnt FROM crawl_targets`;
    const [urlRow] = await sql`SELECT COUNT(*) as cnt FROM crawl_targets WHERE fee_schedule_url IS NOT NULL`;
    const [feeRow] = await sql`SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM extracted_fees`;
    const total = Number(totalRow.cnt);
    const withUrls = Number(urlRow.cnt);
    const withFees = Number(feeRow.cnt);
    return {
      total_institutions: total,
      with_fees: withFees,
      with_urls: withUrls,
      coverage_pct: total > 0 ? Math.round((withFees / total) * 100) : 0,
    };
  } catch (e) {
    console.error("getDashboardStats failed:", e);
    return { total_institutions: 0, with_fees: 0, with_urls: 0, coverage_pct: 0 };
  }
}

export async function getReviewQueueCounts(): Promise<ReviewQueueCounts> {
  try {
    const rows = await sql`
      SELECT review_status, COUNT(*) as cnt
      FROM extracted_fees
      GROUP BY review_status
    `;
    const counts: ReviewQueueCounts = {
      staged: 0,
      flagged: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    for (const row of rows) {
      const status = String(row.review_status);
      const cnt = Number(row.cnt);
      if (status in counts) {
        counts[status as keyof ReviewQueueCounts] = cnt;
      }
    }
    return counts;
  } catch (e) {
    console.error("getReviewQueueCounts failed:", e);
    return { staged: 0, flagged: 0, pending: 0, approved: 0, rejected: 0 };
  }
}

export async function getRecentCrawlRuns(limit = 10): Promise<RecentCrawlRun[]> {
  try {
    const rows = await sql`
      SELECT
        id, started_at, completed_at, status,
        targets_crawled, targets_succeeded, fees_extracted
      FROM crawl_runs
      ORDER BY started_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      started_at: toDateStr(r.started_at as string | Date),
      completed_at: toDateStr(r.completed_at as string | Date),
      status: String(r.status),
      targets_crawled: Number(r.targets_crawled),
      targets_succeeded: Number(r.targets_succeeded),
      fees_extracted: Number(r.fees_extracted),
      success_rate:
        Number(r.targets_crawled) > 0
          ? Math.round((Number(r.targets_succeeded) / Number(r.targets_crawled)) * 100)
          : 0,
    }));
  } catch (e) {
    console.error("getRecentCrawlRuns failed:", e);
    return [];
  }
}

export async function getRecentReviews(limit = 10): Promise<RecentReview[]> {
  try {
    const rows = await sql`
      SELECT
        rl.fee_id,
        ef.fee_name,
        ef.fee_category,
        ct.institution_name,
        rl.action,
        u.username,
        rl.created_at
      FROM review_log rl
      JOIN extracted_fees ef ON ef.id = rl.fee_id
      JOIN crawl_targets ct ON ct.id = ef.crawl_target_id
      LEFT JOIN users u ON u.id = rl.user_id
      ORDER BY rl.created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      fee_id: Number(r.fee_id),
      fee_name: String(r.fee_name),
      fee_category: r.fee_category ? String(r.fee_category) : null,
      institution_name: String(r.institution_name),
      action: String(r.action),
      username: r.username ? String(r.username) : null,
      created_at: toDateStr(r.created_at as string | Date),
    }));
  } catch (e) {
    console.error("getRecentReviews failed:", e);
    return [];
  }
}

export async function getCoverageByState(): Promise<StateCoverage[]> {
  try {
    const rows = await sql`
      SELECT
        t.state_code,
        COUNT(*) as total,
        COUNT(DISTINCT e.crawl_target_id) as with_fees
      FROM crawl_targets t
      LEFT JOIN extracted_fees e ON e.crawl_target_id = t.id
      WHERE t.state_code IS NOT NULL
      GROUP BY t.state_code
      ORDER BY t.state_code
    `;
    return rows.map((r) => {
      const total = Number(r.total);
      const withFees = Number(r.with_fees);
      return {
        state_code: String(r.state_code),
        total,
        with_fees: withFees,
        pct: total > 0 ? Math.round((withFees / total) * 100) : 0,
      };
    });
  } catch (e) {
    console.error("getCoverageByState failed:", e);
    return [];
  }
}

export async function getDiscoveryStatus(): Promise<DiscoveryStatusRow[]> {
  try {
    const rows = await sql`
      SELECT status, COUNT(*) as cnt
      FROM ops_jobs
      GROUP BY status
      ORDER BY cnt DESC
    `;
    return rows.map((r) => ({
      status: String(r.status),
      count: Number(r.cnt),
    }));
  } catch (e) {
    console.error("getDiscoveryStatus failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export async function getPipelineOverview(): Promise<PipelineOverview> {
  try {
    const [totalRow] = await sql`SELECT COUNT(*) as cnt FROM crawl_targets`;
    const [urlRow] = await sql`SELECT COUNT(*) as cnt FROM crawl_targets WHERE fee_schedule_url IS NOT NULL`;
    const [feeRow] = await sql`SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM extracted_fees`;
    const [runRow] = await sql`SELECT COUNT(*) as cnt FROM crawl_runs`;
    return {
      total_institutions: Number(totalRow.cnt),
      with_url: Number(urlRow.cnt),
      with_fees: Number(feeRow.cnt),
      crawl_runs: Number(runRow.cnt),
    };
  } catch (e) {
    console.error("getPipelineOverview failed:", e);
    return { total_institutions: 0, with_url: 0, with_fees: 0, crawl_runs: 0 };
  }
}

export async function getRecentJobs(limit = 20): Promise<OpsJob[]> {
  try {
    const rows = await sql`
      SELECT id, command, status, created_at, started_at, completed_at,
             triggered_by, error_summary
      FROM ops_jobs
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      command: String(r.command),
      status: String(r.status),
      created_at: toDateStr(r.created_at as string | Date),
      started_at: r.started_at ? toDateStr(r.started_at as string | Date) : null,
      completed_at: r.completed_at ? toDateStr(r.completed_at as string | Date) : null,
      triggered_by: r.triggered_by ? String(r.triggered_by) : null,
      error_summary: r.error_summary ? String(r.error_summary) : null,
    }));
  } catch (e) {
    console.error("getRecentJobs failed:", e);
    return [];
  }
}

export async function getJobQueueStatus(): Promise<JobQueueRow[]> {
  try {
    const rows = await sql`
      SELECT
        COALESCE(command, 'unknown') as queue,
        status,
        COUNT(*) as cnt
      FROM ops_jobs
      GROUP BY command, status
      ORDER BY command, status
    `;
    return rows.map((r) => ({
      queue: String(r.queue),
      status: String(r.status),
      count: Number(r.cnt),
    }));
  } catch (e) {
    console.error("getJobQueueStatus failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Data Quality
// ---------------------------------------------------------------------------

export async function getIntegrityChecks(): Promise<IntegrityCheck[]> {
  const checks: IntegrityCheck[] = [];

  // 1. Orphaned fees
  try {
    const [row] = await sql`
      SELECT COUNT(*) as cnt
      FROM extracted_fees ef
      LEFT JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
      WHERE ct.id IS NULL
    `;
    const cnt = Number(row.cnt);
    checks.push({
      name: "No orphaned fees",
      status: cnt === 0 ? "pass" : "fail",
      detail: cnt === 0 ? "All fees linked to valid institutions" : `${cnt} fees with missing crawl_target`,
      count: cnt,
    });
  } catch {
    checks.push({ name: "No orphaned fees", status: "warn", detail: "Check failed", count: -1 });
  }

  // 2. Negative amounts
  try {
    const [row] = await sql`
      SELECT COUNT(*) as cnt FROM extracted_fees
      WHERE amount < 0 AND review_status != 'rejected'
    `;
    const cnt = Number(row.cnt);
    checks.push({
      name: "No negative amounts",
      status: cnt === 0 ? "pass" : "fail",
      detail: cnt === 0 ? "All fee amounts are non-negative" : `${cnt} fees with negative amounts`,
      count: cnt,
    });
  } catch {
    checks.push({ name: "No negative amounts", status: "warn", detail: "Check failed", count: -1 });
  }

  // 3. Extreme amounts (> $10,000)
  try {
    const [row] = await sql`
      SELECT COUNT(*) as cnt FROM extracted_fees
      WHERE amount > 10000 AND review_status != 'rejected'
    `;
    const cnt = Number(row.cnt);
    checks.push({
      name: "No extreme amounts (> $10k)",
      status: cnt === 0 ? "pass" : "warn",
      detail: cnt === 0 ? "No suspiciously large fee amounts" : `${cnt} fees exceed $10,000`,
      count: cnt,
    });
  } catch {
    checks.push({ name: "No extreme amounts (> $10k)", status: "warn", detail: "Check failed", count: -1 });
  }

  // 4. Duplicate institution names
  try {
    const [row] = await sql`
      SELECT COUNT(*) as cnt FROM (
        SELECT institution_name FROM crawl_targets
        GROUP BY institution_name HAVING COUNT(*) > 1
      ) sub
    `;
    const cnt = Number(row.cnt);
    checks.push({
      name: "No duplicate institution names",
      status: cnt === 0 ? "pass" : "warn",
      detail: cnt === 0 ? "All institution names are unique" : `${cnt} institution names appear more than once`,
      count: cnt,
    });
  } catch {
    checks.push({ name: "No duplicate institution names", status: "warn", detail: "Check failed", count: -1 });
  }

  // 5. Uncategorized fees
  try {
    const [row] = await sql`
      SELECT COUNT(*) as cnt FROM extracted_fees
      WHERE fee_category IS NULL AND review_status != 'rejected'
    `;
    const cnt = Number(row.cnt);
    checks.push({
      name: "All fees categorized",
      status: cnt === 0 ? "pass" : cnt < 50 ? "warn" : "fail",
      detail: cnt === 0 ? "Every non-rejected fee has a category" : `${cnt} fees missing category`,
      count: cnt,
    });
  } catch {
    checks.push({ name: "All fees categorized", status: "warn", detail: "Check failed", count: -1 });
  }

  // 6. Null amounts
  try {
    const [row] = await sql`
      SELECT COUNT(*) as cnt FROM extracted_fees
      WHERE amount IS NULL AND review_status != 'rejected'
        AND LOWER(fee_name) NOT LIKE '%free%'
        AND LOWER(fee_name) NOT LIKE '%waived%'
    `;
    const cnt = Number(row.cnt);
    checks.push({
      name: "All fees have amounts",
      status: cnt === 0 ? "pass" : cnt < 100 ? "warn" : "fail",
      detail: cnt === 0 ? "Every non-free fee has a dollar amount" : `${cnt} fees missing amount`,
      count: cnt,
    });
  } catch {
    checks.push({ name: "All fees have amounts", status: "warn", detail: "Check failed", count: -1 });
  }

  // 7. Stale institutions
  try {
    const [row] = await sql`
      SELECT COUNT(*) as cnt FROM crawl_targets
      WHERE last_crawl_at < NOW() - INTERVAL '90 days' OR last_crawl_at IS NULL
    `;
    const cnt = Number(row.cnt);
    checks.push({
      name: "Data freshness (90-day threshold)",
      status: cnt === 0 ? "pass" : "warn",
      detail: cnt === 0 ? "All institutions crawled within 90 days" : `${cnt} institutions not crawled in 90+ days`,
      count: cnt,
    });
  } catch {
    checks.push({ name: "Data freshness (90-day threshold)", status: "warn", detail: "Check failed", count: -1 });
  }

  // 8. Missing financials
  try {
    const [row] = await sql`
      SELECT COUNT(*) as cnt
      FROM crawl_targets ct
      LEFT JOIN institution_financials ifin ON ct.id = ifin.crawl_target_id
      WHERE ifin.id IS NULL
    `;
    const cnt = Number(row.cnt);
    checks.push({
      name: "Financial data linked",
      status: cnt === 0 ? "pass" : "warn",
      detail: cnt === 0 ? "All institutions have financial data" : `${cnt} institutions missing financials`,
      count: cnt,
    });
  } catch {
    checks.push({ name: "Financial data linked", status: "warn", detail: "Check failed", count: -1 });
  }

  // 9. Zombie jobs
  try {
    const [row] = await sql`
      SELECT COUNT(*) as cnt FROM ops_jobs
      WHERE status = 'running' AND started_at < NOW() - INTERVAL '2 hours'
    `;
    const cnt = Number(row.cnt);
    checks.push({
      name: "No zombie jobs",
      status: cnt === 0 ? "pass" : "fail",
      detail: cnt === 0 ? "No jobs stuck in running state" : `${cnt} jobs running for 2+ hours`,
      count: cnt,
    });
  } catch {
    checks.push({ name: "No zombie jobs", status: "warn", detail: "Check failed", count: -1 });
  }

  // 10. Invalid state codes
  try {
    const [row] = await sql`
      SELECT COUNT(*) as cnt FROM crawl_targets
      WHERE state_code IS NOT NULL AND LENGTH(state_code) != 2
    `;
    const cnt = Number(row.cnt);
    checks.push({
      name: "Valid state codes",
      status: cnt === 0 ? "pass" : "fail",
      detail: cnt === 0 ? "All state codes are valid format" : `${cnt} institutions with invalid state codes`,
      count: cnt,
    });
  } catch {
    checks.push({ name: "Valid state codes", status: "warn", detail: "Check failed", count: -1 });
  }

  return checks;
}

export async function getCoverageFunnelData(): Promise<CoverageFunnelData> {
  try {
    const [totalRow] = await sql`SELECT COUNT(*) as cnt FROM crawl_targets`;
    const [webRow] = await sql`SELECT COUNT(*) as cnt FROM crawl_targets WHERE website_url IS NOT NULL`;
    const [urlRow] = await sql`SELECT COUNT(*) as cnt FROM crawl_targets WHERE fee_schedule_url IS NOT NULL`;
    const [feeRow] = await sql`SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM extracted_fees`;
    const [appRow] = await sql`SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM extracted_fees WHERE review_status = 'approved'`;
    return {
      total_institutions: Number(totalRow.cnt),
      with_website: Number(webRow.cnt),
      with_fee_url: Number(urlRow.cnt),
      with_fees: Number(feeRow.cnt),
      with_approved: Number(appRow.cnt),
    };
  } catch (e) {
    console.error("getCoverageFunnelData failed:", e);
    return { total_institutions: 0, with_website: 0, with_fee_url: 0, with_fees: 0, with_approved: 0 };
  }
}

export async function getUncategorizedTopFees(limit = 20): Promise<UncategorizedFee[]> {
  try {
    const rows = await sql`
      SELECT fee_name, COUNT(*) as cnt
      FROM extracted_fees
      WHERE fee_category IS NULL AND review_status != 'rejected'
      GROUP BY fee_name
      ORDER BY cnt DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      fee_name: String(r.fee_name),
      count: Number(r.cnt),
    }));
  } catch (e) {
    console.error("getUncategorizedTopFees failed:", e);
    return [];
  }
}
