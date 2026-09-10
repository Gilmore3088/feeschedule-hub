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

  it("should_backfill_with_the_first_three_catalog_guides_when_slug_is_unknown", () => {
    // No `current` guide to rank overlap against for an unknown slug, so
    // relatedGuides falls back to `others.slice(0, 3)` — the first three
    // guides in catalog order (nothing is excluded, since the unknown slug
    // matches no guide to begin with).
    const related = relatedGuides("not-a-real-guide");
    expect(related.map((g) => g.slug)).toEqual(GUIDES.slice(0, 3).map((g) => g.slug));
  });
});
