import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecommendedActionCard } from "./RecommendedActionCard";

describe("RecommendedActionCard", () => {
  it("preserves selected institution context on the scenario CTA", () => {
    const html = renderToStaticMarkup(
      <RecommendedActionCard
        recommendedCategory="monthly_maintenance"
        thesisExists
        selectedInstitutionId="2945"
      />,
    );

    expect(html).toContain(
      'href="/pro/simulate?category=monthly_maintenance&amp;instId=2945"',
    );
  });

  it("preserves selected institution context on the setup CTA", () => {
    const html = renderToStaticMarkup(
      <RecommendedActionCard
        recommendedCategory={null}
        thesisExists={false}
        selectedInstitutionId="8109"
      />,
    );

    expect(html).toContain('href="/pro/settings?instId=8109"');
  });
});
