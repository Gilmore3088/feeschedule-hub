import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getRecentRuns: vi.fn(),
  getRunSteps: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: h.getCurrentUser }));
vi.mock("@/lib/pipeline/db", () => ({ getRecentRuns: h.getRecentRuns, getRunSteps: h.getRunSteps }));

import { GET } from "./route";

describe("GET /api/admin/pipeline/state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401s when there is no authenticated user", async () => {
    h.getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(h.getRecentRuns).not.toHaveBeenCalled();
  });

  it("returns runs and the latest run's steps for an authed user", async () => {
    h.getCurrentUser.mockResolvedValue({ username: "admin", role: "admin" });
    h.getRecentRuns.mockResolvedValue([{ id: 5 }, { id: 4 }]);
    h.getRunSteps.mockResolvedValue([{ id: 1, stage: "publish", status: "succeeded" }]);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.runs).toHaveLength(2);
    expect(body.latestSteps).toHaveLength(1);
    expect(h.getRunSteps).toHaveBeenCalledWith(5);
  });
});
