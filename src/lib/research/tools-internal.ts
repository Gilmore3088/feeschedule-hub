import { tool } from "ai";
import { z } from "zod";
import { getDistrictStats, getStateStats } from "@/lib/crawler-db/geographic";
import { getLatestBeigeBook } from "@/lib/crawler-db/fed";
import {
  getFeeRevenueData,
  getTierFeeRevenueSummary,
  getCharterFeeRevenueSummary,
} from "@/lib/crawler-db/fee-revenue";
import { getOutlierFlaggedFees, getReviewStats, getStats } from "@/lib/crawler-db/core";
import { getCrawlHealth } from "@/lib/crawler-db/dashboard";
import { getDb } from "@/lib/crawler-db/connection";
import { spawnJob } from "@/lib/job-runner";

/**
 * Admin-only tools for Fee Analyst and Custom Query agents.
 * These access internal DB functions not exposed via the public API.
 */

export const queryDistrictData = tool({
  description:
    "Get comprehensive data for a Federal Reserve district: institution count, fee count, coverage, Beige Book economic commentary.",
  inputSchema: z.object({
    districtId: z.number().min(1).max(12).describe("Fed district number (1-12)"),
  }),
  execute: async ({ districtId }) => {
    const stats = getDistrictStats(districtId);
    const beigeBook = getLatestBeigeBook(districtId);

    return {
      district: districtId,
      stats,
      beige_book: beigeBook.map((b) => ({
        section: b.section_name,
        content: b.content_text.substring(0, 500),
      })),
    };
  },
});

export const queryStateData = tool({
  description:
    "Get comprehensive data for a US state: institution count, fee count, coverage stats.",
  inputSchema: z.object({
    stateCode: z.string().length(2).describe("Two-letter state code (e.g., CA, TX)"),
  }),
  execute: async ({ stateCode }) => {
    return getStateStats(stateCode.toUpperCase());
  },
});

export const queryFeeRevenueCorrelation = tool({
  description:
    "Get fee-to-revenue correlation data showing how extracted fees relate to service charge income from call reports. Includes per-institution data, tier summaries, and charter type summaries.",
  inputSchema: z.object({
    view: z
      .enum(["institutions", "by_tier", "by_charter"])
      .optional()
      .default("by_tier")
      .describe("Which view to return"),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Max institutions to return (only for 'institutions' view)"),
  }),
  execute: async ({ view, limit }) => {
    if (view === "institutions") {
      const data = getFeeRevenueData();
      return {
        view: "institutions",
        total: data.length,
        data: data.slice(0, limit ?? 20),
      };
    }
    if (view === "by_charter") {
      return { view: "by_charter", data: getCharterFeeRevenueSummary() };
    }
    return { view: "by_tier", data: getTierFeeRevenueSummary() };
  },
});

export const queryOutliers = tool({
  description:
    "Get fees flagged as statistical outliers (significantly above or below median). Useful for identifying unusual pricing.",
  inputSchema: z.object({
    category: z.string().optional().describe("Filter to a specific fee category"),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Max results to return"),
  }),
  execute: async ({ category, limit }) => {
    const result = getOutlierFlaggedFees(limit ?? 20, 0, category);
    return {
      total: result.total,
      data: result.fees.map((f) => ({
        id: f.id,
        institution_name: f.institution_name,
        fee_name: f.fee_name,
        amount: f.amount,
        fee_category: f.fee_category,
        flag_reason: f.validation_flags,
        state: f.state_code,
      })),
    };
  },
});

export const getCrawlStatus = tool({
  description:
    "Get current crawl health and pipeline status: total institutions, success rates, recent crawl activity.",
  inputSchema: z.object({}),
  execute: async () => {
    const health = getCrawlHealth();
    const stats = getStats();
    return {
      total_institutions: stats.total_institutions,
      institutions_with_fees: stats.with_fee_url,
      total_fees: stats.total_fees,
      crawl_health: health,
    };
  },
});

export const getReviewQueueStats = tool({
  description:
    "Get review queue statistics: pending, approved, rejected, staged counts.",
  inputSchema: z.object({}),
  execute: async () => {
    return getReviewStats();
  },
});

export const searchInstitutionsByName = tool({
  description:
    "Search for institutions by name (fuzzy match). Returns matching institutions with IDs.",
  inputSchema: z.object({
    query: z.string().describe("Institution name to search for"),
    limit: z.number().optional().default(10).describe("Max results"),
  }),
  execute: async ({ query, limit }) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, institution_name, state_code, city, charter_type, asset_size_tier
         FROM crawl_targets
         WHERE institution_name LIKE ?
         ORDER BY institution_name
         LIMIT ?`
      )
      .all(`%${query}%`, limit ?? 10) as Array<{
      id: number;
      institution_name: string;
      state_code: string;
      city: string;
      charter_type: string;
      asset_size_tier: string;
    }>;

    return {
      total: rows.length,
      data: rows.map((r) => ({
        id: r.id,
        name: r.institution_name,
        state: r.state_code,
        city: r.city,
        charter_type: r.charter_type,
        asset_tier: r.asset_size_tier,
      })),
    };
  },
});

export const rankInstitutions = tool({
  description:
    "Rank institutions by fee positioning against national benchmarks. Returns top N institutions with counts of fees above P75, below P25, total fee count, or outlier count. Use this for questions like 'which institutions have the most expensive fees' or 'top 10 by outliers'.",
  inputSchema: z.object({
    metric: z
      .enum(["above_p75", "below_p25", "total_fees", "outlier_flags"])
      .describe("Ranking metric: above_p75 (most fees above 75th pct), below_p25 (most below 25th), total_fees (most observations), outlier_flags (most validation flags)"),
    charter: z
      .enum(["bank", "credit_union"])
      .optional()
      .describe("Filter by charter type"),
    limit: z.number().optional().default(10).describe("Number of results"),
  }),
  execute: async ({ metric, charter, limit }) => {
    const db = getDb();
    const charterWhere = charter ? `AND ct.charter_type = '${charter}'` : "";
    const n = limit ?? 10;

    if (metric === "above_p75" || metric === "below_p25") {
      // Get national P25/P75 per category
      const benchmarks = db.prepare(`
        SELECT fee_category, amount
        FROM extracted_fees
        WHERE fee_category IS NOT NULL AND amount > 0 AND review_status != 'rejected'
        ORDER BY fee_category, amount
      `).all() as { fee_category: string; amount: number }[];

      const pctMap: Record<string, { p25: number; p75: number }> = {};
      const grouped: Record<string, number[]> = {};
      for (const r of benchmarks) {
        if (!grouped[r.fee_category]) grouped[r.fee_category] = [];
        grouped[r.fee_category].push(r.amount);
      }
      for (const [cat, amounts] of Object.entries(grouped)) {
        const sorted = amounts.sort((a, b) => a - b);
        pctMap[cat] = {
          p25: sorted[Math.floor(sorted.length * 0.25)],
          p75: sorted[Math.floor(sorted.length * 0.75)],
        };
      }

      const threshold = metric === "above_p75" ? "p75" : "p25";
      const comparison = metric === "above_p75" ? ">" : "<";

      // Count per institution
      const instFees = db.prepare(`
        SELECT ct.id, ct.institution_name, ct.state_code, ct.charter_type, ct.asset_size_tier,
               ef.fee_category, ef.amount
        FROM extracted_fees ef
        JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
        WHERE ef.fee_category IS NOT NULL AND ef.amount > 0 AND ef.review_status != 'rejected'
          ${charterWhere}
      `).all() as { id: number; institution_name: string; state_code: string; charter_type: string; asset_size_tier: string; fee_category: string; amount: number }[];

      const counts: Record<number, { name: string; state: string; charter: string; tier: string; count: number; total: number; categories: string[] }> = {};
      for (const r of instFees) {
        if (!counts[r.id]) counts[r.id] = { name: r.institution_name, state: r.state_code, charter: r.charter_type, tier: r.asset_size_tier, count: 0, total: 0, categories: [] };
        counts[r.id].total++;
        const pct = pctMap[r.fee_category];
        if (pct) {
          const pass = comparison === ">" ? r.amount > pct[threshold] : r.amount < pct[threshold];
          if (pass) {
            counts[r.id].count++;
            if (!counts[r.id].categories.includes(r.fee_category)) {
              counts[r.id].categories.push(r.fee_category);
            }
          }
        }
      }

      const ranked = Object.entries(counts)
        .map(([id, data]) => ({ id: Number(id), ...data, pct_above: Math.round(data.count / Math.max(data.total, 1) * 100) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, n);

      return {
        metric,
        results: ranked.map(r => ({
          institution: r.name,
          state: r.state,
          charter_type: r.charter,
          asset_tier: r.tier,
          matching_fees: r.count,
          total_fees: r.total,
          pct: r.pct_above + "%",
          categories: r.categories.slice(0, 5),
        })),
      };
    }

    if (metric === "total_fees") {
      const rows = db.prepare(`
        SELECT ct.institution_name, ct.state_code, ct.charter_type, ct.asset_size_tier,
               COUNT(*) as fee_count
        FROM extracted_fees ef
        JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
        WHERE ef.review_status != 'rejected' ${charterWhere}
        GROUP BY ct.id
        ORDER BY fee_count DESC
        LIMIT ?
      `).all(n) as { institution_name: string; state_code: string; charter_type: string; asset_size_tier: string; fee_count: number }[];

      return { metric, results: rows };
    }

    if (metric === "outlier_flags") {
      const rows = db.prepare(`
        SELECT ct.institution_name, ct.state_code, ct.charter_type, ct.asset_size_tier,
               COUNT(*) as flag_count
        FROM extracted_fees ef
        JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
        WHERE ef.validation_flags IS NOT NULL AND ef.validation_flags != '[]'
          AND ef.review_status != 'rejected' ${charterWhere}
        GROUP BY ct.id
        ORDER BY flag_count DESC
        LIMIT ?
      `).all(n) as { institution_name: string; state_code: string; charter_type: string; asset_size_tier: string; flag_count: number }[];

      return { metric, results: rows };
    }

    return { error: "Unknown metric" };
  },
});

export const queryJobStatus = tool({
  description:
    "Get pipeline job status: recent jobs, active jobs, or details of a specific job. Answers 'did the last crawl succeed?' and 'what jobs are running?'.",
  inputSchema: z.object({
    view: z
      .enum(["recent", "active", "detail"])
      .describe("'recent' for last 10 jobs, 'active' for running/queued, 'detail' for a specific job"),
    jobId: z.number().optional().describe("Job ID for detail view"),
  }),
  execute: async ({ view, jobId }) => {
    const db = getDb();
    if (view === "detail" && jobId) {
      const job = db
        .prepare("SELECT * FROM ops_jobs WHERE id = ?")
        .get(jobId);
      return job || { error: "Job not found" };
    }
    if (view === "active") {
      return db
        .prepare("SELECT id, command, status, triggered_by, started_at FROM ops_jobs WHERE status IN ('running', 'queued') ORDER BY created_at DESC")
        .all();
    }
    return db
      .prepare("SELECT id, command, status, exit_code, triggered_by, started_at, completed_at, result_summary FROM ops_jobs ORDER BY created_at DESC LIMIT 10")
      .all();
  },
});

export const queryDataQuality = tool({
  description:
    "Get data quality metrics: coverage funnel, uncategorized fees, stale institutions, review pipeline health.",
  inputSchema: z.object({
    view: z
      .enum(["funnel", "uncategorized", "stale", "review_status"])
      .describe("Which quality metric to query"),
  }),
  execute: async ({ view }) => {
    const db = getDb();
    if (view === "funnel") {
      return db
        .prepare(`
          SELECT
            (SELECT COUNT(*) FROM crawl_targets) as total_institutions,
            (SELECT COUNT(*) FROM crawl_targets WHERE fee_schedule_url IS NOT NULL) as with_fee_url,
            (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees WHERE review_status != 'rejected') as with_fees,
            (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees WHERE review_status = 'approved') as with_approved,
            (SELECT COUNT(*) FROM extracted_fees WHERE review_status != 'rejected') as total_fees,
            (SELECT COUNT(*) FROM extracted_fees WHERE review_status = 'approved') as approved_fees
        `)
        .get();
    }
    if (view === "uncategorized") {
      const count = db
        .prepare("SELECT COUNT(*) as cnt FROM extracted_fees WHERE fee_category IS NULL AND review_status != 'rejected'")
        .get() as { cnt: number };
      const top = db
        .prepare("SELECT fee_name, COUNT(*) as cnt FROM extracted_fees WHERE fee_category IS NULL AND review_status != 'rejected' GROUP BY fee_name ORDER BY cnt DESC LIMIT 15")
        .all();
      return { total_uncategorized: count.cnt, top_names: top };
    }
    if (view === "stale") {
      const stale = db
        .prepare(`
          SELECT COUNT(*) as cnt FROM crawl_targets
          WHERE fee_schedule_url IS NOT NULL
            AND (last_crawl_at IS NULL OR last_crawl_at < datetime('now', '-90 days'))
        `)
        .get() as { cnt: number };
      return { stale_institutions: stale.cnt, threshold_days: 90 };
    }
    // review_status
    return db
      .prepare("SELECT review_status, COUNT(*) as cnt FROM extracted_fees GROUP BY review_status ORDER BY cnt DESC")
      .all();
  },
});

const SAFE_PIPELINE_COMMANDS = new Set([
  "categorize", "auto-review", "validate", "outlier-detect",
  "enrich", "publish-index", "snapshot", "merge-fees",
]);

export const triggerPipelineJob = tool({
  description:
    "Trigger a pipeline job (admin only). Safe commands: categorize, auto-review, validate, outlier-detect, enrich, publish-index, snapshot, merge-fees. Does NOT allow crawl or discover (those use API credits).",
  inputSchema: z.object({
    command: z.string().describe("Pipeline command name"),
    dryRun: z.boolean().optional().default(false).describe("If true, pass --dry-run flag"),
  }),
  execute: async ({ command, dryRun }) => {
    if (!SAFE_PIPELINE_COMMANDS.has(command)) {
      return { error: `Command '${command}' not allowed. Safe commands: ${[...SAFE_PIPELINE_COMMANDS].join(", ")}` };
    }
    try {
      const args = dryRun ? ["--dry-run"] : [];
      const result = spawnJob(command, args, "agent");
      return { success: true, jobId: result.jobId, pid: result.pid, logPath: result.logPath };
    } catch (e) {
      return { error: String(e) };
    }
  },
});

/** All internal tools bundled for admin agent configs */
export const internalTools = {
  queryDistrictData,
  queryStateData,
  queryFeeRevenueCorrelation,
  queryOutliers,
  getCrawlStatus,
  getReviewQueueStats,
  searchInstitutionsByName,
  rankInstitutions,
  queryJobStatus,
  queryDataQuality,
  triggerPipelineJob,
};
