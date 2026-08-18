import { describe, expect, it, vi } from "vitest";

import { USER_AGENT } from "./fetch";
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
  it("HEAD-checks a candidate with the Magellan User-Agent and records a reachable status", async () => {
    const db = createDbMock([
      { id: 501, institution_id: 3827, document_url: "https://angelinabankonline.com/fees" },
    ]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await runLinkCheck(101, { db: asLinkCheckDb(db), fetchImpl });

    expect(result).toMatchObject({ selected: 1, processed: 1, checked: 1, unavailable: 0, failed: 0, skipped: 0, remaining: 0, stoppedEarly: false });
    expect(result.results[0]).toMatchObject({
      sourceDocumentId: 501,
      institutionId: 3827,
      outcome: "checked",
      statusCode: 200,
      retried: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://angelinabankonline.com/fees",
      expect.objectContaining({
        method: "HEAD",
        redirect: "follow",
        headers: expect.objectContaining({ "User-Agent": USER_AGENT }),
      }),
    );

    const sqlText = db.mock.calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).toContain("UPDATE source_documents");
    expect(sqlText).toContain("last_checked_at = NOW()");
    expect(sqlText).toContain("last_status");
  });

  it("flags a 404 as unavailable, without retrying, while still recording the check", async () => {
    const db = createDbMock([
      { id: 502, institution_id: 22, document_url: "https://brokenbank.example/fees" },
    ]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }));

    const result = await runLinkCheck(102, { db: asLinkCheckDb(db), fetchImpl });

    expect(result).toMatchObject({ checked: 0, unavailable: 1, failed: 0 });
    expect(result.results[0]).toMatchObject({ outcome: "checked", statusCode: 404, retried: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 403 HEAD response with a ranged GET before recording the status", async () => {
    const db = createDbMock([
      { id: 505, institution_id: 6, document_url: "https://strict.example/fees" },
    ]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await runLinkCheck(107, { db: asLinkCheckDb(db), fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://strict.example/fees",
      expect.objectContaining({ method: "HEAD" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://strict.example/fees",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Range: "bytes=0-0", "User-Agent": USER_AGENT }),
      }),
    );
    expect(result.results[0]).toMatchObject({ outcome: "checked", statusCode: 200, retried: true });
  });

  it.each([405, 501])("retries a %d HEAD response with a ranged GET", async (status) => {
    const db = createDbMock([{ id: 509, institution_id: 10, document_url: "https://a.example/fees" }]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await runLinkCheck(114, { db: asLinkCheckDb(db), fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.results[0]).toMatchObject({ outcome: "checked", statusCode: 200, retried: true });
  });

  it("retries a HEAD network error with a ranged GET before recording a failed check", async () => {
    const db = createDbMock([
      { id: 503, institution_id: 44, document_url: "https://unreachable.example/fees" },
    ]);
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockRejectedValueOnce(new Error("network error"));

    const result = await runLinkCheck(103, { db: asLinkCheckDb(db), fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ checked: 0, unavailable: 0, failed: 1 });
    expect(result.results[0]).toMatchObject({ outcome: "failed", statusCode: null, reason: "network error", retried: true });

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

  it("skips a candidate whose document URL is not http/https without calling fetch", async () => {
    const db = createDbMock([{ id: 510, institution_id: 11, document_url: "ftp://example.com/fees" }]);
    const fetchImpl = vi.fn();

    const result = await runLinkCheck(115, { db: asLinkCheckDb(db), fetchImpl });

    expect(result).toMatchObject({ skipped: 1, processed: 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("selects only documents backing an approved published fee, oldest-checked first, bounded by an explicit limit", async () => {
    const db = createDbMock([]);
    const fetchImpl = vi.fn();

    await runLinkCheck(105, { db: asLinkCheckDb(db), fetchImpl, limit: 77 });

    const sqlText = templateText(db.mock.calls[0][0]);
    expect(sqlText).toContain("FROM source_documents");
    expect(sqlText).toContain("published_fee_catalog");
    expect(sqlText).toContain("pfc.source_document_id = sd.id");
    expect(sqlText).toContain("review_status = 'approved'");
    expect(sqlText).toContain("last_checked_at ASC NULLS FIRST");
  });

  it("defaults the limit to 50 and clamps an oversized limit to 200", async () => {
    const db = createDbMock([]);
    const fetchImpl = vi.fn();

    const defaultResult = await runLinkCheck(106, { db: asLinkCheckDb(db), fetchImpl });
    expect(defaultResult.limit).toBe(50);

    const clampedResult = await runLinkCheck(116, { db: asLinkCheckDb(db), fetchImpl, limit: 9000 });
    expect(clampedResult.limit).toBe(200);
  });

  it("stops early once the wall-clock budget is exhausted and reports checked/remaining/stoppedEarly", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const db = createDbMock([
        { id: 601, institution_id: 1, document_url: "https://a.example/fees" },
        { id: 602, institution_id: 2, document_url: "https://b.example/fees" },
        { id: 603, institution_id: 3, document_url: "https://c.example/fees" },
      ]);
      let call = 0;
      const fetchImpl = vi.fn().mockImplementation(async () => {
        call += 1;
        // Simulate each check taking 40s of wall-clock time.
        vi.setSystemTime(call * 40_000);
        return new Response(null, { status: 200 });
      });

      const result = await runLinkCheck(117, {
        db: asLinkCheckDb(db),
        fetchImpl,
        maxDurationMs: 60_000,
      });

      expect(result.selected).toBe(3);
      expect(result.processed).toBe(2);
      expect(result.checked).toBe(2);
      expect(result.remaining).toBe(1);
      expect(result.stoppedEarly).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not stop early when the budget is not exhausted", async () => {
    const db = createDbMock([
      { id: 604, institution_id: 4, document_url: "https://a.example/fees" },
    ]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await runLinkCheck(118, {
      db: asLinkCheckDb(db),
      fetchImpl,
      maxDurationMs: 60_000,
    });

    expect(result.stoppedEarly).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
