import { describe, expect, it } from "vitest";
import { GUIDES } from "./guides";
import { DISPLAY_NAMES } from "./fee-taxonomy";

describe("GUIDES", () => {
  it("should_only_reference_real_categories_and_have_sources", () => {
    for (const g of GUIDES) {
      for (const c of [g.primaryCategory, ...g.feeCategories]) {
        expect(DISPLAY_NAMES[c], `${g.slug}:${c}`).toBeTruthy();
      }
      expect(g.sources.length).toBeGreaterThan(0);
    }
  });

  it("should_have_primary_category_among_its_fee_categories", () => {
    // The page no longer depends on primaryCategory being feeCategories[0] —
    // it looks primaryCategory up explicitly — so this only requires
    // membership, not position.
    for (const g of GUIDES) {
      expect(g.feeCategories.includes(g.primaryCategory), g.slug).toBe(true);
    }
  });
});
