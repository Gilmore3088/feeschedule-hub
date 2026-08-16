import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalyzeCTABar } from "./AnalyzeCTABar";

describe("AnalyzeCTABar", () => {
  it("preserves selected institution context on the scenario CTA", () => {
    const html = renderToStaticMarkup(
      <AnalyzeCTABar isVisible institutionId="2945" />,
    );

    expect(html).toContain('href="/pro/simulate?instId=2945"');
  });

  it("renders secondary actions as real Hamilton workflow links", () => {
    const html = renderToStaticMarkup(
      <AnalyzeCTABar isVisible institutionId="2945" />,
    );

    expect(html).toContain('href="/pro/reports?intent=peer-brief&amp;instId=2945"');
    expect(html).toContain('href="/pro/monitor?instId=2945"');
    expect(html).toContain("Show Peer Distribution");
    expect(html).toContain("View Risk Drivers");
  });

  it("renders nothing before analysis completes", () => {
    const html = renderToStaticMarkup(<AnalyzeCTABar isVisible={false} />);

    expect(html).toBe("");
  });
});
