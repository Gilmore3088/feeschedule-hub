import { describe, expect, it, vi } from "vitest";

import { runKnoxExtract } from "./extract";

type DbMock = ReturnType<typeof vi.fn> & { unsafe: ReturnType<typeof vi.fn> };

function templateText(strings: unknown): string {
  return Array.isArray(strings) ? strings.join(" ") : String(strings);
}

function createDbMock(rows: Array<Record<string, unknown>>): DbMock {
  const db = vi.fn((strings: TemplateStringsArray) => {
    const text = templateText(strings);
    if (text.includes("INSERT INTO raw_fee_observations")) {
      return Promise.resolve([{ fee_raw_id: db.mock.calls.length + 900 }]);
    }
    return Promise.resolve([]);
  }) as DbMock;
  db.unsafe = vi.fn((query: string) => {
    if (query.includes("FROM agent_source_texts")) return Promise.resolve(rows);
    return Promise.resolve([]);
  });
  return db;
}

function asExtractDb(db: DbMock): NonNullable<Parameters<typeof runKnoxExtract>[0]["db"]> {
  return db as unknown as NonNullable<Parameters<typeof runKnoxExtract>[0]["db"]>;
}

const textArtifact = {
  document_text_id: 701,
  source_document_id: 501,
  institution_id: 42,
  institution_name: "Test Bank",
  source_url: "https://testbank.example/fees",
  text_hash: "text-hash",
  normalized_text: [
    "Monthly maintenance fee $5.00 per month",
    "Overdraft fee $35.00 per item",
    "Outgoing domestic wire transfer fee $25.00",
    "No fee for e-statements",
    "Schedule of fees effective January 1, 2026 $0",
  ].join("\n"),
};

describe("Knox agentic extraction", () => {
  it("extracts conservative raw fee observations from Rosetta text artifacts", async () => {
    const db = createDbMock([textArtifact]);

    const result = await runKnoxExtract({
      runId: 101,
      limit: 500,
      db: asExtractDb(db),
    });

    expect(result).toMatchObject({
      selectedDocuments: 1,
      processedDocuments: 1,
      extractedFees: 3,
      insertedFees: 3,
      skippedFees: 0,
      limit: 100,
      dryRun: false,
    });
    expect(result.results[0].candidates.map((candidate) => candidate.canonicalHint)).toEqual([
      "monthly_maintenance",
      "overdraft",
      "wire_domestic_outgoing",
    ]);
    expect(result.results[0].candidates[0]).toMatchObject({
      feeName: "Monthly maintenance fee",
      amount: 5,
      frequency: "monthly",
    });

    const unsafeSql = db.unsafe.mock.calls.map((call) => String(call[0])).join("\n");
    expect(unsafeSql).toContain("FROM agent_source_texts");
    expect(unsafeSql).toContain("fr.source = 'knox'");

    const insertSql = db.mock.calls.map((call) => templateText(call[0])).join("\n");
    expect(insertSql).toContain("INSERT INTO raw_fee_observations");
    expect(insertSql).toContain("INSERT INTO hamilton_signals");
    expect(insertSql).toContain("ON CONFLICT DO NOTHING");
    expect(JSON.stringify(db.mock.calls)).toContain("needs_darwin_verification");
    expect(JSON.stringify(db.mock.calls)).toContain("knox_extraction_completed");
    expect(JSON.stringify(db.mock.calls)).toContain("raw_observations_pending_verification");
    expect(JSON.stringify(db.mock.calls)).not.toContain("No fee for e-statements");
  });

  it("keeps dry runs read-only while still reporting candidates", async () => {
    const db = createDbMock([textArtifact]);

    const result = await runKnoxExtract({
      runId: 102,
      dryRun: true,
      db: asExtractDb(db),
    });

    expect(result.extractedFees).toBe(3);
    expect(result.insertedFees).toBe(0);
    expect(result.skippedFees).toBe(3);
    expect(result.dryRun).toBe(true);
    expect(db.unsafe).toHaveBeenCalledTimes(1);
    expect(db).not.toHaveBeenCalled();
  });

  it("skips documents without recognizable banking fee lines", async () => {
    const db = createDbMock([
      {
        ...textArtifact,
        document_text_id: 702,
        normalized_text: "Schedule of fees\nRates effective today\nFree online banking",
      },
    ]);

    const result = await runKnoxExtract({
      runId: 103,
      db: asExtractDb(db),
    });

    expect(result).toMatchObject({
      selectedDocuments: 1,
      processedDocuments: 1,
      extractedFees: 0,
      insertedFees: 0,
      skippedFees: 0,
    });
    const insertSql = db.mock.calls.map((call) => templateText(call[0])).join("\n");
    expect(insertSql).not.toContain("INSERT INTO raw_fee_observations");
    expect(insertSql).toContain("INSERT INTO hamilton_signals");
    expect(JSON.stringify(db.mock.calls)).toContain("knox_extraction_needs_review");
    expect(JSON.stringify(db.mock.calls)).toContain("extraction_needs_review");
  });

  it("filters extraction candidates by state lane", async () => {
    const db = createDbMock([]);

    await runKnoxExtract({
      runId: 104,
      stateCode: "CA",
      db: asExtractDb(db),
    });

    const unsafeSql = db.unsafe.mock.calls.map((call) => String(call[0])).join("\n");
    expect(unsafeSql).toContain("JOIN institution_sources inst ON inst.id = adt.institution_id");
    expect(unsafeSql).toContain("upper(btrim(inst.state_code))");
  });
});
