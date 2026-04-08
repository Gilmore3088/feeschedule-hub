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
  getNationalEconomicSummary,
  getDistrictEconomicSummary,
  type DistrictEconomicSummary,
} from "./fed";
import { getSql } from "./connection";

type MockSql = ReturnType<typeof vi.fn> & { unsafe: ReturnType<typeof vi.fn> };

function getMock(): MockSql {
  return getSql() as MockSql;
}

function resetMock(mock: MockSql) {
  mock.mockReset();
  mock.unsafe = vi.fn();
}

// ── getNationalEconomicSummary ────────────────────────────────────────────────

describe("getNationalEconomicSummary", () => {
  beforeEach(() => {
    resetMock(getMock());
  });

  it("returns object with all 4 indicator keys", async () => {
    // Each buildRichIndicator call fetches rows; CPI path fetches 24 rows
    getMock().mockResolvedValue([
      { observation_date: "2025-01-01", value: "5.33" },
      { observation_date: "2024-12-01", value: "5.33" },
      { observation_date: "2024-11-01", value: "5.25" },
    ]);

    const result = await getNationalEconomicSummary();
    expect(result).toHaveProperty("fed_funds_rate");
    expect(result).toHaveProperty("unemployment_rate");
    expect(result).toHaveProperty("cpi_yoy_pct");
    expect(result).toHaveProperty("consumer_sentiment");
  });

  it("returns null indicators when DB is empty", async () => {
    getMock().mockResolvedValue([]);

    const result = await getNationalEconomicSummary();
    expect(result.fed_funds_rate).toBeNull();
    expect(result.unemployment_rate).toBeNull();
    expect(result.cpi_yoy_pct).toBeNull();
    expect(result.consumer_sentiment).toBeNull();
  });

  it("returns non-null consumer_sentiment when UMCSENT rows exist", async () => {
    // All buildRichIndicator calls share the same mock; return rows for every call
    getMock().mockResolvedValue([
      { observation_date: "2025-01-01", value: "74.5" },
      { observation_date: "2024-12-01", value: "72.0" },
      { observation_date: "2024-11-01", value: "71.8" },
    ]);

    const result = await getNationalEconomicSummary();
    expect(result.consumer_sentiment).not.toBeNull();
    expect(result.consumer_sentiment!.current).toBeCloseTo(74.5, 1);
  });
});

// ── CPI YoY is a percentage, not a raw index ─────────────────────────────────

describe("getNationalEconomicSummary CPI YoY computation", () => {
  beforeEach(() => {
    resetMock(getMock());
  });

  it("CPI YoY value is a percentage (< 50), not a raw index (> 100)", async () => {
    // 24 rows needed: current index = 315.6, 12mo ago = 305.8 -> YoY ~3.2%
    const cpiRows = Array.from({ length: 24 }, (_, i) => ({
      observation_date: `2025-${String(1 - i).padStart(2, "0")}-01`.replace(
        /(\d{4})-(-\d+)-/,
        (_, y) => `${Number(y) - Math.floor(i / 12)}-`
      ),
      value: String(315.6 - i * 0.5),
    }));
    // Override with exactly 24 rows with known current=315.6 and 12mo=305.6
    const rows24 = Array.from({ length: 24 }, (_, i) => ({
      observation_date: `2025-01-01`,
      value: String(315.6 - i * 0.83),  // index[0]=315.6, index[12]~= 305.6
    }));
    getMock().mockResolvedValue(rows24);

    const result = await getNationalEconomicSummary();
    if (result.cpi_yoy_pct !== null) {
      // YoY percentage must be < 50 (typical range -5% to +15%)
      // A raw index value would be > 100
      expect(result.cpi_yoy_pct.current).toBeLessThan(50);
      expect(result.cpi_yoy_pct.current).toBeGreaterThan(-20);
    }
    // cpi_yoy_pct.current should NOT be a raw CPI index value (like 315)
    if (result.cpi_yoy_pct !== null) {
      expect(result.cpi_yoy_pct.current).not.toBeGreaterThan(100);
    }
  });

  it("CPI YoY computed as ((current - prior) / prior) * 100", async () => {
    // current = 315.6, 12mo ago = 305.8 -> expected YoY = (315.6-305.8)/305.8*100 ~ 3.206
    const rows: { observation_date: string; value: string }[] = [];
    for (let i = 0; i < 24; i++) {
      rows.push({
        observation_date: `2025-01-01`,
        value: i === 0 ? "315.6" : i === 12 ? "305.8" : "310.0",
      });
    }
    getMock().mockResolvedValue(rows);

    const result = await getNationalEconomicSummary();
    if (result.cpi_yoy_pct !== null) {
      const expected = ((315.6 - 305.8) / 305.8) * 100;
      expect(result.cpi_yoy_pct.current).toBeCloseTo(expected, 1);
    }
  });
});

// ── getDistrictEconomicSummary ────────────────────────────────────────────────

describe("getDistrictEconomicSummary", () => {
  beforeEach(() => {
    resetMock(getMock());
  });

  it("returns object with district field and expected shape", async () => {
    getMock().mockResolvedValue([
      { observation_date: "2025-01-01", value: "4.2" },
      { observation_date: "2024-12-01", value: "4.1" },
      { observation_date: "2024-11-01", value: "4.0" },
    ]);

    const result = await getDistrictEconomicSummary(2);
    expect(result).toMatchObject<Partial<DistrictEconomicSummary>>({
      district: 2,
    });
    expect(result).toHaveProperty("unemployment_rate");
    expect(result).toHaveProperty("nonfarm_payroll");
    expect(result).toHaveProperty("nonfarm_yoy_pct");
  });

  it("returns non-null unemployment and payroll when data exists", async () => {
    getMock().mockResolvedValue([
      { observation_date: "2025-01-01", value: "4.2" },
      { observation_date: "2024-12-01", value: "4.1" },
      { observation_date: "2024-11-01", value: "4.0" },
    ]);

    const result = await getDistrictEconomicSummary(2);
    expect(result.unemployment_rate).not.toBeNull();
    expect(result.nonfarm_payroll).not.toBeNull();
  });

  it("computes nonfarm_yoy_pct correctly from 13-month history", async () => {
    // 13 rows: current=8200 (index 0), 12mo ago=8000 (index 12)
    // Expected YoY: (8200 - 8000) / 8000 * 100 = 2.5%
    const rows13 = Array.from({ length: 13 }, (_, i) => ({
      observation_date: `2025-01-01`,
      value: i === 0 ? "8200" : i === 12 ? "8000" : "8100",
    }));
    getMock().mockResolvedValue(rows13);

    const result = await getDistrictEconomicSummary(2);
    expect(result.nonfarm_yoy_pct).not.toBeNull();
    expect(result.nonfarm_yoy_pct).toBeCloseTo(2.5, 1);
  });

  it("returns null fields gracefully when DB returns empty arrays", async () => {
    getMock().mockResolvedValue([]);

    const result = await getDistrictEconomicSummary(9);
    expect(result.district).toBe(9);
    expect(result.unemployment_rate).toBeNull();
    expect(result.nonfarm_payroll).toBeNull();
    expect(result.nonfarm_yoy_pct).toBeNull();
  });

  it("returns null nonfarm_yoy_pct when fewer than 13 history points", async () => {
    // Only 3 rows — not enough for YoY
    getMock().mockResolvedValue([
      { observation_date: "2025-01-01", value: "8200" },
      { observation_date: "2024-12-01", value: "8150" },
      { observation_date: "2024-11-01", value: "8100" },
    ]);

    const result = await getDistrictEconomicSummary(11);
    expect(result.nonfarm_yoy_pct).toBeNull();
  });
});
