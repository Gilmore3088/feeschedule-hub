import { createHash } from "crypto";
import { describe, expect, it, vi } from "vitest";

import { runMagellanFetch } from "./fetch";

type DbMock = ReturnType<typeof vi.fn>;

function templateText(strings: unknown): string {
  return Array.isArray(strings) ? strings.join(" ") : String(strings);
}

function createDbMock(rows: Array<Record<string, unknown>>): DbMock {
  return vi.fn((strings: TemplateStringsArray) => {
    const text = templateText(strings);
    if (text.includes("FROM institution_sources")) return Promise.resolve(rows);
    return Promise.resolve([]);
  });
}

function asFetchDb(db: DbMock): NonNullable<Parameters<typeof runMagellanFetch>[0]["db"]> {
  return db as unknown as NonNullable<Parameters<typeof runMagellanFetch>[0]["db"]>;
}

function response(body: string, contentType = "text/html", status = 200): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

describe("Magellan agentic fetch", () => {
  it("fetches a source document and writes crawl result plus target health", async () => {
    const body = "monthly maintenance fee overdraft fee";
    const db = createDbMock([
      {
        id: 42,
        institution_name: "Test Bank",
        fee_schedule_url: "https://testbank.example/fees",
        asset_size: "1000000",
        last_crawl_at: null,
        consecutive_failures: 0,
      },
    ]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(body));

    const result = await runMagellanFetch({
      runId: 101,
      limit: 500,
      db: asFetchDb(db),
      fetchImpl,
    });

    expect(result).toMatchObject({
      selected: 1,
      processed: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
      bytes: body.length,
      limit: 50,
      dryRun: false,
    });
    expect(result.results[0]).toMatchObject({
      institutionId: 42,
      outcome: "success",
      finalUrl: "https://testbank.example/fees",
      statusCode: 200,
      documentType: "html",
      contentHash: createHash("sha256").update(body).digest("hex"),
    });

    const sqlText = db.mock.calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).toContain("INSERT INTO source_documents");
    expect(sqlText).toContain("UPDATE institution_sources");
    expect(sqlText).toContain("last_success_at = NOW()");
  });

  it("keeps dry runs read-only while still reporting fetched documents", async () => {
    const db = createDbMock([
      {
        id: 43,
        institution_name: "Dry Run CU",
        fee_schedule_url: "https://dryrun.example/schedule-of-fees.pdf",
        asset_size: "1000",
        last_crawl_at: null,
        consecutive_failures: 0,
      },
    ]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(response("%PDF", "application/pdf"));

    const result = await runMagellanFetch({
      runId: 102,
      dryRun: true,
      db: asFetchDb(db),
      fetchImpl,
    });

    expect(result.succeeded).toBe(1);
    expect(result.results[0].documentType).toBe("pdf");
    expect(db).toHaveBeenCalledTimes(1);
  });

  it("records failed source fetches and increments target failure state", async () => {
    const db = createDbMock([
      {
        id: 44,
        institution_name: "Broken Bank",
        fee_schedule_url: "https://broken.example/fees",
        asset_size: "500",
        last_crawl_at: null,
        consecutive_failures: 2,
      },
    ]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(response("missing", "text/html", 404));

    const result = await runMagellanFetch({
      runId: 103,
      db: asFetchDb(db),
      fetchImpl,
    });

    expect(result).toMatchObject({
      selected: 1,
      processed: 1,
      succeeded: 0,
      failed: 1,
      skipped: 0,
    });
    expect(result.results[0]).toMatchObject({
      outcome: "failed",
      statusCode: 404,
      reason: "HTTP 404",
    });

    const sqlText = db.mock.calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).toContain("INSERT INTO source_documents");
    expect(sqlText).toContain("consecutive_failures = COALESCE(consecutive_failures, 0) + 1");
    expect(sqlText).toContain("agentic_fetch_failed");
  });

  it("rotates fetch work by retry window instead of immediately retrying failures", async () => {
    const db = createDbMock([]);
    const fetchImpl = vi.fn();

    await runMagellanFetch({
      runId: 104,
      db: asFetchDb(db),
      fetchImpl,
    });

    const sqlText = templateText(db.mock.calls[0][0]);
    expect(sqlText).not.toContain("OR consecutive_failures > 0");
    expect(sqlText).toContain("WHEN COALESCE(inst.consecutive_failures, 0) >= 3 THEN INTERVAL '7 days'");
    expect(sqlText).toContain("WHEN COALESCE(inst.consecutive_failures, 0) > 0 THEN INTERVAL '24 hours'");
    expect(sqlText).toContain("inst.last_crawl_at ASC NULLS FIRST");
    expect(sqlText).toContain("COALESCE(inst.consecutive_failures, 0) ASC");
  });

  it("filters fetch candidates by state lane and profile memory", async () => {
    const db = createDbMock([]);
    const fetchImpl = vi.fn();

    await runMagellanFetch({
      runId: 105,
      stateCode: "WA",
      db: asFetchDb(db),
      fetchImpl,
    });

    const sqlText = templateText(db.mock.calls[0][0]);
    expect(sqlText).toContain("upper(btrim(inst.state_code))");
    expect(sqlText).toContain("institution_source_profiles");
    expect(sqlText).toContain("profile.canonical_source_url IS NOT NULL");
    expect(sqlText).toContain("COALESCE(profile.read_strategy, '') <> 'manual_review'");
  });
});
