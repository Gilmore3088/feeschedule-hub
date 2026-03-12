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

/** All internal tools bundled for admin agent configs */
export const internalTools = {
  queryDistrictData,
  queryStateData,
  queryFeeRevenueCorrelation,
  queryOutliers,
  getCrawlStatus,
  getReviewQueueStats,
  searchInstitutionsByName,
};
