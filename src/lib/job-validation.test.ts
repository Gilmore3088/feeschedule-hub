import { describe, expect, it } from "vitest";
import { getAllowedCommands, validateJobRequest } from "./job-validation";

describe("admin job validation", () => {
  it("exposes the atomic pipeline and retires the legacy orchestrator", () => {
    expect(getAllowedCommands()).toContain("pipeline");
    expect(getAllowedCommands()).not.toContain("run-pipeline");
    expect(validateJobRequest("run-pipeline", { limit: 10 })).toEqual({
      valid: false,
      error: "Unknown command: run-pipeline",
    });
  });

  it("rejects unsafe commands before Modal dispatch", () => {
    expect(validateJobRequest("shell", {})).toEqual({
      valid: false,
      error: "Unknown command: shell",
    });
  });

  it("allows the audited stale-run reconciliation command without arguments", () => {
    expect(validateJobRequest("reconcile-runs", {})).toEqual({
      valid: true,
      sanitized: { command: "reconcile-runs", args: [] },
    });
  });

  it("validates Atlas pipeline scope", () => {
    expect(validateJobRequest("pipeline", { limit: 100, state: "CA" })).toEqual({
      valid: true,
      sanitized: { command: "pipeline", args: ["--limit", "100", "--state", "CA"] },
    });
  });
});
