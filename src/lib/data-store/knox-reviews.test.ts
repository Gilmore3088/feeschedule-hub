import { describe, it, expect } from "vitest";
import { categorizeReason, KNOX_REASON_CATEGORIES } from "./knox-reviews";

describe("categorizeReason", () => {
  it("returns 'other' when reason is null or empty", () => {
    expect(categorizeReason(null)).toBe("other");
    expect(categorizeReason("")).toBe("other");
  });

  it("classifies outlier-style reasons", () => {
    expect(categorizeReason("amount is an extreme outlier")).toBe("outlier");
    expect(categorizeReason("Implausible value for category")).toBe("outlier");
  });

  it("classifies duplicates", () => {
    expect(categorizeReason("duplicate of fee_verified_id=42")).toBe("duplicate");
    expect(categorizeReason("already extracted from this document")).toBe(
      "duplicate"
    );
  });

  it("classifies low confidence", () => {
    expect(categorizeReason("low confidence from extractor")).toBe(
      "low_confidence"
    );
    expect(categorizeReason("Uncertain amount parse")).toBe("low_confidence");
  });

  it("classifies schema mismatch", () => {
    expect(categorizeReason("schema: missing amount field")).toBe(
      "schema_mismatch"
    );
    expect(categorizeReason("malformed frequency")).toBe("schema_mismatch");
  });

  it("classifies canonical key miss", () => {
    expect(categorizeReason("canonical_fee_key not in taxonomy")).toBe(
      "canonical_miss"
    );
    expect(categorizeReason("fee_key invalid")).toBe("canonical_miss");
  });

  it("classifies policy violations", () => {
    expect(categorizeReason("policy: extraction disallowed")).toBe(
      "policy_violation"
    );
    expect(categorizeReason("governance contract violation")).toBe(
      "policy_violation"
    );
  });

  it("falls back to 'other' for unmatched reasons", () => {
    expect(categorizeReason("just a weird note")).toBe("other");
  });

  it("returns a value from KNOX_REASON_CATEGORIES for every case", () => {
    const cases = [
      null,
      "",
      "outlier",
      "duplicate",
      "low confidence",
      "schema",
      "canonical",
      "policy",
      "random nonsense",
    ];
    for (const c of cases) {
      const cat = categorizeReason(c);
      expect(KNOX_REASON_CATEGORIES).toContain(cat);
    }
  });
});
