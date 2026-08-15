import { describe, expect, it, vi } from "vitest";

import {
  classifyPublicDiscoveryObservation,
  runPublicDiscoveryAudit,
  selectPublicDiscoveryRoutes,
} from "./public-discovery";

type DbMock = ReturnType<typeof vi.fn>;

function templateText(strings: unknown): string {
  return Array.isArray(strings) ? strings.join(" ") : String(strings);
}

function response(body: string, contentType = "text/html", status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": contentType },
  });
}

function createDbMock(): DbMock {
  return vi.fn((strings: TemplateStringsArray) => {
    const text = templateText(strings);
    if (text.includes("GROUP BY city")) return Promise.resolve([{ city: "Los Angeles" }]);
    if (text.includes("FROM public.institution_sources inst")) return Promise.resolve([{ id: 42 }]);
    if (text.includes("INSERT INTO public.public_discovery_observations")) {
      return Promise.resolve([{ id: 7001 }]);
    }
    return Promise.resolve([]);
  });
}

function asPublicDiscoveryDb(db: DbMock): NonNullable<NonNullable<Parameters<typeof runPublicDiscoveryAudit>[0]>["db"]> {
  return db as unknown as NonNullable<NonNullable<Parameters<typeof runPublicDiscoveryAudit>[0]>["db"]>;
}

describe("public discovery agent lane", () => {
  it("classifies deterministic render findings", () => {
    const findings = classifyPublicDiscoveryObservation({
      url: "https://feeinsight.test/broken",
      statusCode: 404,
      hasHorizontalOverflow: true,
      consoleErrorCount: 2,
      detail: {
        unlabeledInputCount: 1,
        visibleError: true,
        visibleErrorText: "Rendered page displayed a Server Components error.",
      },
    });

    expect(findings.map((finding) => finding.code)).toEqual([
      "not_found",
      "horizontal_overflow",
      "console_errors",
      "unlabeled_inputs",
      "visible_error",
    ]);
    expect(findings.filter((finding) => finding.severity === "critical")).toHaveLength(2);
  });

  it("selects bounded public routes for one state lane", async () => {
    const db = createDbMock();

    const routes = await selectPublicDiscoveryRoutes({
      stateCode: "ca",
      limit: 4,
      baseUrl: "https://feeinsight.test",
      db: asPublicDiscoveryDb(db),
    });

    expect(routes).toEqual([
      {
        stateCode: "CA",
        routeTemplate: "/research/state/[code]",
        url: "https://feeinsight.test/research/state/CA",
        source: "state",
      },
      {
        stateCode: "CA",
        routeTemplate: "/fees/city/[state]",
        url: "https://feeinsight.test/fees/city/ca",
        source: "state",
      },
      {
        stateCode: "CA",
        routeTemplate: "/fees/city/[state]/[city]",
        url: "https://feeinsight.test/fees/city/ca/los%20angeles",
        source: "city",
      },
      {
        stateCode: "CA",
        routeTemplate: "/institution/[id]",
        url: "https://feeinsight.test/institution/42",
        source: "institution",
      },
    ]);

    const sqlText = db.mock.calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).toContain("upper(btrim(state_code))");
    expect(sqlText).toContain("published_fee_catalog");
  });

  it("records public observations and findings without failing the audit on broken pages", async () => {
    const db = createDbMock();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response("<title>California</title><h1>California</h1><input name=\"q\">"))
      .mockResolvedValueOnce(response("missing", "text/html", 404))
      .mockResolvedValueOnce(response("An error occurred in the Server Components render."))
      .mockResolvedValueOnce(response("<title>Institution</title><h1>Institution profile</h1>"));

    const result = await runPublicDiscoveryAudit({
      runId: 901,
      stateCode: "CA",
      limit: 4,
      baseUrl: "https://feeinsight.test",
      db: asPublicDiscoveryDb(db),
      fetchImpl,
    });

    expect(result).toMatchObject({
      selected: 4,
      processed: 4,
      observed: 4,
      failed: 0,
      findings: 3,
      criticalFindings: 2,
      warningFindings: 1,
      routeTemplates: 4,
      dryRun: false,
    });
    expect(result.routes.map((route) => route.findingCodes)).toEqual([
      ["unlabeled_inputs"],
      ["not_found"],
      ["visible_error"],
      [],
    ]);

    const sqlText = db.mock.calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).toContain("INSERT INTO public.public_discovery_observations");
    expect(sqlText).toContain("INSERT INTO public.public_discovery_findings");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("keeps dry-run audits read-only and network-free", async () => {
    const db = createDbMock();
    const fetchImpl = vi.fn();

    const result = await runPublicDiscoveryAudit({
      stateCode: "WA",
      limit: 2,
      baseUrl: "https://feeinsight.test",
      db: asPublicDiscoveryDb(db),
      fetchImpl,
      dryRun: true,
    });

    expect(result).toMatchObject({
      selected: 2,
      processed: 0,
      observed: 0,
      failed: 0,
      findings: 0,
      dryRun: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    const sqlText = db.mock.calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).not.toContain("INSERT INTO public.public_discovery_observations");
  });
});
