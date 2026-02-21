import { describe, it, expect } from "vitest";

// Test the change detection logic directly
describe("fee change percentage calculation", () => {
  function calcChangePct(oldAmount: number, newAmount: number): number {
    if (oldAmount === 0) return 100;
    return ((newAmount - oldAmount) / oldAmount) * 100;
  }

  it("calculates positive change correctly", () => {
    expect(calcChangePct(10, 15)).toBe(50);
  });

  it("calculates negative change correctly", () => {
    expect(calcChangePct(20, 15)).toBe(-25);
  });

  it("returns 0 for no change", () => {
    expect(calcChangePct(10, 10)).toBe(0);
  });

  it("handles zero old amount", () => {
    expect(calcChangePct(0, 10)).toBe(100);
  });

  it("calculates small percentage changes", () => {
    const pct = calcChangePct(35, 36.5);
    expect(pct).toBeCloseTo(4.29, 1);
  });
});

describe("threshold filtering", () => {
  it("filters out changes below threshold", () => {
    const changes = [
      { pct: 15 },
      { pct: 5 },
      { pct: -12 },
      { pct: 3 },
      { pct: -25 },
    ];
    const threshold = 10;
    const significant = changes.filter((c) => Math.abs(c.pct) >= threshold);
    expect(significant).toHaveLength(3);
  });
});
