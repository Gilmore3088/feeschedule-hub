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
  getRevenueConcentration,
  getFeeDependencyRatio,
  getRevenuePerInstitution,
} from "./derived";
import type {
  RevenueConcentration,
  FeeDependencyRow,
  RevenuePerInstitutionRow,
} from "./derived";
import { getSql } from "./connection";

type MockSql = ReturnType<typeof vi.fn> & { unsafe: ReturnType<typeof vi.fn> };

function getMock(): MockSql {
  return getSql() as MockSql;
}

function resetMock(mock: MockSql) {
  mock.mockReset();
  mock.unsafe = vi.fn();
}

// ── Type-level checks ─────────────────────────────────────────────────────────

describe("RevenueConcentration type", () => {
  it("has required fields with correct types", () => {
    const rc: RevenueConcentration = {
      fee_category: "overdraft",
      total_service_charges: 5_000_000,
      share_pct: 25.5,
      cumulative_pct: 25.5,
      institution_count: 1200,
    };
    expect(rc.fee_category).toBe("overdraft");
    expect(rc.total_service_charges).toBe(5_000_000);
    expect(rc.share_pct).toBe(25.5);
    expect(rc.cumulative_pct).toBe(25.5);
    expect(rc.institution_count).toBe(1200);
  });
});

describe("FeeDependencyRow type", () => {
  it("has required fields with correct types", () => {
    const row: FeeDependencyRow = {
      charter_type: "bank",
      asset_size_tier: "community",
      median_ratio: 0.15,
      p25_ratio: 0.08,
      p75_ratio: 0.22,
      institution_count: 500,
      total_sc_income: 2_000_000,
      overdraft_revenue: 1_200_000,
      other_sc_income: 800_000,
      overdraft_share: 60.0,
    };
    expect(row.charter_type).toBe("bank");
    expect(row.overdraft_share).toBe(60.0);
  });

  it("allows null overdraft fields", () => {
    const row: FeeDependencyRow = {
      charter_type: "credit_union",
      asset_size_tier: "small",
      median_ratio: 0.10,
      p25_ratio: 0.05,
      p75_ratio: 0.18,
      institution_count: 200,
      total_sc_income: 500_000,
      overdraft_revenue: null,
      other_sc_income: null,
      overdraft_share: null,
    };
    expect(row.overdraft_revenue).toBeNull();
    expect(row.overdraft_share).toBeNull();
  });
});

describe("RevenuePerInstitutionRow type", () => {
  it("has required fields with correct types", () => {
    const row: RevenuePerInstitutionRow = {
      charter_type: "bank",
      asset_size_tier: "large",
      avg_sc_income: 10_000_000,
      median_sc_income: 8_000_000,
      institution_count: 50,
    };
    expect(row.avg_sc_income).toBe(10_000_000);
    expect(row.median_sc_income).toBe(8_000_000);
  });
});

// ── getRevenueConcentration ───────────────────────────────────────────────────

describe("getRevenueConcentration", () => {
  let mock: MockSql;

  beforeEach(() => {
    mock = getMock();
    resetMock(mock);
  });

  it("returns correct structure with cumulative_pct computed", async () => {
    // SQL returns total_sc already in dollars (scaled * 1000 at SQL level)
    const rows = [
      { fee_category: "overdraft", total_sc: "5000000", institution_count: "1200", share_pct: "50" },
      { fee_category: "nsf", total_sc: "3000000", institution_count: "900", share_pct: "30" },
      { fee_category: "monthly_maintenance", total_sc: "2000000", institution_count: "600", share_pct: "20" },
    ];
    mock.unsafe.mockResolvedValue(rows);

    const result = await getRevenueConcentration(3);

    expect(result).toHaveLength(3);
    expect(result[0].fee_category).toBe("overdraft");
    expect(result[0].total_service_charges).toBe(5_000_000);
    expect(result[0].institution_count).toBe(1200);
  });

  it("computes share_pct that sums correctly", async () => {
    const rows = [
      { fee_category: "overdraft", total_sc: "6000000", institution_count: "1000", share_pct: "60" },
      { fee_category: "nsf", total_sc: "4000000", institution_count: "800", share_pct: "40" },
    ];
    mock.unsafe.mockResolvedValue(rows);

    const result = await getRevenueConcentration(2);

    expect(result[0].share_pct).toBeCloseTo(60.0, 1);
    expect(result[1].share_pct).toBeCloseTo(40.0, 1);
    const totalShare = result.reduce((sum, r) => sum + r.share_pct, 0);
    expect(totalShare).toBeCloseTo(100.0, 1);
  });

  it("computes cumulative_pct monotonically", async () => {
    const rows = [
      { fee_category: "overdraft", total_sc: "5000000", institution_count: "1200", share_pct: "50" },
      { fee_category: "nsf", total_sc: "3000000", institution_count: "900", share_pct: "30" },
      { fee_category: "monthly_maintenance", total_sc: "2000000", institution_count: "600", share_pct: "20" },
    ];
    mock.unsafe.mockResolvedValue(rows);

    const result = await getRevenueConcentration(3);

    for (let i = 1; i < result.length; i++) {
      expect(result[i].cumulative_pct).toBeGreaterThan(result[i - 1].cumulative_pct);
    }
    expect(result[result.length - 1].cumulative_pct).toBeCloseTo(100.0, 1);
  });

  it("returns exactly N rows when requested", async () => {
    const rows = [
      { fee_category: "overdraft", total_sc: "5000000", institution_count: "1200", share_pct: "50" },
      { fee_category: "nsf", total_sc: "3000000", institution_count: "900", share_pct: "30" },
      { fee_category: "monthly_maintenance", total_sc: "2000000", institution_count: "600", share_pct: "20" },
    ];
    mock.unsafe.mockResolvedValue(rows);

    const result = await getRevenueConcentration(3);
    expect(result).toHaveLength(3);
  });

  it("uses sql.unsafe with parameterized topN", async () => {
    mock.unsafe.mockResolvedValue([]);

    await getRevenueConcentration(7);

    expect(mock.unsafe).toHaveBeenCalledOnce();
    const call = mock.unsafe.mock.calls[0];
    expect(call[1]).toContain(7);
  });

  it("returns empty array on error", async () => {
    mock.unsafe.mockRejectedValue(new Error("DB connection failed"));

    const result = await getRevenueConcentration(5);
    expect(result).toEqual([]);
  });

  it("returns empty array when no data", async () => {
    mock.unsafe.mockResolvedValue([]);

    const result = await getRevenueConcentration(5);
    expect(result).toEqual([]);
  });
});

// ── getFeeDependencyRatio ─────────────────────────────────────────────────────

describe("getFeeDependencyRatio", () => {
  let mock: MockSql;

  beforeEach(() => {
    mock = getMock();
    resetMock(mock);
  });

  it("returns correct structure with charter_type and asset_size_tier grouping", async () => {
    // SQL returns total_sc_income and overdraft_revenue in thousands (raw DB values)
    const rows = [
      {
        charter_type: "bank",
        asset_size_tier: "community",
        ratios: [0.08, 0.12, 0.15, 0.18, 0.22],
        total_sc_income: "1000",
        overdraft_revenue: "600",
        institution_count: "5",
      },
    ];
    mock.unsafe.mockResolvedValue(rows);

    const result = await getFeeDependencyRatio();
    expect(result).toHaveLength(1);
    expect(result[0].charter_type).toBe("bank");
    expect(result[0].asset_size_tier).toBe("community");
    expect(result[0].institution_count).toBe(5);
  });

  it("applies * 1000 scaling to total_sc_income and overdraft_revenue", async () => {
    // SQL returns values in thousands; TypeScript multiplies by 1000
    const rows = [
      {
        charter_type: "bank",
        asset_size_tier: "community",
        ratios: [0.10, 0.15, 0.20],
        total_sc_income: "1000",
        overdraft_revenue: "600",
        institution_count: "3",
      },
    ];
    mock.unsafe.mockResolvedValue(rows);

    const result = await getFeeDependencyRatio();
    expect(result[0].total_sc_income).toBe(1_000_000);
    expect(result[0].overdraft_revenue).toBe(600_000);
  });

  it("computes overdraft_share as percentage when both values present", async () => {
    const rows = [
      {
        charter_type: "bank",
        asset_size_tier: "community",
        ratios: [0.10, 0.15, 0.20],
        total_sc_income: "1000",
        overdraft_revenue: "600",
        institution_count: "3",
      },
    ];
    mock.unsafe.mockResolvedValue(rows);

    const result = await getFeeDependencyRatio();
    expect(result[0].overdraft_share).toBeCloseTo(60.0, 1);
    expect(result[0].other_sc_income).toBe(400_000);
  });

  it("sets overdraft_share to null when overdraft_revenue is null", async () => {
    const rows = [
      {
        charter_type: "credit_union",
        asset_size_tier: "small",
        ratios: [0.05, 0.10, 0.15],
        total_sc_income: "500",
        overdraft_revenue: null,
        institution_count: "3",
      },
    ];
    mock.unsafe.mockResolvedValue(rows);

    const result = await getFeeDependencyRatio();
    expect(result[0].overdraft_share).toBeNull();
    expect(result[0].other_sc_income).toBeNull();
  });

  it("filters by charter when opts.charter provided", async () => {
    mock.unsafe.mockResolvedValue([]);

    await getFeeDependencyRatio({ charter: "bank" });

    expect(mock.unsafe).toHaveBeenCalledOnce();
  });

  it("returns empty array on error", async () => {
    mock.unsafe.mockRejectedValue(new Error("Query failed"));

    const result = await getFeeDependencyRatio();
    expect(result).toEqual([]);
  });
});

// ── getRevenuePerInstitution ──────────────────────────────────────────────────

describe("getRevenuePerInstitution", () => {
  let mock: MockSql;

  beforeEach(() => {
    mock = getMock();
    resetMock(mock);
  });

  it("returns correct structure with avg_sc_income scaled * 1000", async () => {
    // SQL returns avg_sc and sc_values in thousands; TypeScript scales to dollars
    const rows = [
      {
        charter_type: "bank",
        asset_size_tier: "large",
        avg_sc: "10000",
        institution_count: "50",
        sc_values: [8000, 9000, 10000, 11000, 12000],
      },
    ];
    mock.unsafe.mockResolvedValue(rows);

    const result = await getRevenuePerInstitution();
    expect(result).toHaveLength(1);
    expect(result[0].charter_type).toBe("bank");
    expect(result[0].asset_size_tier).toBe("large");
    expect(result[0].avg_sc_income).toBe(10_000_000);
    expect(result[0].institution_count).toBe(50);
  });

  it("computes median_sc_income in TypeScript from sc_values (scaled * 1000)", async () => {
    // sc_values are in thousands from DB; median * 1000 = dollars
    const rows = [
      {
        charter_type: "bank",
        asset_size_tier: "community",
        avg_sc: "5000",
        institution_count: "3",
        sc_values: [3000, 5000, 7000],
      },
    ];
    mock.unsafe.mockResolvedValue(rows);

    const result = await getRevenuePerInstitution();
    // median of [3000, 5000, 7000] * 1000 = 5_000_000
    expect(result[0].median_sc_income).toBe(5_000_000);
  });

  it("returns empty array on error", async () => {
    mock.unsafe.mockRejectedValue(new Error("DB error"));

    const result = await getRevenuePerInstitution();
    expect(result).toEqual([]);
  });

  it("returns empty array when no data", async () => {
    mock.unsafe.mockResolvedValue([]);

    const result = await getRevenuePerInstitution();
    expect(result).toEqual([]);
  });
});
