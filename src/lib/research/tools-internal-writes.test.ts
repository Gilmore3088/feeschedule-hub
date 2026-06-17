import { describe, it, expect, vi } from "vitest";

// Mock all crawler-db and downstream action deps before importing the tools.
vi.mock("@/lib/crawler-db/connection", () => ({
  sql: Object.assign(vi.fn().mockResolvedValue([{ event_id: "evt-1" }]), {
    json: (v: unknown) => v,
  }),
}));
vi.mock("@/lib/crawler-db/call-reports", () => ({
  getRevenueTrend: vi.fn(), getTopRevenueInstitutions: vi.fn(),
  getRevenueByTier: vi.fn(), getDistrictFeeRevenue: vi.fn(),
}));
vi.mock("@/lib/crawler-db/fed", () => ({
  getNationalEconomicSummary: vi.fn(), getBeigeBookThemes: vi.fn(),
  getFredSummary: vi.fn(), getDistrictEconomicSummary: vi.fn(),
  getLatestBeigeBook: vi.fn(), getDistrictContent: vi.fn(),
  getRecentSpeeches: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/crawler-db/health", () => ({
  getIndustryHealthMetrics: vi.fn(), getHealthMetricsByCharter: vi.fn(),
  getDepositGrowthTrend: vi.fn(), getLoanGrowthTrend: vi.fn(),
  getInstitutionCountTrends: vi.fn(),
}));
vi.mock("@/lib/crawler-db/complaints", () => ({
  getDistrictComplaintSummary: vi.fn(),
  getNationalComplaintSummary: vi.fn().mockResolvedValue({
    total_complaints: 0, fee_related_pct: 0, average_per_institution: 0,
  }),
}));
vi.mock("@/lib/crawler-db/financial", () => ({
  getStateDemographics: vi.fn(), getLatestIndicators: vi.fn(),
  getSodMarketShare: vi.fn(), getNyFedData: vi.fn(), getOfrData: vi.fn(),
}));
vi.mock("@/lib/crawler-db/fee-index", () => ({
  getNationalIndex: vi.fn(), getPeerIndex: vi.fn(), getIndexSnapshot: vi.fn(),
}));
vi.mock("@/lib/crawler-db/derived-analytics", () => ({
  getRevenueConcentration: vi.fn(), getFeeDependencyTrend: vi.fn(),
  getRevenuePerInstitutionTrend: vi.fn(),
}));
vi.mock("@/lib/crawler-db/geographic", () => ({
  getDistrictStats: vi.fn(), getStateStats: vi.fn(),
}));
vi.mock("@/lib/crawler-db/fee-revenue", () => ({
  getFeeRevenueData: vi.fn(), getTierFeeRevenueSummary: vi.fn(),
  getCharterFeeRevenueSummary: vi.fn(),
}));
vi.mock("@/lib/crawler-db/core", () => ({
  getOutlierFlaggedFees: vi.fn(), getReviewStats: vi.fn(), getStats: vi.fn(),
}));
vi.mock("@/lib/crawler-db/dashboard", () => ({ getCrawlHealth: vi.fn() }));
vi.mock("@/lib/crawler-db/intelligence", () => ({
  searchExternalIntelligence: vi.fn(), listIntelligence: vi.fn(),
}));
vi.mock("@/lib/job-runner", () => ({ spawnJob: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Mock the wrapped server actions so we can verify they're invoked.
const approveFeeMock = vi.fn().mockResolvedValue({ success: true });
const rejectFeeMock = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/fee-actions", () => ({
  approveFee: (...a: unknown[]) => approveFeeMock(...a),
  rejectFee: (...a: unknown[]) => rejectFeeMock(...a),
}));

const updateUrlMock = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/app/admin/peers/actions", () => ({
  updateFeeScheduleUrl: (...a: unknown[]) => updateUrlMock(...a),
}));

const publishMock = vi.fn().mockResolvedValue({ success: true, slug: "pulse-2026-06" });
const cancelMock = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/app/admin/hamilton/actions", () => ({
  publishReport: (...a: unknown[]) => publishMock(...a),
  cancelReport: (...a: unknown[]) => cancelMock(...a),
}));

import { internalTools } from "./tools-internal";

describe("Wave 1 admin write tools", () => {
  const WRITE_TOOLS = [
    "approveFee",
    "rejectFee",
    "updateFeeScheduleUrl",
    "publishReport",
    "cancelReport",
  ] as const;

  it("all five write tools are registered on internalTools", () => {
    for (const name of WRITE_TOOLS) {
      expect(internalTools[name]).toBeDefined();
    }
  });

  it("each tool has a description and an inputSchema", () => {
    for (const name of WRITE_TOOLS) {
      const t = internalTools[name] as unknown as {
        description: string;
        inputSchema: unknown;
      };
      expect(typeof t.description).toBe("string");
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema).toBeDefined();
    }
  });

  it("approveFee delegates to fee-actions.approveFee and returns event_id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execute = internalTools.approveFee.execute as any;
    const result = await execute({ feeId: 42, notes: "looks good" });
    expect(approveFeeMock).toHaveBeenCalledWith(42, "looks good");
    expect(result.success).toBe(true);
    expect(result.event_id).toBe("evt-1");
  });

  it("rejectFee delegates to fee-actions.rejectFee", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execute = internalTools.rejectFee.execute as any;
    const result = await execute({ feeId: 9, rationale: "duplicate" });
    expect(rejectFeeMock).toHaveBeenCalledWith(9, "duplicate");
    expect(result.success).toBe(true);
  });

  it("updateFeeScheduleUrl delegates to peers action", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execute = internalTools.updateFeeScheduleUrl.execute as any;
    const result = await execute({
      institutionId: 100,
      url: "https://example.com/fees.pdf",
    });
    expect(updateUrlMock).toHaveBeenCalledWith(100, "https://example.com/fees.pdf");
    expect(result.success).toBe(true);
  });

  it("publishReport delegates to hamilton action with slug round-trip", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execute = internalTools.publishReport.execute as any;
    const result = await execute({
      jobId: "11111111-1111-1111-1111-111111111111",
      title: "Monthly Pulse 2026-06",
      reportType: "monthly_pulse",
      isPublic: true,
    });
    expect(publishMock).toHaveBeenCalled();
    expect(result.slug).toBe("pulse-2026-06");
  });

  it("cancelReport delegates to hamilton action", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execute = internalTools.cancelReport.execute as any;
    const result = await execute({ jobId: "22222222-2222-2222-2222-222222222222" });
    expect(cancelMock).toHaveBeenCalledWith("22222222-2222-2222-2222-222222222222");
    expect(result.success).toBe(true);
  });
});
