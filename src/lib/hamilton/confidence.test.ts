/**
 * Unit tests for Hamilton confidence tier logic.
 *
 * Verifies D-05 threshold boundaries, D-06 simulation gating,
 * and exported constant values.
 *
 * Pure logic module — no DB mocking required.
 */

import { describe, it, expect } from "vitest";
import {
  computeConfidenceTier,
  canSimulate,
  CONFIDENCE_TIERS,
  CONFIDENCE_THRESHOLDS,
} from "./confidence";

describe("computeConfidenceTier", () => {
  it("returns 'insufficient' for 0 approved fees", () => {
    expect(computeConfidenceTier(0)).toBe("insufficient");
  });

  it("returns 'insufficient' for 9 approved fees (just below provisional threshold)", () => {
    expect(computeConfidenceTier(9)).toBe("insufficient");
  });

  it("returns 'provisional' for exactly 10 approved fees (boundary)", () => {
    expect(computeConfidenceTier(10)).toBe("provisional");
  });

  it("returns 'provisional' for 19 approved fees (just below strong threshold)", () => {
    expect(computeConfidenceTier(19)).toBe("provisional");
  });

  it("returns 'strong' for exactly 20 approved fees (boundary)", () => {
    expect(computeConfidenceTier(20)).toBe("strong");
  });

  it("returns 'strong' for 100 approved fees (well above)", () => {
    expect(computeConfidenceTier(100)).toBe("strong");
  });
});

describe("canSimulate", () => {
  it("allows simulation for 'strong' tier", () => {
    const result = canSimulate("strong");
    expect(result.allowed).toBe(true);
  });

  it("allows simulation for 'provisional' tier", () => {
    const result = canSimulate("provisional");
    expect(result.allowed).toBe(true);
  });

  it("blocks simulation for 'insufficient' tier", () => {
    const result = canSimulate("insufficient");
    expect(result.allowed).toBe(false);
  });

  it("includes the minimum threshold number (10) in the block reason", () => {
    const result = canSimulate("insufficient");
    if (!result.allowed) {
      expect(result.reason).toContain("10");
    } else {
      throw new Error("Expected simulation to be blocked");
    }
  });
});

describe("constants", () => {
  it("CONFIDENCE_TIERS has exactly 3 entries", () => {
    expect(CONFIDENCE_TIERS).toHaveLength(3);
  });

  it("CONFIDENCE_TIERS contains 'strong', 'provisional', and 'insufficient'", () => {
    expect(CONFIDENCE_TIERS).toContain("strong");
    expect(CONFIDENCE_TIERS).toContain("provisional");
    expect(CONFIDENCE_TIERS).toContain("insufficient");
  });

  it("CONFIDENCE_THRESHOLDS.strong is 20", () => {
    expect(CONFIDENCE_THRESHOLDS.strong).toBe(20);
  });

  it("CONFIDENCE_THRESHOLDS.provisional is 10", () => {
    expect(CONFIDENCE_THRESHOLDS.provisional).toBe(10);
  });
});
