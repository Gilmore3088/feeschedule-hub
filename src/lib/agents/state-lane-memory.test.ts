import { describe, expect, it, vi } from "vitest";

import {
  getStatePublicDiscoveryFindings,
  getStateSourceMemoryProfiles,
  updatePublicDiscoveryFindingDecision,
} from "./state-lane-memory";

type DbMock = ReturnType<typeof vi.fn>;

function templateText(strings: unknown): string {
  return Array.isArray(strings) ? strings.join(" ") : String(strings);
}

function asStateLaneDb(db: DbMock): NonNullable<Parameters<typeof getStatePublicDiscoveryFindings>[2]> {
  return db as unknown as NonNullable<Parameters<typeof getStatePublicDiscoveryFindings>[2]>;
}

describe("state lane memory", () => {
  it("loads state source memory with correction history and attention-first selectors", async () => {
    const updatedAt = new Date("2026-08-15T19:00:00.000Z");
    const db = vi.fn((strings: TemplateStringsArray) => {
      const text = templateText(strings);
      if (text.includes("INSERT INTO public.agent_state_lanes")) return Promise.resolve([]);
      if (text.includes("INSERT INTO public.institution_source_profiles")) return Promise.resolve([]);
      if (text.includes("UPDATE public.agent_state_lanes")) return Promise.resolve([]);
      if (text.includes("FROM public.agent_state_lanes")) {
        return Promise.resolve([{
          missing_urls: "0",
          stale_sources: "0",
          ocr_backlog: "0",
          manual_backlog: "0",
          failures: "0",
          corrections: "0",
        }]);
      }
      return Promise.resolve([
        {
          institution_id: "42",
          institution_name: "Test Bank",
          city: "Los Angeles",
          website_url: "https://bank.test",
          fee_schedule_url: "https://bank.test/fees",
          canonical_source_url: "https://bank.test/fees.pdf",
          source_kind: "pdf",
          read_strategy: "pdf_text",
          locked_by_correction: true,
          correction_version: "2",
          consecutive_failures: "1",
          last_failure_reason: "timeout",
          last_failure_at: updatedAt,
          last_success_at: updatedAt,
          last_successful_source_document_id: "701",
          last_successful_text_id: "801",
          updated_at: updatedAt,
          correction_count: "2",
          latest_correction_type: "canonical_source_url",
          latest_correction_at: updatedAt,
        },
      ]);
    });

    const rows = await getStateSourceMemoryProfiles("ca", { limit: 4 }, asStateLaneDb(db));

    expect(rows).toEqual([
      expect.objectContaining({
        institutionId: 42,
        institutionName: "Test Bank",
        sourceKind: "pdf",
        readStrategy: "pdf_text",
        lockedByCorrection: true,
        correctionVersion: 2,
        correctionCount: 2,
        latestCorrectionType: "canonical_source_url",
        consecutiveFailures: 1,
        lastSuccessfulSourceDocumentId: 701,
        lastSuccessfulTextId: 801,
      }),
    ]);
    const calls = db.mock.calls as unknown as Array<unknown[]>;
    const sqlText = calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).toContain("FROM public.institution_source_profiles profile");
    expect(sqlText).toContain("LEFT JOIN LATERAL");
    expect(sqlText).toContain("public.institution_source_corrections");
    expect(sqlText).toContain("WHERE profile.state_code =");
    expect(sqlText).toContain("profile.locked_by_correction IS TRUE");
    expect(calls.at(-1)?.[1]).toBe("CA");
    expect(calls.at(-1)?.[2]).toBe(4);
  });

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

  it("updates one open public discovery finding decision within the state lane", async () => {
    const db = vi.fn(() => Promise.resolve([
      {
        id: "9001",
        state_code: "CA",
        verified_status: "dismissed",
      },
    ]));

    const result = await updatePublicDiscoveryFindingDecision({
      findingId: 9001,
      stateCode: "ca",
      status: "dismissed",
      decidedByUserId: 12,
      decidedByUsername: "atlas.admin",
      db: asStateLaneDb(db),
    });

    expect(result).toEqual({
      success: true,
      findingId: 9001,
      stateCode: "CA",
      status: "dismissed",
    });
    const calls = db.mock.calls as unknown as Array<unknown[]>;
    const sqlText = calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).toContain("UPDATE public.public_discovery_findings");
    expect(sqlText).toContain("operator_decision");
    expect(sqlText).toContain("AND state_code =");
    expect(sqlText).toContain("AND verified_status = 'unverified'");
    expect(calls[0]?.[1]).toBe("dismissed");
    expect(calls[0]?.[3]).toBe(12);
    expect(calls[0]?.[5]).toBe(9001);
    expect(calls[0]?.[6]).toBe("CA");
  });

  it("returns a review error when the finding is already decided or out of scope", async () => {
    const db = vi.fn(() => Promise.resolve([]));

    const result = await updatePublicDiscoveryFindingDecision({
      findingId: 9001,
      stateCode: "CA",
      status: "verified",
      decidedByUserId: 12,
      db: asStateLaneDb(db),
    });

    expect(result).toMatchObject({
      success: false,
      error: "Public discovery finding was not found, was already reviewed, or belongs to another state.",
    });
  });
});
