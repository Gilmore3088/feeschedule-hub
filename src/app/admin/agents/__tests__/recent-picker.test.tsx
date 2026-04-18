// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RecentPicker } from "../lineage/recent-picker";
import type { RecentPublishedFee } from "@/lib/crawler-db/agent-console-types";

afterEach(() => {
  cleanup();
});

const SAMPLE: RecentPublishedFee[] = [
  {
    fee_published_id: 1,
    canonical_fee_key: "monthly_maintenance",
    institution_id: 42,
    fee_name: "Monthly Maintenance",
    published_at: "2026-04-18T12:00:00Z",
  },
  {
    fee_published_id: 2,
    canonical_fee_key: "overdraft",
    institution_id: 99,
    fee_name: "Overdraft Fee",
    published_at: "2026-04-17T12:00:00Z",
  },
  {
    fee_published_id: 3,
    canonical_fee_key: "nsf",
    institution_id: 7,
    fee_name: "NSF Fee",
    published_at: "2026-04-16T12:00:00Z",
  },
];

describe("RecentPicker (UAT Gap 6b)", () => {
  it("renders one clickable Link per item with correct href", () => {
    render(<RecentPicker items={SAMPLE} />);
    const link1 = screen.getByRole("link", { name: /Monthly Maintenance/ });
    expect(link1.getAttribute("href")).toBe("/admin/agents/lineage?fee=1");
    const link2 = screen.getByRole("link", { name: /Overdraft Fee/ });
    expect(link2.getAttribute("href")).toBe("/admin/agents/lineage?fee=2");
    expect(screen.getAllByTestId("recent-picker-id").length).toBe(3);
  });

  it("shows explanatory empty state (no raw JSON) when items is empty", () => {
    render(<RecentPicker items={[]} />);
    const emptyCard = screen.getByTestId("recent-picker-empty");
    expect(emptyCard.textContent).toMatch(/No published fees yet/);
    expect(emptyCard.textContent).toMatch(/run the pipeline/);
    // Guard against Gap 5 regression -- no raw JSON in the empty state.
    expect(emptyCard.textContent).not.toMatch(/fee_published_id"\s*:/);
    expect(emptyCard.querySelector("pre")).toBeNull();
  });

  it("does not render JSON <pre> for non-empty case", () => {
    const { container } = render(<RecentPicker items={SAMPLE} />);
    expect(container.querySelectorAll("pre").length).toBe(0);
  });
});
