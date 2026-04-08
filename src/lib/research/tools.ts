import { tool } from "ai";
import { z } from "zod";
import {
  getFeeCategorySummaries,
  getFeeCategoryDetail,
} from "@/lib/crawler-db";
import { getNationalIndex, getPeerIndex } from "@/lib/crawler-db";
import {
  getInstitutionById,
  getFeesByInstitution,
  getInstitutionsByFilter,
} from "@/lib/crawler-db";
import { getDisplayName, getFeeFamily, getFeeTier } from "@/lib/fee-taxonomy";

/**
 * Public tools — wrap the same logic as /api/v1/ routes but call DB directly
 * (avoids HTTP round-trip when running server-side in the same process).
 */

export const searchFees = tool({
  description:
    "Returns national statistics (median, P25, P75, min, max, institution count) for each of 49 fee categories. Optionally returns detailed breakdown for a single category by charter type, asset tier, Fed district, and state. When: fee benchmark questions, 'what is the national average overdraft fee?', category deep-dives. Combine with: searchIndex for filtered peer comparison, queryNationalData(complaints) when the category is overdraft/NSF (regulatory context adds value).",
  inputSchema: z.object({
    category: z
      .string()
      .optional()
      .describe(
        "Fee category slug (e.g., overdraft, nsf, monthly_maintenance). Omit for all 49 categories."
      ),
  }),
  execute: async ({ category }) => {
    if (category) {
      const detail = await getFeeCategoryDetail(category);
      if (!detail || detail.fees.length === 0) {
        return { error: "Category not found", category };
      }
      return {
        category,
        display_name: getDisplayName(category),
        family: getFeeFamily(category),
        tier: getFeeTier(category),
        summary: {
          institution_count: new Set(
            detail.fees.map((f) => f.crawl_target_id)
          ).size,
          observation_count: detail.fees.length,
        },
        by_charter_type: detail.by_charter_type,
        by_asset_tier: detail.by_asset_tier,
        by_fed_district: detail.by_fed_district,
        by_state: detail.by_state,
      };
    }

    const summaries = await getFeeCategorySummaries();
    return {
      total: summaries.length,
      data: summaries.map((s) => ({
        category: s.fee_category,
        display_name: getDisplayName(s.fee_category),
        family: getFeeFamily(s.fee_category),
        tier: getFeeTier(s.fee_category),
        median: s.median_amount,
        p25: s.p25_amount,
        p75: s.p75_amount,
        min: s.min_amount,
        max: s.max_amount,
        institution_count: s.institution_count,
      })),
    };
  },
});

export const searchIndex = tool({
  description:
    "Returns the national fee index or a filtered peer index with median, P25, P75 per category. Filter by state, charter type (bank/credit_union), or Fed district. When: peer benchmarking, 'how does District 7 compare to national?', charter-type comparison. Combine with: queryNationalData(economic) for macroeconomic context, queryNationalData(health) for ROA/efficiency alongside fee positioning.",
  inputSchema: z.object({
    state: z
      .string()
      .optional()
      .describe("Two-letter state code (e.g., CA, TX)"),
    charter: z
      .enum(["bank", "credit_union"])
      .optional()
      .describe("Charter type filter"),
    district: z
      .string()
      .optional()
      .describe("Fed district number(s), comma-separated (e.g., 7 or 2,7,12)"),
  }),
  execute: async ({ state, charter, district }) => {
    const hasFilters = state || charter || district;

    const entries = hasFilters
      ? await getPeerIndex({
          state_code: state?.toUpperCase(),
          charter_type: charter,
          fed_districts: district
            ? district
                .split(",")
                .map((d) => parseInt(d, 10))
                .filter((d) => d >= 1 && d <= 12)
            : undefined,
        })
      : await getNationalIndex();

    return {
      scope: hasFilters ? "filtered" : "national",
      filters: { state: state ?? null, charter: charter ?? null, district: district ?? null },
      total: entries.length,
      data: entries.map((e) => ({
        category: e.fee_category,
        display_name: getDisplayName(e.fee_category),
        family: getFeeFamily(e.fee_category),
        median: e.median_amount,
        p25: e.p25_amount,
        p75: e.p75_amount,
        min: e.min_amount,
        max: e.max_amount,
        institution_count: e.institution_count,
        bank_count: e.bank_count,
        cu_count: e.cu_count,
      })),
    };
  },
});

export const searchInstitutions = tool({
  description:
    "Lists financial institutions with fee data, paginated, filterable by state and charter type. Returns id, name, state, city, charter type, asset size, fee count. When: browsing institutions, finding institutions to profile, narrowing a question to a specific segment. Combine with: getInstitution for a single institution's full fee profile, searchIndex(state:XX) for that state's fee benchmark.",
  inputSchema: z.object({
    state: z
      .string()
      .optional()
      .describe("Two-letter state code (e.g., NY, CA)"),
    charter: z
      .enum(["bank", "credit_union"])
      .optional()
      .describe("Charter type filter"),
    page: z.number().optional().default(1).describe("Page number (default 1)"),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Results per page (default 20, max 50)"),
  }),
  execute: async ({ state, charter, page, limit }) => {
    const pageSize = Math.min(limit ?? 20, 50);
    const filters: {
      charter_type?: string;
      state_code?: string;
      page: number;
      pageSize: number;
    } = { page: page ?? 1, pageSize };

    if (charter) filters.charter_type = charter;
    if (state) filters.state_code = state.toUpperCase();

    const { rows, total } = await getInstitutionsByFilter(filters);

    return {
      total,
      page: filters.page,
      page_size: pageSize,
      data: rows.map((r) => ({
        id: r.id,
        name: r.institution_name,
        state: r.state_code,
        city: r.city,
        charter_type: r.charter_type,
        asset_size: r.asset_size,
        asset_tier: r.asset_size_tier,
        fed_district: r.fed_district,
        fee_count: r.fee_count,
      })),
    };
  },
});

export const getInstitution = tool({
  description:
    "Returns a single institution's full profile: all non-rejected fees, financial data, and comparison to national medians. When: institution-specific queries, 'what does Bank X charge?', profiling a named institution. Combine with: searchIndex(charter:bank, district:N) to benchmark against peer group, queryNationalData(complaints) if the institution is in a region with elevated complaint rates.",
  inputSchema: z.object({
    id: z.number().describe("Institution ID"),
  }),
  execute: async ({ id }) => {
    const inst = await getInstitutionById(id);
    if (!inst) return { error: "Institution not found", id };

    const fees = (await getFeesByInstitution(id))
      .filter((f) => f.review_status !== "rejected")
      .map((f) => ({
        fee_name: f.fee_name,
        amount: f.amount,
        frequency: f.frequency,
        conditions: f.conditions,
      }));

    return {
      id: inst.id,
      name: inst.institution_name,
      state: inst.state_code,
      city: inst.city,
      charter_type: inst.charter_type,
      asset_size: inst.asset_size,
      asset_tier: inst.asset_size_tier,
      fed_district: inst.fed_district,
      fee_count: fees.length,
      fees,
    };
  },
});

/** All public tools bundled for agent configs */
export const publicTools = {
  searchFees,
  searchIndex,
  searchInstitutions,
  getInstitution,
};
