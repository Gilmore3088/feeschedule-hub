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
import { toDateStr, safeJsonb } from "@/lib/pg-helpers";

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

// ---------------------------------------------------------------------------
// Review Page
// ---------------------------------------------------------------------------

export interface ReviewFeeRow {
  id: number;
  fee_name: string;
  amount: number | null;
  fee_category: string | null;
  review_status: string;
  institution_name: string;
  crawl_target_id: number;
  state_code: string | null;
  charter_type: string | null;
  confidence: number;
  created_at: string;
}

export interface FeeDetailRow {
  id: number;
  fee_name: string;
  amount: number | null;
  frequency: string | null;
  conditions: string | null;
  fee_category: string | null;
  fee_family: string | null;
  review_status: string;
  confidence: number;
  created_at: string;
  institution_name: string;
  crawl_target_id: number;
  state_code: string | null;
  charter_type: string | null;
  document_url: string | null;
  fee_schedule_url: string | null;
  validation_flags: string[];
  review_history: ReviewHistoryRow[];
}

export interface ReviewHistoryRow {
  action: string;
  username: string | null;
  previous_status: string | null;
  new_status: string | null;
  notes: string | null;
  created_at: string;
}

export interface FeeCatalogRow {
  fee_category: string;
  display_name: string;
  count: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
}

export async function getReviewFees(
  status: string,
  page: number,
  limit: number,
  search?: string,
): Promise<{ fees: ReviewFeeRow[]; total: number }> {
  try {
    const offset = (page - 1) * limit;
    const conditions = ["ef.review_status = $1"];
    const params: (string | number | null)[] = [status];
    let paramIdx = 2;

    if (search) {
      conditions.push(
        `(ef.fee_name ILIKE $${paramIdx++} OR ct.institution_name ILIKE $${paramIdx++})`,
      );
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = conditions.join(" AND ");

    const countResult = await sql.unsafe<{ cnt: string }[]>(
      `SELECT COUNT(*) as cnt
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ${where}`,
      params,
    );
    const total = Number(countResult[0].cnt);

    const rows = await sql.unsafe<Record<string, unknown>[]>(
      `SELECT ef.id, ef.fee_name, ef.amount, ef.fee_category,
              ef.review_status, ct.institution_name, ef.crawl_target_id,
              ct.state_code, ct.charter_type, ef.extraction_confidence,
              ef.created_at
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ${where}
       ORDER BY ef.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset],
    );

    const fees: ReviewFeeRow[] = rows.map((r) => ({
      id: Number(r.id),
      fee_name: String(r.fee_name),
      amount: r.amount != null ? Number(r.amount) : null,
      fee_category: r.fee_category ? String(r.fee_category) : null,
      review_status: String(r.review_status),
      institution_name: String(r.institution_name),
      crawl_target_id: Number(r.crawl_target_id),
      state_code: r.state_code ? String(r.state_code) : null,
      charter_type: r.charter_type ? String(r.charter_type) : null,
      confidence: Number(r.extraction_confidence),
      created_at: toDateStr(r.created_at as string | Date),
    }));

    return { fees, total };
  } catch (e) {
    console.error("getReviewFees failed:", e);
    return { fees: [], total: 0 };
  }
}

export async function getFeeDetail(feeId: number): Promise<FeeDetailRow | null> {
  try {
    const [row] = await sql<Record<string, unknown>[]>`
      SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
             ef.fee_category, ef.fee_family, ef.review_status,
             ef.extraction_confidence, ef.created_at, ef.validation_flags,
             ct.institution_name, ef.crawl_target_id,
             ct.state_code, ct.charter_type,
             cr.document_url, ct.fee_schedule_url
      FROM extracted_fees ef
      JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
      LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id
      WHERE ef.id = ${feeId}
    `;
    if (!row) return null;

    const historyRows = await sql<Record<string, unknown>[]>`
      SELECT rl.action, u.username, rl.previous_status, rl.new_status,
             rl.notes, rl.created_at
      FROM review_log rl
      LEFT JOIN users u ON u.id = rl.user_id
      WHERE rl.fee_id = ${feeId}
      ORDER BY rl.created_at DESC
    `;

    const flags = safeJsonb<string[]>(row.validation_flags) ?? [];

    const history: ReviewHistoryRow[] = historyRows.map((h) => ({
      action: String(h.action),
      username: h.username ? String(h.username) : null,
      previous_status: h.previous_status ? String(h.previous_status) : null,
      new_status: h.new_status ? String(h.new_status) : null,
      notes: h.notes ? String(h.notes) : null,
      created_at: toDateStr(h.created_at as string | Date),
    }));

    return {
      id: Number(row.id),
      fee_name: String(row.fee_name),
      amount: row.amount != null ? Number(row.amount) : null,
      frequency: row.frequency ? String(row.frequency) : null,
      conditions: row.conditions ? String(row.conditions) : null,
      fee_category: row.fee_category ? String(row.fee_category) : null,
      fee_family: row.fee_family ? String(row.fee_family) : null,
      review_status: String(row.review_status),
      confidence: Number(row.extraction_confidence),
      created_at: toDateStr(row.created_at as string | Date),
      institution_name: String(row.institution_name),
      crawl_target_id: Number(row.crawl_target_id),
      state_code: row.state_code ? String(row.state_code) : null,
      charter_type: row.charter_type ? String(row.charter_type) : null,
      document_url: row.document_url ? String(row.document_url) : null,
      fee_schedule_url: row.fee_schedule_url ? String(row.fee_schedule_url) : null,
      validation_flags: flags,
      review_history: history,
    };
  } catch (e) {
    console.error("getFeeDetail failed:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fees Catalog
// ---------------------------------------------------------------------------

export async function getFeeCatalogSummary(): Promise<FeeCatalogRow[]> {
  try {
    const rows = await sql<Record<string, unknown>[]>`
      SELECT
        fee_category,
        COUNT(*) as cnt,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) as median,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY amount) as p25,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount) as p75
      FROM extracted_fees
      WHERE fee_category IS NOT NULL
        AND review_status != 'rejected'
        AND amount IS NOT NULL
      GROUP BY fee_category
      ORDER BY cnt DESC
    `;

    // Build display name lookup inline to avoid importing taxonomy at module level
    const { DISPLAY_NAMES } = await import("@/lib/fee-taxonomy");

    return rows.map((r) => {
      const cat = String(r.fee_category);
      return {
        fee_category: cat,
        display_name: DISPLAY_NAMES[cat] || cat.replace(/_/g, " "),
        count: Number(r.cnt),
        median: r.median != null ? Number(Number(r.median).toFixed(2)) : null,
        p25: r.p25 != null ? Number(Number(r.p25).toFixed(2)) : null,
        p75: r.p75 != null ? Number(Number(r.p75).toFixed(2)) : null,
      };
    });
  } catch (e) {
    console.error("getFeeCatalogSummary failed:", e);
    return [];
  }
}
