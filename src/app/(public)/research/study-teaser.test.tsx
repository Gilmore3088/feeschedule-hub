import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudyTeaser } from "./study-teaser";

const HIGHLIGHTS = [
  { label: "Micro (<$100M)", value: "$4.25" },
  { label: "Community ($100M-$1B)", value: "$5.10" },
  { label: "Mid-Size ($1B-$10B)", value: "$6.75" },
];

describe("StudyTeaser", () => {
  it("should_render_h1_abstract_and_highlights_without_its_own_pricing_link", () => {
    render(
      <StudyTeaser
        title="Fee-to-Revenue Analysis"
        abstract="This is a placeholder abstract for the study teaser test, long enough to stand in for real research copy."
        highlights={HIGHLIGHTS}
      />
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Fee-to-Revenue Analysis" })
    ).toBeInTheDocument();
    expect(screen.getByText(/placeholder abstract/)).toBeInTheDocument();

    for (const highlight of HIGHLIGHTS) {
      expect(screen.getByText(highlight.label)).toBeInTheDocument();
      expect(screen.getByText(highlight.value)).toBeInTheDocument();
    }

    // StudyTeaser must never render its own pricing CTA: the calling page
    // renders exactly one <UpgradeGate /> right after this component for
    // non-premium visitors, and that is the single page-level pricing CTA.
    // Regression guard for a bug where both StudyTeaser and UpgradeGate
    // rendered a "See pricing" link, producing two on the composed page.
    expect(screen.queryAllByRole("link", { name: /see pricing/i })).toHaveLength(0);
  });

  it("should_render_optional_chart_node_when_provided", () => {
    render(
      <StudyTeaser
        title="Market Concentration & Bank Fees"
        abstract="Placeholder abstract for the chart-rendering test case."
        highlights={HIGHLIGHTS}
        chart={<div data-testid="teaser-chart">chart-content</div>}
      />
    );

    expect(screen.getByTestId("teaser-chart")).toBeInTheDocument();
  });
});
