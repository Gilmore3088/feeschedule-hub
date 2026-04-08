import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all crawler-db modules before importing the tool
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
}));

vi.mock("@/lib/crawler-db/health", () => ({
  getIndustryHealthMetrics: vi.fn().mockResolvedValue({}),
  getHealthMetricsByCharter: vi.fn().mockResolvedValue({}),
  getDepositGrowthTrend: vi.fn().mockResolvedValue([]),
  getLoanGrowthTrend: vi.fn().mockResolvedValue([]),
  getInstitutionCountTrends: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/crawler-db/complaints", () => ({
  getDistrictComplaintSummary: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/crawler-db/fee-index", () => ({
  getNationalIndex: vi.fn().mockResolvedValue([]),
  getPeerIndex: vi.fn().mockResolvedValue([]),
  getIndexSnapshot: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/crawler-db/derived-analytics", () => ({
  getRevenueConcentration: vi.fn().mockResolvedValue({ dollar_volume: [], institution_prevalence: [], summary: {} }),
  getFeeDependencyTrend: vi.fn().mockResolvedValue({ trend: [], signals: {} }),
  getRevenuePerInstitutionTrend: vi.fn().mockResolvedValue({ current: {}, trend: [], signals: {} }),
}));

// Mock other deps used by tools-internal.ts
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
vi.mock("@/lib/crawler-db/connection", () => ({
  sql: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/job-runner", () => ({
  spawnJob: vi.fn().mockResolvedValue({ jobId: 1, pid: 123, logPath: "/tmp/test.log" }),
}));

import { internalTools } from "./tools-internal";

// Import mocked modules so we can check calls
import * as callReports from "@/lib/crawler-db/call-reports";
import * as fed from "@/lib/crawler-db/fed";
import * as health from "@/lib/crawler-db/health";
import * as complaints from "@/lib/crawler-db/complaints";
import * as feeIndex from "@/lib/crawler-db/fee-index";
import * as derivedAnalytics from "@/lib/crawler-db/derived-analytics";

describe("queryNationalData", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const execute = internalTools.queryNationalData.execute as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Registration ────────────────────────────────────────────────────────
  it("is registered in internalTools", () => {
    expect(internalTools.queryNationalData).toBeDefined();
  });

  // ── call_reports source ─────────────────────────────────────────────────
  describe("source: call_reports", () => {
    it("returns all data when no view specified", async () => {
      const result = await execute({ source: "call_reports", quarters: 8, limit: 10, top_n: 5 });
      expect(callReports.getRevenueTrend).toHaveBeenCalledWith(8);
      expect(callReports.getTopRevenueInstitutions).toHaveBeenCalledWith(10);
      expect(callReports.getRevenueByTier).toHaveBeenCalled();
      expect(result).toHaveProperty("trend");
      expect(result).toHaveProperty("top_institutions");
      expect(result).toHaveProperty("by_tier");
    });

    it("returns only trend when view=trend", async () => {
      const result = await execute({ source: "call_reports", view: "trend", quarters: 4, limit: 10, top_n: 5 });
      expect(callReports.getRevenueTrend).toHaveBeenCalledWith(4);
      expect(callReports.getTopRevenueInstitutions).not.toHaveBeenCalled();
      expect(result).toHaveProperty("trend");
    });

    it("returns top institutions when view=top_institutions", async () => {
      const result = await execute({ source: "call_reports", view: "top_institutions", limit: 5, quarters: 8, top_n: 5 });
      expect(callReports.getTopRevenueInstitutions).toHaveBeenCalledWith(5);
      expect(result).toHaveProperty("top_institutions");
    });

    it("returns tier data when view=by_tier", async () => {
      const result = await execute({ source: "call_reports", view: "by_tier", quarters: 8, limit: 10, top_n: 5 });
      expect(callReports.getRevenueByTier).toHaveBeenCalled();
      expect(result).toHaveProperty("by_tier");
    });

    it("returns district data when view=by_district with district param", async () => {
      const result = await execute({ source: "call_reports", view: "by_district", district: 3, quarters: 8, limit: 10, top_n: 5 });
      expect(callReports.getDistrictFeeRevenue).toHaveBeenCalledWith(3);
      expect(result).toHaveProperty("district_revenue");
    });
  });

  // ── economic source ─────────────────────────────────────────────────────
  describe("source: economic", () => {
    it("returns all economic data when no view specified", async () => {
      const result = await execute({ source: "economic", quarters: 8, limit: 10, top_n: 5 });
      expect(fed.getNationalEconomicSummary).toHaveBeenCalled();
      expect(fed.getBeigeBookThemes).toHaveBeenCalled();
      expect(fed.getFredSummary).toHaveBeenCalled();
      expect(result).toHaveProperty("national_summary");
      expect(result).toHaveProperty("beige_book_themes");
      expect(result).toHaveProperty("fred_summary");
    });

    it("returns only fred when view=fred", async () => {
      const result = await execute({ source: "economic", view: "fred", quarters: 8, limit: 10, top_n: 5 });
      expect(fed.getFredSummary).toHaveBeenCalled();
      expect(fed.getNationalEconomicSummary).not.toHaveBeenCalled();
      expect(result).toHaveProperty("fred_summary");
    });

    it("returns only beige book when view=beige_book", async () => {
      const result = await execute({ source: "economic", view: "beige_book", quarters: 8, limit: 10, top_n: 5 });
      expect(fed.getBeigeBookThemes).toHaveBeenCalled();
      expect(result).toHaveProperty("beige_book_themes");
    });

    it("returns district summary when view=district with district param", async () => {
      const result = await execute({ source: "economic", view: "district", district: 7, quarters: 8, limit: 10, top_n: 5 });
      expect(fed.getDistrictEconomicSummary).toHaveBeenCalledWith(7);
      expect(result).toHaveProperty("district_summary");
    });

    it("returns error when view=district without district param", async () => {
      const result = await execute({ source: "economic", view: "district", quarters: 8, limit: 10, top_n: 5 });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("district");
    });
  });

  // ── health source ───────────────────────────────────────────────────────
  describe("source: health", () => {
    it("returns all health data when no view specified", async () => {
      const result = await execute({ source: "health", quarters: 8, limit: 10, top_n: 5 });
      expect(health.getIndustryHealthMetrics).toHaveBeenCalled();
      expect(health.getHealthMetricsByCharter).toHaveBeenCalled();
      expect(health.getDepositGrowthTrend).toHaveBeenCalled();
      expect(health.getLoanGrowthTrend).toHaveBeenCalled();
      expect(health.getInstitutionCountTrends).toHaveBeenCalled();
      expect(result).toHaveProperty("metrics");
      expect(result).toHaveProperty("by_charter");
    });

    it("returns only metrics when view=metrics", async () => {
      const result = await execute({ source: "health", view: "metrics", quarters: 8, limit: 10, top_n: 5 });
      expect(health.getIndustryHealthMetrics).toHaveBeenCalled();
      expect(health.getHealthMetricsByCharter).not.toHaveBeenCalled();
      expect(result).toHaveProperty("metrics");
    });

    it("returns deposit trend when view=deposits", async () => {
      const result = await execute({ source: "health", view: "deposits", quarters: 6, limit: 10, top_n: 5 });
      expect(health.getDepositGrowthTrend).toHaveBeenCalledWith(6);
      expect(result).toHaveProperty("deposits");
    });
  });

  // ── complaints source ───────────────────────────────────────────────────
  describe("source: complaints", () => {
    it("returns district complaint summary when district provided", async () => {
      const result = await execute({ source: "complaints", district: 5, quarters: 8, limit: 10, top_n: 5 });
      expect(complaints.getDistrictComplaintSummary).toHaveBeenCalledWith(5);
      expect(result).toHaveProperty("complaints");
    });

    it("returns error when district not provided", async () => {
      const result = await execute({ source: "complaints", quarters: 8, limit: 10, top_n: 5 });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("district");
    });
  });

  // ── fee_index source ────────────────────────────────────────────────────
  describe("source: fee_index", () => {
    it("returns national index snapshot by default", async () => {
      const result = await execute({ source: "fee_index", limit: 15, quarters: 8, top_n: 5 });
      expect(feeIndex.getIndexSnapshot).toHaveBeenCalledWith(undefined, 15);
      expect(result).toHaveProperty("index");
    });

    it("returns peer index when charter provided", async () => {
      const result = await execute({ source: "fee_index", charter: "bank", quarters: 8, limit: 10, top_n: 5 });
      expect(feeIndex.getPeerIndex).toHaveBeenCalledWith(
        expect.objectContaining({ charter_type: "bank" }),
      );
      expect(result).toHaveProperty("index");
    });

    it("returns peer index when tiers provided", async () => {
      const result = await execute({ source: "fee_index", tiers: ["community"], quarters: 8, limit: 10, top_n: 5 });
      expect(feeIndex.getPeerIndex).toHaveBeenCalledWith(
        expect.objectContaining({ asset_tiers: ["community"] }),
      );
      expect(result).toHaveProperty("index");
    });
  });

  // ── derived source ──────────────────────────────────────────────────────
  describe("source: derived", () => {
    it("returns all derived analytics when no view specified", async () => {
      const result = await execute({ source: "derived", quarters: 8, limit: 10, top_n: 5 });
      expect(derivedAnalytics.getRevenueConcentration).toHaveBeenCalledWith(5);
      expect(derivedAnalytics.getFeeDependencyTrend).toHaveBeenCalledWith(8);
      expect(derivedAnalytics.getRevenuePerInstitutionTrend).toHaveBeenCalledWith(8);
      expect(result).toHaveProperty("concentration");
      expect(result).toHaveProperty("dependency");
      expect(result).toHaveProperty("revenue_per_institution");
    });

    it("returns only concentration when view=concentration", async () => {
      const result = await execute({ source: "derived", view: "concentration", top_n: 3, quarters: 8, limit: 10 });
      expect(derivedAnalytics.getRevenueConcentration).toHaveBeenCalledWith(3);
      expect(derivedAnalytics.getFeeDependencyTrend).not.toHaveBeenCalled();
      expect(result).toHaveProperty("concentration");
    });

    it("returns only dependency when view=dependency", async () => {
      const result = await execute({ source: "derived", view: "dependency", quarters: 6, limit: 10, top_n: 5 });
      expect(derivedAnalytics.getFeeDependencyTrend).toHaveBeenCalledWith(6);
      expect(result).toHaveProperty("dependency");
    });

    it("returns only per-institution when view=revenue_per_institution", async () => {
      const result = await execute({ source: "derived", view: "revenue_per_institution", quarters: 4, limit: 10, top_n: 5 });
      expect(derivedAnalytics.getRevenuePerInstitutionTrend).toHaveBeenCalledWith(4);
      expect(result).toHaveProperty("revenue_per_institution");
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────
  describe("error handling", () => {
    it("returns error for unknown source", async () => {
      // Type cast to bypass type checking for test
      const result = await execute({
        source: "invalid" as "call_reports",
        quarters: 8,
        limit: 10,
        top_n: 5,
      });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("Unknown source");
    });
  });
});
