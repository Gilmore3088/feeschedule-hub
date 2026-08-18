import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatAssets,
  formatCompactDollars,
  formatStoredPercent,
  formatNumber,
  formatMoney,
  formatDate,
} from "./format";

describe("formatAmount", () => {
  it("renders Postgres numeric strings as dollar amounts", () => {
    expect(formatAmount("35.00")).toBe("$35.00");
    expect(formatAmount("0.35")).toBe("$0.35");
    expect(formatAmount(5000)).toBe("$5,000.00");
  });

  it("renders invalid or missing amounts as unavailable", () => {
    expect(formatAmount(null)).toBe("-");
    expect(formatAmount(undefined)).toBe("-");
    expect(formatAmount("not-a-number")).toBe("-");
  });
});

describe("formatAssets", () => {
  it("renders trillion-scale FDIC asset values without collapsing to billions", () => {
    expect(formatAssets(3_813_431_000)).toBe("$3.8T");
  });

  it("keeps billion and million asset tiers readable", () => {
    expect(formatAssets(679_293_260)).toBe("$679.3B");
    expect(formatAssets(9_610_864)).toBe("$9.6B");
    expect(formatAssets(69_891)).toBe("$70M");
  });
});

describe("formatCompactDollars", () => {
  it("renders whole-dollar financial values without FDIC-thousands scaling", () => {
    expect(formatCompactDollars(208_795)).toBe("$209K");
    expect(formatCompactDollars(12_450_000)).toBe("$12.4M");
    expect(formatCompactDollars(3_813_431_000)).toBe("$3.8B");
  });
});

describe("formatStoredPercent", () => {
  it("formats stored percentage values without multiplying by 100", () => {
    expect(formatStoredPercent(13.456, 1)).toBe("13.5%");
    expect(formatStoredPercent(0.048, 2)).toBe("0.05%");
  });
});

describe("formatNumber", () => {
  it("formats with en-US thousands separators", () => {
    expect(formatNumber(1234.5)).toBe("1,234.5");
    expect(formatNumber(1000000)).toBe("1,000,000");
  });
});

describe("formatMoney", () => {
  it("formats with en-US currency style, two decimals", () => {
    expect(formatMoney(5)).toBe("$5.00");
    expect(formatMoney(1234.5)).toBe("$1,234.50");
  });
});

describe("formatDate", () => {
  it("formats a date-only ISO string as an absolute en-US date", () => {
    expect(formatDate("2026-08-12")).toBe("Aug 12, 2026");
  });

  it("formats a Date instance the same way", () => {
    expect(formatDate(new Date("2026-01-05T12:00:00Z"))).toBe("Jan 5, 2026");
  });
});
