import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ query: vi.fn(), begin: vi.fn(async () => {}) }));
vi.mock("@/lib/crawler-db/connection", () => ({
  sql: Object.assign((...args: unknown[]) => h.query(...args), {
    begin: h.begin,
    json: (x: unknown) => x,
  }),
}));

const classifyFeeNamesMock = vi.hoisted(() => vi.fn());
vi.mock("../llm", () => ({ classifyFeeNames: classifyFeeNamesMock }));

import { classifyStage } from "./classify";

describe("classifyStage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dry-run counts the full backlog without calling the LLM or writing", async () => {
    h.query.mockResolvedValueOnce([{ n: 102330 }]);
    const r = await classifyStage.run({ runId: 1, params: {} });
    expect(r.rowsIn).toBe(102330);
    expect(r.rowsOut).toBe(0);
    expect(classifyFeeNamesMock).not.toHaveBeenCalled();
    expect(h.begin).not.toHaveBeenCalled();
  });

  it("apply promotes valid high-confidence rows and skips the rest", async () => {
    h.query.mockResolvedValueOnce([
      { fee_raw_id: 1, fee_name: "Monthly Fee", amount: 5 },
      { fee_raw_id: 2, fee_name: "Overdraft Item", amount: 35 },
      { fee_raw_id: 3, fee_name: "Mystery", amount: 1 },
    ]);
    classifyFeeNamesMock.mockResolvedValue({
      results: [
        { fee_name: "monthly fee", canonical_fee_key: "monthly_maintenance", confidence: 0.95 },
        { fee_name: "overdraft item", canonical_fee_key: "overdraft", confidence: 0.95 },
        { fee_name: "mystery", canonical_fee_key: null, confidence: 0 },
      ],
      costCents: 1,
    });
    const r = await classifyStage.run({ runId: 1, params: { apply: true } });
    expect(r.rowsIn).toBe(3);
    expect(r.rowsOut).toBe(2);
    expect(h.begin).toHaveBeenCalledTimes(2);
  });

  it("skips low-confidence classifications", async () => {
    h.query.mockResolvedValueOnce([{ fee_raw_id: 1, fee_name: "Monthly Fee", amount: 5 }]);
    classifyFeeNamesMock.mockResolvedValue({
      results: [{ fee_name: "monthly fee", canonical_fee_key: "monthly_maintenance", confidence: 0.4 }],
      costCents: 1,
    });
    const r = await classifyStage.run({ runId: 1, params: { apply: true } });
    expect(r.rowsOut).toBe(0);
    expect(h.begin).not.toHaveBeenCalled();
  });
});
