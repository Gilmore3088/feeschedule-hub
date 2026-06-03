import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/crawler-db/connection", () => ({
  sql: Object.assign((...args: unknown[]) => h.query(...args), { json: (x: unknown) => x }),
}));

import { discoverStage, normalizeBase, probeFeeUrl } from "./discover";

describe("normalizeBase", () => {
  it("adds a scheme and strips trailing slashes", () => {
    expect(normalizeBase("example.com/")).toBe("https://example.com");
    expect(normalizeBase("http://bank.com//")).toBe("http://bank.com");
    expect(normalizeBase(" https://cu.org ")).toBe("https://cu.org");
  });
});

describe("probeFeeUrl", () => {
  it("returns the first path that responds OK", async () => {
    const fakeFetch = vi.fn(async (url: string | URL) => ({
      ok: String(url).endsWith("/fee-schedule"),
    })) as unknown as typeof fetch;
    const found = await probeFeeUrl("acmebank.com", fakeFetch);
    expect(found).toBe("https://acmebank.com/fee-schedule");
  });

  it("returns null when no candidate path responds", async () => {
    const fakeFetch = vi.fn(async () => ({ ok: false })) as unknown as typeof fetch;
    const found = await probeFeeUrl("nowhere.com", fakeFetch);
    expect(found).toBeNull();
  });

  it("survives fetch errors and keeps probing", async () => {
    const fakeFetch = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/fees")) throw new Error("ECONNREFUSED");
      return { ok: String(url).endsWith("/fees-and-charges") };
    }) as unknown as typeof fetch;
    const found = await probeFeeUrl("bank.com", fakeFetch);
    expect(found).toBe("https://bank.com/fees-and-charges");
  });
});

describe("discoverStage dry-run", () => {
  beforeEach(() => vi.clearAllMocks());
  it("counts targets missing a fee URL without writing", async () => {
    h.query.mockResolvedValueOnce([{ n: 3444 }]);
    const r = await discoverStage.run({ runId: 1, params: {} });
    expect(r.rowsIn).toBe(3444);
    expect(r.rowsOut).toBe(0);
    expect(h.query).toHaveBeenCalledTimes(1); // only the count query, no updates
  });
});
