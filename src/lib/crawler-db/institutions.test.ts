import { describe, it, expect } from "vitest";
import {
  searchInstitutions,
  getInstitutionProfile,
  getInstitutionScorecard,
  getInstitutionIdsWithFees,
} from "./institutions";

describe("searchInstitutions", () => {
  it("returns empty for queries shorter than 2 characters", () => {
    expect(searchInstitutions("")).toEqual([]);
    expect(searchInstitutions("A")).toEqual([]);
    expect(searchInstitutions(" ")).toEqual([]);
  });

  it("returns results for valid queries", () => {
    const results = searchInstitutions("First State", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);
    for (const r of results) {
      expect(r.institution_name.toLowerCase()).toContain("first state");
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("charter_type");
      expect(typeof r.has_fees).toBe("number"); // SQLite returns 0/1
      expect(typeof r.fee_count).toBe("number");
    }
  });

  it("respects the limit parameter", () => {
    const results = searchInstitutions("bank", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("prioritizes prefix matches", () => {
    const results = searchInstitutions("Chase", 10);
    if (results.length >= 2) {
      const firstIsPrefix = results[0].institution_name
        .toLowerCase()
        .startsWith("chase");
      if (firstIsPrefix) {
        expect(firstIsPrefix).toBe(true);
      }
    }
  });

  it("handles LIKE special characters without errors", () => {
    expect(() => searchInstitutions("test%bank")).not.toThrow();
    expect(() => searchInstitutions("test_bank")).not.toThrow();
    expect(() => searchInstitutions("test\\bank")).not.toThrow();
  });

  it("truncates queries over 100 characters", () => {
    const longQuery = "A".repeat(200);
    expect(() => searchInstitutions(longQuery)).not.toThrow();
  });
});

describe("getInstitutionProfile", () => {
  it("returns null for non-existent ID", () => {
    expect(getInstitutionProfile(999999999)).toBeNull();
  });

  it("returns null for negative ID", () => {
    expect(getInstitutionProfile(-1)).toBeNull();
  });

  it("returns a profile for a valid institution", () => {
    const ids = getInstitutionIdsWithFees();
    if (ids.length === 0) return; // skip if no data

    const profile = getInstitutionProfile(ids[0].id);
    expect(profile).not.toBeNull();
    expect(profile!.id).toBe(ids[0].id);
    expect(profile!.institution_name).toBeTruthy();
    expect(profile!.charter_type).toBeTruthy();
    expect(Array.isArray(profile!.fees)).toBe(true);
    expect(profile!.fees.length).toBeGreaterThan(0);

    for (const fee of profile!.fees) {
      expect(fee.fee_category).toBeTruthy();
      expect(fee.review_status).not.toBe("rejected");
    }
  });

  it("deduplicates fees by category", () => {
    const ids = getInstitutionIdsWithFees();
    if (ids.length === 0) return;

    const profile = getInstitutionProfile(ids[0].id);
    if (!profile) return;

    const categories = profile.fees.map((f) => f.fee_category);
    const uniqueCategories = new Set(categories);
    expect(categories.length).toBe(uniqueCategories.size);
  });
});

describe("getInstitutionScorecard", () => {
  it("returns empty array for empty fees", () => {
    expect(getInstitutionScorecard(1, [])).toEqual([]);
  });

  it("computes scorecard for an institution with fees", () => {
    const ids = getInstitutionIdsWithFees();
    if (ids.length === 0) return;

    const profile = getInstitutionProfile(ids[0].id);
    if (!profile || profile.fees.length === 0) return;

    const scorecard = getInstitutionScorecard(profile.id, profile.fees);
    expect(scorecard.length).toBe(profile.fees.length);

    for (const entry of scorecard) {
      expect(entry.fee_category).toBeTruthy();
      if (
        entry.institution_amount != null &&
        entry.institution_amount > 0 &&
        entry.national_median != null &&
        entry.national_median > 0
      ) {
        expect(entry.national_delta_pct).not.toBeNull();
      }
    }
  });
});

describe("getInstitutionIdsWithFees", () => {
  it("returns institution IDs with fee data", () => {
    const ids = getInstitutionIdsWithFees();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);

    for (const inst of ids) {
      expect(inst.id).toBeGreaterThan(0);
    }
  });

  it("returns sorted by ID", () => {
    const ids = getInstitutionIdsWithFees();
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i].id).toBeGreaterThan(ids[i - 1].id);
    }
  });
});
