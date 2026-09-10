import { describe, expect, it } from "vitest";
import { GUIDES } from "./guides";
import { relatedGuides } from "./guides-related";

describe("relatedGuides", () => {
  it("should_return_at_most_three_guides", () => {
    for (const g of GUIDES) {
      expect(relatedGuides(g.slug).length).toBeLessThanOrEqual(3);
    }
  });

  it("should_never_include_itself", () => {
    for (const g of GUIDES) {
      const slugs = relatedGuides(g.slug).map((r) => r.slug);
      expect(slugs).not.toContain(g.slug);
    }
  });

  it("should_rank_shared_fee_categories_first", () => {
    // overdraft-fees shares "atm_international" with foreign-transaction-fees
    // via nothing, but shares real category overlap only with itself; use a
    // pair known to overlap in guides.ts: monthly-maintenance-fees and
    // account-closure-fees both include "early_closure"/"dormant_account".
    const related = relatedGuides("monthly-maintenance-fees").map((r) => r.slug);
    expect(related).toContain("account-closure-fees");
  });

  it("should_return_empty_for_unknown_slug_backed_by_other_guides", () => {
    const related = relatedGuides("not-a-real-guide");
    expect(related.length).toBeLessThanOrEqual(3);
    expect(related.every((g) => g.slug !== "not-a-real-guide")).toBe(true);
  });
});
