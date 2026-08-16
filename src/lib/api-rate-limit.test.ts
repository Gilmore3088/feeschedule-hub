import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
}));

vi.mock("@/lib/data-store/connection", () => ({ sql: sqlMock }));

import { checkRateLimitWithTier } from "./api-rate-limit";

function templateText(strings: unknown): string {
  return Array.isArray(strings) ? strings.join(" ") : String(strings);
}

describe("API rate limiting", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  it("reserves before allowing a public v1 read", async () => {
    sqlMock.mockResolvedValueOnce([{ request_count: 1 }]);

    const result = await checkRateLimitWithTier(null, "anon-1", "free", "api.v1.index");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99);
    expect(templateText(sqlMock.mock.calls[0][0])).toContain("INSERT INTO public.api_rate_limit_events");
  });

  it("blocks when the monthly reservation is exhausted", async () => {
    sqlMock.mockResolvedValueOnce([]);

    const result = await checkRateLimitWithTier(null, "anon-1", "free", "api.v1.index");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("fails closed when the reservation table cannot be checked", async () => {
    sqlMock.mockRejectedValueOnce(new Error("relation missing"));

    const result = await checkRateLimitWithTier(null, "anon-1", "free", "api.v1.index");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
