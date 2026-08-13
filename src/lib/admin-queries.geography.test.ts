import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data-store/connection", () => ({
  sql: vi.fn(),
}));

import { sql } from "@/lib/data-store/connection";
import { getDistrictOverview, getStateOverview } from "./admin-queries";

const sqlMock = sql as unknown as ReturnType<typeof vi.fn>;

describe("admin geography queries", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  it("returns all 12 district rows with distinct institution aggregation", async () => {
    sqlMock.mockResolvedValueOnce([
      {
        district: "7",
        total: "1543",
        with_urls: "870",
        with_fees: "220",
        url_but_zero: "650",
        latest_failed: "50",
        extracted_not_published: "20",
      },
    ]);

    const rows = await getDistrictOverview();
    const issuedSql = String(sqlMock.mock.calls[0][0]);

    expect(rows).toHaveLength(12);
    expect(rows.find((row) => row.district === 7)).toMatchObject({
      name: "Chicago",
      total: 1543,
      with_urls: 870,
      with_fees: 220,
      url_but_zero: 650,
      latest_failed: 50,
      extracted_not_published: 20,
      pct: 14,
    });
    expect(rows.find((row) => row.district === 1)).toMatchObject({
      total: 0,
      with_fees: 0,
      pct: 0,
    });
    expect(rows.find((row) => row.district === 7)?.states).toContain("IL");
    expect(issuedSql).toContain("COUNT(DISTINCT ct.id)");
    expect(issuedSql).not.toContain("COUNT(*) as total");
  });

  it("returns known state rows even when a state has no institution records", async () => {
    sqlMock.mockResolvedValueOnce([
      {
        state_code: "TX",
        total: "740",
        with_urls: "410",
        with_fees: "77",
        missing_url: "330",
        url_but_zero: "333",
        latest_failed: "12",
        extracted_not_published: "4",
      },
    ]);

    const rows = await getStateOverview();
    const issuedSql = String(sqlMock.mock.calls[0][0]);

    expect(rows.length).toBeGreaterThanOrEqual(54);
    expect(rows.find((row) => row.state_code === "TX")).toMatchObject({
      name: "Texas",
      district: 11,
      district_name: "Dallas",
      total: 740,
      with_urls: 410,
      with_fees: 77,
      missing_url: 330,
      url_but_zero: 333,
      latest_failed: 12,
      extracted_not_published: 4,
      pct: 10,
    });
    expect(rows.find((row) => row.state_code === "AK")).toMatchObject({
      name: "Alaska",
      total: 0,
      pct: 0,
    });
    expect(issuedSql).toContain("source_documents");
    expect(issuedSql).toContain("published_fee_catalog");
  });
});
