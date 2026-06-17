import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the control-plane DB layer and the stage registry so the runner's state
// machine can be tested in isolation — no database required.
vi.mock("./db", () => ({
  markRunRunning: vi.fn(async () => {}),
  markRunFinished: vi.fn(async () => {}),
  markStepRunning: vi.fn(async () => {}),
  markStepResult: vi.fn(async () => {}),
  incrementStagesDone: vi.fn(async () => {}),
}));
vi.mock("./stages", () => ({
  getStage: vi.fn(),
}));

import { executeRun } from "./runner";
import * as db from "./db";
import { getStage } from "./stages";

const getStageMock = getStage as unknown as ReturnType<typeof vi.fn>;

describe("executeRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should run a stage to success and record counts", async () => {
    getStageMock.mockReturnValue({
      name: "publish",
      description: "test",
      run: vi.fn(async () => ({ rowsIn: 7, rowsOut: 0, notes: { mode: "dry-run" } })),
    });

    const result = await executeRun(1, ["publish"], {});

    expect(result.status).toBe("succeeded");
    expect(db.markRunRunning).toHaveBeenCalledWith(1);
    expect(db.markStepRunning).toHaveBeenCalledWith(1, "publish");
    expect(db.markStepResult).toHaveBeenCalledWith(1, "publish", "succeeded", {
      rowsIn: 7,
      rowsOut: 0,
      costCents: undefined,
      notes: { mode: "dry-run" },
    });
    expect(db.incrementStagesDone).toHaveBeenCalledWith(1);
    expect(db.markRunFinished).toHaveBeenCalledWith(1, "succeeded");
  });

  it("should mark the run failed when a stage throws", async () => {
    getStageMock.mockReturnValue({
      name: "publish",
      description: "test",
      run: vi.fn(async () => {
        throw new Error("boom");
      }),
    });

    const result = await executeRun(2, ["publish"], {});

    expect(result.status).toBe("failed");
    expect(result.error).toBe("boom");
    expect(db.markStepResult).toHaveBeenCalledWith(2, "publish", "failed", { error: "boom" });
    expect(db.markRunFinished).toHaveBeenCalledWith(2, "failed", "stage 'publish' failed: boom");
    expect(db.incrementStagesDone).not.toHaveBeenCalled();
  });

  it("should fail fast on an unknown stage", async () => {
    getStageMock.mockReturnValue(undefined);

    const result = await executeRun(3, ["does-not-exist"], {});

    expect(result.status).toBe("failed");
    expect(db.markStepResult).toHaveBeenCalledWith(3, "does-not-exist", "failed", {
      error: "Unknown stage: does-not-exist",
    });
    expect(db.markRunFinished).toHaveBeenCalledWith(3, "failed", "Unknown stage: does-not-exist");
  });

  it("should stop the sequence after the first failure", async () => {
    const secondRun = vi.fn(async () => ({ rowsIn: 1, rowsOut: 1 }));
    getStageMock.mockImplementation((name: string) => {
      if (name === "a") {
        return { name: "a", description: "", run: vi.fn(async () => { throw new Error("x"); }) };
      }
      return { name: "b", description: "", run: secondRun };
    });

    const result = await executeRun(4, ["a", "b"], {});

    expect(result.status).toBe("failed");
    expect(secondRun).not.toHaveBeenCalled();
  });
});
