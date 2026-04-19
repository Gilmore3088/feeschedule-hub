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

export type AgentStatus = "live" | "stubbed" | "missing";

export interface PipelineStageAgent {
  name: string;
  status: AgentStatus;
  note?: string;
}

export interface PipelineStageSummary {
  id: "scrape" | "discovery" | "extraction" | "review" | "publish";
  label: string;
  one_liner: string;
  current: number;
  current_label: string;
  throughput_24h: number;
  agents: PipelineStageAgent[];
}

export interface PipelineMapData {
  stages: PipelineStageSummary[];
  generated_at: string;
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

export interface DataQualityStats {
  total_with_fees: number;
  good_6plus: number;
  incomplete_1to5: number;
  url_no_fees: number;
  no_url: number;
  freeform_fees: number;
  rejected_fees: number;
  quality_pct: number;
}

export async function getDataQualityStats(): Promise<DataQualityStats> {
  try {
    // Institutions with 6+ fees (credible)
    const [goodRow] = await sql`
      SELECT COUNT(*) as cnt FROM (
        SELECT crawl_target_id FROM extracted_fees
        WHERE review_status != 'rejected'
        GROUP BY crawl_target_id HAVING COUNT(*) >= 6
      ) sub`;

    // Institutions with 1-5 fees (incomplete)
    const [incompleteRow] = await sql`
      SELECT COUNT(*) as cnt FROM (
        SELECT crawl_target_id FROM extracted_fees
        WHERE review_status != 'rejected'
        GROUP BY crawl_target_id HAVING COUNT(*) BETWEEN 1 AND 5
      ) sub`;

    // Have URL but no fees
    const [urlNoFeesRow] = await sql`
      SELECT COUNT(*) as cnt FROM crawl_targets ct
      WHERE ct.fee_schedule_url IS NOT NULL AND ct.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM extracted_fees ef WHERE ef.crawl_target_id = ct.id AND ef.review_status != 'rejected'
        )`;

    // No URL at all (addressable)
    const [noUrlRow] = await sql`
      SELECT COUNT(*) as cnt FROM crawl_targets ct
      WHERE ct.fee_schedule_url IS NULL AND ct.status = 'active'
        AND ct.website_url IS NOT NULL
        AND (ct.document_type IS NULL OR ct.document_type != 'offline')`;

    // Freeform fees (not in 49-category taxonomy)
    const [freeformRow] = await sql`
      SELECT COUNT(*) as cnt FROM extracted_fees
      WHERE review_status != 'rejected'
        AND fee_category NOT IN (
          'overdraft','nsf','wire_domestic_outgoing','wire_domestic_incoming',
          'wire_intl_outgoing','wire_intl_incoming','atm_non_network','atm_international',
          'monthly_maintenance','minimum_balance','dormant_account','account_closing',
          'early_closure','paper_statement','estatement_fee','stop_payment',
          'cashiers_check','money_order','check_printing','check_image','counter_check',
          'check_cashing','certified_check','card_replacement','card_foreign_txn',
          'card_dispute','rush_card','cash_advance','ach_origination','ach_return',
          'od_protection_transfer','od_daily_cap','od_line_of_credit','nsf_daily_cap',
          'continuous_od','deposited_item_return','late_payment','garnishment_levy',
          'legal_process','notary_fee','safe_deposit_box','coin_counting','bill_pay',
          'mobile_deposit','zelle_fee','night_deposit','account_research',
          'account_verification','balance_inquiry','appraisal_fee','loan_origination'
        )`;

    const [rejectedRow] = await sql`SELECT COUNT(*) as cnt FROM extracted_fees WHERE review_status = 'rejected'`;

    const good = Number(goodRow.cnt);
    const incomplete = Number(incompleteRow.cnt);
    const total = good + incomplete;

    return {
      total_with_fees: total,
      good_6plus: good,
      incomplete_1to5: incomplete,
      url_no_fees: Number(urlNoFeesRow.cnt),
      no_url: Number(noUrlRow.cnt),
      freeform_fees: Number(freeformRow.cnt),
      rejected_fees: Number(rejectedRow.cnt),
      quality_pct: total > 0 ? Math.round((good / total) * 100) : 0,
    };
  } catch (e) {
    console.error("getDataQualityStats failed:", e);
    return { total_with_fees: 0, good_6plus: 0, incomplete_1to5: 0, url_no_fees: 0, no_url: 0, freeform_fees: 0, rejected_fees: 0, quality_pct: 0 };
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
        COUNT(DISTINCT t.id) as total,
        COUNT(DISTINCT e.crawl_target_id) as with_fees,
        COUNT(DISTINCT CASE WHEN t.document_type = 'offline' OR t.website_url IS NULL THEN t.id END) as excluded
      FROM crawl_targets t
      LEFT JOIN extracted_fees e ON e.crawl_target_id = t.id
      WHERE t.state_code IS NOT NULL
      GROUP BY t.state_code
      ORDER BY t.state_code
    `;
    return rows.map((r) => {
      const total = Number(r.total);
      const withFees = Number(r.with_fees);
      const excluded = Number(r.excluded);
      const addressable = total - excluded;
      return {
        state_code: String(r.state_code),
        total,
        with_fees: withFees,
        pct: addressable > 0 ? Math.round((withFees / addressable) * 100) : 0,
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

export async function getPipelineMap(): Promise<PipelineMapData> {
  const stages: PipelineStageSummary[] = [
    {
      id: "scrape",
      label: "Scrape",
      one_liner: "Fetch raw HTML/PDF from institution fee-schedule URLs.",
      current: 0,
      current_label: "crawl targets",
      throughput_24h: 0,
      agents: [
        { name: "Modal crawler", status: "live", note: "runs at 02:00 / 03:00 / 04:00 UTC" },
        { name: "state_xx (per-state)", status: "live", note: "50 state orchestrators" },
      ],
    },
    {
      id: "discovery",
      label: "Discovery",
      one_liner: "Find the correct fee_schedule_url for each institution.",
      current: 0,
      current_label: "urls known",
      throughput_24h: 0,
      agents: [
        { name: "Magellan", status: "live", note: "5-rung ladder; shipped v1" },
      ],
    },
    {
      id: "extraction",
      label: "Extraction",
      one_liner: "Parse raw text/PDF into structured fee rows (fees_raw).",
      current: 0,
      current_label: "fees_raw rows",
      throughput_24h: 0,
      agents: [
        { name: "extract_pdf / html / js", status: "live", note: "specialist subagents per doc type" },
      ],
    },
    {
      id: "review",
      label: "Review",
      one_liner: "Classify, score confidence, verify (fees_raw -> fees_verified).",
      current: 0,
      current_label: "fees_verified rows",
      throughput_24h: 0,
      agents: [
        { name: "Darwin", status: "live", note: "classifier; auto-promote >=0.90" },
        { name: "auto-review CLI", status: "live", note: "heuristic rules" },
      ],
    },
    {
      id: "publish",
      label: "Publish",
      one_liner: "Adversarial handshake + promote to fees_published.",
      current: 0,
      current_label: "fees_published rows",
      throughput_24h: 0,
      agents: [
        { name: "Darwin accept", status: "live", note: "auto via publish-fees CLI" },
        { name: "Knox accept", status: "stubbed", note: "publish-fees plays both sides until real Knox ships" },
      ],
    },
  ];

  try {
    // Scrape: total crawl targets + crawl_runs in last 24h
    const [scrapeNow] = await sql`SELECT COUNT(*)::int AS n FROM crawl_targets`;
    const [scrape24h] = await sql`
      SELECT COUNT(*)::int AS n FROM crawl_runs WHERE started_at > NOW() - INTERVAL '24 hours'
    `;
    stages[0].current = Number(scrapeNow?.n ?? 0);
    stages[0].throughput_24h = Number(scrape24h?.n ?? 0);

    // Discovery: targets with fee_schedule_url known
    const [discoveryNow] = await sql`
      SELECT COUNT(*)::int AS n FROM crawl_targets WHERE fee_schedule_url IS NOT NULL
    `;
    const [discovery24h] = await sql`
      SELECT COUNT(*)::int AS n FROM crawl_targets
       WHERE fee_schedule_url IS NOT NULL AND discovered_at > NOW() - INTERVAL '24 hours'
    `;
    stages[1].current = Number(discoveryNow?.n ?? 0);
    stages[1].throughput_24h = Number(discovery24h?.n ?? 0);

    // Extraction: fees_raw rows (cumulative) + last 24h
    const [extractionNow] = await sql`SELECT COUNT(*)::int AS n FROM fees_raw`;
    const [extraction24h] = await sql`
      SELECT COUNT(*)::int AS n FROM fees_raw WHERE created_at > NOW() - INTERVAL '24 hours'
    `;
    stages[2].current = Number(extractionNow?.n ?? 0);
    stages[2].throughput_24h = Number(extraction24h?.n ?? 0);

    // Review: fees_verified rows + last 24h
    const [reviewNow] = await sql`SELECT COUNT(*)::int AS n FROM fees_verified`;
    const [review24h] = await sql`
      SELECT COUNT(*)::int AS n FROM fees_verified WHERE created_at > NOW() - INTERVAL '24 hours'
    `;
    stages[3].current = Number(reviewNow?.n ?? 0);
    stages[3].throughput_24h = Number(review24h?.n ?? 0);

    // Publish: fees_published rows + last 24h. Filter out rolled-back rows
    // per 20260419_fees_published_rollback.sql contract — rolled_back_at IS
    // NULL is the "live" subset used by every downstream consumer.
    //
    // Column is published_at (not created_at) — fees_published has no
    // created_at. Prior typo swallowed by the surrounding try/catch so the
    // Publish row silently rendered 0/0. See bug_001 / remote review.
    const [publishNow] = await sql`
      SELECT COUNT(*)::int AS n FROM fees_published WHERE rolled_back_at IS NULL
    `;
    const [publish24h] = await sql`
      SELECT COUNT(*)::int AS n FROM fees_published
       WHERE rolled_back_at IS NULL AND published_at > NOW() - INTERVAL '24 hours'
    `;
    stages[4].current = Number(publishNow?.n ?? 0);
    stages[4].throughput_24h = Number(publish24h?.n ?? 0);
  } catch (e) {
    console.error("getPipelineMap failed:", e);
  }

  return { stages, generated_at: new Date().toISOString() };
}

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

// ---------------------------------------------------------------------------
// Job freshness / cron health (Reliability Roadmap #1)
// ---------------------------------------------------------------------------

export interface JobFreshness {
  job_name: string;
  display_name: string;
  source: "workers_last_run" | "crawl_runs";
  last_completed_at: string | null;
  hours_since: number | null;
  expected_within_hours: number;
  status: "ok" | "stale" | "never_ran";
}

export interface JobHealthSummary {
  generated_at: string;
  stale_count: number;
  ok_count: number;
  never_ran_count: number;
  jobs: JobFreshness[];
}

// Inventory of scheduled jobs we expect to run. Two sources of truth:
// (a) workers_last_run markers written by modal_app.py post-processing
// (b) crawl_runs rows for the three Modal scraping crons that don't yet
//     write markers (run_discovery, run_pdf_extraction, run_browser_extraction).
// Any stale entry here surfaces as a red banner on /admin/pipeline.
const JOB_INVENTORY: Array<
  Pick<JobFreshness, "job_name" | "display_name" | "source" | "expected_within_hours">
> = [
  { job_name: "daily_pipeline",     display_name: "Daily post-processing (06:00)",       source: "workers_last_run", expected_within_hours: 26 },
  { job_name: "magellan_rescue",    display_name: "Magellan URL rescue (05:00)",         source: "workers_last_run", expected_within_hours: 26 },
  { job_name: "knox_review",        display_name: "Knox adversarial review (05:00)",     source: "workers_last_run", expected_within_hours: 26 },
  { job_name: "ingest_data",        display_name: "Federal data ingest (10:00)",         source: "workers_last_run", expected_within_hours: 26 },
  { job_name: "run_discovery",      display_name: "URL discovery crawler (02:00)",       source: "crawl_runs",       expected_within_hours: 26 },
  { job_name: "run_pdf_extraction", display_name: "PDF extraction crawler (03:00)",      source: "crawl_runs",       expected_within_hours: 26 },
  { job_name: "run_browser_extraction", display_name: "Browser extraction crawler (04:00)", source: "crawl_runs",   expected_within_hours: 26 },
];

// Reliability Roadmap #11 — URL freshness surface.
// Stale URLs are flagged by fee_crawler/commands/probe_urls.py::run_revalidate
// by setting failure_reason='url_stale'. This helper counts them per state
// so /admin/coverage can expose the pool that's silently not being recrawled.
export interface UrlFreshnessStats {
  total_with_url: number;
  stale_count: number;
  stale_pct: number;
  last_revalidated_at: string | null;
}

export async function getUrlFreshnessStats(): Promise<UrlFreshnessStats> {
  try {
    const [row] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE fee_schedule_url IS NOT NULL)::int AS total_with_url,
        COUNT(*) FILTER (WHERE failure_reason = 'url_stale')::int AS stale_count,
        MAX(failure_reason_updated_at) FILTER (WHERE failure_reason = 'url_stale') AS last_revalidated_at
      FROM crawl_targets
    `;
    const total = Number(row?.total_with_url ?? 0);
    const stale = Number(row?.stale_count ?? 0);
    const lastAt = row?.last_revalidated_at as Date | null;
    return {
      total_with_url: total,
      stale_count: stale,
      stale_pct: total > 0 ? Math.round((stale / total) * 1000) / 10 : 0,
      last_revalidated_at: lastAt ? toDateStr(lastAt) : null,
    };
  } catch (e) {
    console.error("getUrlFreshnessStats failed:", e);
    return { total_with_url: 0, stale_count: 0, stale_pct: 0, last_revalidated_at: null };
  }
}

// Reliability Roadmap #13 — classification history read helper. The migration
// at supabase/migrations/20260418_classification_history.sql installs an AFTER
// UPDATE trigger on fees_verified that captures every canonical_fee_key or
// variant_type transition. This helper pulls the log for a single fee; the
// /admin/fees/[id]/history page renders it.
export interface ClassificationChange {
  id: number;
  old_canonical_key: string | null;
  new_canonical_key: string;
  old_variant_type: string | null;
  new_variant_type: string | null;
  changed_at: string;
  changed_by: string | null;
}

export async function getClassificationHistory(
  feeVerifiedId: number,
): Promise<ClassificationChange[]> {
  try {
    const rows = await sql`
      SELECT id, old_canonical_key, new_canonical_key,
             old_variant_type, new_variant_type, changed_at, changed_by
      FROM classification_history
      WHERE fee_verified_id = ${feeVerifiedId}
      ORDER BY changed_at DESC
      LIMIT 100
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      old_canonical_key: r.old_canonical_key ? String(r.old_canonical_key) : null,
      new_canonical_key: String(r.new_canonical_key),
      old_variant_type: r.old_variant_type ? String(r.old_variant_type) : null,
      new_variant_type: r.new_variant_type ? String(r.new_variant_type) : null,
      changed_at: toDateStr(r.changed_at as string | Date),
      changed_by: r.changed_by ? String(r.changed_by) : null,
    }));
  } catch (e) {
    console.error("getClassificationHistory failed:", e);
    return [];
  }
}

// Reliability Roadmap #14 — surface how many institutions are in each
// backoff tier so humans can see where the crawler is choosing not to retry
// (and why). Exposed on /admin/coverage so dormant URLs are visible, not
// silently ignored.
export interface CrawlHealthTiers {
  healthy: number;
  short_backoff: number;
  long_backoff: number;
  dormant: number;
  total_active: number;
}

export async function getCrawlHealthTiers(): Promise<CrawlHealthTiers> {
  try {
    const [row] = await sql`
      SELECT
        COUNT(*) FILTER (
          WHERE status != 'dormant' AND consecutive_failures < 3
        )::int AS healthy,
        COUNT(*) FILTER (
          WHERE status != 'dormant' AND consecutive_failures BETWEEN 3 AND 6
        )::int AS short_backoff,
        COUNT(*) FILTER (
          WHERE status != 'dormant' AND consecutive_failures BETWEEN 7 AND 13
        )::int AS long_backoff,
        COUNT(*) FILTER (WHERE status = 'dormant')::int AS dormant,
        COUNT(*)::int AS total_active
      FROM crawl_targets
      WHERE fee_schedule_url IS NOT NULL
    `;
    return {
      healthy: Number(row?.healthy ?? 0),
      short_backoff: Number(row?.short_backoff ?? 0),
      long_backoff: Number(row?.long_backoff ?? 0),
      dormant: Number(row?.dormant ?? 0),
      total_active: Number(row?.total_active ?? 0),
    };
  } catch (e) {
    console.error("getCrawlHealthTiers failed:", e);
    return { healthy: 0, short_backoff: 0, long_backoff: 0, dormant: 0, total_active: 0 };
  }
}

export async function getJobFreshness(): Promise<JobHealthSummary> {
  const jobs: JobFreshness[] = [];

  // Pull all workers_last_run rows at once, then index by job_name.
  const markerRows: Record<string, Date | null> = {};
  try {
    const rows = await sql`SELECT job_name, completed_at FROM workers_last_run`;
    for (const r of rows) {
      markerRows[String(r.job_name)] = (r.completed_at as Date | null) ?? null;
    }
  } catch (e) {
    console.error("getJobFreshness marker read failed:", e);
  }

  // For crawl_runs-backed jobs, find latest completed crawl_run per source label.
  // run_discovery -> trigger_type='scheduled' AND source='discovery' (if discovery
  // writes crawl_runs rows) else any scheduled run. Keep it simple: look at
  // most-recent crawl_run completed_at as a blanket "crawler is alive" signal,
  // since all three scraping Modal crons write to crawl_runs.
  let latestCrawlRun: Date | null = null;
  try {
    const [row] = await sql`
      SELECT MAX(completed_at) AS last FROM crawl_runs
       WHERE trigger_type = 'scheduled' AND status = 'completed'
    `;
    latestCrawlRun = (row?.last as Date | null) ?? null;
  } catch (e) {
    console.error("getJobFreshness crawl_runs read failed:", e);
  }

  const now = Date.now();
  for (const spec of JOB_INVENTORY) {
    let lastCompleted: Date | null = null;
    if (spec.source === "workers_last_run") {
      lastCompleted = markerRows[spec.job_name] ?? null;
    } else {
      // crawl_runs: all three scraping jobs share the latest row for now,
      // because we don't per-job-label them yet (#1 follow-up: emit markers
      // per cron function in modal_app.py so we can tell WHICH crawler stalled).
      lastCompleted = latestCrawlRun;
    }

    let hoursSince: number | null = null;
    let status: JobFreshness["status"] = "never_ran";
    if (lastCompleted) {
      hoursSince = (now - lastCompleted.getTime()) / (1000 * 60 * 60);
      status = hoursSince > spec.expected_within_hours ? "stale" : "ok";
    }

    jobs.push({
      job_name: spec.job_name,
      display_name: spec.display_name,
      source: spec.source,
      last_completed_at: lastCompleted ? toDateStr(lastCompleted) : null,
      hours_since: hoursSince !== null ? Math.round(hoursSince * 10) / 10 : null,
      expected_within_hours: spec.expected_within_hours,
      status,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    stale_count: jobs.filter((j) => j.status === "stale").length,
    ok_count: jobs.filter((j) => j.status === "ok").length,
    never_ran_count: jobs.filter((j) => j.status === "never_ran").length,
    jobs,
  };
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
  sort?: string,
  dir?: string,
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
       ORDER BY ${sort === "amount" ? "ef.amount" : sort === "category" ? "ef.fee_category" : sort === "institution" ? "ct.institution_name" : sort === "confidence" ? "ef.extraction_confidence" : "ef.created_at"} ${dir === "asc" ? "ASC" : "DESC"} NULLS LAST
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

// ---------------------------------------------------------------------------
// Operations (Ops)
// ---------------------------------------------------------------------------

export interface OpsJobRow {
  id: number;
  command: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_sec: number | null;
  result_summary: string | null;
  triggered_by: string | null;
  error_summary: string | null;
}

export async function getOpsJobs(limit = 50): Promise<OpsJobRow[]> {
  try {
    const rows = await sql`
      SELECT id, command, status, started_at, completed_at,
             CASE WHEN started_at IS NOT NULL AND completed_at IS NOT NULL
               THEN EXTRACT(EPOCH FROM (completed_at - started_at))::int
               ELSE NULL END as duration_sec,
             result_summary, triggered_by, error_summary
      FROM ops_jobs
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      command: String(r.command),
      status: String(r.status),
      started_at: r.started_at ? toDateStr(r.started_at as string | Date) : null,
      completed_at: r.completed_at ? toDateStr(r.completed_at as string | Date) : null,
      duration_sec: r.duration_sec != null ? Number(r.duration_sec) : null,
      result_summary: r.result_summary ? String(r.result_summary) : null,
      triggered_by: r.triggered_by ? String(r.triggered_by) : null,
      error_summary: r.error_summary ? String(r.error_summary) : null,
    }));
  } catch (e) {
    console.error("getOpsJobs failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Institutions
// ---------------------------------------------------------------------------

export interface InstitutionRow {
  id: number;
  institution_name: string;
  state_code: string | null;
  charter_type: string | null;
  asset_size: number | null;
  has_fee_url: boolean;
  fee_count: number;
}

export interface SearchInstitutionsResult {
  institutions: InstitutionRow[];
  total: number;
}

// Allowlist of sortable columns — SQL identifiers come straight off the URL
// query string, so they MUST be gated here. Each entry maps to a safe ORDER BY
// fragment already bound to the query's table aliases.
const INSTITUTIONS_SORT_SQL: Record<string, string> = {
  institution_name: "ct.institution_name",
  state_code: "ct.state_code",
  charter_type: "ct.charter_type",
  asset_size: "ct.asset_size",
  has_fee_url: "(ct.fee_schedule_url IS NOT NULL)",
  fee_count: "COALESCE(fc.fee_count, 0)",
};

export async function searchInstitutions(
  query: string | undefined,
  page: number,
  limit: number,
  sort?: string,
  dir?: "asc" | "desc",
): Promise<SearchInstitutionsResult> {
  try {
    const offset = (page - 1) * limit;

    const sortCol = sort && INSTITUTIONS_SORT_SQL[sort]
      ? INSTITUTIONS_SORT_SQL[sort]
      : "ct.asset_size";
    const sortDir = dir === "asc" ? "ASC" : "DESC";
    const orderBy = `${sortCol} ${sortDir} NULLS LAST`;

    if (query && query.trim()) {
      const pattern = `%${query.trim()}%`;
      const countResult = await sql`
        SELECT COUNT(*) as cnt FROM crawl_targets
        WHERE institution_name ILIKE ${pattern}
      `;
      const total = Number(countResult[0].cnt);

      const rows = await sql.unsafe(
        `
        SELECT ct.id, ct.institution_name, ct.state_code, ct.charter_type, ct.asset_size,
               (ct.fee_schedule_url IS NOT NULL) as has_fee_url,
               COALESCE(fc.fee_count, 0) as fee_count
        FROM crawl_targets ct
        LEFT JOIN (
          SELECT crawl_target_id, COUNT(*) as fee_count
          FROM extracted_fees WHERE review_status != 'rejected'
          GROUP BY crawl_target_id
        ) fc ON fc.crawl_target_id = ct.id
        WHERE ct.institution_name ILIKE $1
        ORDER BY ${orderBy}
        LIMIT $2 OFFSET $3
        `,
        [pattern, limit, offset],
      );

      return {
        total,
        institutions: rows.map(mapInstitutionRow),
      };
    }

    const countResult = await sql`SELECT COUNT(*) as cnt FROM crawl_targets`;
    const total = Number(countResult[0].cnt);

    const rows = await sql.unsafe(
      `
      SELECT ct.id, ct.institution_name, ct.state_code, ct.charter_type, ct.asset_size,
             (ct.fee_schedule_url IS NOT NULL) as has_fee_url,
             COALESCE(fc.fee_count, 0) as fee_count
      FROM crawl_targets ct
      LEFT JOIN (
        SELECT crawl_target_id, COUNT(*) as fee_count
        FROM extracted_fees WHERE review_status != 'rejected'
        GROUP BY crawl_target_id
      ) fc ON fc.crawl_target_id = ct.id
      ORDER BY ${orderBy}
      LIMIT $1 OFFSET $2
      `,
      [limit, offset],
    );

    return {
      total,
      institutions: rows.map(mapInstitutionRow),
    };
  } catch (e) {
    console.error("searchInstitutions failed:", e);
    return { institutions: [], total: 0 };
  }
}

function mapInstitutionRow(r: Record<string, unknown>): InstitutionRow {
  return {
    id: Number(r.id),
    institution_name: String(r.institution_name),
    state_code: r.state_code ? String(r.state_code) : null,
    charter_type: r.charter_type ? String(r.charter_type) : null,
    asset_size: r.asset_size != null ? Number(r.asset_size) : null,
    has_fee_url: Boolean(r.has_fee_url),
    fee_count: Number(r.fee_count),
  };
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export interface LeadRow {
  id: number;
  name: string;
  email: string;
  company: string | null;
  role: string | null;
  use_case: string | null;
  source: string | null;
  status: string;
  created_at: string;
}

export interface LeadsSummary {
  total: number;
  new_this_week: number;
  new_today: number;
  latest_at: string | null;
}

export async function getLeadsSummary(): Promise<LeadsSummary> {
  try {
    const [row] = await sql<
      {
        total: string;
        new_this_week: string;
        new_today: string;
        latest_at: string | Date | null;
      }[]
    >`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text AS new_this_week,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::text AS new_today,
        MAX(created_at) AS latest_at
      FROM leads
    `;
    return {
      total: Number(row?.total ?? 0),
      new_this_week: Number(row?.new_this_week ?? 0),
      new_today: Number(row?.new_today ?? 0),
      latest_at: row?.latest_at ? toDateStr(row.latest_at) : null,
    };
  } catch (e) {
    console.error("getLeadsSummary failed:", e);
    return { total: 0, new_this_week: 0, new_today: 0, latest_at: null };
  }
}

export async function getLeads(limit = 200): Promise<LeadRow[]> {
  try {
    const rows = await sql`
      SELECT id, name, email, company, role, use_case, source, status, created_at
      FROM leads
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      email: String(r.email),
      company: r.company ? String(r.company) : null,
      role: r.role ? String(r.role) : null,
      use_case: r.use_case ? String(r.use_case) : null,
      source: r.source ? String(r.source) : null,
      status: String(r.status || "new"),
      created_at: toDateStr(r.created_at as string | Date),
    }));
  } catch (e) {
    console.error("getLeads failed:", e);
    return [];
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

// ---------------------------------------------------------------------------
// Districts Overview
// ---------------------------------------------------------------------------

export interface DistrictOverviewRow {
  district: number;
  name: string;
  total: number;
  with_fees: number;
  pct: number;
}

export async function getDistrictOverview(): Promise<DistrictOverviewRow[]> {
  const NAMES: Record<number, string> = {
    1: "Boston", 2: "New York", 3: "Philadelphia", 4: "Cleveland",
    5: "Richmond", 6: "Atlanta", 7: "Chicago", 8: "St. Louis",
    9: "Minneapolis", 10: "Kansas City", 11: "Dallas", 12: "San Francisco",
  };

  try {
    const rows = await sql`
      SELECT
        ct.fed_district as district,
        COUNT(*) as total,
        COUNT(DISTINCT ef.crawl_target_id) as with_fees
      FROM crawl_targets ct
      LEFT JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
        AND ef.review_status != 'rejected'
      WHERE ct.fed_district IS NOT NULL
      GROUP BY ct.fed_district
      ORDER BY ct.fed_district
    `;
    return rows.map((r) => {
      const total = Number(r.total);
      const withFees = Number(r.with_fees);
      const d = Number(r.district);
      return {
        district: d,
        name: NAMES[d] ?? `District ${d}`,
        total,
        with_fees: withFees,
        pct: total > 0 ? Math.round((withFees / total) * 100) : 0,
      };
    });
  } catch (e) {
    console.error("getDistrictOverview failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// National Fee Index
// ---------------------------------------------------------------------------

export interface NationalIndexRow {
  fee_category: string;
  display_name: string;
  fee_family: string | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  min_amount: number | null;
  max_amount: number | null;
  institution_count: number;
  observation_count: number;
  approved_count: number;
  bank_count: number;
  cu_count: number;
  maturity: string;
}

export async function getNationalIndexData(): Promise<NationalIndexRow[]> {
  try {
    const rows = await sql`
      SELECT fee_category, fee_family,
             median_amount, p25_amount, p75_amount,
             min_amount, max_amount,
             institution_count, observation_count, approved_count,
             bank_count, cu_count, maturity_tier
      FROM fee_index_cache
      ORDER BY institution_count DESC
    `;

    const { DISPLAY_NAMES } = await import("@/lib/fee-taxonomy");

    return rows.map((r) => {
      const cat = String(r.fee_category);
      return {
        fee_category: cat,
        display_name: DISPLAY_NAMES[cat] || cat.replace(/_/g, " "),
        fee_family: r.fee_family ? String(r.fee_family) : null,
        median: r.median_amount != null ? Number(Number(r.median_amount).toFixed(2)) : null,
        p25: r.p25_amount != null ? Number(Number(r.p25_amount).toFixed(2)) : null,
        p75: r.p75_amount != null ? Number(Number(r.p75_amount).toFixed(2)) : null,
        min_amount: r.min_amount != null ? Number(Number(r.min_amount).toFixed(2)) : null,
        max_amount: r.max_amount != null ? Number(Number(r.max_amount).toFixed(2)) : null,
        institution_count: Number(r.institution_count),
        observation_count: Number(r.observation_count),
        approved_count: Number(r.approved_count),
        bank_count: Number(r.bank_count),
        cu_count: Number(r.cu_count),
        maturity: String(r.maturity_tier),
      };
    });
  } catch (e) {
    console.error("getNationalIndexData failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Market Index (segment vs national)
// ---------------------------------------------------------------------------

export interface MarketIndexRow {
  fee_category: string;
  display_name: string;
  national_median: number | null;
  segment_median: number | null;
  delta_pct: number | null;
  institution_count: number;
}

export async function getMarketData(filters: {
  charter_type?: string;
  asset_tier?: string;
  state_code?: string;
}): Promise<MarketIndexRow[]> {
  try {
    // Always load national baseline from cache
    const national = await sql`
      SELECT fee_category, median_amount, institution_count
      FROM fee_index_cache
      ORDER BY institution_count DESC
    `;

    const { DISPLAY_NAMES } = await import("@/lib/fee-taxonomy");

    const nationalMap = new Map<string, { median: number | null; count: number }>();
    for (const r of national) {
      nationalMap.set(String(r.fee_category), {
        median: r.median_amount != null ? Number(r.median_amount) : null,
        count: Number(r.institution_count),
      });
    }

    const hasFilters = !!(filters.charter_type || filters.asset_tier || filters.state_code);

    if (!hasFilters) {
      return national.map((r) => {
        const cat = String(r.fee_category);
        return {
          fee_category: cat,
          display_name: DISPLAY_NAMES[cat] || cat.replace(/_/g, " "),
          national_median: r.median_amount != null ? Number(Number(r.median_amount).toFixed(2)) : null,
          segment_median: null,
          delta_pct: null,
          institution_count: Number(r.institution_count),
        };
      });
    }

    // Build filtered segment query
    const conditions = [
      "ef.fee_category IS NOT NULL",
      "ef.review_status != 'rejected'",
      "ef.amount IS NOT NULL",
    ];
    const params: (string | number | null)[] = [];
    let paramIdx = 1;

    if (filters.charter_type) {
      conditions.push(`ct.charter_type = $${paramIdx++}`);
      params.push(filters.charter_type);
    }
    if (filters.asset_tier) {
      conditions.push(`ct.asset_tier = $${paramIdx++}`);
      params.push(filters.asset_tier);
    }
    if (filters.state_code) {
      conditions.push(`ct.state_code = $${paramIdx++}`);
      params.push(filters.state_code);
    }

    const where = conditions.join(" AND ");
    const segRows = await sql.unsafe(
      `SELECT ef.fee_category,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ef.amount) as median,
              COUNT(DISTINCT ct.id) as inst_count
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ${where}
       GROUP BY ef.fee_category`,
      params,
    );

    const segMap = new Map<string, { median: number; count: number }>();
    for (const r of segRows) {
      segMap.set(String(r.fee_category), {
        median: Number(r.median),
        count: Number(r.inst_count),
      });
    }

    // Merge: union of all categories
    const allCats = new Set([...nationalMap.keys(), ...segMap.keys()]);
    const results: MarketIndexRow[] = [];
    for (const cat of allCats) {
      const nat = nationalMap.get(cat);
      const seg = segMap.get(cat);
      const natMedian = nat?.median ?? null;
      const segMedian = seg?.median ?? null;
      let deltaPct: number | null = null;
      if (natMedian != null && natMedian !== 0 && segMedian != null) {
        deltaPct = Number(((segMedian - natMedian) / natMedian * 100).toFixed(1));
      }
      results.push({
        fee_category: cat,
        display_name: DISPLAY_NAMES[cat] || cat.replace(/_/g, " "),
        national_median: natMedian != null ? Number(natMedian.toFixed(2)) : null,
        segment_median: segMedian != null ? Number(segMedian.toFixed(2)) : null,
        delta_pct: deltaPct,
        institution_count: seg?.count ?? nat?.count ?? 0,
      });
    }

    results.sort((a, b) => b.institution_count - a.institution_count);
    return results;
  } catch (e) {
    console.error("getMarketData failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Peer Index
// ---------------------------------------------------------------------------

export interface PeerIndexRow {
  fee_category: string;
  display_name: string;
  peer_median: number | null;
  national_median: number | null;
  delta_pct: number | null;
  peer_count: number;
  national_count: number;
}

export async function getPeerIndexData(filters: {
  charter_type?: string;
  asset_tier?: string;
  fed_district?: number;
}): Promise<PeerIndexRow[]> {
  try {
    const national = await sql`
      SELECT fee_category, median_amount, institution_count
      FROM fee_index_cache
    `;

    const { DISPLAY_NAMES } = await import("@/lib/fee-taxonomy");

    const nationalMap = new Map<string, { median: number | null; count: number }>();
    for (const r of national) {
      nationalMap.set(String(r.fee_category), {
        median: r.median_amount != null ? Number(r.median_amount) : null,
        count: Number(r.institution_count),
      });
    }

    const conditions = [
      "ef.fee_category IS NOT NULL",
      "ef.review_status != 'rejected'",
      "ef.amount IS NOT NULL",
    ];
    const params: (string | number | null)[] = [];
    let paramIdx = 1;

    if (filters.charter_type) {
      conditions.push(`ct.charter_type = $${paramIdx++}`);
      params.push(filters.charter_type);
    }
    if (filters.asset_tier) {
      conditions.push(`ct.asset_tier = $${paramIdx++}`);
      params.push(filters.asset_tier);
    }
    if (filters.fed_district) {
      conditions.push(`ct.fed_district = $${paramIdx++}`);
      params.push(filters.fed_district);
    }

    const where = conditions.join(" AND ");
    const peerRows = await sql.unsafe(
      `SELECT ef.fee_category,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ef.amount) as median,
              COUNT(DISTINCT ct.id) as inst_count
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ${where}
       GROUP BY ef.fee_category`,
      params,
    );

    const results: PeerIndexRow[] = [];
    for (const r of peerRows) {
      const cat = String(r.fee_category);
      const nat = nationalMap.get(cat);
      const peerMedian = Number(r.median);
      const natMedian = nat?.median ?? null;
      let deltaPct: number | null = null;
      if (natMedian != null && natMedian !== 0) {
        deltaPct = Number(((peerMedian - natMedian) / natMedian * 100).toFixed(1));
      }
      results.push({
        fee_category: cat,
        display_name: DISPLAY_NAMES[cat] || cat.replace(/_/g, " "),
        peer_median: Number(peerMedian.toFixed(2)),
        national_median: natMedian != null ? Number(natMedian.toFixed(2)) : null,
        delta_pct: deltaPct,
        peer_count: Number(r.inst_count),
        national_count: nat?.count ?? 0,
      });
    }

    results.sort((a, b) => b.peer_count - a.peer_count);
    return results;
  } catch (e) {
    console.error("getPeerIndexData failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Gold Standard Verification
// ---------------------------------------------------------------------------

export interface GoldStandardCandidate {
  id: number;
  institution_name: string;
  state_code: string | null;
  asset_size_tier: string | null;
  asset_size: number | null;
  fee_schedule_url: string | null;
  fee_count: number;
}

export async function getGoldStandardCandidates(
  limit = 50
): Promise<GoldStandardCandidate[]> {
  try {
    const rows = await sql`
      SELECT ct.id,
             ct.institution_name,
             ct.state_code,
             ct.asset_size_tier,
             ct.asset_size,
             ct.fee_schedule_url,
             COUNT(ef.id) as fee_count
      FROM crawl_targets ct
      JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
      WHERE ef.review_status != 'rejected'
      GROUP BY ct.id, ct.institution_name, ct.state_code,
               ct.asset_size_tier, ct.asset_size, ct.fee_schedule_url
      ORDER BY ct.asset_size DESC NULLS LAST
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      institution_name: String(r.institution_name),
      state_code: r.state_code ? String(r.state_code) : null,
      asset_size_tier: r.asset_size_tier ? String(r.asset_size_tier) : null,
      asset_size: r.asset_size != null ? Number(r.asset_size) : null,
      fee_schedule_url: r.fee_schedule_url ? String(r.fee_schedule_url) : null,
      fee_count: Number(r.fee_count),
    }));
  } catch (e) {
    console.error("getGoldStandardCandidates failed:", e);
    return [];
  }
}

export async function getGoldStandardCandidate(
  id: number
): Promise<GoldStandardCandidate | null> {
  try {
    const rows = await sql`
      SELECT ct.id,
             ct.institution_name,
             ct.state_code,
             ct.asset_size_tier,
             ct.asset_size,
             ct.fee_schedule_url,
             COUNT(ef.id) as fee_count
      FROM crawl_targets ct
      JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
      WHERE ct.id = ${id} AND ef.review_status != 'rejected'
      GROUP BY ct.id, ct.institution_name, ct.state_code,
               ct.asset_size_tier, ct.asset_size, ct.fee_schedule_url
    `;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: Number(r.id),
      institution_name: String(r.institution_name),
      state_code: r.state_code ? String(r.state_code) : null,
      asset_size_tier: r.asset_size_tier ? String(r.asset_size_tier) : null,
      asset_size: r.asset_size != null ? Number(r.asset_size) : null,
      fee_schedule_url: r.fee_schedule_url ? String(r.fee_schedule_url) : null,
      fee_count: Number(r.fee_count),
    };
  } catch (e) {
    console.error("getGoldStandardCandidate failed:", e);
    return null;
  }
}

export interface ExtractedFeeRow {
  id: number;
  fee_name: string;
  amount: number | null;
  fee_category: string | null;
  frequency: string | null;
  review_status: string;
}

export async function getExtractedFeesForInstitution(
  institutionId: number
): Promise<ExtractedFeeRow[]> {
  try {
    const rows = await sql`
      SELECT id, fee_name, amount, fee_category, frequency, review_status
      FROM extracted_fees
      WHERE crawl_target_id = ${institutionId}
        AND review_status != 'rejected'
      ORDER BY fee_category NULLS LAST, fee_name
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      fee_name: String(r.fee_name),
      amount: r.amount != null ? Number(r.amount) : null,
      fee_category: r.fee_category ? String(r.fee_category) : null,
      frequency: r.frequency ? String(r.frequency) : null,
      review_status: String(r.review_status),
    }));
  } catch (e) {
    console.error("getExtractedFeesForInstitution failed:", e);
    return [];
  }
}
