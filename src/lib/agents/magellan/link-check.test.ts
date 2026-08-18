import { describe, expect, it, vi } from "vitest";

import { runLinkCheck } from "./link-check";

type DbMock = ReturnType<typeof vi.fn>;

function templateText(strings: unknown): string {
  return Array.isArray(strings) ? strings.join(" ") : String(strings);
}

function createDbMock(rows: Array<Record<string, unknown>>): DbMock {
  return vi.fn((strings: TemplateStringsArray) => {
    const text = templateText(strings);
    if (text.includes("FROM source_documents")) return Promise.resolve(rows);
    return Promise.resolve([]);
  });
}

function asLinkCheckDb(db: DbMock): NonNullable<Parameters<typeof runLinkCheck>[1]>["db"] {
  return db as unknown as NonNullable<Parameters<typeof runLinkCheck>[1]>["db"];
}

describe("Magellan link-check", () => {
  it("HEAD-checks a candidate and records a reachable status", async () => {
    const db = createDbMock([
      { id: 501, institution_id: 3827, document_url: "https://angelinabankonline.com/fees" },
    ]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await runLinkCheck(101, { db: asLinkCheckDb(db), fetchImpl });

    expect(result).toMatchObject({ selected: 1, processed: 1, checked: 1, unavailable: 0, failed: 0, skipped: 0 });
    expect(result.results[0]).toMatchObject({
      sourceDocumentId: 501,
      institutionId: 3827,
      outcome: "checked",
      statusCode: 200,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://angelinabankonline.com/fees",
      expect.objectContaining({ method: "HEAD", redirect: "follow" }),
    );

    const sqlText = db.mock.calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).toContain("UPDATE source_documents");
    expect(sqlText).toContain("last_checked_at = NOW()");
    expect(sqlText).toContain("last_status");
  });

  it("flags a 404 as unavailable while still recording the check", async () => {
    const db = createDbMock([
      { id: 502, institution_id: 22, document_url: "https://brokenbank.example/fees" },
    ]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }));

    const result = await runLinkCheck(102, { db: asLinkCheckDb(db), fetchImpl });

    expect(result).toMatchObject({ checked: 0, unavailable: 1, failed: 0 });
    expect(result.results[0]).toMatchObject({ outcome: "checked", statusCode: 404 });
  });

  it("records a failed check without a status when the fetch rejects", async () => {
    const db = createDbMock([
      { id: 503, institution_id: 44, document_url: "https://unreachable.example/fees" },
    ]);
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("network error"));

    const result = await runLinkCheck(103, { db: asLinkCheckDb(db), fetchImpl });

    expect(result).toMatchObject({ checked: 0, unavailable: 0, failed: 1 });
    expect(result.results[0]).toMatchObject({ outcome: "failed", statusCode: null, reason: "network error" });

    const sqlText = db.mock.calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).toContain("last_status");
  });

  it("skips a candidate with no document URL without calling fetch", async () => {
    const db = createDbMock([{ id: 504, institution_id: 55, document_url: null }]);
    const fetchImpl = vi.fn();

    const result = await runLinkCheck(104, { db: asLinkCheckDb(db), fetchImpl });

    expect(result).toMatchObject({ skipped: 1, processed: 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("selects only documents backing an approved published fee, oldest-checked first, bounded by limit", async () => {
    const db = createDbMock([]);
    const fetchImpl = vi.fn();

    await runLinkCheck(105, { db: asLinkCheckDb(db), fetchImpl, limit: 50 });

    const sqlText = templateText(db.mock.calls[0][0]);
    expect(sqlText).toContain("FROM source_documents");
    expect(sqlText).toContain("published_fee_catalog");
    expect(sqlText).toContain("pfc.source_document_id = sd.id");
    expect(sqlText).toContain("review_status = 'approved'");
    expect(sqlText).toContain("last_checked_at ASC NULLS FIRST");
  });

  it("defaults the limit to 200 when none is given", async () => {
    const db = createDbMock([]);
    const fetchImpl = vi.fn();

    const result = await runLinkCheck(106, { db: asLinkCheckDb(db), fetchImpl });

    expect(result.limit).toBe(200);
  });
});
