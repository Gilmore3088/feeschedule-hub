import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(async () => ({ username: "tester" })),
  getRunSteps: vi.fn(),
  createRun: vi.fn(),
  seedSteps: vi.fn(),
  executeRun: vi.fn(),
  getStage: vi.fn(),
  stageNames: vi.fn(() => ["discover", "extract", "classify", "review", "publish"]),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuth: h.requireAuth }));
vi.mock("@/lib/job-runner", () => ({ spawnJob: vi.fn() }));
vi.mock("@/lib/crawler-db/connection", () => ({ sql: vi.fn() }));
vi.mock("@/lib/pipeline/db", () => ({
  createRun: h.createRun,
  seedSteps: h.seedSteps,
  getRunSteps: h.getRunSteps,
}));
vi.mock("@/lib/pipeline/runner", () => ({ executeRun: h.executeRun }));
vi.mock("@/lib/pipeline/stages", () => ({ getStage: h.getStage, stageNames: h.stageNames }));

import { rerunFailedSteps } from "./actions";

describe("rerunFailedSteps", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new run with only the failed stages", async () => {
    h.getRunSteps.mockResolvedValue([
      { stage: "classify", status: "failed" },
      { stage: "extract", status: "failed" },
      { stage: "publish", status: "succeeded" },
    ]);
    h.getStage.mockImplementation((s: string) => ({ name: s }));
    h.createRun.mockResolvedValue(42);
    h.executeRun.mockResolvedValue({ status: "succeeded" });

    const res = await rerunFailedSteps(7);

    expect(res.ok).toBe(true);
    expect(res.runId).toBe(42);
    expect(h.createRun).toHaveBeenCalledWith("manual", "tester", ["classify", "extract"], { rerunOf: 7 });
    expect(h.executeRun).toHaveBeenCalledWith(42, ["classify", "extract"], {});
  });

  it("returns an error when there are no failed steps", async () => {
    h.getRunSteps.mockResolvedValue([{ stage: "publish", status: "succeeded" }]);
    h.getStage.mockReturnValue({ name: "publish" });
    const res = await rerunFailedSteps(7);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no failed steps/i);
    expect(h.createRun).not.toHaveBeenCalled();
  });
});
