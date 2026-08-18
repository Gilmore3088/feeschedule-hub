import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Page-level regression test for a duplicate-CTA bug: StudyTeaser and
// UpgradeGate each used to render their own "See pricing" link, so the
// composed anonymous page showed two. StudyTeaser no longer renders one;
// this test renders the real anonymous branch of the page (real
// StudyTeaser, stubbed UpgradeGate standing in for whatever pricing CTA it
// renders) and asserts the page contains exactly one such link.
vi.mock("@/lib/data-store/financial", () => ({
  getMarketConcentration: vi.fn().mockResolvedValue([
    { msa_code: 1, msa_name: "Test Metro, TX", total_deposits: 1_000_000, institution_count: 12, hhi: 3200, top3_share: 62, year: 2024 },
  ]),
}));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/access", () => ({
  canAccessPremium: vi.fn().mockReturnValue(false),
}));
vi.mock("@/components/upgrade-gate", () => ({
  UpgradeGate: () => <a href="/subscribe">See pricing</a>,
}));

import MarketConcentrationPage from "./page";

describe("MarketConcentrationPage (anonymous)", () => {
  it("should_render_exactly_one_see_pricing_link_when_teaser_and_upgrade_gate_are_composed", async () => {
    const jsx = await MarketConcentrationPage();
    render(jsx);

    expect(
      screen.getByRole("heading", { level: 1, name: "Market Concentration & Bank Fees" })
    ).toBeInTheDocument();

    const pricingLinks = screen.getAllByRole("link", { name: /see pricing/i });
    expect(pricingLinks).toHaveLength(1);
  });
});
