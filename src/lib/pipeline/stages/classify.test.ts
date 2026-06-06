import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ query: vi.fn(), begin: vi.fn(async () => {}) }));
vi.mock("@/lib/crawler-db/connection", () => ({
  sql: Object.assign((...args: unknown[]) => h.query(...args), {
    begin: h.begin,
    json: (x: unknown) => x,
  }),
}));

const classifyFeeNamesMock = vi.hoisted(() => vi.fn());
vi.mock("../llm", () => ({
  classifyFeeNames: classifyFeeNamesMock,
  CLASSIFY_MODEL: "haiku-test",
  ESCALATION_MODEL: "sonnet-test",
}));

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

  it("pass 1 promotes valid high-confidence rows; escalation finds nothing new", async () => {
    h.query.mockResolvedValueOnce([
      { fee_raw_id: 1, fee_name: "Monthly Fee", amount: 5 },
      { fee_raw_id: 2, fee_name: "Overdraft Item", amount: 35 },
      { fee_raw_id: 3, fee_name: "Mystery", amount: 1 },
    ]);
    // Same result for both passes; "mystery" stays null after escalation too.
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
    expect(r.notes?.basePromoted).toBe(2);
    expect(r.notes?.escalatedPromoted).toBe(0);
  });

  it("escalates an unsure row to the stronger model and recovers it", async () => {
    h.query.mockResolvedValueOnce([{ fee_raw_id: 1, fee_name: "Foreign Currency Exchange", amount: 10 }]);
    // pass 1 (haiku): below threshold -> unresolved
    classifyFeeNamesMock.mockResolvedValueOnce({
      results: [{ fee_name: "foreign currency exchange", canonical_fee_key: "card_foreign_txn", confidence: 0.75 }],
      costCents: 1,
    });
    // pass 2 (sonnet): confident -> promoted
    classifyFeeNamesMock.mockResolvedValueOnce({
      results: [{ fee_name: "foreign currency exchange", canonical_fee_key: "card_foreign_txn", confidence: 0.95 }],
      costCents: 3,
    });
    const r = await classifyStage.run({ runId: 1, params: { apply: true } });
    expect(r.rowsOut).toBe(1);
    expect(r.notes?.basePromoted).toBe(0);
    expect(r.notes?.escalatedPromoted).toBe(1);
    expect(classifyFeeNamesMock).toHaveBeenCalledTimes(2);
  });

  it("does not escalate when escalate=false", async () => {
    h.query.mockResolvedValueOnce([{ fee_raw_id: 1, fee_name: "Monthly Fee", amount: 5 }]);
    classifyFeeNamesMock.mockResolvedValue({
      results: [{ fee_name: "monthly fee", canonical_fee_key: "monthly_maintenance", confidence: 0.4 }],
      costCents: 1,
    });
    const r = await classifyStage.run({ runId: 1, params: { apply: true, escalate: false } });
    expect(r.rowsOut).toBe(0);
    expect(classifyFeeNamesMock).toHaveBeenCalledTimes(1);
  });
});
