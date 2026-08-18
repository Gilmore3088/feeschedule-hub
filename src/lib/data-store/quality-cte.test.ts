import { describe, expect, it } from "vitest";
import { buildQualityCte, SEARCH_QUALITY_CTE } from "./quality-cte";

describe("buildQualityCte", () => {
  it("should_emit_no_institution_filter_when_unscoped", () => {
    const cte = buildQualityCte();
    expect(cte).not.toMatch(/institution_id\s*=\s*\d+/);
    expect(cte).toBe(SEARCH_QUALITY_CTE);
  });

  it("should_scope_every_cte_to_the_given_institution_id_when_provided", () => {
    const cte = buildQualityCte({ institutionId: 3827 });
    expect(cte).toContain("WHERE institution_id = 3827");
    expect(cte).toContain("fv.institution_id = 3827");
    expect(cte).toContain("fr.institution_id = 3827");
    // catalog_counts + latest_docs each get "WHERE institution_id = 3827";
    // verified_unpublished_counts and raw_unverified_counts each get their
    // own alias-qualified filter — 4 scoped predicates total.
    expect(cte.match(/institution_id = 3827/g)).toHaveLength(4);
  });

  it("should_reject_a_non_integer_institution_id", () => {
    expect(() => buildQualityCte({ institutionId: Number.NaN })).toThrow();
    expect(() => buildQualityCte({ institutionId: 1.5 })).toThrow();
    expect(() => buildQualityCte({ institutionId: Infinity })).toThrow();
  });

  it("should_keep_the_unscoped_and_scoped_projections_identical_in_shape", () => {
    const unscoped = buildQualityCte();
    const scoped = buildQualityCte({ institutionId: 1 });
    for (const cteName of ["catalog_counts", "verified_unpublished_counts", "raw_unverified_counts", "latest_docs"]) {
      expect(unscoped).toContain(`${cteName} AS (`);
      expect(scoped).toContain(`${cteName} AS (`);
    }
  });
});
