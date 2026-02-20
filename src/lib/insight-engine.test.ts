import { describe, it, expect } from "vitest";
import { generateAllInsights, type DashboardData, type Insight } from "./insight-engine";

function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    reviewStats: { pending: 100, staged: 200, flagged: 10, approved: 50, rejected: 20 },
    stuckItems: { flagged_over_14d: 0, staged_over_30d: 0 },
    crawlHealth: {
      last_run_at: "2026-02-20T10:00:00Z",
      last_run_status: "completed",
      success_rate_24h: 0.95,
      avg_confidence: 0.85,
      institutions_failing: 2,
      total_crawled_24h: 50,
      crawl_runs_7d: 10,
    },
    dailyTrends: [],
    peerStats: {
      total_institutions: 500,
      with_website: 400,
      with_fee_url: 200,
      total_fees: 5000,
      banks: 300,
      credit_unions: 200,
    },
    nationalStats: null,
    indexSnapshot: [
      {
        fee_category: "monthly_maintenance",
        fee_family: "Account Maintenance",
        median_amount: 12.5,
        p25_amount: 8,
        p75_amount: 15,
        min_amount: 0,
        max_amount: 25,
        institution_count: 30,
        observation_count: 45,
        approved_count: 15,
        bank_count: 20,
        cu_count: 10,
        maturity_tier: "strong",
        last_updated: "2026-02-19",
      },
    ],
    volatileCategories: [],
    riskOutliers: {
      top_flagged_categories: [],
      repeated_failures: [],
      extreme_outlier_fees: [],
    },
    ...overrides,
  };
}

describe("generateAllInsights", () => {
  it("returns an array of insights", () => {
    const insights = generateAllInsights(makeData());
    expect(Array.isArray(insights)).toBe(true);
  });

  it("caps output at 8 insights maximum", () => {
    const data = makeData({
      stuckItems: { flagged_over_14d: 20, staged_over_30d: 30 },
      crawlHealth: {
        last_run_at: null,
        last_run_status: null,
        success_rate_24h: 0.5,
        avg_confidence: 0.6,
        institutions_failing: 50,
        total_crawled_24h: 100,
        crawl_runs_7d: 5,
      },
      riskOutliers: {
        top_flagged_categories: [
          { fee_category: "overdraft", flagged_count: 40, total_count: 50 },
        ],
        repeated_failures: Array.from({ length: 5 }, (_, i) => ({
          id: i,
          institution_name: `Bank ${i}`,
          consecutive_failures: 15,
          last_crawl_at: null,
        })),
        extreme_outlier_fees: Array.from({ length: 10 }, (_, i) => ({
          id: i,
          fee_name: "test",
          amount: 999,
          institution_name: `Bank ${i}`,
          crawl_target_id: i,
          fee_category: "overdraft",
        })),
      },
    });
    const insights = generateAllInsights(data);
    expect(insights.length).toBeLessThanOrEqual(8);
  });

  it("sorts by priority descending", () => {
    const insights = generateAllInsights(
      makeData({
        stuckItems: { flagged_over_14d: 20, staged_over_30d: 25 },
        crawlHealth: {
          last_run_at: null,
          last_run_status: null,
          success_rate_24h: 0,
          avg_confidence: 0,
          institutions_failing: 0,
          total_crawled_24h: 0,
          crawl_runs_7d: 0,
        },
      })
    );
    for (let i = 1; i < insights.length; i++) {
      expect(insights[i - 1].priority).toBeGreaterThanOrEqual(insights[i].priority);
    }
  });

  it("generates critical insight for aging flagged items", () => {
    const insights = generateAllInsights(
      makeData({ stuckItems: { flagged_over_14d: 15, staged_over_30d: 0 } })
    );
    const flagged = insights.find((i) => i.id === "review-flagged-aging");
    expect(flagged).toBeDefined();
    expect(flagged!.severity).toBe("critical");
    expect(flagged!.headline).toContain("15");
    expect(flagged!.action?.href).toBe("/admin/review?status=flagged");
  });

  it("generates warning for low approval rate", () => {
    const insights = generateAllInsights(
      makeData({
        reviewStats: { pending: 500, staged: 300, flagged: 100, approved: 10, rejected: 5 },
      })
    );
    const low = insights.find((i) => i.id === "review-low-approval");
    expect(low).toBeDefined();
    expect(low!.severity).toBe("warning");
  });

  it("generates positive insight for clean review queue", () => {
    const insights = generateAllInsights(
      makeData({
        reviewStats: { pending: 0, staged: 0, flagged: 0, approved: 100, rejected: 10 },
        stuckItems: { flagged_over_14d: 0, staged_over_30d: 0 },
      })
    );
    const clean = insights.find((i) => i.id === "review-clean");
    expect(clean).toBeDefined();
    expect(clean!.severity).toBe("positive");
  });

  it("generates critical insight for zero crawls", () => {
    const insights = generateAllInsights(
      makeData({
        crawlHealth: {
          last_run_at: null,
          last_run_status: null,
          success_rate_24h: 0,
          avg_confidence: 0,
          institutions_failing: 0,
          total_crawled_24h: 0,
          crawl_runs_7d: 0,
        },
      })
    );
    const zero = insights.find((i) => i.id === "crawl-zero");
    expect(zero).toBeDefined();
    expect(zero!.severity).toBe("critical");
    expect(zero!.priority).toBe(95);
  });

  it("generates critical insight for low crawl success rate", () => {
    const insights = generateAllInsights(
      makeData({
        crawlHealth: {
          last_run_at: "2026-02-20T10:00:00Z",
          last_run_status: "completed",
          success_rate_24h: 0.5,
          avg_confidence: 0.85,
          institutions_failing: 20,
          total_crawled_24h: 40,
          crawl_runs_7d: 10,
        },
      })
    );
    const low = insights.find((i) => i.id === "crawl-low-success");
    expect(low).toBeDefined();
    expect(low!.severity).toBe("critical");
    expect(low!.headline).toContain("50%");
  });

  it("generates positive insight for healthy crawl pipeline", () => {
    const insights = generateAllInsights(makeData());
    const healthy = insights.find((i) => i.id === "crawl-healthy");
    expect(healthy).toBeDefined();
    expect(healthy!.severity).toBe("positive");
  });

  it("generates warning for low extraction confidence", () => {
    const insights = generateAllInsights(
      makeData({
        crawlHealth: {
          last_run_at: "2026-02-20T10:00:00Z",
          last_run_status: "completed",
          success_rate_24h: 0.9,
          avg_confidence: 0.6,
          institutions_failing: 2,
          total_crawled_24h: 30,
          crawl_runs_7d: 10,
        },
      })
    );
    const conf = insights.find((i) => i.id === "crawl-low-confidence");
    expect(conf).toBeDefined();
    expect(conf!.severity).toBe("warning");
  });

  it("generates warning for declining extraction trend", () => {
    const trends = [
      { date: "2026-02-14", institutions: 50, fees_extracted: 100, fee_urls: 40 },
      { date: "2026-02-15", institutions: 50, fees_extracted: 110, fee_urls: 40 },
      { date: "2026-02-16", institutions: 50, fees_extracted: 105, fee_urls: 40 },
      { date: "2026-02-17", institutions: 50, fees_extracted: 50, fee_urls: 30 },
      { date: "2026-02-18", institutions: 50, fees_extracted: 40, fee_urls: 25 },
      { date: "2026-02-19", institutions: 50, fees_extracted: 30, fee_urls: 20 },
    ];
    const insights = generateAllInsights(makeData({ dailyTrends: trends }));
    const declining = insights.find((i) => i.id === "crawl-declining-trend");
    expect(declining).toBeDefined();
    expect(declining!.severity).toBe("warning");
  });

  it("generates warning for insufficient index maturity", () => {
    const snapshot: IndexEntry[] = Array.from({ length: 10 }, (_, i) => ({
      fee_category: `fee_${i}`,
      fee_family: "Test",
      median_amount: 10,
      p25_amount: 8,
      p75_amount: 12,
      min_amount: 5,
      max_amount: 20,
      institution_count: 3,
      observation_count: 5,
      approved_count: 1,
      bank_count: 2,
      cu_count: 1,
      maturity_tier: i < 6 ? "insufficient" : "strong",
      last_updated: "2026-02-19",
    }));
    const insights = generateAllInsights(makeData({ indexSnapshot: snapshot }));
    const maturity = insights.find((i) => i.id === "index-low-maturity");
    expect(maturity).toBeDefined();
    expect(maturity!.headline).toContain("6 of 10");
  });

  it("generates warning for high volatility category", () => {
    const volatileCategories: VolatileCategory[] = [
      {
        fee_category: "overdraft",
        institution_count: 20,
        min_amount: 5,
        max_amount: 80,
        median_amount: 30,
        p25_amount: 15,
        p75_amount: 50,
        iqr: 35,
        range_width: 75,
        flagged_count: 3,
        flag_rate: 0.05,
      },
    ];
    const insights = generateAllInsights(makeData({ volatileCategories }));
    const vol = insights.find((i) => i.id?.startsWith("index-volatile-"));
    expect(vol).toBeDefined();
    expect(vol!.severity).toBe("warning");
  });

  it("generates warning for low coverage", () => {
    const insights = generateAllInsights(
      makeData({
        peerStats: {
          total_institutions: 500,
          with_website: 200,
          with_fee_url: 100,
          total_fees: 1000,
          banks: 300,
          credit_unions: 200,
        },
      })
    );
    const cov = insights.find((i) => i.id === "coverage-low");
    expect(cov).toBeDefined();
    expect(cov!.headline).toContain("20%");
  });

  it("generates positive insight for peer coverage above national", () => {
    const insights = generateAllInsights(
      makeData({
        peerStats: {
          total_institutions: 100,
          with_website: 80,
          with_fee_url: 60,
          total_fees: 500,
          banks: 60,
          credit_unions: 40,
        },
        nationalStats: {
          total_institutions: 500,
          with_website: 400,
          with_fee_url: 200,
          total_fees: 5000,
          banks: 300,
          credit_unions: 200,
        },
      })
    );
    const above = insights.find((i) => i.id === "coverage-peer-above");
    expect(above).toBeDefined();
    expect(above!.severity).toBe("positive");
  });

  it("generates warning for extreme outlier fees", () => {
    const insights = generateAllInsights(
      makeData({
        riskOutliers: {
          top_flagged_categories: [],
          repeated_failures: [],
          extreme_outlier_fees: Array.from({ length: 5 }, (_, i) => ({
            id: i,
            fee_name: "test",
            amount: 500,
            institution_name: `Bank ${i}`,
            crawl_target_id: i,
            fee_category: "overdraft",
          })),
        },
      })
    );
    const outliers = insights.find((i) => i.id === "risk-extreme-outliers");
    expect(outliers).toBeDefined();
    expect(outliers!.severity).toBe("warning");
  });

  it("generates critical insight for severe repeated failures", () => {
    const insights = generateAllInsights(
      makeData({
        riskOutliers: {
          top_flagged_categories: [],
          repeated_failures: [
            { id: 1, institution_name: "Test Bank", consecutive_failures: 15, last_crawl_at: null },
          ],
          extreme_outlier_fees: [],
        },
      })
    );
    const failures = insights.find((i) => i.id === "risk-repeated-failures");
    expect(failures).toBeDefined();
    expect(failures!.severity).toBe("critical");
  });

  it("returns empty array for minimal data with no triggers", () => {
    const insights = generateAllInsights(
      makeData({
        reviewStats: { pending: 0, staged: 10, flagged: 0, approved: 100, rejected: 5 },
        indexSnapshot: [],
        volatileCategories: [],
      })
    );
    const critical = insights.filter((i) => i.severity === "critical");
    expect(critical.length).toBe(0);
  });

  it("all insights have required fields", () => {
    const insights = generateAllInsights(
      makeData({ stuckItems: { flagged_over_14d: 20, staged_over_30d: 25 } })
    );
    for (const insight of insights) {
      expect(insight.id).toBeTruthy();
      expect(insight.severity).toBeTruthy();
      expect(insight.domain).toBeTruthy();
      expect(insight.headline).toBeTruthy();
      expect(insight.body).toBeTruthy();
      expect(typeof insight.priority).toBe("number");
    }
  });
});
