import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = vi.fn();
vi.mock("@/lib/crawler-db/connection", () => ({
  sql: (...args: unknown[]) => sqlMock(...args),
}));

import { reviewOne } from "./review";

const base = {
  fee_verified_id: 1,
  institution_id: 10,
  canonical_fee_key: "monthly_maintenance",
  asset_size_tier: "a",
};

describe("reviewOne (Knox rules)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a zero amount with no free-fee keyword", async () => {
    const r = await reviewOne({ ...base, fee_name: "Monthly Maintenance", amount: 0 });
    expect(r.decision).toBe("reject");
    expect(sqlMock).not.toHaveBeenCalled(); // short-circuits before peer query
  });

  it("accepts a zero amount when the name signals a free fee", async () => {
    sqlMock.mockResolvedValue([{ median: null, n: 0 }]);
    const r = await reviewOne({ ...base, fee_name: "Monthly Maintenance (waived)", amount: 0 });
    expect(r.decision).toBe("accept");
  });

  it("rejects an amount above 5x the peer median when peers are sufficient", async () => {
    sqlMock.mockResolvedValue([{ median: 5, n: 12 }]);
    const r = await reviewOne({ ...base, fee_name: "Monthly Maintenance", amount: 40 });
    expect(r.decision).toBe("reject");
    expect(r.reasons[0]).toContain("exceeds");
  });

  it("accepts a normal amount within peer range", async () => {
    sqlMock.mockResolvedValue([{ median: 10, n: 30 }]);
    const r = await reviewOne({ ...base, fee_name: "Monthly Maintenance", amount: 12 });
    expect(r.decision).toBe("accept");
  });

  it("accepts when peer data is too sparse to judge", async () => {
    sqlMock.mockResolvedValue([{ median: 2, n: 3 }]); // n < MIN_PEERS
    const r = await reviewOne({ ...base, fee_name: "Monthly Maintenance", amount: 40 });
    expect(r.decision).toBe("accept");
  });
});
