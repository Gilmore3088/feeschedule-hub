import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./connection", () => ({
  sql: {
    unsafe: vi.fn(),
  },
}));

import { autocompleteInstitutions } from "./search";
import { sql } from "./connection";

const unsafeMock = sql.unsafe as unknown as ReturnType<typeof vi.fn>;

describe("autocompleteInstitutions", () => {
  beforeEach(() => {
    unsafeMock.mockReset();
  });

  it("returns public-safe quality labels and prioritizes asset size in the query", async () => {
    unsafeMock.mockResolvedValueOnce([
      {
        id: 1,
        institution_name: "JPMorgan Chase Bank, National Association",
        city: "Columbus",
        state_code: "OH",
        charter_type: "bank",
        asset_size_tier: "super_regional",
        asset_size: "3813431000",
        source: "fdic",
        cert_number: "628",
        website_url: "https://www.jpmorganchase.com",
        fee_schedule_url:
          "https://www.jpmorganchase.com/ir/news/2021/chase-helps-more-than-two-million-customers-avoid-overdraft-service-fees",
        fee_count: "0",
        latest_source_status: "failed",
        latest_extracted_fee_count: "0",
        latest_source_error: null,
        latest_source_collected_at: "2026-03-17T01:00:43Z",
      },
    ]);

    const rows = await autocompleteInstitutions("jpm");

    expect(unsafeMock.mock.calls[0][0]).toContain("ct.asset_size DESC NULLS LAST");
    expect(rows[0]).toMatchObject({
      id: 1,
      quality_status: "needs_review",
      quality_label: "Fee schedule under review",
      fee_count: 0,
    });
  });
});
