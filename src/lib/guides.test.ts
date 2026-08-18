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
});
