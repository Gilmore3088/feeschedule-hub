import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  query: vi.fn(),
  // begin must actually run the callback so writeRawFees' insert loop executes.
  begin: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = Object.assign(() => Promise.resolve([]), { json: (x: unknown) => x });
    return cb(tx);
  }),
}));
vi.mock("@/lib/crawler-db/connection", () => ({
  sql: Object.assign((...args: unknown[]) => h.query(...args), {
    begin: h.begin,
    json: (x: unknown) => x,
  }),
}));

const fetchPageTextMock = vi.hoisted(() => vi.fn());
vi.mock("../sandbox", () => ({ fetchPageText: fetchPageTextMock }));

const extractFeesMock = vi.hoisted(() => vi.fn());
vi.mock("../extract-llm", () => ({ extractFeesFromText: extractFeesMock }));

import { extractStage } from "./extract";

describe("extractStage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dry-run counts targets needing extraction, no sandbox, no writes", async () => {
    h.query.mockResolvedValueOnce([{ n: 954 }]);
    const r = await extractStage.run({ runId: 1, params: {} });
    expect(r.rowsIn).toBe(954);
    expect(r.rowsOut).toBe(0);
    expect(fetchPageTextMock).not.toHaveBeenCalled();
    expect(h.begin).not.toHaveBeenCalled();
  });

  it("apply extracts and writes fees_raw per target", async () => {
    h.query.mockResolvedValueOnce([
      { id: 1, institution_name: "A", fee_schedule_url: "https://a.com/fees" },
    ]);
    fetchPageTextMock.mockResolvedValue({ title: "A Fees", text: "Monthly $10" });
    extractFeesMock.mockResolvedValue({
      fees: [
        { fee_name: "Monthly", amount: 10, frequency: "monthly" },
        { fee_name: "NSF", amount: 35, frequency: "per item" },
      ],
      costCents: 2,
    });
    const r = await extractStage.run({ runId: 1, params: { apply: true } });
    expect(r.rowsIn).toBe(1);
    expect(r.rowsOut).toBe(2); // two fees written
    expect(h.begin).toHaveBeenCalledTimes(1);
    expect(r.notes?.mode).toBe("apply");
  });

  it("apply counts a target as failed when extraction throws", async () => {
    h.query.mockResolvedValueOnce([
      { id: 1, institution_name: "A", fee_schedule_url: "https://a.com/fees" },
    ]);
    fetchPageTextMock.mockRejectedValue(new Error("sandbox unavailable"));
    const r = await extractStage.run({ runId: 1, params: { apply: true } });
    expect(r.rowsOut).toBe(0);
    expect(r.notes?.failed).toBe(1);
  });
});
