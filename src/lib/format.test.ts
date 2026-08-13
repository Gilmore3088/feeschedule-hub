import { describe, expect, it } from "vitest";
import { formatAssets } from "./format";

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
