import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted — factories must be inline with no references to outer vars

vi.mock("@/lib/crawler-db", () => ({
  getPublicStats: vi.fn().mockResolvedValue({
    total_observations: 125000,
    total_institutions: 4200,
    total_states: 51,
    total_categories: 49,
  }),
}));

vi.mock("@/lib/crawler-db/connection", () => ({
  sql: vi.fn().mockImplementation(() => Promise.resolve([])),
}));

// Mock fee-taxonomy to break transitive import chain through crawler-db barrel
vi.mock("@/lib/fee-taxonomy", () => ({
  getDisplayName: vi.fn((s: string) => s),
  getFeeFamily: vi.fn(() => "account"),
  getFeeTier: vi.fn(() => "core"),
  isFeaturedFee: vi.fn(() => true),
  getFeaturedCategories: vi.fn(() => []),
  getSpotlightCategories: vi.fn(() => []),
  FEE_FAMILIES: [],
  TAXONOMY_COUNT: 49,
  FEATURED_COUNT: 15,
}));

vi.mock("./tools", () => ({
  publicTools: {
    searchFees: { description: "searchFees", inputSchema: {}, execute: vi.fn() },
    searchIndex: { description: "searchIndex", inputSchema: {}, execute: vi.fn() },
    searchInstitutions: { description: "searchInstitutions", inputSchema: {}, execute: vi.fn() },
    getInstitution: { description: "getInstitution", inputSchema: {}, execute: vi.fn() },
  },
}));

vi.mock("./tools-internal", () => ({
  internalTools: {
    queryDistrictData: { description: "queryDistrictData", inputSchema: {}, execute: vi.fn() },
    queryStateData: { description: "queryStateData", inputSchema: {}, execute: vi.fn() },
    queryFeeRevenueCorrelation: { description: "queryFeeRevenueCorrelation", inputSchema: {}, execute: vi.fn() },
    queryOutliers: { description: "queryOutliers", inputSchema: {}, execute: vi.fn() },
    getCrawlStatus: { description: "getCrawlStatus", inputSchema: {}, execute: vi.fn() },
    getReviewQueueStats: { description: "getReviewQueueStats", inputSchema: {}, execute: vi.fn() },
    searchInstitutionsByName: { description: "searchInstitutionsByName", inputSchema: {}, execute: vi.fn() },
    rankInstitutions: { description: "rankInstitutions", inputSchema: {}, execute: vi.fn() },
    rankByPercentile: { description: "rankByPercentile", inputSchema: {}, execute: vi.fn() },
    rankByFeeCount: { description: "rankByFeeCount", inputSchema: {}, execute: vi.fn() },
    rankByOutlierFlags: { description: "rankByOutlierFlags", inputSchema: {}, execute: vi.fn() },
    queryJobStatus: { description: "queryJobStatus", inputSchema: {}, execute: vi.fn() },
    queryDataQuality: { description: "queryDataQuality", inputSchema: {}, execute: vi.fn() },
    triggerPipelineJob: { description: "triggerPipelineJob", inputSchema: {}, execute: vi.fn() },
    queryNationalData: { description: "queryNationalData", inputSchema: {}, execute: vi.fn() },
    queryRegulatoryRisk: { description: "queryRegulatoryRisk", inputSchema: {}, execute: vi.fn() },
  },
}));

// Import after mocks
import { getHamilton, buildSegmentContextLine } from "./agents";

describe("buildSegmentContextLine", () => {
  it("returns empty string when filters is undefined", () => {
    expect(buildSegmentContextLine(undefined)).toBe("");
  });

  it("returns empty string when filters has no meaningful values", () => {
    expect(buildSegmentContextLine({})).toBe("");
    expect(buildSegmentContextLine({ range: "30d" })).toBe("");
  });

  it("returns empty string when only empty arrays provided", () => {
    expect(buildSegmentContextLine({ tiers: [], districts: [] })).toBe("");
  });

  it("includes segment description when charter filter is set", () => {
    const out = buildSegmentContextLine({ charter: "bank" });
    expect(out).toContain("Active segment:");
    expect(out).toContain("Banks");
  });

  it("includes tiers and districts in the segment line", () => {
    const out = buildSegmentContextLine({
      charter: "bank",
      tiers: ["community"],
      districts: [7],
    });
    expect(out).toContain("Active segment:");
    expect(out).toContain("District 7");
    expect(out).toContain("Banks");
  });

  it("the appended line stays under 200 chars for typical filters", () => {
    const out = buildSegmentContextLine({
      charter: "credit_union",
      tiers: ["midsize"],
      districts: [3],
    });
    // First line (the actual added content) should be reasonably short
    const firstLine = out.trim().split("\n")[0];
    expect(firstLine.length).toBeLessThan(200);
  });
});

describe("getHamilton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BFI_MODEL_CONSUMER;
    delete process.env.BFI_MODEL_PRO;
    delete process.env.BFI_MODEL_ADMIN;
  });

  it("consumer: returns Haiku model and public tools only with maxSteps=3", async () => {
    const config = await getHamilton("consumer");

    expect(config.model).toBe("claude-haiku-4-5-20251001");
    expect(config.maxSteps).toBe(3);
    expect(config.maxTokens).toBe(2048);
    expect(config.requiresAuth).toBe(false);
    expect(config.requiredRole).toBeNull();

    const toolNames = Object.keys(config.tools);
    expect(toolNames).toContain("searchFees");
    expect(toolNames).toContain("searchIndex");
    expect(toolNames).toContain("searchInstitutions");
    expect(toolNames).toContain("getInstitution");

    // Should NOT have internal/ops tools
    expect(toolNames).not.toContain("triggerPipelineJob");
    expect(toolNames).not.toContain("getCrawlStatus");
    expect(toolNames).not.toContain("queryNationalData");
  });

  it("pro: returns Sonnet model, public + non-ops internal tools, maxSteps=4", async () => {
    const config = await getHamilton("pro");

    expect(config.model).toBe("claude-sonnet-4-6");
    expect(config.maxSteps).toBe(4);
    expect(config.maxTokens).toBe(4096);
    expect(config.requiresAuth).toBe(true);
    expect(config.requiredRole).toBe("premium");

    const toolNames = Object.keys(config.tools);

    // Has public tools
    expect(toolNames).toContain("searchFees");
    // Has consolidated internal tools
    expect(toolNames).toContain("queryNationalData");
    expect(toolNames).toContain("searchInstitutionsByName");
    expect(toolNames).toContain("rankInstitutions");
    // New ranking primitives registered alongside the backward-compat shim
    expect(toolNames).toContain("rankByPercentile");
    expect(toolNames).toContain("rankByFeeCount");
    expect(toolNames).toContain("rankByOutlierFlags");
  });

  it("admin: returns Sonnet model, all tools, maxSteps=4", async () => {
    const config = await getHamilton("admin");

    expect(config.model).toBe("claude-sonnet-4-6");
    expect(config.maxSteps).toBe(4);
    expect(config.maxTokens).toBe(12000);
    expect(config.requiresAuth).toBe(true);
    expect(config.requiredRole).toBe("admin");

    const toolNames = Object.keys(config.tools);

    // Has all tools including ops
    // Same consolidated tools as pro (Hamilton is single agent)
    expect(toolNames).toContain("queryNationalData");
    expect(toolNames).toContain("searchFees");
    expect(toolNames).toContain("searchInstitutionsByName");
    expect(toolNames).toContain("rankInstitutions");
    expect(toolNames).toContain("rankByPercentile");
    expect(toolNames).toContain("rankByFeeCount");
    expect(toolNames).toContain("rankByOutlierFlags");
  });

  it("consumer: systemPrompt contains HAMILTON_SYSTEM_PROMPT base text", async () => {
    const config = await getHamilton("consumer");
    expect(config.systemPrompt).toContain("You are Hamilton, the chief strategist");
  });

  it("consumer: systemPrompt starts with consumer-role prefix (plain-language framing)", async () => {
    const config = await getHamilton("consumer");
    const hamiltonIdx = config.systemPrompt.indexOf("You are Hamilton, the chief strategist");
    expect(hamiltonIdx).toBeGreaterThan(0);

    const prefix = config.systemPrompt.slice(0, hamiltonIdx);
    expect(prefix.toLowerCase()).toMatch(/consumer|general public|plain language|plain-language|explain/);
  });

  it("admin: systemPrompt starts with admin-role prefix containing operational/data quality language", async () => {
    const config = await getHamilton("admin");
    const hamiltonIdx = config.systemPrompt.indexOf("You are Hamilton, the chief strategist");
    expect(hamiltonIdx).toBeGreaterThan(0);

    const prefix = config.systemPrompt.slice(0, hamiltonIdx);
    expect(prefix.toLowerCase()).toMatch(/operational|data quality|pipeline|review queue|analyst|administrator/);
  });

  it("old functions do not exist: getAgent, getPublicAgents, getAdminAgents, buildAgents", async () => {
    const mod = await import("./agents");
    expect((mod as Record<string, unknown>).getAgent).toBeUndefined();
    expect((mod as Record<string, unknown>).getPublicAgents).toBeUndefined();
    expect((mod as Record<string, unknown>).getAdminAgents).toBeUndefined();
    expect((mod as Record<string, unknown>).buildAgents).toBeUndefined();
  });

  it("BFI_MODEL_CONSUMER env var overrides consumer model", async () => {
    process.env.BFI_MODEL_CONSUMER = "claude-opus-4-5-20250514";
    const config = await getHamilton("consumer");
    expect(config.model).toBe("claude-opus-4-5-20250514");
  });
});
