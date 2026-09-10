import { describe, it, expect } from "vitest";
import { resolvePoolMax, resolveStatementTimeout } from "./connection";

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

describe("resolveStatementTimeout", () => {
  it("defaults to 30000ms (batch-pipeline-safe) when unset", () => {
    expect(resolveStatementTimeout(undefined)).toBe(30000);
  });

  it("uses a valid configured timeout", () => {
    expect(resolveStatementTimeout("8000")).toBe(8000);
  });

  it("falls back to 30000 for a non-numeric value", () => {
    expect(resolveStatementTimeout("x")).toBe(30000);
  });

  it("falls back to 30000 for zero or negative values", () => {
    expect(resolveStatementTimeout("0")).toBe(30000);
    expect(resolveStatementTimeout("-2")).toBe(30000);
  });

  it("falls back to 30000 for a non-integer value", () => {
    expect(resolveStatementTimeout("2.5")).toBe(30000);
  });
});
