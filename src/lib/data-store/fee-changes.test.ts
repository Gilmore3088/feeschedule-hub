import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the connection module before importing anything that uses it
vi.mock("./connection", () => {
  const mockSql = vi.fn();
  return {
    getSql: () => mockSql,
    sql: mockSql,
  };
});

import { getFeeChangeEvents } from "./fee-changes";
import { getSql } from "./connection";

type MockSql = ReturnType<typeof vi.fn> & { unsafe: ReturnType<typeof vi.fn> };

function makeMockSql(rows: unknown[] | Error): MockSql {
  const mockSql = getSql() as unknown as MockSql;
  mockSql.mockReset();

  if (rows instanceof Error) {
    // unsafe() throws
    mockSql.unsafe = vi.fn().mockRejectedValue(rows);
  } else {
    mockSql.unsafe = vi.fn().mockResolvedValue(rows);
  }

  return mockSql;
}

const SAMPLE_ROW = {
  id: 1,
  crawl_target_id: 42,
  institution_name: "First National Bank",
  fee_category: "overdraft",
  old_amount: 30,
  new_amount: 35,
  change_type: "increase",
  changed_at: new Date("2025-01-15T12:00:00Z"),
  charter_type: "bank",
};

describe("getFeeChangeEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns [] when fee_change_events table does not exist", async () => {
    const tableErr = new Error('relation "fee_change_events" does not exist');
    makeMockSql(tableErr);

    const result = await getFeeChangeEvents({ charter_type: "bank" });
    expect(result).toEqual([]);
  });

  it("returns [] when error message mentions 'no such table'", async () => {
    const tableErr = new Error("no such table: fee_change_events");
    makeMockSql(tableErr);

    const result = await getFeeChangeEvents({});
    expect(result).toEqual([]);
  });

  it("rethrows errors unrelated to missing table", async () => {
    const networkErr = new Error("connection refused");
    makeMockSql(networkErr);

    await expect(getFeeChangeEvents({})).rejects.toThrow("connection refused");
  });

  it("returns array of FeeChangeEvent objects when table has rows", async () => {
    makeMockSql([SAMPLE_ROW]);

    const result = await getFeeChangeEvents({});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 1,
      crawl_target_id: 42,
      institution_name: "First National Bank",
      fee_category: "overdraft",
      old_amount: 30,
      new_amount: 35,
      change_type: "increase",
      charter_type: "bank",
    });
    // changed_at should be an ISO string
    expect(typeof result[0].changed_at).toBe("string");
    expect(result[0].changed_at).toContain("2025-01-15");
  });

  it("returns empty array when table exists but has no matching rows", async () => {
    makeMockSql([]);

    const result = await getFeeChangeEvents({ fed_districts: [1, 2] });
    expect(result).toEqual([]);
  });

  it("builds WHERE clause with charter_type filter", async () => {
    makeMockSql([]);

    await getFeeChangeEvents({ charter_type: "bank" });

    const mockSql = getSql() as unknown as MockSql;
    const unsafeCall = mockSql.unsafe.mock.calls[0];
    const query: string = unsafeCall[0];
    const params: unknown[] = unsafeCall[1];

    expect(query).toContain("ct.charter_type");
    expect(params).toContain("bank");
  });

  it("builds WHERE clause with fed_districts filter", async () => {
    makeMockSql([]);

    await getFeeChangeEvents({ fed_districts: [1, 2] });

    const mockSql = getSql() as unknown as MockSql;
    const unsafeCall = mockSql.unsafe.mock.calls[0];
    const query: string = unsafeCall[0];
    const params: unknown[] = unsafeCall[1];

    expect(query).toContain("ct.fed_district IN");
    expect(params).toContain(1);
    expect(params).toContain(2);
  });

  it("builds WHERE clause with asset_tiers filter", async () => {
    makeMockSql([]);

    await getFeeChangeEvents({ asset_tiers: ["community"] });

    const mockSql = getSql() as unknown as MockSql;
    const unsafeCall = mockSql.unsafe.mock.calls[0];
    const query: string = unsafeCall[0];
    const params: unknown[] = unsafeCall[1];

    expect(query).toContain("ct.asset_size_tier IN");
    expect(params).toContain("community");
  });

  it("applies default LIMIT of 100", async () => {
    makeMockSql([]);

    await getFeeChangeEvents({});

    const mockSql = getSql() as unknown as MockSql;
    const unsafeCall = mockSql.unsafe.mock.calls[0];
    const query: string = unsafeCall[0];

    expect(query).toContain("LIMIT");
    expect(query).toContain("100");
  });

  it("caps limit at 500", async () => {
    makeMockSql([]);

    await getFeeChangeEvents({ limit: 999 });

    const mockSql = getSql() as unknown as MockSql;
    const unsafeCall = mockSql.unsafe.mock.calls[0];
    const query: string = unsafeCall[0];

    expect(query).toContain("500");
  });

  it("applies ORDER BY changed_at DESC", async () => {
    makeMockSql([]);

    await getFeeChangeEvents({});

    const mockSql = getSql() as unknown as MockSql;
    const unsafeCall = mockSql.unsafe.mock.calls[0];
    const query: string = unsafeCall[0];

    expect(query).toContain("ORDER BY");
    expect(query).toContain("changed_at DESC");
  });
});
