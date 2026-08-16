import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyzeResponse } from "@/lib/hamilton/types";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canAccessPremium: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/access", () => ({
  canAccessPremium: mocks.canAccessPremium,
}));

vi.mock("@/lib/data-store/connection", () => ({
  sql: mocks.sql,
}));

const responseJson: AnalyzeResponse = {
  title: "Wire fee position",
  confidence: { level: "medium", basis: [] },
  hamiltonView: "The $35 wire fee is provisional.",
  whatThisMeans: "Treat this as directional until approval.",
  whyItMatters: ["Provisional rows are excluded from verified scoring."],
  evidence: { metrics: [{ label: "Wire fee", value: "$35 provisional" }] },
  exploreFurther: ["Validate the source document."],
};

function saveParams(institutionId: string) {
  return {
    institutionId,
    analysisFocus: "Peer Compare",
    prompt: "Analyze wire fees",
    responseJson,
  };
}

describe("Analyze saveAnalysis", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: 7, role: "premium" });
    mocks.canAccessPremium.mockReturnValue(true);
    mocks.sql.mockResolvedValue([{ id: "analysis-1" }]);
  });

  it("persists canonical numeric selected institution IDs", async () => {
    const { saveAnalysis } = await import("@/app/pro/(hamilton)/analyze/actions");

    const result = await saveAnalysis(saveParams(" 2945 "));

    expect(result).toEqual({ id: "analysis-1" });
    expect(mocks.sql.mock.calls[0][2]).toBe("2945");
  });

  it("does not persist profile-name slugs as institution identity", async () => {
    const { saveAnalysis } = await import("@/app/pro/(hamilton)/analyze/actions");

    const result = await saveAnalysis(saveParams("first-national-bank"));

    expect(result).toEqual({ id: "analysis-1" });
    expect(mocks.sql.mock.calls[0][2]).toBe("");
  });

  it("loads saved analysis metadata with a canonical institution fallback", async () => {
    const { loadAnalysisRecord } = await import("@/app/pro/(hamilton)/analyze/actions");
    mocks.sql.mockResolvedValue([
      {
        response_json: JSON.stringify(responseJson),
        institution_id: "2945",
      },
    ]);

    const result = await loadAnalysisRecord("00000000-0000-0000-0000-000000000001");

    expect(result).toEqual({
      responseJson,
      institutionId: "2945",
    });
  });

  it("does not restore profile-name slugs as saved analysis institution context", async () => {
    const { loadAnalysisRecord } = await import("@/app/pro/(hamilton)/analyze/actions");
    mocks.sql.mockResolvedValue([
      {
        response_json: JSON.stringify(responseJson),
        institution_id: "first-national-bank",
      },
    ]);

    const result = await loadAnalysisRecord("00000000-0000-0000-0000-000000000001");

    expect(result).toEqual({
      responseJson,
      institutionId: null,
    });
  });
});
