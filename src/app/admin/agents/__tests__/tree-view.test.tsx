// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TreeView } from "../lineage/tree-view";

afterEach(() => {
  cleanup();
});

// Mock lineage_graph() JSON output (per 62B-01 schema):
// {
//   tier_3: { row: {...}, children: [{ tier_2: {...}, children: [{ tier_1: {...}, r2_key: "..." }] }] }
// }
const LINEAGE_FIXTURE = {
  tier_3: {
    row: {
      fee_published_id: 123,
      fee_category: "monthly_maintenance",
      amount: 12,
      institution_id: 999,
    },
    children: [
      {
        tier_2: {
          row: {
            verification_id: 55,
            verifier: "knox",
            verified_at: "2026-04-16T00:00:00Z",
          },
          children: [
            {
              tier_1: {
                row: {
                  extraction_id: 11,
                  extractor: "darwin",
                  confidence: 0.92,
                },
                r2_key: "https://r2.example.com/raw/fees/2026/04/16/abc.pdf",
              },
            },
          ],
        },
      },
    ],
  },
};

describe("TreeView (OBS-03)", () => {
  it("renders tier-3 root default-expanded", () => {
    render(<TreeView graph={LINEAGE_FIXTURE} />);
    // fee_category from tier-3 row should be visible immediately (default-expanded)
    expect(screen.getByText(/monthly_maintenance/i)).toBeTruthy();
  });

  it("reaches R2 link within <=3 clicks (OBS-03 3-click bar)", () => {
    render(<TreeView graph={LINEAGE_FIXTURE} />);

    // Click 1: expand tier-2
    const tier2Toggles = screen.getAllByRole("button", { name: /tier 2/i });
    fireEvent.click(tier2Toggles[0]);

    // Click 2: expand tier-1
    const tier1Toggles = screen.getAllByRole("button", { name: /tier 1/i });
    fireEvent.click(tier1Toggles[0]);

    // R2 link should now be visible (click 2 was sufficient since tier-3 is default-expanded)
    const r2Link = screen.getByRole("link", { name: /raw\/fees\/2026\/04\/16\/abc\.pdf/i });
    expect(r2Link).toBeTruthy();
    expect(r2Link.getAttribute("href")).toContain("abc.pdf");
  });

  it("renders not-found state for null graph", () => {
    render(<TreeView graph={null} />);
    expect(screen.getByText(/no lineage found/i)).toBeTruthy();
  });
});
