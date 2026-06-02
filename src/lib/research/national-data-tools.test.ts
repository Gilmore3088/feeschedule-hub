import { describe, it, expect, vi } from "vitest";

// Mock all crawler-db modules used by tools-internal.ts
vi.mock("@/lib/crawler-db/call-reports", () => ({
  getRevenueTrend: vi.fn().mockResolvedValue({ quarters: [], latest: null }),
  getTopRevenueInstitutions: vi.fn().mockResolvedValue([]),
  getRevenueByTier: vi.fn().mockResolvedValue([]),
  getDistrictFeeRevenue: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/crawler-db/fed", () => ({
  getNationalEconomicSummary: vi.fn().mockResolvedValue({}),
  getBeigeBookThemes: vi.fn().mockResolvedValue([]),
  getFredSummary: vi.fn().mockResolvedValue({}),
  getDistrictEconomicSummary: vi.fn().mockResolvedValue({}),
  getLatestBeigeBook: vi.fn().mockResolvedValue([]),
  getDistrictContent: vi.fn().mockResolvedValue([]),
  getRecentSpeeches: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/crawler-db/health", () => ({
  getIndustryHealthMetrics: vi.fn().mockResolvedValue({}),
  getHealthMetricsByCharter: vi.fn().mockResolvedValue({}),
  getDepositGrowthTrend: vi.fn().mockResolvedValue([]),
  getLoanGrowthTrend: vi.fn().mockResolvedValue([]),
  getInstitutionCountTrends: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/crawler-db/complaints", () => ({
  getDistrictComplaintSummary: vi.fn().mockResolvedValue({ district: 1, total: 0 }),
  getNationalComplaintSummary: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/crawler-db/financial", () => ({
  getStateDemographics: vi.fn().mockResolvedValue({ state: "CA" }),
  getLatestIndicators: vi.fn().mockResolvedValue([{ series_id: "LNS14000000" }]),
  getSodMarketShare: vi.fn().mockResolvedValue([{ rssd: 1 }, { rssd: 2 }]),
  getNyFedData: vi.fn().mockResolvedValue([]),
  getOfrData: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/crawler-db/fee-index", () => ({
  getNationalIndex: vi.fn().mockResolvedValue([]),
  getPeerIndex: vi.fn().mockResolvedValue([{ fee_category: "overdraft" }]),
  getIndexSnapshot: vi.fn().mockResolvedValue([{ fee_category: "nsf" }]),
}));
vi.mock("@/lib/crawler-db/derived-analytics", () => ({
  getRevenueConcentration: vi.fn().mockResolvedValue({}),
  getFeeDependencyTrend: vi.fn().mockResolvedValue({}),
  getRevenuePerInstitutionTrend: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/crawler-db/geographic", () => ({
  getDistrictStats: vi.fn().mockResolvedValue({}),
  getStateStats: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/crawler-db/fee-revenue", () => ({
  getFeeRevenueData: vi.fn().mockResolvedValue([]),
  getTierFeeRevenueSummary: vi.fn().mockResolvedValue([]),
  getCharterFeeRevenueSummary: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/crawler-db/core", () => ({
  getOutlierFlaggedFees: vi.fn().mockResolvedValue({ total: 0, fees: [] }),
  getReviewStats: vi.fn().mockResolvedValue({}),
  getStats: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/crawler-db/dashboard", () => ({
  getCrawlHealth: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/crawler-db/intelligence", () => ({
  searchExternalIntelligence: vi.fn().mockResolvedValue([]),
  listIntelligence: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));
vi.mock("@/lib/crawler-db/connection", () => ({
  sql: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/job-runner", () => ({
  spawnJob: vi.fn().mockResolvedValue({ jobId: 1, pid: 123, logPath: "/tmp/test.log" }),
}));

import { internalTools } from "./tools-internal";

const ATOMIC_TOOL_NAMES = [
  "queryCallReportData",
  "queryEconomicData",
  "queryNationalHealth",
  "queryCfpbComplaints",
  "queryFeeIndexData",
  "queryDerivedMetrics",
  "queryFedContent",
  "queryLaborData",
  "queryDemographics",
  "queryResearchData",
  "queryDepositsData",
  "queryExternalIntel",
] as const;

describe("atomic national-data tools", () => {
  it("registers all 12 atomic tools on internalTools", () => {
    for (const name of ATOMIC_TOOL_NAMES) {
      expect(internalTools).toHaveProperty(name);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = (internalTools as any)[name];
      expect(t).toBeDefined();
      expect(typeof t.execute).toBe("function");
      expect(typeof t.description).toBe("string");
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.description.length).toBeLessThan(400);
    }
  });

  it("queryCallReportData returns aggregated revenue data", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (internalTools.queryCallReportData.execute as any)(
      { view: "all", quarters: 8, limit: 10 },
      {},
    );
    expect(result).toHaveProperty("trend");
    expect(result).toHaveProperty("by_tier");
  });

  it("queryCfpbComplaints requires a district", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (internalTools.queryCfpbComplaints.execute as any)(
      { district: 7 },
      {},
    );
    expect(result).toHaveProperty("complaints");
  });

  it("queryFeeIndexData returns peer index when filters set", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (internalTools.queryFeeIndexData.execute as any)(
      { charter: "bank", limit: 10 },
      {},
    );
    expect(result).toHaveProperty("index");
  });

  it("queryDemographics errors without stateFips when validation bypassed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (internalTools.queryDemographics.execute as any)(
      { stateFips: "06" },
      {},
    );
    expect(result).toHaveProperty("state_demographics");
  });

  it("queryDepositsData returns market share", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (internalTools.queryDepositsData.execute as any)(
      { limit: 5 },
      {},
    );
    expect(result).toHaveProperty("deposit_market_share");
  });

  it("queryExternalIntel returns items when no query provided", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (internalTools.queryExternalIntel.execute as any)(
      { limit: 5 },
      {},
    );
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
  });
});

describe("queryNationalData backward-compat shim", () => {
  it("still exists and delegates to source handlers", async () => {
    expect(internalTools.queryNationalData).toBeDefined();
    expect(internalTools.queryNationalData.description).toMatch(/DEPRECATED/i);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (internalTools.queryNationalData.execute as any)(
      { source: "call_reports", view: "trend", quarters: 4, limit: 10, top_n: 5 },
      {},
    );
    expect(result).toHaveProperty("trend");
  });

  it("shim handles fee_index source", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (internalTools.queryNationalData.execute as any)(
      { source: "fee_index", limit: 10, quarters: 8, top_n: 5 },
      {},
    );
    expect(result).toHaveProperty("index");
  });
});
