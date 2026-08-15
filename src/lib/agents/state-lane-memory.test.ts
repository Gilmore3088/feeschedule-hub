import { describe, expect, it, vi } from "vitest";

import {
  applyStateSourceMemoryCorrection,
  getAtlasStateLaneDispatch,
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

  it("surfaces per-state public discovery counts in Atlas lane dispatch", async () => {
    const now = new Date("2026-08-15T20:00:00.000Z");
    const db = vi.fn((strings: TemplateStringsArray) => {
      const text = templateText(strings);
      if (text.includes("WITH lane_base AS")) {
        return Promise.resolve([{
          total_lanes: "2",
          due_lanes: "1",
          running_lanes: "0",
          attention_lanes: "1",
          total_missing_urls: "3",
          total_stale_sources: "4",
          total_ocr_backlog: "1",
          total_manual_backlog: "2",
          total_failures: "5",
          total_corrections: "6",
          total_public_findings: "8",
          total_critical_public_findings: "2",
          next_due_after: now,
          latest_run_at: now,
        }]);
      }
      if (text.includes("AS lane_status")) {
        return Promise.resolve([
          {
            state_code: "CA",
            priority_score: "90",
            backlog_missing_urls: "3",
            backlog_stale_sources: "4",
            backlog_ocr: "1",
            backlog_manual_review: "2",
            failure_count: "5",
            correction_count: "6",
            public_findings: "8",
            critical_public_findings: "2",
            last_agent_run_id: "700",
            last_run_at: now,
            last_success_at: now,
            next_run_after: now,
            active_run_id: null,
            active_run_status: null,
            lane_status: "attention",
          },
        ]);
      }
      if (text.includes("SELECT state_code")) {
        return Promise.resolve([{ state_code: "CA" }, { state_code: "WA" }]);
      }
      return Promise.resolve([]);
    });

    const dispatch = await getAtlasStateLaneDispatch(asStateLaneDb(db));

    expect(dispatch).toMatchObject({
      schemaReady: true,
      totalLanes: 2,
      dueLanes: 1,
      attentionLanes: 1,
      totalPublicFindings: 8,
      totalCriticalPublicFindings: 2,
      rows: [
        expect.objectContaining({
          stateCode: "CA",
          status: "attention",
          publicFindings: 8,
          criticalPublicFindings: 2,
          failures: 5,
        }),
      ],
      stateOptions: [
        { stateCode: "CA", name: "California" },
        { stateCode: "WA", name: "Washington" },
      ],
    });
    const calls = db.mock.calls as unknown as Array<unknown[]>;
    const sqlText = calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).toContain("LEFT JOIN LATERAL");
    expect(sqlText).toContain("public.public_discovery_findings finding");
    expect(sqlText).toContain("finding.state_code = lane.state_code");
    expect(sqlText).toContain("finding.verified_status = 'unverified'");
    expect(sqlText).toContain("critical_public_findings");
  });

  it("locks corrected source memory and appends correction history within one state", async () => {
    const db = vi.fn((strings: TemplateStringsArray) => {
      const text = templateText(strings);
      if (text.includes("FROM public.institution_sources inst") && text.includes("LEFT JOIN public.institution_source_profiles")) {
        return Promise.resolve([{
          id: "42",
          state_code: "CA",
          fee_schedule_url: "https://old.example/fees",
          document_type: "html",
          canonical_source_url: "https://old.example/fees",
          source_kind: "html",
          read_strategy: "html_dom",
          correction_version: "1",
        }]);
      }
      if (text.includes("INSERT INTO public.institution_source_profiles")) {
        return Promise.resolve([{ correction_version: "2" }]);
      }
      if (text.includes("UPDATE public.institution_sources")) return Promise.resolve([]);
      if (text.includes("INSERT INTO public.institution_source_corrections")) {
        return Promise.resolve([{ id: "8001" }]);
      }
      if (text.includes("INSERT INTO public.agent_state_lanes")) return Promise.resolve([]);
      if (text.includes("UPDATE public.agent_state_lanes")) return Promise.resolve([]);
      if (text.includes("FROM public.agent_state_lanes")) {
        return Promise.resolve([{
          missing_urls: "0",
          stale_sources: "0",
          ocr_backlog: "0",
          manual_backlog: "0",
          failures: "0",
          corrections: "1",
        }]);
      }
      return Promise.resolve([]);
    });

    const result = await applyStateSourceMemoryCorrection({
      institutionId: 42,
      stateCode: "ca",
      canonicalSourceUrl: "https://new.example/fees.pdf#page=2",
      sourceKind: "pdf",
      readStrategy: "pdf_text",
      reason: "Official fee PDF found by operator",
      correctedBy: "atlas.admin",
      db: asStateLaneDb(db),
    });

    expect(result).toEqual({
      success: true,
      institutionId: 42,
      stateCode: "CA",
      correctionId: 8001,
      correctionVersion: 2,
    });
    const calls = db.mock.calls as unknown as Array<unknown[]>;
    const sqlText = calls.map((call) => templateText(call[0])).join("\n");
    expect(sqlText).toContain("WHERE inst.id =");
    expect(sqlText).toContain("AND upper(btrim(inst.state_code)) =");
    expect(sqlText).toContain("locked_by_correction");
    expect(sqlText).toContain("INSERT INTO public.institution_source_corrections");
    expect(sqlText).toContain("before_value");
    expect(sqlText).toContain("after_value");
    expect(sqlText).toContain("UPDATE public.institution_sources");
    expect(sqlText).toContain("INSERT INTO public.agent_state_lanes");
    expect(calls[0]?.[1]).toBe(42);
    expect(calls[0]?.[2]).toBe("CA");
    expect(calls[1]?.[3]).toBe("https://new.example/fees.pdf");
    expect(calls[1]?.[4]).toBe("pdf");
    expect(calls[1]?.[5]).toBe("pdf_text");
    expect(calls[3]?.[2]).toBe("canonical_source_url");
    expect(calls[3]?.[5]).toBe("Official fee PDF found by operator");
    expect(calls[3]?.[6]).toBe("atlas.admin");
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
