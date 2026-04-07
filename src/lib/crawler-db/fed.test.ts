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

import { getFredSummary, getNationalEconomicSummary, getDistrictUnemployment } from "./fed";
import { getSql } from "./connection";

type MockSql = ReturnType<typeof vi.fn> & { unsafe: ReturnType<typeof vi.fn> };

function getMock(): MockSql {
  return getSql() as MockSql;
}

function resetMock(mock: MockSql) {
  mock.mockReset();
  mock.unsafe = vi.fn();
}

// ── getFredSummary (backward compatibility) ───────────────────────────────────

describe("getFredSummary", () => {
  beforeEach(() => {
    resetMock(getMock());
  });

  it("returns all null fields on DB error", async () => {
    getMock().mockRejectedValue(new Error("connection refused"));

    const result = await getFredSummary();
    expect(result.fed_funds_rate).toBeNull();
    expect(result.unemployment_rate).toBeNull();
    expect(result.cpi_yoy_pct).toBeNull();
    expect(result.consumer_sentiment).toBeNull();
    expect(typeof result.as_of).toBe("string");
  });

  it("returns correct structure with mock data for all series", async () => {
    // First call: DISTINCT ON query for FEDFUNDS, UNRATE, CPIAUCSL, UMCSENT
    getMock().mockResolvedValueOnce([
      { series_id: "FEDFUNDS", value: 5.33, observation_date: "2024-09-01" },
      { series_id: "UNRATE", value: 4.1, observation_date: "2024-09-01" },
      { series_id: "UMCSENT", value: 70.1, observation_date: "2024-09-01" },
    ]);
    // Second call: CPI YoY (13-row fetch)
    getMock().mockResolvedValueOnce(
      Array.from({ length: 13 }, (_, i) => ({
        value: i === 0 ? 310.0 : 300.0,
        observation_date: `2024-${String(9 - i).padStart(2, "0")}-01`,
      }))
    );

    const result = await getFredSummary();
    expect(result.fed_funds_rate).toBe(5.33);
    expect(result.unemployment_rate).toBe(4.1);
    expect(result.consumer_sentiment).toBe(70.1);
    expect(result.as_of).toBe("2024-09-01");
  });

  it("computes CPI YoY as a percentage, not raw index", async () => {
    // DISTINCT ON query (no CPI in results — that's handled separately)
    getMock().mockResolvedValueOnce([
      { series_id: "FEDFUNDS", value: 5.33, observation_date: "2024-09-01" },
    ]);
    // 13 CPI rows: index 0 = 310.0, index 12 = 300.0 → YoY = ((310-300)/300)*100 = 3.333...
    const cpiRows = Array.from({ length: 13 }, (_, i) => ({
      value: i === 0 ? 310.0 : 300.0,
      observation_date: `2024-${String(9 - i).padStart(2, "0")}-01`,
    }));
    getMock().mockResolvedValueOnce(cpiRows);

    const result = await getFredSummary();
    expect(result.cpi_yoy_pct).not.toBeNull();
    // Should be a percentage (~3.33), not a raw index (>100)
    expect(result.cpi_yoy_pct!).toBeLessThan(50);
    expect(result.cpi_yoy_pct!).toBeCloseTo(3.333, 1);
  });

  it("returns null cpi_yoy_pct when fewer than 13 rows available", async () => {
    getMock().mockResolvedValueOnce([
      { series_id: "FEDFUNDS", value: 5.33, observation_date: "2024-09-01" },
    ]);
    // Only 5 CPI rows — not enough for YoY
    getMock().mockResolvedValueOnce(
      Array.from({ length: 5 }, (_, i) => ({
        value: 310.0 - i,
        observation_date: `2024-${String(9 - i).padStart(2, "0")}-01`,
      }))
    );

    const result = await getFredSummary();
    expect(result.cpi_yoy_pct).toBeNull();
  });

  it("returns non-null consumer_sentiment when UMCSENT data present", async () => {
    getMock().mockResolvedValueOnce([
      { series_id: "UMCSENT", value: 68.5, observation_date: "2024-09-01" },
    ]);
    getMock().mockResolvedValueOnce([]); // CPI fetch returns empty

    const result = await getFredSummary();
    expect(result.consumer_sentiment).not.toBeNull();
    expect(result.consumer_sentiment).toBe(68.5);
  });
});

// ── getNationalEconomicSummary ─────────────────────────────────────────────────

describe("getNationalEconomicSummary", () => {
  beforeEach(() => {
    resetMock(getMock());
  });

  function makeIndicatorRows(values: number[], baseDate = "2024-09-01") {
    return values.map((v, i) => ({
      value: v,
      observation_date: new Date(
        new Date(baseDate).getTime() - i * 30 * 24 * 60 * 60 * 1000
      )
        .toISOString()
        .slice(0, 10),
    }));
  }

  it("returns object with expected keys", async () => {
    // Four parallel fetches: FEDFUNDS, UNRATE, CPI (17 rows), UMCSENT
    getMock()
      .mockResolvedValueOnce(makeIndicatorRows([5.33, 5.25, 5.25, 5.0, 4.75])) // FEDFUNDS
      .mockResolvedValueOnce(makeIndicatorRows([4.1, 4.0, 3.9, 3.8, 3.7])) // UNRATE
      .mockResolvedValueOnce( // CPI 17 rows
        Array.from({ length: 17 }, (_, i) => ({
          value: 310 - i * 0.5,
          observation_date: `2024-${String(9 - i).padStart(2, "0")}-01`,
        }))
      )
      .mockResolvedValueOnce(makeIndicatorRows([70.1, 69.5, 68.0, 71.0, 72.0])); // UMCSENT

    const result = await getNationalEconomicSummary();
    expect(result).toHaveProperty("fed_funds_rate");
    expect(result).toHaveProperty("unemployment_rate");
    expect(result).toHaveProperty("cpi_yoy_pct");
    expect(result).toHaveProperty("consumer_sentiment");
  });

  it("each non-null key is a RichIndicator with current, history, trend, asOf", async () => {
    getMock()
      .mockResolvedValueOnce(makeIndicatorRows([5.33, 5.25, 5.0, 4.75, 4.5]))
      .mockResolvedValueOnce(makeIndicatorRows([4.1, 4.0, 3.9, 3.8, 3.7]))
      .mockResolvedValueOnce(
        Array.from({ length: 17 }, (_, i) => ({
          value: 310 - i * 0.5,
          observation_date: `2024-${String(9 - i).padStart(2, "0")}-01`,
        }))
      )
      .mockResolvedValueOnce(makeIndicatorRows([70.1, 69.5, 68.0, 71.0, 72.0]));

    const result = await getNationalEconomicSummary();
    const indicator = result.fed_funds_rate;

    expect(indicator).not.toBeNull();
    expect(typeof indicator!.current).toBe("number");
    expect(Array.isArray(indicator!.history)).toBe(true);
    expect(["rising", "falling", "stable"]).toContain(indicator!.trend);
    expect(typeof indicator!.asOf).toBe("string");
  });

  it("history array has up to 4 entries in ascending date order", async () => {
    getMock()
      .mockResolvedValueOnce(makeIndicatorRows([5.33, 5.25, 5.0, 4.75, 4.5]))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getNationalEconomicSummary();
    const history = result.fed_funds_rate!.history;

    expect(history.length).toBeLessThanOrEqual(4);
    // Should be ascending (oldest first)
    for (let i = 1; i < history.length; i++) {
      expect(history[i].date >= history[i - 1].date).toBe(true);
    }
  });

  it("trend is 'rising' when current > oldest by more than 0.5%", async () => {
    // current = 5.33, oldest = 4.5: diff = (5.33-4.5)/4.5*100 = 18.4% > 0.5
    getMock()
      .mockResolvedValueOnce(makeIndicatorRows([5.33, 5.25, 5.0, 4.75, 4.5]))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getNationalEconomicSummary();
    expect(result.fed_funds_rate!.trend).toBe("rising");
  });

  it("trend is 'falling' when current < oldest by more than 0.5%", async () => {
    // current = 4.5, oldest = 5.33: diff < -0.5%
    getMock()
      .mockResolvedValueOnce(makeIndicatorRows([4.5, 4.75, 5.0, 5.25, 5.33]))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getNationalEconomicSummary();
    expect(result.fed_funds_rate!.trend).toBe("falling");
  });

  it("trend is 'stable' when difference is within 0.5%", async () => {
    // current = 5.33, oldest = 5.34: diff tiny
    getMock()
      .mockResolvedValueOnce(makeIndicatorRows([5.33, 5.34, 5.33, 5.34, 5.34]))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getNationalEconomicSummary();
    expect(result.fed_funds_rate!.trend).toBe("stable");
  });

  it("CPI indicator returns YoY percentage, not raw index", async () => {
    // Rows DESC: index 0 = 310.0 (latest), index 12 = 300.0 (12mo ago) → YoY = 3.33%
    const cpiRows = Array.from({ length: 17 }, (_, i) => ({
      value: 310.0 - i * (10.0 / 12),
      observation_date: `2024-${String(9 - i).padStart(2, "0")}-01`,
    }));

    getMock()
      .mockResolvedValueOnce([]) // FEDFUNDS
      .mockResolvedValueOnce([]) // UNRATE
      .mockResolvedValueOnce(cpiRows)
      .mockResolvedValueOnce([]); // UMCSENT

    const result = await getNationalEconomicSummary();
    expect(result.cpi_yoy_pct).not.toBeNull();
    // YoY percentage should be < 50, not a raw index > 100
    expect(result.cpi_yoy_pct!.current).toBeLessThan(50);
    expect(result.cpi_yoy_pct!.current).toBeGreaterThan(0);
  });

  it("returns null for indicators with empty DB results", async () => {
    getMock()
      .mockResolvedValueOnce([]) // FEDFUNDS
      .mockResolvedValueOnce([]) // UNRATE
      .mockResolvedValueOnce([]) // CPI (< 13 rows)
      .mockResolvedValueOnce([]); // UMCSENT

    const result = await getNationalEconomicSummary();
    expect(result.fed_funds_rate).toBeNull();
    expect(result.unemployment_rate).toBeNull();
    expect(result.cpi_yoy_pct).toBeNull();
    expect(result.consumer_sentiment).toBeNull();
  });

  it("returns null-safe result on DB error", async () => {
    getMock().mockRejectedValue(new Error("DB connection failed"));

    const result = await getNationalEconomicSummary();
    expect(result.fed_funds_rate).toBeNull();
    expect(result.unemployment_rate).toBeNull();
    expect(result.cpi_yoy_pct).toBeNull();
    expect(result.consumer_sentiment).toBeNull();
  });
});

// ── getDistrictUnemployment ───────────────────────────────────────────────────

describe("getDistrictUnemployment", () => {
  beforeEach(() => {
    resetMock(getMock());
  });

  it("returns Map<number, number> with district -> unemployment", async () => {
    getMock().mockResolvedValueOnce([
      { fed_district: 1, value: 3.5 },
      { fed_district: 2, value: 4.1 },
      { fed_district: 7, value: 5.2 },
    ]);

    const result = await getDistrictUnemployment();
    expect(result instanceof Map).toBe(true);
    expect(result.get(1)).toBe(3.5);
    expect(result.get(2)).toBe(4.1);
    expect(result.get(7)).toBe(5.2);
  });

  it("returns empty Map on DB error", async () => {
    getMock().mockRejectedValue(new Error("timeout"));

    const result = await getDistrictUnemployment();
    expect(result instanceof Map).toBe(true);
    expect(result.size).toBe(0);
  });

  it("handles districts with no data gracefully (empty result)", async () => {
    getMock().mockResolvedValueOnce([]);

    const result = await getDistrictUnemployment();
    expect(result instanceof Map).toBe(true);
    expect(result.size).toBe(0);
  });

  it("converts string values from DB to numbers", async () => {
    getMock().mockResolvedValueOnce([
      { fed_district: "3", value: "4.2" },
    ]);

    const result = await getDistrictUnemployment();
    expect(result.get(3)).toBe(4.2);
  });
});
