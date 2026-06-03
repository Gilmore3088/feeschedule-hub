import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ query: vi.fn(), begin: vi.fn(async () => {}) }));
vi.mock("@/lib/crawler-db/connection", () => ({
  sql: Object.assign((...args: unknown[]) => h.query(...args), {
    begin: h.begin,
    json: (x: unknown) => x,
  }),
}));

import { publishStage } from "./publish";

describe("publishStage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dry-run reports the eligible count and writes nothing", async () => {
    h.query.mockResolvedValueOnce([{ eligible: 42 }]);
    const r = await publishStage.run({ runId: 1, params: {} });
    expect(r.rowsIn).toBe(42);
    expect(r.rowsOut).toBe(0);
    expect(r.notes?.mode).toBe("dry-run");
    expect(h.begin).not.toHaveBeenCalled();
  });

  it("honors a custom minConfidence in dry-run", async () => {
    h.query.mockResolvedValueOnce([{ eligible: 0 }]);
    const r = await publishStage.run({ runId: 1, params: { minConfidence: 0.75 } });
    expect(r.rowsIn).toBe(0);
    expect(r.notes?.minConfidence).toBe(0.75);
  });

  it("apply publishes each eligible row through the handshake", async () => {
    h.query.mockResolvedValueOnce([{ fee_verified_id: 11 }, { fee_verified_id: 12 }]);
    const r = await publishStage.run({ runId: 1, params: { apply: true } });
    expect(r.rowsIn).toBe(2);
    expect(r.rowsOut).toBe(2);
    expect(h.begin).toHaveBeenCalledTimes(2);
    expect(r.notes?.mode).toBe("apply");
  });
});
