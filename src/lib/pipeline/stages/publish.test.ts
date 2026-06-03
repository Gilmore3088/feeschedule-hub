import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the shared sql client; the publish stage runs one read-only count query.
const sqlMock = vi.fn();
vi.mock("@/lib/crawler-db/connection", () => ({
  sql: (...args: unknown[]) => sqlMock(...args),
}));

import { publishStage } from "./publish";

describe("publishStage (dry-run)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should report the eligible count as rowsIn and write nothing (rowsOut 0)", async () => {
    sqlMock.mockResolvedValue([{ eligible: 42 }]);

    const result = await publishStage.run({ runId: 1, params: {} });

    expect(result.rowsIn).toBe(42);
    expect(result.rowsOut).toBe(0);
    expect(result.notes?.mode).toBe("dry-run");
    expect(result.notes?.minConfidence).toBe(0.9);
  });

  it("should honor a custom minConfidence param", async () => {
    sqlMock.mockResolvedValue([{ eligible: 0 }]);

    const result = await publishStage.run({ runId: 1, params: { minConfidence: 0.75 } });

    expect(result.rowsIn).toBe(0);
    expect(result.notes?.minConfidence).toBe(0.75);
  });

  it("should default to 0 when the query returns no rows", async () => {
    sqlMock.mockResolvedValue([]);

    const result = await publishStage.run({ runId: 1, params: {} });

    expect(result.rowsIn).toBe(0);
  });
});
