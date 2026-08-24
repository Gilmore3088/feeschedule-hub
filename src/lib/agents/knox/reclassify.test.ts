import { describe, expect, it, vi } from "vitest";

import { reclassificationSegment, runKnoxReclassify } from "./reclassify";

type DbMock = ReturnType<typeof vi.fn> & { unsafe: ReturnType<typeof vi.fn> };

function createDbMock(rows: Array<Record<string, unknown>>): DbMock {
  const db = vi.fn(() => Promise.resolve([])) as DbMock;
  // The module issues exactly two `unsafe` statements: the SELECT that claims a
  // batch, then a single batched UPDATE. Distinguish them by the SQL text.
  db.unsafe = vi.fn((query: string, params?: unknown[]) => {
    if (query.includes("UPDATE raw_fee_observations")) {
      const ids = (params?.[0] as number[] | undefined) ?? [];
      return Promise.resolve(ids.map((id) => ({ fee_raw_id: id })));
    }
    return Promise.resolve(rows);
  });
  return db;
}

function asReclassifyDb(db: DbMock): NonNullable<Parameters<typeof runKnoxReclassify>[0]["db"]> {
  return db as unknown as NonNullable<Parameters<typeof runKnoxReclassify>[0]["db"]>;
}

/** Real rows from the migration_v10 import, verbatim. */
const LEGACY_ROWS = [
  {
    fee_raw_id: 2,
    institution_id: 100,
    fee_name: "Overdraft Daily Cap",
    amount: null,
    frequency: "daily",
    conditions: "maximum of 10 overdraft fees assessed per business day",
    source: "migration_v10",
    institution_name: "Test CU",
  },
  {
    fee_raw_id: 6,
    institution_id: 101,
    fee_name: "Overdraft Daily Cap",
    amount: "90.00",
    frequency: "daily",
    conditions: "Maximum overdraft fees per day under Bounce Protection",
    source: "migration_v10",
    institution_name: "Test CU 2",
  },
  {
    fee_raw_id: 10,
    institution_id: 102,
    fee_name: "Courtesy Pay Daily Cap",
    amount: "120.00",
    frequency: "daily",
    conditions: "Maximum $120/day on Courtesy Pay fees",
    source: "migration_v10",
    institution_name: "Test CU 3",
  },
  {
    fee_raw_id: 14,
    institution_id: 103,
    fee_name: "Temporary Checks",
    amount: "5.00",
    frequency: "per_occurrence",
    conditions: "Per pack of ten",
    source: "migration_v10",
    institution_name: "Test CU 4",
  },
  {
    fee_raw_id: 5,
    institution_id: 104,
    fee_name: "WebPay - Express Pay",
    amount: "8.00",
    frequency: "per_occurrence",
    conditions: "",
    source: "migration_v10",
    institution_name: "Test CU 5",
  },
];

describe("reclassificationSegment", () => {
  it("joins the fee name with its qualifier text", () => {
    expect(
      reclassificationSegment({
        fee_name: "Courtesy Pay Daily Cap",
        conditions: "Maximum $120/day on Courtesy Pay fees",
      }),
    ).toBe("Courtesy Pay Daily Cap Maximum $120/day on Courtesy Pay fees");
  });

  it("tolerates null conditions", () => {
    expect(reclassificationSegment({ fee_name: "Stop Payment", conditions: null })).toBe("Stop Payment");
  });

  it("is why caps resolve correctly — the qualifier carries the cap language", () => {
    // "Overdraft Daily Cap" alone is classifiable, but plenty of legacy rows
    // put the deciding words only in `conditions`.
    const withoutConditions = reclassificationSegment({ fee_name: "Overdraft", conditions: null });
    const withConditions = reclassificationSegment({
      fee_name: "Overdraft",
      conditions: "maximum of 10 overdraft fees assessed per business day",
    });
    expect(withoutConditions).not.toContain("maximum");
    expect(withConditions).toContain("maximum");
  });
});

describe("runKnoxReclassify", () => {
  it("defaults to a dry run and writes nothing", async () => {
    const db = createDbMock(LEGACY_ROWS);
    const result = await runKnoxReclassify({ runId: 1, db: asReclassifyDb(db) });

    expect(result.dryRun).toBe(true);
    expect(result.updatedRows).toBe(0);
    // Only the claiming SELECT ran — no UPDATE was issued.
    expect(db.unsafe).toHaveBeenCalledTimes(1);
  });

  it("stays a dry run when dryRun is passed explicitly", async () => {
    const db = createDbMock(LEGACY_ROWS);
    const result = await runKnoxReclassify({ runId: 1, dryRun: true, db: asReclassifyDb(db) });
    expect(result.updatedRows).toBe(0);
    expect(db.unsafe).toHaveBeenCalledTimes(1);
  });

  it("classifies real legacy rows, caps included", async () => {
    const db = createDbMock(LEGACY_ROWS);
    const result = await runKnoxReclassify({ runId: 1, db: asReclassifyDb(db) });

    expect(result.selectedRows).toBe(5);
    expect(result.classifiedRows).toBe(4);
    expect(result.unclassifiedRows).toBe(1);

    const byId = new Map(result.results.map((row) => [row.feeRawId, row]));
    expect(byId.get(2)?.canonicalHint).toBe("od_daily_cap");
    expect(byId.get(6)?.canonicalHint).toBe("od_daily_cap");
    expect(byId.get(10)?.canonicalHint).toBe("od_daily_cap");
    expect(byId.get(14)?.canonicalHint).toBe("counter_check");
    expect(byId.get(5)?.canonicalHint).toBeNull();
  });

  it("projects Darwin's outcome rather than just counting rows touched", async () => {
    const db = createDbMock(LEGACY_ROWS);
    const result = await runKnoxReclassify({ runId: 1, db: asReclassifyDb(db) });

    // fee_raw_id 2 has a null amount — Darwin skips it whatever the hint says.
    expect(result.results.find((row) => row.feeRawId === 2)?.projectedOutcome).toBe("skip_no_amount");
    expect(result.projected.skippedNoAmount).toBe(1);
    // The three with amounts sit inside their envelopes.
    expect(result.projected.wouldVerify).toBe(3);
    expect(result.projected.wouldReview).toBe(0);
  });

  it("reports the key distribution so a run is legible before it is trusted", async () => {
    const db = createDbMock(LEGACY_ROWS);
    const result = await runKnoxReclassify({ runId: 1, db: asReclassifyDb(db) });
    expect(result.keyDistribution[0]).toEqual({ canonicalFeeKey: "od_daily_cap", rows: 3 });
  });

  it("writes only when dryRun is explicitly false", async () => {
    const db = createDbMock(LEGACY_ROWS);
    const result = await runKnoxReclassify({ runId: 1, dryRun: false, db: asReclassifyDb(db) });

    expect(result.dryRun).toBe(false);
    expect(result.updatedRows).toBe(4);
    // One SELECT plus ONE batched UPDATE — not one statement per row. A remote
    // database makes per-row round-trips pathological at 10,000 rows.
    expect(db.unsafe).toHaveBeenCalledTimes(2);
  });

  it("clamps the limit", async () => {
    const db = createDbMock([]);
    expect((await runKnoxReclassify({ runId: 1, limit: 999_999, db: asReclassifyDb(db) })).limit).toBe(10_000);
    expect((await runKnoxReclassify({ runId: 1, limit: 0, db: asReclassifyDb(db) })).limit).toBe(1);
    expect((await runKnoxReclassify({ runId: 1, limit: Number.NaN, db: asReclassifyDb(db) })).limit).toBe(500);
  });

  it("handles an empty selection", async () => {
    const db = createDbMock([]);
    const result = await runKnoxReclassify({ runId: 1, dryRun: false, db: asReclassifyDb(db) });
    expect(result.selectedRows).toBe(0);
    expect(result.updatedRows).toBe(0);
    expect(result.keyDistribution).toEqual([]);
  });
});
