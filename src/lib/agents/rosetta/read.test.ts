import { createHash } from "crypto";
import { describe, expect, it, vi } from "vitest";

import { runRosettaRead } from "./read";

type DbMock = ReturnType<typeof vi.fn> & { unsafe: ReturnType<typeof vi.fn> };

function templateText(strings: unknown): string {
  return Array.isArray(strings) ? strings.join(" ") : String(strings);
}

function createDbMock(rows: Array<Record<string, unknown>>): DbMock {
  const db = vi.fn(() => Promise.resolve([])) as DbMock;
  db.unsafe = vi.fn((query: string) => {
    if (query.includes("FROM crawl_results")) return Promise.resolve(rows);
    return Promise.resolve([]);
  });
  return db;
}

function asReadDb(db: DbMock): NonNullable<Parameters<typeof runRosettaRead>[0]["db"]> {
  return db as unknown as NonNullable<Parameters<typeof runRosettaRead>[0]["db"]>;
}

function response(body: string, contentType = "text/html", status = 200): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

const htmlCandidate = {
  crawl_result_id: 501,
  crawl_target_id: 42,
  institution_name: "Test Bank",
  document_url: "https://testbank.example/fees",
  content_hash: "source-hash",
};

describe("Rosetta agentic read", () => {
  it("normalizes fetched HTML into an internal text artifact", async () => {
    const body = `
      <main>
        <h1>Schedule of Fees</h1>
        <p>Monthly maintenance fee $5</p>
        <script>window.noise = true</script>
      </main>
    `;
    const db = createDbMock([htmlCandidate]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(body));

    const result = await runRosettaRead({
      runId: 101,
      limit: 500,
      db: asReadDb(db),
      fetchImpl,
    });

    expect(result).toMatchObject({
      selected: 1,
      processed: 1,
      completed: 1,
      empty: 0,
      needsOcr: 0,
      failed: 0,
      skipped: 0,
      limit: 50,
      dryRun: false,
    });
    expect(result.results[0]).toMatchObject({
      crawlResultId: 501,
      crawlTargetId: 42,
      status: "completed",
      documentType: "html",
      textHash: createHash("sha256")
        .update("Schedule of Fees\n\nMonthly maintenance fee $5")
        .digest("hex"),
    });

    const sqlText = db.mock.calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).toContain("INSERT INTO agent_document_texts");
    expect(JSON.stringify(db.mock.calls)).toContain("Monthly maintenance fee $5");
    expect(JSON.stringify(db.mock.calls)).not.toContain("window.noise");
  });

  it("keeps dry runs read-only while still reporting normalized text", async () => {
    const db = createDbMock([htmlCandidate]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(response("<p>Overdraft fee $35</p>"));

    const result = await runRosettaRead({
      runId: 102,
      dryRun: true,
      db: asReadDb(db),
      fetchImpl,
    });

    expect(result.completed).toBe(1);
    expect(result.dryRun).toBe(true);
    expect(db.unsafe).toHaveBeenCalledTimes(1);
    expect(db).not.toHaveBeenCalled();
  });

  it("routes PDFs to OCR without making provider calls", async () => {
    const db = createDbMock([
      {
        ...htmlCandidate,
        crawl_result_id: 502,
        document_url: "https://testbank.example/schedule-of-fees.pdf",
      },
    ]);
    const fetchImpl = vi.fn();

    const result = await runRosettaRead({
      runId: 103,
      db: asReadDb(db),
      fetchImpl,
    });

    expect(result).toMatchObject({
      selected: 1,
      processed: 1,
      completed: 0,
      needsOcr: 1,
      failed: 0,
    });
    expect(result.results[0]).toMatchObject({
      crawlResultId: 502,
      status: "needs_ocr",
      documentType: "pdf",
      error: "PDF reading/OCR is not wired into Rosetta yet",
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    const sqlText = db.mock.calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).toContain("INSERT INTO agent_document_texts");
  });

  it("records failed reads for non-OK source responses", async () => {
    const db = createDbMock([htmlCandidate]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(response("missing", "text/html", 404));

    const result = await runRosettaRead({
      runId: 104,
      db: asReadDb(db),
      fetchImpl,
    });

    expect(result).toMatchObject({
      selected: 1,
      processed: 1,
      completed: 0,
      failed: 1,
    });
    expect(result.results[0]).toMatchObject({
      status: "failed",
      error: "HTTP 404",
    });

    const sqlText = db.mock.calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).toContain("INSERT INTO agent_document_texts");
  });
});
