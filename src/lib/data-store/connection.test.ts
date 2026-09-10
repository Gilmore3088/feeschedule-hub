import { describe, it, expect } from "vitest";
import { resolvePoolMax } from "./connection";

describe("resolvePoolMax", () => {
  it("defaults to 3 (serverless-safe) when unset", () => {
    expect(resolvePoolMax(undefined)).toBe(3);
  });

  it("uses a valid configured pool size", () => {
    expect(resolvePoolMax("8")).toBe(8);
  });

  it("falls back to 3 for a non-numeric value", () => {
    expect(resolvePoolMax("x")).toBe(3);
  });

  it("falls back to 3 for zero or negative values", () => {
    expect(resolvePoolMax("0")).toBe(3);
    expect(resolvePoolMax("-2")).toBe(3);
  });

  it("falls back to 3 for a non-integer value", () => {
    expect(resolvePoolMax("2.5")).toBe(3);
  });
});
