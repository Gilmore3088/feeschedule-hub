import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PositioningEvidence } from "./PositioningEvidence";
import type { PositioningEntry } from "@/lib/hamilton/home-data";

const entry: PositioningEntry = {
  feeCategory: "monthly_maintenance",
  displayName: "Monthly Maintenance",
  medianAmount: 12,
  p25Amount: 8,
  p75Amount: 15,
  institutionCount: 42,
  maturityTier: "strong",
};

describe("PositioningEvidence", () => {
  it("links full distribution to Simulate with fee and institution context", () => {
    const html = renderToStaticMarkup(
      <PositioningEvidence entries={[entry]} selectedInstitutionId="2945" />,
    );

    expect(html).toContain(
      'href="/pro/simulate?category=monthly_maintenance&amp;instId=2945"',
    );
    expect(html).not.toContain('href="#"');
  });

  it("does not render a dead distribution link without positioning data", () => {
    const html = renderToStaticMarkup(
      <PositioningEvidence entries={[]} selectedInstitutionId="2945" />,
    );

    expect(html).not.toContain("View full distribution");
    expect(html).not.toContain('href="#"');
  });
});
