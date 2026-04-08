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
import { sql } from "@/lib/crawler-db/connection";
import { spawnJob } from "@/lib/job-runner";

// queryNationalData imports -- Phase 23-25 query functions
import {
  getRevenueTrend,
  getTopRevenueInstitutions,
  getRevenueByTier,
  getDistrictFeeRevenue,
} from "@/lib/crawler-db/call-reports";
import {
  getNationalEconomicSummary,
  getBeigeBookThemes,
  getFredSummary,
  getDistrictEconomicSummary,
  getDistrictContent,
  getRecentSpeeches,
} from "@/lib/crawler-db/fed";
import {
  getIndustryHealthMetrics,
  getHealthMetricsByCharter,
  getDepositGrowthTrend,
  getLoanGrowthTrend,
  getInstitutionCountTrends,
} from "@/lib/crawler-db/health";
import {
  getStateDemographics,
  getLatestIndicators,
  getSodMarketShare,
  getNyFedData,
  getOfrData,
} from "@/lib/crawler-db/financial";
import { getDistrictComplaintSummary, getNationalComplaintSummary } from "@/lib/crawler-db/complaints";
import { getIndexSnapshot, getPeerIndex } from "@/lib/crawler-db/fee-index";
import {
  getRevenueConcentration,
  getFeeDependencyTrend,
  getRevenuePerInstitutionTrend,
} from "@/lib/crawler-db/derived-analytics";
import {
  searchExternalIntelligence,
  listIntelligence,
} from "@/lib/crawler-db/intelligence";

/**
 * Admin-only tools for Fee Analyst and Custom Query agents.
 * These access internal DB functions not exposed via the public API.
 */

export const queryDistrictData = tool({
  description:
    "Returns institution count, fee count, coverage stats, and Beige Book commentary for a Fed district. When: district-level analysis, regional benchmarking. Combine with: queryNationalData, queryNationalData(complaints, district:N) for CFPB signals, queryNationalData(economic, district:N) for FRED labor/inflation data.",
  inputSchema: z.object({
    districtId: z.number().min(1).max(12).describe("Fed district number (1-12)"),
  }),
  execute: async ({ districtId }) => {
    const stats = await getDistrictStats(districtId);
    const beigeBook = await getLatestBeigeBook(districtId);

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
    "Returns institution count, fee count, and coverage stats for a US state. When: state-level scoping, geography filters, state ranking. Combine with: queryNationalData, queryNationalData(deposits, stateFips:XX) for deposit market share.",
  inputSchema: z.object({
    stateCode: z.string().length(2).describe("Two-letter state code (e.g., CA, TX)"),
  }),
  execute: async ({ stateCode }) => {
    return await getStateStats(stateCode.toUpperCase());
  },
});

export const queryFeeRevenueCorrelation = tool({
  description:
    "Returns correlation between published fee schedules and FDIC/NCUA service charge income. Views: institutions (per-institution), by_tier (asset tier summary), by_charter (bank vs CU). When: revenue dependency questions, fee-to-income analysis. Combine with: queryNationalData, queryNationalData(health) for ROA/efficiency context.",
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
      const data = await getFeeRevenueData();
      return {
        view: "institutions",
        total: data.length,
        data: data.slice(0, limit ?? 20),
      };
    }
    if (view === "by_charter") {
      return { view: "by_charter", data: await getCharterFeeRevenueSummary() };
    }
    return { view: "by_tier", data: await getTierFeeRevenueSummary() };
  },
});

export const queryOutliers = tool({
  description:
    "Returns fees flagged as statistical outliers — amounts significantly above or below category median. When: outlier detection, pricing anomalies, data quality review. Combine with: queryRegulatoryRisk if the outlier category is overdraft/NSF/junk fees, rankInstitutions(above_p75) for breadth across all categories.",
  inputSchema: z.object({
    category: z.string().optional().describe("Filter to a specific fee category"),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Max results to return"),
  }),
  execute: async ({ category, limit }) => {
    const result = await getOutlierFlaggedFees(limit ?? 20, 0, category);
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
    "Returns crawl health: total institutions, success rates, recent crawl activity. When: pipeline status questions, 'did the last crawl run?', coverage freshness checks. Combine with: getReviewQueueStats for review backlog, queryDataQuality(funnel) for end-to-end coverage picture.",
  inputSchema: z.object({}),
  execute: async () => {
    const health = await getCrawlHealth();
    const stats = await getStats();
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
    "Returns pending, approved, rejected, staged counts in the fee review pipeline. When: review backlog questions, approval pipeline health. Combine with: getCrawlStatus for pipeline breadth, queryDataQuality(review_status) for detailed breakdown.",
  inputSchema: z.object({}),
  execute: async () => {
    return await getReviewStats();
  },
});

export const searchInstitutionsByName = tool({
  description:
    "Returns matching institutions with IDs, state, city, charter type, and asset tier. When: named institution lookups, finding institution IDs for follow-up queries. Combine with: getInstitution (public tool) for full fee profile, queryFeeRevenueCorrelation(institutions) for revenue correlation.",
  inputSchema: z.object({
    query: z.string().describe("Institution name to search for"),
    limit: z.number().optional().default(10).describe("Max results"),
  }),
  execute: async ({ query, limit }) => {
    const rows = await sql`
      SELECT id, institution_name, state_code, city, charter_type, asset_size_tier
      FROM crawl_targets
      WHERE institution_name LIKE ${"%" + query + "%"}
      ORDER BY institution_name
      LIMIT ${limit ?? 10}
    ` as Array<{
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
    "Ranks institutions by above_p75 (most fees above 75th pct), below_p25, total_fees, or outlier_flags. When: 'which institutions have the highest fees?', pricing leadership, outlier leaderboard. Combine with: queryRegulatoryRisk if ranking by overdraft/NSF categories, queryNationalData(complaints) to correlate pricing with complaints.",
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
    const charterClause = charter ? sql`AND ct.charter_type = ${charter}` : sql``;
    const n = limit ?? 10;

    if (metric === "above_p75" || metric === "below_p25") {
      const benchmarks = await sql`
        SELECT fee_category, amount
        FROM extracted_fees
        WHERE fee_category IS NOT NULL AND amount > 0 AND review_status != 'rejected'
        ORDER BY fee_category, amount
      ` as { fee_category: string; amount: number }[];

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

      const instFees = await sql`
        SELECT ct.id, ct.institution_name, ct.state_code, ct.charter_type, ct.asset_size_tier,
               ef.fee_category, ef.amount
        FROM extracted_fees ef
        JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
        WHERE ef.fee_category IS NOT NULL AND ef.amount > 0 AND ef.review_status != 'rejected'
          ${charterClause}
      ` as { id: number; institution_name: string; state_code: string; charter_type: string; asset_size_tier: string; fee_category: string; amount: number }[];

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
      const rows = await sql`
        SELECT ct.institution_name, ct.state_code, ct.charter_type, ct.asset_size_tier,
               COUNT(*) as fee_count
        FROM extracted_fees ef
        JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
        WHERE ef.review_status != 'rejected' ${charterClause}
        GROUP BY ct.id, ct.institution_name, ct.state_code, ct.charter_type, ct.asset_size_tier
        ORDER BY fee_count DESC
        LIMIT ${n}
      ` as { institution_name: string; state_code: string; charter_type: string; asset_size_tier: string; fee_count: number }[];

      return { metric, results: rows };
    }

    if (metric === "outlier_flags") {
      const rows = await sql`
        SELECT ct.institution_name, ct.state_code, ct.charter_type, ct.asset_size_tier,
               COUNT(*) as flag_count
        FROM extracted_fees ef
        JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
        WHERE ef.validation_flags IS NOT NULL AND ef.validation_flags != '[]'
          AND ef.review_status != 'rejected' ${charterClause}
        GROUP BY ct.id, ct.institution_name, ct.state_code, ct.charter_type, ct.asset_size_tier
        ORDER BY flag_count DESC
        LIMIT ${n}
      ` as { institution_name: string; state_code: string; charter_type: string; asset_size_tier: string; flag_count: number }[];

      return { metric, results: rows };
    }

    return { error: "Unknown metric" };
  },
});

export const queryJobStatus = tool({
  description:
    "Returns recent, active, or detailed pipeline job status. When: 'did the last crawl succeed?', 'what's running now?', job failure investigation. Combine with: getCrawlStatus for coverage impact of recent jobs.",
  inputSchema: z.object({
    view: z
      .enum(["recent", "active", "detail"])
      .describe("'recent' for last 10 jobs, 'active' for running/queued, 'detail' for a specific job"),
    jobId: z.number().optional().describe("Job ID for detail view"),
  }),
  execute: async ({ view, jobId }) => {
    if (view === "detail" && jobId) {
      const [job] = await sql`SELECT * FROM ops_jobs WHERE id = ${jobId}`;
      return job || { error: "Job not found" };
    }
    if (view === "active") {
      return await sql`
        SELECT id, command, status, triggered_by, started_at
        FROM ops_jobs WHERE status IN ('running', 'queued')
        ORDER BY created_at DESC
      `;
    }
    return await sql`
      SELECT id, command, status, exit_code, triggered_by, started_at, completed_at, result_summary
      FROM ops_jobs ORDER BY created_at DESC LIMIT 10
    `;
  },
});

export const queryDataQuality = tool({
  description:
    "Returns data quality metrics: funnel (coverage), uncategorized fees, stale institutions, review_status breakdown. When: coverage gap questions, data hygiene review, pre-analysis quality check. Combine with: getCrawlStatus for pipeline health, queryNationalData(fee_index) to contextualize coverage against category depth.",
  inputSchema: z.object({
    view: z
      .enum(["funnel", "uncategorized", "stale", "review_status"])
      .describe("Which quality metric to query"),
  }),
  execute: async ({ view }) => {
    if (view === "funnel") {
      const [row] = await sql`
        SELECT
          (SELECT COUNT(*) FROM crawl_targets) as total_institutions,
          (SELECT COUNT(*) FROM crawl_targets WHERE fee_schedule_url IS NOT NULL) as with_fee_url,
          (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees WHERE review_status != 'rejected') as with_fees,
          (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees WHERE review_status = 'approved') as with_approved,
          (SELECT COUNT(*) FROM extracted_fees WHERE review_status != 'rejected') as total_fees,
          (SELECT COUNT(*) FROM extracted_fees WHERE review_status = 'approved') as approved_fees
      `;
      return row;
    }
    if (view === "uncategorized") {
      const [count] = await sql`
        SELECT COUNT(*) as cnt FROM extracted_fees WHERE fee_category IS NULL AND review_status != 'rejected'
      ` as { cnt: number }[];
      const top = await sql`
        SELECT fee_name, COUNT(*) as cnt FROM extracted_fees
        WHERE fee_category IS NULL AND review_status != 'rejected'
        GROUP BY fee_name ORDER BY cnt DESC LIMIT 15
      `;
      return { total_uncategorized: count.cnt, top_names: top };
    }
    if (view === "stale") {
      const [stale] = await sql`
        SELECT COUNT(*) as cnt FROM crawl_targets
        WHERE fee_schedule_url IS NOT NULL
          AND (last_crawl_at IS NULL OR last_crawl_at < NOW() - INTERVAL '90 days')
      ` as { cnt: number }[];
      return { stale_institutions: stale.cnt, threshold_days: 90 };
    }
    // review_status
    return await sql`
      SELECT review_status, COUNT(*) as cnt FROM extracted_fees GROUP BY review_status ORDER BY cnt DESC
    `;
  },
});

const SAFE_PIPELINE_COMMANDS = new Set([
  "categorize", "auto-review", "validate", "outlier-detect",
  "enrich", "publish-index", "snapshot", "merge-fees",
]);

export const triggerPipelineJob = tool({
  description:
    "Triggers a safe pipeline job: categorize, auto-review, validate, outlier-detect, enrich, publish-index, snapshot, merge-fees. When: operator asks to run a pipeline step. Does NOT trigger crawl or discover (those use API credits). Combine with: queryJobStatus to confirm the triggered job is running.",
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
      const result = await spawnJob(command, args, "agent");
      return { success: true, jobId: result.jobId, pid: result.pid, logPath: result.logPath };
    } catch (e) {
      return { error: String(e) };
    }
  },
});

// ── Unified National Data Tool ───────────────────────────────────────────────

const VALID_SOURCES = ["call_reports", "economic", "health", "complaints", "fee_index", "derived", "fed_content", "labor", "demographics", "research", "deposits", "external"] as const;

export const queryNationalData = tool({
  description:
    "Query national summary data across all 12 source domains. Sources: call_reports (FDIC/NCUA revenue trends), economic (FRED rates, Beige Book themes), health (ROA, efficiency, deposits, loans), complaints (CFPB district summaries), fee_index (national/peer fee medians), derived (concentration, fee dependency), fed_content (Fed speeches/papers by district), labor (BLS unemployment, payroll, bank-fee CPI), demographics (Census ACS income/poverty by state), research (NY Fed + OFR financial stability data), deposits (FDIC SOD market share), external (admin-curated research, surveys, reports -- use 'query' param for full-text search). When: any macroeconomic, regional, or financial context question. Combine with: district analysis → economic+complaints+fed_content; compliance question → complaints+fee_index+fed_content; consumer impact → demographics+labor+fee_index; external context → external+fee_index for industry research alongside fee data.",
  inputSchema: z.object({
    source: z.enum(["call_reports", "economic", "health", "complaints", "fee_index", "derived", "fed_content", "labor", "demographics", "research", "deposits", "external"])
      .describe("Data source category to query"),
    view: z.string().optional()
      .describe("Specific view within the source (e.g., 'trend', 'by_tier', 'fred', 'concentration'). For external source, doubles as category filter."),
    query: z.string().optional()
      .describe("Search query text (used for external source full-text search)"),
    limit: z.number().optional().default(10)
      .describe("Limit results (for top_institutions, fee_index)"),
    quarters: z.number().optional().default(8)
      .describe("Number of quarters for trend data"),
    district: z.number().min(1).max(12).optional()
      .describe("Fed district number (for complaints, economic district view, fed_content)"),
    charter: z.enum(["bank", "credit_union"]).optional()
      .describe("Charter type filter"),
    tiers: z.array(z.string()).optional()
      .describe("Asset size tier filter (for fee_index peer queries)"),
    top_n: z.number().optional().default(5)
      .describe("Top N for concentration analysis"),
    stateFips: z.string().optional()
      .describe("State FIPS code for demographics/deposits (e.g., '06' for California, '36' for New York)"),
    seriesIds: z.array(z.string()).optional()
      .describe("BLS series IDs for labor view (defaults to unemployment, payroll, bank fee CPI)"),
  }),
  execute: async ({ source, view, query, limit, quarters, district, charter, tiers, top_n, stateFips, seriesIds }) => {
    switch (source) {
      case "call_reports":
        return handleCallReports(view, quarters, limit, district);
      case "economic":
        return handleEconomic(view, district);
      case "health":
        return handleHealth(view, quarters);
      case "complaints":
        return handleComplaints(district);
      case "fee_index":
        return handleFeeIndex(charter, tiers, limit);
      case "derived":
        return handleDerived(view, top_n, quarters);
      case "fed_content":
        return handleFedContent(district, limit ?? 10);
      case "labor":
        return handleLabor(seriesIds);
      case "demographics":
        return handleDemographics(stateFips);
      case "research":
        return handleResearch(limit ?? 20);
      case "deposits":
        return handleDeposits(stateFips, limit ?? 10);
      case "external":
        return handleExternal(query, view, limit);
      default:
        return { error: `Unknown source '${source}'. Valid sources: ${VALID_SOURCES.join(", ")}` };
    }
  },
});

async function handleCallReports(
  view: string | undefined,
  quarters: number,
  limit: number,
  district: number | undefined
) {
  if (!view || view === "all") {
    const [trend, top_institutions, by_tier] = await Promise.all([
      getRevenueTrend(quarters),
      getTopRevenueInstitutions(limit),
      getRevenueByTier(),
    ]);
    return { trend, top_institutions, by_tier };
  }
  switch (view) {
    case "trend":
      return { trend: await getRevenueTrend(quarters) };
    case "top_institutions":
      return { top_institutions: await getTopRevenueInstitutions(limit) };
    case "by_tier":
      return { by_tier: await getRevenueByTier() };
    case "by_district":
      return { district_revenue: await getDistrictFeeRevenue(district ?? 1) };
    default:
      return { error: `Unknown call_reports view '${view}'. Valid: trend, top_institutions, by_tier, by_district` };
  }
}

async function handleEconomic(view: string | undefined, district: number | undefined) {
  if (!view || view === "all") {
    const [national_summary, beige_book_themes, fred_summary] = await Promise.all([
      getNationalEconomicSummary(),
      getBeigeBookThemes(),
      getFredSummary(),
    ]);
    return { national_summary, beige_book_themes, fred_summary };
  }
  switch (view) {
    case "fred":
      return { fred_summary: await getFredSummary() };
    case "beige_book":
      return { beige_book_themes: await getBeigeBookThemes() };
    case "national":
      return { national_summary: await getNationalEconomicSummary() };
    case "district":
      if (!district) return { error: "district parameter required for economic district view" };
      return { district_summary: await getDistrictEconomicSummary(district) };
    default:
      return { error: `Unknown economic view '${view}'. Valid: fred, beige_book, national, district` };
  }
}

async function handleHealth(view: string | undefined, quarters: number) {
  if (!view || view === "all") {
    const [metrics, by_charter, deposits, loans, institution_counts] = await Promise.all([
      getIndustryHealthMetrics(),
      getHealthMetricsByCharter(),
      getDepositGrowthTrend(quarters),
      getLoanGrowthTrend(quarters),
      getInstitutionCountTrends(quarters),
    ]);
    return { metrics, by_charter, deposits, loans, institution_counts };
  }
  switch (view) {
    case "metrics":
      return { metrics: await getIndustryHealthMetrics() };
    case "by_charter":
      return { by_charter: await getHealthMetricsByCharter() };
    case "deposits":
      return { deposits: await getDepositGrowthTrend(quarters) };
    case "loans":
      return { loans: await getLoanGrowthTrend(quarters) };
    case "institution_counts":
      return { institution_counts: await getInstitutionCountTrends(quarters) };
    default:
      return { error: `Unknown health view '${view}'. Valid: metrics, by_charter, deposits, loans, institution_counts` };
  }
}

async function handleComplaints(district: number | undefined) {
  if (!district) return { error: "district parameter required for complaints source" };
  return { complaints: await getDistrictComplaintSummary(district) };
}

async function handleFeeIndex(
  charter: string | undefined,
  tiers: string[] | undefined,
  limit: number
) {
  if (charter || tiers) {
    const filters: { charter_type?: string; asset_tiers?: string[] } = {};
    if (charter) filters.charter_type = charter;
    if (tiers) filters.asset_tiers = tiers;
    return { index: await getPeerIndex(filters) };
  }
  return { index: await getIndexSnapshot(undefined, limit) };
}

async function handleDerived(
  view: string | undefined,
  top_n: number,
  quarters: number
) {
  if (!view || view === "all") {
    const [concentration, dependency, revenue_per_institution] = await Promise.all([
      getRevenueConcentration(top_n),
      getFeeDependencyTrend(quarters),
      getRevenuePerInstitutionTrend(quarters),
    ]);
    return { concentration, dependency, revenue_per_institution };
  }
  switch (view) {
    case "concentration":
      return { concentration: await getRevenueConcentration(top_n) };
    case "dependency":
      return { dependency: await getFeeDependencyTrend(quarters) };
    case "revenue_per_institution":
      return { revenue_per_institution: await getRevenuePerInstitutionTrend(quarters) };
    default:
      return { error: `Unknown derived view '${view}'. Valid: concentration, dependency, revenue_per_institution` };
  }
}

// ── New source handlers (Phase 36) ───────────────────────────────────────────

const BLS_LABOR_SERIES = ["LNS14000000", "CES0000000001", "CUUR0000SEMC01"] as const;

async function handleFedContent(district: number | undefined, limit: number) {
  if (district) {
    const content = await getDistrictContent(district, limit);
    return {
      district,
      content: content.map((c) => ({
        type: c.content_type,
        title: c.title,
        speaker: c.speaker,
        published: c.published_at,
        description: c.description,
      })),
    };
  }
  const speeches = await getRecentSpeeches(limit);
  return {
    speeches: speeches.map((c) => ({
      type: c.content_type,
      title: c.title,
      speaker: c.speaker,
      district: c.fed_district,
      published: c.published_at,
    })),
  };
}

async function handleLabor(seriesIds: string[] | undefined) {
  const ids = seriesIds && seriesIds.length > 0 ? seriesIds : [...BLS_LABOR_SERIES];
  const indicators = await getLatestIndicators(ids);
  return { labor_indicators: indicators };
}

async function handleDemographics(stateFips: string | undefined) {
  if (!stateFips) {
    return {
      error: "stateFips parameter required for demographics source (e.g., '06' for California, '36' for New York)",
    };
  }
  const state = await getStateDemographics(stateFips);
  return { state_demographics: state };
}

async function handleResearch(limit: number) {
  const [nyfed, ofr] = await Promise.all([getNyFedData(limit), getOfrData(limit)]);
  return { nyfed_data: nyfed, ofr_data: ofr };
}

async function handleDeposits(stateFips: string | undefined, limit: number) {
  const data = await getSodMarketShare(stateFips);
  return { deposit_market_share: data.slice(0, limit) };
}

async function handleExternal(
  query: string | undefined,
  view: string | undefined,
  limit: number
) {
  if (query) {
    const category = view || undefined;
    const results = await searchExternalIntelligence(query, category ? { category } : undefined);
    return {
      query,
      results: results.map((r) => ({
        source_name: r.source_name,
        source_date: r.source_date,
        category: r.category,
        tags: r.tags,
        headline: r.headline,
        content_snippet: r.content_text.substring(0, 500),
        source_url: r.source_url,
        citation: `[Source: ${r.source_name}, ${r.source_date}]`,
      })),
      total: results.length,
    };
  }

  const { items, total } = await listIntelligence(limit, 0);
  return {
    items: items.map((r) => ({
      source_name: r.source_name,
      source_date: r.source_date,
      category: r.category,
      tags: r.tags,
      content_snippet: r.content_text.substring(0, 300),
      source_url: r.source_url,
      citation: `[Source: ${r.source_name}, ${r.source_date}]`,
    })),
    total,
  };
}

// ── Regulatory Risk Tool ──────────────────────────────────────────────────────

const REGULATED_FEE_CATEGORIES = [
  "overdraft",
  "nsf",
  "monthly_maintenance",
  "atm_non_network",
  "wire_domestic_outgoing",
] as const;

const REGULATORY_KEYWORDS = [
  "overdraft",
  "junk fee",
  "consumer protection",
  "fee",
  "cfpb",
  "enforcement",
] as const;

export const queryRegulatoryRisk = tool({
  description:
    "Assesses regulatory risk by cross-referencing fee outliers in scrutinized categories (overdraft, NSF, junk fees), CFPB complaint volumes for fee-related products, and recent Fed speeches mentioning enforcement signals. Returns risk score (0-100), affected institution count, and three signal sources. When: compliance risk questions, 'how many institutions face enforcement risk?', CFPB enforcement impact analysis, regulatory pressure on fee categories. Combine with: queryOutliers for institution-level outlier detail, queryNationalData(complaints) for district-level complaint breakdown, queryNationalData(fed_content) for full speech text.",
  inputSchema: z.object({
    categories: z
      .array(z.string())
      .optional()
      .describe(
        "Fee categories to assess (default: overdraft, nsf, monthly_maintenance, atm_non_network, wire_domestic_outgoing)"
      ),
    district: z
      .number()
      .min(1)
      .max(12)
      .optional()
      .describe("Narrow complaint signals to a specific Fed district"),
    limit: z.number().optional().default(5).describe("Max outlier institutions to surface"),
  }),
  execute: async ({ categories, district: _district, limit }) => {
    const targetCategories = categories && categories.length > 0
      ? categories
      : [...REGULATED_FEE_CATEGORIES];
    const n = limit ?? 5;

    // 1. Fee outlier signals — institutions above P75 in regulated categories
    const feeOutlierSignals = await (async () => {
      try {
        const fees = await sql`
          SELECT ef.fee_category, ef.amount, ct.institution_name, ct.state_code
          FROM extracted_fees ef
          JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
          WHERE ef.fee_category = ANY(${targetCategories}::text[])
            AND ef.amount > 0
            AND ef.review_status != 'rejected'
          ORDER BY ef.fee_category, ef.amount DESC
        ` as { fee_category: string; amount: number; institution_name: string; state_code: string }[];

        // Compute P75 per category
        const grouped: Record<string, number[]> = {};
        for (const r of fees) {
          if (!grouped[r.fee_category]) grouped[r.fee_category] = [];
          grouped[r.fee_category].push(r.amount);
        }
        const p75Map: Record<string, number> = {};
        for (const [cat, amounts] of Object.entries(grouped)) {
          const sorted = [...amounts].sort((a, b) => a - b);
          p75Map[cat] = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
        }

        const outliers = fees.filter((r) => r.amount > (p75Map[r.fee_category] ?? 0));
        const uniqueInstitutions = [...new Set(outliers.map((r) => r.institution_name))];

        return {
          outlier_institution_count: uniqueInstitutions.length,
          top_institutions: uniqueInstitutions.slice(0, n),
          categories_with_outliers: Object.keys(p75Map).filter((cat) =>
            fees.some((r) => r.fee_category === cat && r.amount > (p75Map[cat] ?? 0))
          ),
        };
      } catch {
        return { outlier_institution_count: 0, top_institutions: [], categories_with_outliers: [] };
      }
    })();

    // 2. Complaint signals — fee-related CFPB products
    const complaintSignals = await (async () => {
      try {
        const national = await getNationalComplaintSummary();
        return {
          total_fee_complaints: national.total_complaints,
          fee_related_pct: national.fee_related_pct,
          average_per_institution: national.average_per_institution,
        };
      } catch {
        return { total_fee_complaints: 0, fee_related_pct: 0, average_per_institution: 0 };
      }
    })();

    // 3. Fed Content signals — recent speeches mentioning regulatory keywords
    const fedContentSignals = await (async () => {
      try {
        const speeches = await getRecentSpeeches(30);
        const relevant = speeches.filter((s) => {
          const text = `${s.title ?? ""} ${s.description ?? ""}`.toLowerCase();
          return REGULATORY_KEYWORDS.some((kw) => text.includes(kw));
        });
        return {
          signal_count: relevant.length,
          recent_titles: relevant.slice(0, 3).map((s) => ({
            title: s.title,
            speaker: s.speaker,
            published: s.published_at,
          })),
        };
      } catch {
        return { signal_count: 0, recent_titles: [] };
      }
    })();

    // Compute risk score: up to 33 points per signal source
    const outlierScore = Math.min(
      33,
      Math.round((feeOutlierSignals.outlier_institution_count / 100) * 33)
    );
    const complaintScore = Math.min(
      33,
      Math.round((Math.min(complaintSignals.total_fee_complaints, 1000) / 1000) * 33)
    );
    const fedScore = Math.min(34, fedContentSignals.signal_count * 10);
    const riskScore = Math.min(100, outlierScore + complaintScore + fedScore);

    return {
      risk_score: riskScore,
      risk_label: riskScore >= 70 ? "high" : riskScore >= 40 ? "moderate" : "low",
      signal_count:
        feeOutlierSignals.categories_with_outliers.length +
        (fedContentSignals.signal_count > 0 ? 1 : 0) +
        (complaintSignals.total_fee_complaints > 0 ? 1 : 0),
      affected_institutions: feeOutlierSignals.outlier_institution_count,
      fee_outlier_signals: feeOutlierSignals,
      complaint_signals: complaintSignals,
      fed_content_signals: fedContentSignals,
      categories_assessed: targetCategories,
    };
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
  queryNationalData,
  queryRegulatoryRisk,
};
