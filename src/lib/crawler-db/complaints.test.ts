import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./connection", () => {
  const mockSql = vi.fn() as ReturnType<typeof vi.fn> & {
    unsafe: ReturnType<typeof vi.fn>;
  };
  mockSql.unsafe = vi.fn();
  return {
    getSql: () => mockSql,
    sql: mockSql,
  };
});

import {
  getDistrictComplaintSummary,
  getInstitutionComplaintProfile,
} from "./complaints";
import type {
  DistrictComplaintSummary,
  InstitutionComplaintProfile,
} from "./complaints";
import { getSql } from "./connection";

type MockSql = ReturnType<typeof vi.fn> & { unsafe: ReturnType<typeof vi.fn> };

function getMock(): MockSql {
  return getSql() as MockSql;
}

function resetMock(mock: MockSql) {
  mock.mockReset();
  mock.unsafe = vi.fn();
}

// ── DistrictComplaintSummary type ────────────────────────────────────────────

describe("DistrictComplaintSummary type", () => {
  it("has required fields with correct types", () => {
    const summary: DistrictComplaintSummary = {
      fed_district: 2,
      total_complaints: 1500,
      fee_related_complaints: 400,
      institution_count: 12,
      top_products: [{ product: "Checking or savings account", count: 900 }],
    };
    expect(summary.fed_district).toBe(2);
    expect(summary.fee_related_complaints).toBe(400);
  });
});

// ── InstitutionComplaintProfile type ─────────────────────────────────────────

describe("InstitutionComplaintProfile type", () => {
  it("has required fields", () => {
    const profile: InstitutionComplaintProfile = {
      crawl_target_id: 42,
      total_complaints: 250,
      by_product: [{ product: "Checking or savings account", count: 200 }],
      by_issue: [{ issue: "Fees or interest", count: 80 }],
      fee_related_pct: 32.0,
    };
    expect(profile.crawl_target_id).toBe(42);
    expect(profile.fee_related_pct).toBe(32.0);
  });
});

// ── getDistrictComplaintSummary ───────────────────────────────────────────────

describe("getDistrictComplaintSummary", () => {
  beforeEach(() => {
    resetMock(getMock());
  });

  it("returns complaint counts aggregated for a district", async () => {
    const mock = getMock();
    // Three unsafe calls: totalRows, feeRows, productRows
    mock.unsafe = vi.fn()
      .mockResolvedValueOnce([{ institution_count: "5", total_complaints: "1200" }])
      .mockResolvedValueOnce([{ fee_complaints: "350" }])
      .mockResolvedValueOnce([
        { product: "Checking or savings account", count: "900" },
        { product: "Credit card", count: "300" },
      ]);

    const result = await getDistrictComplaintSummary(2);

    expect(result.fed_district).toBe(2);
    expect(result.total_complaints).toBe(1200);
    expect(result.fee_related_complaints).toBe(350);
    expect(result.institution_count).toBe(5);
    expect(result.top_products).toHaveLength(2);
    expect(result.top_products[0].product).toBe("Checking or savings account");
    expect(result.top_products[0].count).toBe(900);
  });

  it("returns zero counts for empty district", async () => {
    const mock = getMock();
    mock.unsafe = vi.fn()
      .mockResolvedValueOnce([{ institution_count: "0", total_complaints: "0" }])
      .mockResolvedValueOnce([{ fee_complaints: "0" }])
      .mockResolvedValueOnce([]);

    const result = await getDistrictComplaintSummary(99);

    expect(result.fed_district).toBe(99);
    expect(result.total_complaints).toBe(0);
    expect(result.fee_related_complaints).toBe(0);
    expect(result.institution_count).toBe(0);
    expect(result.top_products).toHaveLength(0);
  });

  it("returns zero counts when rows array is empty", async () => {
    const mock = getMock();
    mock.unsafe = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getDistrictComplaintSummary(5);

    expect(result.total_complaints).toBe(0);
    expect(result.fee_related_complaints).toBe(0);
    expect(result.institution_count).toBe(0);
  });

  it("accepts optional reportPeriod parameter", async () => {
    const mock = getMock();
    mock.unsafe = vi.fn()
      .mockResolvedValueOnce([{ institution_count: "3", total_complaints: "500" }])
      .mockResolvedValueOnce([{ fee_complaints: "120" }])
      .mockResolvedValueOnce([{ product: "Checking or savings account", count: "500" }]);

    const result = await getDistrictComplaintSummary(1, "2024");

    expect(result.fed_district).toBe(1);
    expect(result.total_complaints).toBe(500);
    // Verify reportPeriod was passed to SQL (second arg of third unsafe call includes year)
    const thirdCallArgs = mock.unsafe.mock.calls[2];
    expect(thirdCallArgs[1]).toContain("2024");
  });
});

// ── getInstitutionComplaintProfile ────────────────────────────────────────────

describe("getInstitutionComplaintProfile", () => {
  beforeEach(() => {
    resetMock(getMock());
  });

  it("returns complaint profile with product and issue breakdown", async () => {
    const mock = getMock();
    // Template-literal calls: totalRow, productRows, issueRows, feeIssueRows
    mock
      .mockResolvedValueOnce([{ total: "300" }])           // total
      .mockResolvedValueOnce([                              // by_product
        { product: "Checking or savings account", count: "250" },
        { product: "Credit card", count: "50" },
      ])
      .mockResolvedValueOnce([                              // by_issue
        { issue: "Fees or interest", count: "80" },
        { issue: "Managing an account", count: "60" },
      ])
      .mockResolvedValueOnce([{ fee_count: "140" }]);       // fee issues

    const result = await getInstitutionComplaintProfile(42);

    expect(result.crawl_target_id).toBe(42);
    expect(result.total_complaints).toBe(300);
    expect(result.by_product).toHaveLength(2);
    expect(result.by_product[0].product).toBe("Checking or savings account");
    expect(result.by_product[0].count).toBe(250);
    expect(result.by_issue).toHaveLength(2);
    expect(result.by_issue[0].issue).toBe("Fees or interest");
  });

  it("computes fee_related_pct correctly", async () => {
    const mock = getMock();
    mock
      .mockResolvedValueOnce([{ total: "200" }])
      .mockResolvedValueOnce([{ product: "Checking or savings account", count: "200" }])
      .mockResolvedValueOnce([
        { issue: "Fees or interest", count: "50" },
        { issue: "Managing an account", count: "50" },
        { issue: "Other", count: "100" },
      ])
      .mockResolvedValueOnce([{ fee_count: "100" }]); // 100 fee issues out of 200 total issues

    const result = await getInstitutionComplaintProfile(10);

    // fee_related_pct = 100 / (50+50+100) * 100 = 50%
    expect(result.fee_related_pct).toBe(50.0);
  });

  it("returns zero fee_related_pct when no issues exist", async () => {
    const mock = getMock();
    mock
      .mockResolvedValueOnce([{ total: "0" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ fee_count: "0" }]);

    const result = await getInstitutionComplaintProfile(99);

    expect(result.total_complaints).toBe(0);
    expect(result.fee_related_pct).toBe(0);
    expect(result.by_product).toHaveLength(0);
    expect(result.by_issue).toHaveLength(0);
  });
});
