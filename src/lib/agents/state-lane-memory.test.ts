import { describe, expect, it, vi } from "vitest";

import { getStatePublicDiscoveryFindings } from "./state-lane-memory";

type DbMock = ReturnType<typeof vi.fn>;

function templateText(strings: unknown): string {
  return Array.isArray(strings) ? strings.join(" ") : String(strings);
}

function asStateLaneDb(db: DbMock): NonNullable<Parameters<typeof getStatePublicDiscoveryFindings>[2]> {
  return db as unknown as NonNullable<Parameters<typeof getStatePublicDiscoveryFindings>[2]>;
}

describe("state lane memory", () => {
  it("loads open public discovery findings for one state lane", async () => {
    const observedAt = new Date("2026-08-15T18:00:00.000Z");
    const db = vi.fn(() => Promise.resolve([
      {
        id: "9001",
        state_code: "CA",
        route_template: "/fees/city/[state]/[city]",
        url: "https://feeinsight.test/fees/city/ca/los-angeles",
        issue_code: "visible_error",
        severity: "critical",
        verified_status: "unverified",
        message: "Rendered page displayed a Server Components error.",
        evidence: {
          darwin_cluster_size: 4,
          systemic_candidate: true,
        },
        agent_run_id: "700",
        observation_id: "800",
        status_code: 500,
        final_url: "https://feeinsight.test/fees/city/ca/los-angeles",
        viewport: "desktop",
        h1: null,
        title: "Error",
        observed_at: observedAt,
        created_at: observedAt,
        updated_at: observedAt,
      },
    ]));

    const findings = await getStatePublicDiscoveryFindings("ca", { limit: 3 }, asStateLaneDb(db));

    expect(findings).toEqual([
      expect.objectContaining({
        id: 9001,
        stateCode: "CA",
        routeTemplate: "/fees/city/[state]/[city]",
        issueCode: "visible_error",
        severity: "critical",
        verifiedStatus: "unverified",
        agentRunId: 700,
        observationId: 800,
        statusCode: 500,
        clusterSize: 4,
        systemicCandidate: true,
        observedAt: "2026-08-15T18:00:00.000Z",
      }),
    ]);
    const calls = db.mock.calls as unknown as Array<unknown[]>;
    const sqlText = calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).toContain("FROM public.public_discovery_findings finding");
    expect(sqlText).toContain("finding.state_code =");
    expect(sqlText).toContain("finding.verified_status = 'unverified'");
    expect(calls[0]?.[1]).toBe("CA");
    expect(calls[0]?.[2]).toBe(3);
  });

  it("does not query for invalid state codes", async () => {
    const db = vi.fn();

    await expect(getStatePublicDiscoveryFindings("california", {}, asStateLaneDb(db))).resolves.toEqual([]);

    expect(db).not.toHaveBeenCalled();
  });
});
