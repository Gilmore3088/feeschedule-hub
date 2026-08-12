import { describe, expect, it, vi } from "vitest";

import { reviewReadyStagedFees } from "./review";

type TxMock = ReturnType<typeof vi.fn> & { unsafe: ReturnType<typeof vi.fn> };

function createTxMock(): TxMock {
  const tx = vi.fn(async () => []) as TxMock;
  tx.unsafe = vi.fn();
  return tx;
}

function templateText(strings: unknown): string {
  return Array.isArray(strings) ? strings.join(" ") : String(strings);
}

function asReviewSql(tx: TxMock): Parameters<typeof reviewReadyStagedFees>[0] {
  return tx as unknown as Parameters<typeof reviewReadyStagedFees>[0];
}

describe("Knox ready staged review", () => {
  it("counts dry-run candidates without updating compatibility fee rows", async () => {
    const tx = createTxMock();
    tx.unsafe
      .mockResolvedValueOnce([{ count: "25860" }])
      .mockResolvedValueOnce([{ count: "1200" }])
      .mockResolvedValueOnce([{ count: "311" }])
      .mockResolvedValueOnce([{ count: "0" }]);

    const result = await reviewReadyStagedFees(asReviewSql(tx), {
      runId: 78,
      dryRun: true,
      limit: 999_999,
      minConfidence: 0.95,
    });

    expect(result).toMatchObject({
      stagedBefore: 25860,
      readyBefore: 1200,
      approved: 0,
      auditRows: 0,
      stagedAfter: 25860,
      flagged: 311,
      pending: 0,
      limit: 5000,
      minConfidence: 0.95,
      dryRun: true,
    });
    expect(tx.unsafe).toHaveBeenCalledTimes(4);
    expect(tx).not.toHaveBeenCalled();
  });

  it("approves only ready rows and writes review audit rows inside the agent transaction", async () => {
    const tx = createTxMock();
    tx.unsafe
      .mockResolvedValueOnce([{ count: "25860" }])
      .mockResolvedValueOnce([{ count: "700" }])
      .mockResolvedValueOnce([{ count: "311" }])
      .mockResolvedValueOnce([{ count: "0" }])
      .mockResolvedValueOnce([{ approved: "500", audit_rows: "500" }]);

    const result = await reviewReadyStagedFees(asReviewSql(tx), {
      runId: 78,
      dryRun: false,
      actor: "knox-agent",
    });

    expect(result).toMatchObject({
      stagedBefore: 25860,
      readyBefore: 700,
      approved: 500,
      auditRows: 500,
      stagedAfter: 25360,
      flagged: 311,
      pending: 0,
      limit: 500,
      minConfidence: 0.9,
      dryRun: false,
    });

    const taggedSql = tx.mock.calls.map((call) => templateText(call[0])).join("\n");
    expect(taggedSql).toContain("SET LOCAL app.allow_legacy_writes = 'true'");

    const updateCall = tx.unsafe.mock.calls[4];
    expect(String(updateCall[0])).toContain("UPDATE extracted_fees");
    expect(String(updateCall[0])).toContain("INSERT INTO fee_reviews");
    expect(String(updateCall[0])).toContain("agentic_ready_approve");
    expect(updateCall[1]).toEqual([
      0.9,
      500,
      "knox-agent",
      expect.stringContaining("Knox agentic ready-review run #78"),
    ]);
  });

  it("does not request compatibility write access when no staged rows are ready", async () => {
    const tx = createTxMock();
    tx.unsafe
      .mockResolvedValueOnce([{ count: "100" }])
      .mockResolvedValueOnce([{ count: "0" }])
      .mockResolvedValueOnce([{ count: "2" }])
      .mockResolvedValueOnce([{ count: "3" }]);

    const result = await reviewReadyStagedFees(asReviewSql(tx), {
      runId: 79,
      dryRun: false,
    });

    expect(result).toMatchObject({
      stagedBefore: 100,
      readyBefore: 0,
      approved: 0,
      auditRows: 0,
      stagedAfter: 100,
      flagged: 2,
      pending: 3,
    });
    expect(tx.unsafe).toHaveBeenCalledTimes(4);
    expect(tx).not.toHaveBeenCalled();
  });
});
