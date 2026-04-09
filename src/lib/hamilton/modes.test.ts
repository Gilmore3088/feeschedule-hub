/**
 * Tests for Hamilton MODE_BEHAVIOR config (Phase 38).
 * Runtime assertions + type-level literal narrowing checks.
 */

import { describe, it, expect } from "vitest";
import { MODE_BEHAVIOR } from "./modes";
import type { HamiltonMode } from "./modes";

describe("MODE_BEHAVIOR completeness", () => {
  it("has exactly 5 keys matching HamiltonMode union", () => {
    const keys = Object.keys(MODE_BEHAVIOR);
    expect(keys).toHaveLength(5);
    expect(keys).toContain("home");
    expect(keys).toContain("analyze");
    expect(keys).toContain("simulate");
    expect(keys).toContain("report");
    expect(keys).toContain("monitor");
  });

  it("all mode keys are valid HamiltonMode values", () => {
    const validModes: HamiltonMode[] = ["home", "analyze", "simulate", "report", "monitor"];
    for (const key of Object.keys(MODE_BEHAVIOR)) {
      expect(validModes).toContain(key as HamiltonMode);
    }
  });
});

describe("MODE_BEHAVIOR analyze mode", () => {
  it("canRecommend is exactly false (not just falsy)", () => {
    expect(MODE_BEHAVIOR.analyze.canRecommend).toBe(false);
  });

  it("canExport is false", () => {
    expect(MODE_BEHAVIOR.analyze.canExport).toBe(false);
  });

  it("canSimulate is true", () => {
    expect(MODE_BEHAVIOR.analyze.canSimulate).toBe(true);
  });
});

describe("MODE_BEHAVIOR simulate mode", () => {
  it("canRecommend is exactly true (simulate is the only recommending screen)", () => {
    expect(MODE_BEHAVIOR.simulate.canRecommend).toBe(true);
  });

  it("canExport is true", () => {
    expect(MODE_BEHAVIOR.simulate.canExport).toBe(true);
  });

  it("canSimulate is true", () => {
    expect(MODE_BEHAVIOR.simulate.canSimulate).toBe(true);
  });
});

describe("MODE_BEHAVIOR report mode", () => {
  it("canRecommend is true (report repeats recommendation)", () => {
    expect(MODE_BEHAVIOR.report.canRecommend).toBe(true);
  });

  it("canExport is true", () => {
    expect(MODE_BEHAVIOR.report.canExport).toBe(true);
  });

  it("canSimulate is false (report is read-only presentation)", () => {
    expect(MODE_BEHAVIOR.report.canSimulate).toBe(false);
  });
});

describe("MODE_BEHAVIOR home and monitor", () => {
  it("home.canRecommend is false", () => {
    expect(MODE_BEHAVIOR.home.canRecommend).toBe(false);
  });

  it("monitor.canRecommend is false", () => {
    expect(MODE_BEHAVIOR.monitor.canRecommend).toBe(false);
  });
});
