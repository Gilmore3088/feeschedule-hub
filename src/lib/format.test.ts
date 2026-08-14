import { describe, expect, it } from "vitest";
import { formatAssets, formatCompactDollars, formatStoredPercent } from "./format";

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
