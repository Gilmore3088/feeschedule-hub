/**
 * Tests for assembleMonthlyPulse().
 *
 * There is currently no prior-period snapshot store — getNationalIndexCached()
 * (mocked here) is the live, canonical-benchmark-overlaid national index, not
 * a materialized "prior period". These tests lock in the fix-round-1 ruling:
 * the manifest must describe what actually runs (no fee_index_cache), and
 * the payload must say explicitly why movers are empty rather than silently
 * implying a comparison found no movement.
 */

import { describe, it, expect, vi } from "vitest";

// vi.mock factories are hoisted above imports/top-level consts, so anything
// the factory closes over must go through vi.hoisted().
const { mockIndexEntries, getNationalIndexCached } = vi.hoisted(() => {
  const mockIndexEntries = [
    {
      fee_category: "overdraft",
      fee_family: "Deposit Accounts",
      median_amount: 30,
      p25_amount: 25,
      p75_amount: 35,
      min_amount: 10,
      max_amount: 40,
      institution_count: 120,
      observation_count: 140,
      approved_count: 140,
      bank_count: 80,
      cu_count: 40,
      maturity_tier: "strong" as const,
      last_updated: "2026-08-15T00:00:00.000Z",
    },
    {
      fee_category: "nsf",
      fee_family: "Deposit Accounts",
      median_amount: 30,
      p25_amount: 20,
      p75_amount: 35,
      min_amount: 10,
      max_amount: 40,
      institution_count: 90,
      observation_count: 100,
      approved_count: 100,
      bank_count: 60,
      cu_count: 30,
      maturity_tier: "strong" as const,
      last_updated: "2026-08-15T00:00:00.000Z",
    },
  ];
  return {
    mockIndexEntries,
    getNationalIndexCached: vi.fn(async () => mockIndexEntries),
  };
});

vi.mock("@/lib/data-store/fee-index", () => ({
  getNationalIndexCached,
}));

vi.mock("@/lib/fee-taxonomy", () => ({
  getDisplayName: (cat: string) => cat.replace(/_/g, " "),
}));

vi.mock("@/lib/report-engine/types", () => ({}));

import { assembleMonthlyPulse, NO_PRIOR_SNAPSHOT_NOTE } from "./monthly-pulse";

describe("assembleMonthlyPulse", () => {
  it("describes what actually runs in the manifest, not fee_index_cache", async () => {
    const payload = await assembleMonthlyPulse();

    const manifestSql = payload.manifest.queries.map((q) => q.sql).join(" ");
    expect(manifestSql).not.toContain("fee_index_cache");
    expect(manifestSql.toLowerCase()).toContain("canonical benchmark");
    expect(manifestSql).toContain("getNationalIndexCached");
  });

  it("reports an explicit movers_note instead of silently claiming no movement when there is no prior snapshot", async () => {
    const payload = await assembleMonthlyPulse();

    expect(payload.movers_note).toBe(NO_PRIOR_SNAPSHOT_NOTE);
    expect(payload.movers_up).toEqual([]);
    expect(payload.movers_down).toEqual([]);
    expect(payload.total_movers).toBe(0);
    expect(payload.total_categories_tracked).toBe(mockIndexEntries.length);
  });

  it("does not read fee_index_cache anywhere in the manifest queries", async () => {
    const payload = await assembleMonthlyPulse();
    for (const query of payload.manifest.queries) {
      expect(query.sql).not.toMatch(/fee_index_cache/i);
    }
  });
});
