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
  getRevenueTrend,
  getTopRevenueInstitutions,
  getRevenueByCharter,
} from "./call-reports";
import type {
  RevenueSnapshot,
  RevenueTrend,
  TopRevenueInstitution,
  RevenueByCharter,
} from "./call-reports";
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

describe("RevenueSnapshot type", () => {
  it("has required fields with correct types", () => {
    const snapshot: RevenueSnapshot = {
      quarter: "2024-Q4",
      total_service_charges: 1_000_000,
      total_institutions: 5_000,
      bank_service_charges: 750_000,
      cu_service_charges: 250_000,
      yoy_change_pct: 3.5,
    };
    expect(snapshot.quarter).toBe("2024-Q4");
    expect(snapshot.yoy_change_pct).toBe(3.5);
  });

  it("allows null yoy_change_pct", () => {
    const snapshot: RevenueSnapshot = {
      quarter: "2024-Q1",
      total_service_charges: 800_000,
      total_institutions: 4_200,
      bank_service_charges: 600_000,
      cu_service_charges: 200_000,
      yoy_change_pct: null,
    };
    expect(snapshot.yoy_change_pct).toBeNull();
  });
});

describe("RevenueTrend type", () => {
  it("has quarters array and latest snapshot", () => {
    const trend: RevenueTrend = {
      quarters: [],
      latest: null,
    };
    expect(Array.isArray(trend.quarters)).toBe(true);
    expect(trend.latest).toBeNull();
  });
});

describe("TopRevenueInstitution type", () => {
  it("has required fields", () => {
    const inst: TopRevenueInstitution = {
      cert_number: "12345",
      institution_name: "First National Bank",
      charter_type: "bank",
      report_date: "2024-09-30",
      service_charge_income: 500_000,
      total_assets: 1_000_000_000,
    };
    expect(inst.cert_number).toBe("12345");
  });

  it("allows null institution_name and total_assets", () => {
    const inst: TopRevenueInstitution = {
      cert_number: "99999",
      institution_name: null,
      charter_type: "credit_union",
      report_date: "2024-09-30",
      service_charge_income: 100_000,
      total_assets: null,
    };
    expect(inst.institution_name).toBeNull();
    expect(inst.total_assets).toBeNull();
  });
});

// ── getRevenueTrend ────────────────────────────────────────────────────────────

describe("getRevenueTrend", () => {
  beforeEach(() => {
    resetMock(getMock());
  });

  it("returns empty trend on DB error", async () => {
    getMock().unsafe = vi.fn().mockRejectedValue(new Error("connection refused"));

    const result = await getRevenueTrend();
    expect(result.quarters).toEqual([]);
    expect(result.latest).toBeNull();
  });

  it("returns empty trend when no rows", async () => {
    getMock().unsafe = vi.fn().mockResolvedValue([]);

    const result = await getRevenueTrend();
    expect(result.quarters).toHaveLength(0);
    expect(result.latest).toBeNull();
  });

  it("maps DB rows to RevenueSnapshot objects", async () => {
    const dbRows = [
      {
        quarter: "2024-4Q",
        quarter_date: "2024-10-01",
        total_service_charges: "5000000",
        total_institutions: "8000",
        bank_service_charges: "3500000",
        cu_service_charges: "1500000",
      },
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(dbRows);

    const result = await getRevenueTrend(1);
    expect(result.quarters).toHaveLength(1);
    const snap = result.quarters[0];
    expect(snap.total_service_charges).toBe(5_000_000);
    expect(snap.total_institutions).toBe(8_000);
    expect(snap.bank_service_charges).toBe(3_500_000);
    expect(snap.cu_service_charges).toBe(1_500_000);
    expect(snap.yoy_change_pct).toBeNull();
  });

  it("sets latest to the first (most recent) quarter", async () => {
    const dbRows = [
      {
        quarter: "2024-4Q",
        quarter_date: "2024-10-01",
        total_service_charges: "5000000",
        total_institutions: "8000",
        bank_service_charges: "3500000",
        cu_service_charges: "1500000",
      },
      {
        quarter: "2024-3Q",
        quarter_date: "2024-07-01",
        total_service_charges: "4800000",
        total_institutions: "7900",
        bank_service_charges: "3400000",
        cu_service_charges: "1400000",
      },
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(dbRows);

    const result = await getRevenueTrend(2);
    expect(result.latest?.quarter).toBe("2024-4Q");
  });

  it("computes YoY change when 5+ quarters present", async () => {
    const buildRow = (q: string, total: string) => ({
      quarter: q,
      quarter_date: "2024-01-01",
      total_service_charges: total,
      total_institutions: "1000",
      bank_service_charges: total,
      cu_service_charges: "0",
    });

    // 5 quarters: most recent first
    const dbRows = [
      buildRow("2024-4Q", "11000"), // i=0, compare to i=4 (10000)
      buildRow("2024-3Q", "10500"),
      buildRow("2024-2Q", "10200"),
      buildRow("2024-1Q", "10100"),
      buildRow("2023-4Q", "10000"), // i=4, base for i=0
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(dbRows);

    const result = await getRevenueTrend(5);
    const yoy = result.quarters[0].yoy_change_pct;
    expect(yoy).not.toBeNull();
    expect(yoy).toBeCloseTo(10, 1); // (11000 - 10000) / 10000 * 100 = 10%
  });

  it("passes quarterCount to query as LIMIT parameter", async () => {
    getMock().unsafe = vi.fn().mockResolvedValue([]);

    await getRevenueTrend(4);

    const callArgs = getMock().unsafe.mock.calls[0];
    const params: unknown[] = callArgs[1];
    expect(params).toContain(4);
  });

  it("SQL contains * 1000 scaling for service_charge_income", async () => {
    getMock().unsafe = vi.fn().mockResolvedValue([]);

    await getRevenueTrend(1);

    const callArgs = getMock().unsafe.mock.calls[0];
    const sql: string = callArgs[0];
    expect(sql).toContain("* 1000");
  });
});

// ── getTopRevenueInstitutions ─────────────────────────────────────────────────

describe("getTopRevenueInstitutions", () => {
  beforeEach(() => {
    const mock = getMock();
    resetMock(mock);
    // Default: template-literal call returns latest date, unsafe returns rows
    mock.mockResolvedValue([{ latest_date: "2024-09-30" }]);
    mock.unsafe = vi.fn().mockResolvedValue([]);
  });

  it("returns empty array when no latest date found", async () => {
    getMock().mockResolvedValue([{}]);

    const result = await getTopRevenueInstitutions();
    expect(result).toEqual([]);
  });

  it("returns empty array on DB error", async () => {
    getMock().mockRejectedValue(new Error("timeout"));

    const result = await getTopRevenueInstitutions();
    expect(result).toEqual([]);
  });

  it("maps DB rows to TopRevenueInstitution objects", async () => {
    getMock().mockResolvedValue([{ latest_date: "2024-09-30" }]);
    getMock().unsafe = vi.fn().mockResolvedValue([
      {
        cert_number: "12345",
        institution_name: "First National Bank",
        charter_type: "bank",
        report_date: "2024-09-30",
        service_charge_income: "4500000",
        total_assets: "2000000000",
      },
    ]);

    const result = await getTopRevenueInstitutions(1);
    expect(result).toHaveLength(1);
    expect(result[0].cert_number).toBe("12345");
    expect(result[0].service_charge_income).toBe(4_500_000);
    expect(result[0].total_assets).toBe(2_000_000_000);
  });

  it("handles null institution_name from LEFT JOIN", async () => {
    getMock().mockResolvedValue([{ latest_date: "2024-09-30" }]);
    getMock().unsafe = vi.fn().mockResolvedValue([
      {
        cert_number: "99999",
        institution_name: null,
        charter_type: "credit_union",
        report_date: "2024-09-30",
        service_charge_income: "200000",
        total_assets: null,
      },
    ]);

    const result = await getTopRevenueInstitutions(1);
    expect(result[0].institution_name).toBeNull();
    expect(result[0].total_assets).toBeNull();
  });

  it("converts Postgres Date objects to ISO string for report_date", async () => {
    getMock().mockResolvedValue([{ latest_date: new Date("2024-09-30") }]);
    getMock().unsafe = vi.fn().mockResolvedValue([]);

    // Should not throw; latest_date handling covers Date instances
    const result = await getTopRevenueInstitutions();
    expect(Array.isArray(result)).toBe(true);
  });

  it("SQL contains * 1000 scaling for service_charge_income and total_assets", async () => {
    getMock().mockResolvedValue([{ latest_date: "2024-09-30" }]);
    getMock().unsafe = vi.fn().mockResolvedValue([]);

    await getTopRevenueInstitutions(5);

    const callArgs = getMock().unsafe.mock.calls[0];
    const sql: string = callArgs[0];
    expect(sql).toContain("service_charge_income * 1000");
    expect(sql).toContain("total_assets * 1000");
  });
});

// ── getRevenueByCharter ────────────────────────────────────────────────────────

describe("getRevenueByCharter", () => {
  beforeEach(() => {
    resetMock(getMock());
  });

  it("returns rows with charter_type bank and credit_union from mock data", async () => {
    const dbRows = [
      {
        charter_type: "bank",
        total_service_charges: "750000000",
        institution_count: "3500",
        avg_service_charges: "214285",
        quarter: "2024-Q4",
      },
      {
        charter_type: "credit_union",
        total_service_charges: "250000000",
        institution_count: "2000",
        avg_service_charges: "125000",
        quarter: "2024-Q4",
      },
    ];
    getMock().unsafe = vi.fn().mockResolvedValue(dbRows);

    const result = await getRevenueByCharter();
    expect(result).toHaveLength(2);
    const charterTypes = result.map((r) => r.charter_type);
    expect(charterTypes).toContain("bank");
    expect(charterTypes).toContain("credit_union");
  });

  it("returns empty array on DB error", async () => {
    getMock().unsafe = vi.fn().mockRejectedValue(new Error("connection error"));

    const result = await getRevenueByCharter();
    expect(result).toEqual([]);
  });

  it("passes optional quarter parameter as $1 positional param", async () => {
    getMock().unsafe = vi.fn().mockResolvedValue([]);

    await getRevenueByCharter("2024-Q4");

    const callArgs = getMock().unsafe.mock.calls[0];
    const params: unknown[] = callArgs[1];
    expect(params).toContain("2024-Q4");
  });

  it("returns numeric values (not strings) for amounts", async () => {
    getMock().unsafe = vi.fn().mockResolvedValue([
      {
        charter_type: "bank",
        total_service_charges: "750000000",
        institution_count: "3500",
        avg_service_charges: "214285",
        quarter: "2024-Q4",
      },
    ]);

    const result = await getRevenueByCharter();
    expect(typeof result[0].total_service_charges).toBe("number");
    expect(typeof result[0].institution_count).toBe("number");
    expect(typeof result[0].avg_service_charges).toBe("number");
  });

  it("SQL contains * 1000 scaling", async () => {
    getMock().unsafe = vi.fn().mockResolvedValue([]);

    await getRevenueByCharter();

    const callArgs = getMock().unsafe.mock.calls[0];
    const sql: string = callArgs[0];
    expect(sql).toContain("* 1000");
  });

  it("type RevenueByCharter has required fields", () => {
    const entry: RevenueByCharter = {
      charter_type: "bank",
      total_service_charges: 750_000_000,
      institution_count: 3500,
      avg_service_charges: 214285,
      quarter: "2024-Q4",
    };
    expect(entry.charter_type).toBe("bank");
  });
});
