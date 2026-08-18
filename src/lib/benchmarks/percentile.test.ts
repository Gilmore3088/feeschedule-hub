import { describe, it, expect } from "vitest";
import { computePercentile } from "./percentile";

describe("computePercentile", () => {
  it("returns 0 for empty array", () => {
    expect(computePercentile([], 50)).toBe(0);
  });

  it("returns the single value for length-1 array", () => {
    expect(computePercentile([10], 50)).toBe(10);
  });

  it("computes median of even-length array", () => {
    expect(computePercentile([1, 2, 3, 4], 50)).toBe(2.5);
  });

  it("computes P25 and P75", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const p25 = computePercentile(sorted, 25);
    const p75 = computePercentile(sorted, 75);
    expect(p25).toBeCloseTo(3.25, 2);
    expect(p75).toBeCloseTo(7.75, 2);
  });
});
