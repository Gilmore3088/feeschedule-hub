import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MonitorFeedPreview } from "./MonitorFeedPreview";
import { WhatChangedCard } from "./WhatChangedCard";

describe("Hamilton home context links", () => {
  it("preserves selected institution context from the empty What Changed state", () => {
    const html = renderToStaticMarkup(
      <WhatChangedCard signals={[]} selectedInstitutionId="2945" />,
    );

    expect(html).toContain('href="/pro/settings?instId=2945"');
  });

  it("preserves selected institution context from the monitor feed links", () => {
    const html = renderToStaticMarkup(
      <MonitorFeedPreview signals={[]} selectedInstitutionId="2945" />,
    );

    expect(html).toContain('href="/pro/monitor?instId=2945"');
  });
});
