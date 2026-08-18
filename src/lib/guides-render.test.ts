import { describe, expect, it } from "vitest";
import { renderGuideProse } from "./guides-render";

describe("renderGuideProse", () => {
  it("should_fill_tokens_from_the_benchmark", () => {
    const out = renderGuideProse(
      "Most banks charge between {{p25}} and {{p75}}, median {{median}} (n={{n}}).",
      {
        fee_category: "overdraft",
        median: 30,
        p25: 20,
        p75: 35,
        min: 1,
        max: 40,
        institution_count: 68,
        observation_count: 78,
        as_of: null,
      } as never
    );
    expect(out).toBe("Most banks charge between $20.00 and $35.00, median $30.00 (n=68).");
  });

  it("should_use_an_em_dash_when_the_benchmark_is_null", () => {
    const out = renderGuideProse(
      "Median: {{median}}, P25: {{p25}}, P75: {{p75}}, n={{n}}.",
      null
    );
    expect(out).toBe("Median: —, P25: —, P75: —, n=—.");
  });

  it("should_leave_content_without_tokens_unchanged", () => {
    const out = renderGuideProse("No tokens here.", null);
    expect(out).toBe("No tokens here.");
  });
});
