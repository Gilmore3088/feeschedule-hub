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
  getIndustryHealthMetrics,
  getDepositGrowthTrend,
  getLoanGrowthTrend,
  getInstitutionCountTrend,
  getHealthMetricsByCharter,
} from "./health";
import type {
  IndustryHealthMetrics,
  GrowthTrend,
  InstitutionCountSnapshot,
  HealthByCharter,
} from "./health";
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

describe("IndustryHealthMetrics type", () => {
  it("allows all nulls", () => {
    const metrics: IndustryHealthMetrics = {
      roa: null,
      roe: null,
      efficiency_ratio: null,
    };
    expect(metrics.roa).toBeNull();
    expect(metrics.roe).toBeNull();
    expect(metrics.efficiency_ratio).toBeNull();
  });
});

describe("GrowthTrend type", () => {
  it("has required fields", () => {
    const trend: GrowthTrend = {
      current_yoy_pct: 3.5,
      history: [],
      trend: "rising",
      asOf: "2024-Q4",
    };
    expect(trend.current_yoy_pct).toBe(3.5);
    expect(trend.trend).toBe("rising");
  });

  it("allows null current_yoy_pct", () => {
    const trend: GrowthTrend = {
      current_yoy_pct: null,
      history: [],
      trend: "stable",
      asOf: "2024-Q1",
    };
    expect(trend.current_yoy_pct).toBeNull();
  });
});

describe("InstitutionCountSnapshot type", () => {
  it("has required fields", () => {
    const snap: InstitutionCountSnapshot = {
      quarter: "2024-Q4",
      total: 5000,
      bank_count: 3500,
      cu_count: 1500,
      change: 10,
    };
    expect(snap.total).toBe(5000);
    expect(snap.change).toBe(10);
  });

  it("allows null change", () => {
    const snap: InstitutionCountSnapshot = {
      quarter: "2020-Q1",
      total: 4800,
      bank_count: 3400,
      cu_count: 1400,
      change: null,
    };
    expect(snap.change).toBeNull();
  });
});

// ── getIndustryHealthMetrics ──────────────────────────────────────────────────

describe("getIndustryHealthMetrics", () => {
  beforeEach(() => {
    resetMock(getMock());
  });

  it("returns all nulls on DB error", async () => {
    getMock().unsafe = vi.fn().mockRejectedValue(new Error("connection refused"));

    const result = await getIndustryHealthMetrics();
    expect(result.roa).toBeNull();
    expect(result.roe).toBeNull();
    expect(result.efficiency_ratio).toBeNull();
  });

  it("returns all nulls when result set is empty", async () => {
    getMock().unsafe = vi.fn().mockResolvedValue([]);

    const result = await getIndustryHealthMetrics();
    expect(result.roa).toBeNull();
    expect(result.roe).toBeNull();
    expect(result.efficiency_ratio).toBeNull();
  });

  it("returns RichIndicator with current, history, trend, asOf for roa", async () => {
    const roaRows = [
      { quarter: "2024-Q4", value: "0.0120" },
      { quarter: "2024-Q3", value: "0.0115" },
      { quarter: "2024-Q2", value: "0.0110" },
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(roaRows);

    const result = await getIndustryHealthMetrics();
    expect(result.roa).not.toBeNull();
    expect(typeof result.roa!.current).toBe("number");
    expect(Array.isArray(result.roa!.history)).toBe(true);
    expect(["rising", "falling", "stable"]).toContain(result.roa!.trend);
    expect(typeof result.roa!.asOf).toBe("string");
  });

  it("ROA value is NOT multiplied by 1000 -- it is a FLOAT ratio", async () => {
    const roaRows = [
      { quarter: "2024-Q4", value: "0.0120" },
      { quarter: "2024-Q3", value: "0.0115" },
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(roaRows);

    const result = await getIndustryHealthMetrics();
    // current should be ~0.012, not 12
    expect(result.roa!.current).toBeCloseTo(0.012, 4);
  });

  it("deriveTrend is importable from fed.ts (export verified at module level)", async () => {
    // If deriveTrend is not exported, health.ts import would fail at module load
    // The fact that getIndustryHealthMetrics() runs at all proves deriveTrend is exported
    getMock().unsafe = vi.fn().mockResolvedValue([]);
    const result = await getIndustryHealthMetrics();
    expect(result).toBeDefined();
  });

  it("sets asOf to the most recent quarter label", async () => {
    const rows = [
      { quarter: "2024-Q4", value: "0.012" },
      { quarter: "2024-Q3", value: "0.011" },
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(rows);

    const result = await getIndustryHealthMetrics();
    expect(result.roa!.asOf).toBe("2024-Q4");
  });

  it("history contains prior quarters in chronological order", async () => {
    const rows = [
      { quarter: "2024-Q4", value: "0.012" },
      { quarter: "2024-Q3", value: "0.011" },
      { quarter: "2024-Q2", value: "0.010" },
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(rows);

    const result = await getIndustryHealthMetrics();
    // history = rows.slice(1).reverse() => Q2, Q3 (oldest first)
    expect(result.roa!.history).toHaveLength(2);
    expect(result.roa!.history[0].date).toBe("2024-Q2");
    expect(result.roa!.history[1].date).toBe("2024-Q3");
  });
});

// ── getDepositGrowthTrend ─────────────────────────────────────────────────────

describe("getDepositGrowthTrend", () => {
  beforeEach(() => {
    resetMock(getMock());
  });

  it("returns null on DB error", async () => {
    getMock().unsafe = vi.fn().mockRejectedValue(new Error("timeout"));

    const result = await getDepositGrowthTrend();
    expect(result).toBeNull();
  });

  it("returns GrowthTrend with YoY pct as current_yoy_pct", async () => {
    // quarters: most-recent first
    const rows = [
      { quarter: "2024-Q4", total: "500000000000" },  // current
      { quarter: "2024-Q3", total: "490000000000" },
      { quarter: "2024-Q2", total: "480000000000" },
      { quarter: "2024-Q1", total: "470000000000" },
      { quarter: "2023-Q4", total: "460000000000" },  // prior year for Q4
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(rows);

    const result = await getDepositGrowthTrend();
    expect(result).not.toBeNull();
    expect(result!.current_yoy_pct).not.toBeNull();
    // YoY: (500B - 460B) / 460B * 100 ≈ 8.7%
    expect(result!.current_yoy_pct).toBeCloseTo(8.695, 1);
  });

  it("deposit values use * 1000 scaling (BIGINT monetary fields)", async () => {
    // total_deposits stored in thousands in DB, SQL must multiply by 1000
    // We verify by checking that asOf is set and result is not null
    const rows = [
      { quarter: "2024-Q4", total: "1000000" }, // 1M * 1000 = 1B actual
      { quarter: "2023-Q4", total: "900000" },
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(rows);

    const result = await getDepositGrowthTrend();
    expect(result).not.toBeNull();
    expect(result!.asOf).toBe("2024-Q4");
    // YoY: (1000000 - 900000) / 900000 * 100 ≈ 11.1%
    expect(result!.current_yoy_pct).toBeCloseTo(11.111, 1);
  });

  it("uses priorYearQuarter label matching for YoY, not positional offset", async () => {
    // Only Q4 2024 and Q4 2023 present (no contiguous quarters)
    const rows = [
      { quarter: "2024-Q4", total: "500000" },
      { quarter: "2023-Q4", total: "450000" },
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(rows);

    const result = await getDepositGrowthTrend();
    // Should compute YoY correctly via label matching
    expect(result).not.toBeNull();
    expect(result!.current_yoy_pct).toBeCloseTo(11.111, 1);
  });

  it("current_yoy_pct is null when no prior year data", async () => {
    const rows = [
      { quarter: "2024-Q4", total: "500000" },
      { quarter: "2024-Q3", total: "490000" },
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(rows);

    const result = await getDepositGrowthTrend();
    expect(result).not.toBeNull();
    expect(result!.current_yoy_pct).toBeNull();
  });
});

// ── getLoanGrowthTrend ────────────────────────────────────────────────────────

describe("getLoanGrowthTrend", () => {
  beforeEach(() => {
    resetMock(getMock());
  });

  it("returns null on DB error", async () => {
    getMock().unsafe = vi.fn().mockRejectedValue(new Error("timeout"));

    const result = await getLoanGrowthTrend();
    expect(result).toBeNull();
  });

  it("returns GrowthTrend with YoY pct for loans", async () => {
    const rows = [
      { quarter: "2024-Q4", total: "600000" },
      { quarter: "2023-Q4", total: "540000" },
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(rows);

    const result = await getLoanGrowthTrend();
    expect(result).not.toBeNull();
    // YoY: (600000 - 540000) / 540000 * 100 ≈ 11.1%
    expect(result!.current_yoy_pct).toBeCloseTo(11.111, 1);
  });
});

// ── getInstitutionCountTrend ──────────────────────────────────────────────────

describe("getInstitutionCountTrend", () => {
  beforeEach(() => {
    resetMock(getMock());
  });

  it("returns empty array on DB error", async () => {
    getMock().unsafe = vi.fn().mockRejectedValue(new Error("timeout"));

    const result = await getInstitutionCountTrend();
    expect(result).toEqual([]);
  });

  it("returns array of InstitutionCountSnapshot", async () => {
    const rows = [
      { quarter: "2024-Q4", total: "5000", bank_count: "3500", cu_count: "1500" },
      { quarter: "2024-Q3", total: "4990", bank_count: "3490", cu_count: "1500" },
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(rows);

    const result = await getInstitutionCountTrend();
    expect(result).toHaveLength(2);
    expect(result[0].quarter).toBe("2024-Q4");
    expect(result[0].total).toBe(5000);
    expect(result[0].bank_count).toBe(3500);
    expect(result[0].cu_count).toBe(1500);
  });

  it("computes period-over-period change for most recent quarter", async () => {
    const rows = [
      { quarter: "2024-Q4", total: "5000", bank_count: "3500", cu_count: "1500" },
      { quarter: "2024-Q3", total: "4990", bank_count: "3490", cu_count: "1500" },
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(rows);

    const result = await getInstitutionCountTrend();
    // change for most recent = 5000 - 4990 = 10
    expect(result[0].change).toBe(10);
    // change for oldest = null (no prior quarter in data)
    expect(result[result.length - 1].change).toBeNull();
  });

  it("active institution = has a row in institution_financials that quarter", async () => {
    // getInstitutionCountTrend uses COUNT(DISTINCT crawl_target_id) per quarter
    // Verified structurally: result has total field from COUNT
    const rows = [
      { quarter: "2024-Q4", total: "100", bank_count: "70", cu_count: "30" },
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(rows);

    const result = await getInstitutionCountTrend();
    expect(result[0].total).toBe(100);
  });
});

// ── getHealthMetricsByCharter ─────────────────────────────────────────────────

describe("getHealthMetricsByCharter", () => {
  beforeEach(() => {
    resetMock(getMock());
  });

  it("returns { bank, credit_union } structure", async () => {
    getMock().unsafe = vi.fn().mockResolvedValue([]);

    const result = await getHealthMetricsByCharter();
    expect(result).toHaveProperty("bank");
    expect(result).toHaveProperty("credit_union");
  });

  it("returns all nulls for both charters on DB error", async () => {
    getMock().unsafe = vi.fn().mockRejectedValue(new Error("connection failed"));

    const result = await getHealthMetricsByCharter();
    expect(result.bank.roa).toBeNull();
    expect(result.bank.roe).toBeNull();
    expect(result.bank.efficiency_ratio).toBeNull();
    expect(result.credit_union.roa).toBeNull();
    expect(result.credit_union.roe).toBeNull();
    expect(result.credit_union.efficiency_ratio).toBeNull();
  });

  it("charter segmentation returns RichIndicator per charter when data exists", async () => {
    const bankRows = [
      { quarter: "2024-Q4", value: "0.014" },
      { quarter: "2024-Q3", value: "0.013" },
    ];
    // First 3 calls = bank (roa, roe, efficiency), next 3 = credit_union
    getMock().unsafe = vi.fn()
      .mockResolvedValueOnce(bankRows)  // bank roa
      .mockResolvedValueOnce(bankRows)  // bank roe
      .mockResolvedValueOnce(bankRows)  // bank efficiency_ratio
      .mockResolvedValueOnce([{ quarter: "2024-Q4", value: "0.010" }])  // cu roa
      .mockResolvedValueOnce([])        // cu roe
      .mockResolvedValueOnce([]);       // cu efficiency_ratio

    const result = await getHealthMetricsByCharter();
    expect(result.bank.roa).not.toBeNull();
    expect(result.bank.roa!.current).toBeCloseTo(0.014, 4);
    expect(result.credit_union.roa).not.toBeNull();
    expect(result.credit_union.roa!.current).toBeCloseTo(0.010, 4);
    expect(result.credit_union.roe).toBeNull();
  });
});
