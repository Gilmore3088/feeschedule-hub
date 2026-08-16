import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignalFeed } from "./SignalFeed";

describe("SignalFeed", () => {
  it("preserves selected institution context from the empty-state Settings CTA", () => {
    const html = renderToStaticMarkup(
      <SignalFeed signals={[]} selectedInstitutionId="2945" />,
    );

    expect(html).toContain('href="/pro/settings?instId=2945"');
  });
});
