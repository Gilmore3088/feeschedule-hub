import { describe, it, expect } from "vitest";
import { computePercentiles } from "./percentile";

describe("computePercentiles", () => {
  it("returns zeros for empty array", () => {
    expect(computePercentiles([])).toEqual({ p25: 0, p50: 0, p75: 0 });
  });

  it("returns the single value for all percentiles when n=1", () => {
    expect(computePercentiles([42])).toEqual({ p25: 42, p50: 42, p75: 42 });
  });

  it("computes percentiles for an odd count via nearest-rank", () => {
    // sorted: [1,2,3,4,5] -> floor(5*0.25)=1, floor(5*0.5)=2, floor(5*0.75)=3
    expect(computePercentiles([5, 1, 3, 2, 4])).toEqual({ p25: 2, p50: 3, p75: 4 });
  });

  it("computes percentiles for an even count via nearest-rank", () => {
    // sorted: [10,20,30,40] -> floor(4*0.25)=1, floor(4*0.5)=2, floor(4*0.75)=3
    expect(computePercentiles([40, 10, 30, 20])).toEqual({ p25: 20, p50: 30, p75: 40 });
  });

  it("does not mutate the input array", () => {
    const input = [3, 1, 2];
    computePercentiles(input);
    expect(input).toEqual([3, 1, 2]);
  });
});
