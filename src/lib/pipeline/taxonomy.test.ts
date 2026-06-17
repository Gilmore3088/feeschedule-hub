import { describe, it, expect } from "vitest";
import {
  CANONICAL_FEE_KEYS,
  normalizeFeeName,
  isValidClassification,
  isCanonicalKey,
} from "./taxonomy";

describe("taxonomy", () => {
  it("exposes the canonical key set", () => {
    expect(CANONICAL_FEE_KEYS.length).toBeGreaterThan(40);
    expect(isCanonicalKey("monthly_maintenance")).toBe(true);
    expect(isCanonicalKey("not_a_real_key")).toBe(false);
  });

  it("normalizes fee names", () => {
    expect(normalizeFeeName("  Monthly  Maintenance!! ")).toBe("monthly maintenance");
    expect(normalizeFeeName("ATM (Non-Network)")).toBe("atm non network");
  });

  it("accepts a valid canonical classification", () => {
    expect(isValidClassification("monthly service charge", "monthly_maintenance")).toBe(true);
  });

  it("rejects a hallucinated (non-canonical) key", () => {
    expect(isValidClassification("monthly fee", "totally_made_up")).toBe(false);
    expect(isValidClassification("monthly fee", null)).toBe(false);
  });

  it("enforces the NSF/overdraft never-merge guard", () => {
    // Name says NSF but model suggested overdraft — must reject.
    expect(isValidClassification("nsf returned item fee", "overdraft")).toBe(false);
    // Name says overdraft but model suggested nsf — must reject.
    expect(isValidClassification("overdraft paid item", "nsf")).toBe(false);
    // Correct matches still pass.
    expect(isValidClassification("nsf returned item fee", "nsf")).toBe(true);
    expect(isValidClassification("overdraft paid item", "overdraft")).toBe(true);
  });
});
