import { describe, expect, it } from "vitest";
import {
  REPORT_BANNED_GENERIC_PHRASES,
  validateHamiltonReportArtifact,
} from "@/lib/hamilton/report-quality";
import type { ReportSummaryResponse } from "@/lib/hamilton/types";

function baseReport(overrides: Partial<ReportSummaryResponse> = {}): ReportSummaryResponse {
  return {
    title: "Competitive Positioning - Hamilton Federal Credit Union",
    executiveSummary: [
      "Hamilton Federal Credit Union has a $35 domestic wire row that is provisional.",
    ],
    snapshot: [
      {
        label: "wire transfer",
        current: "$35.00 provisional",
        proposed: "$20.00 Custom CU peers median",
      },
    ],
    strategicRationale:
      "The $35 domestic wire row is $15 above the $20 Custom CU peers median. Treat that conclusion as provisional.",
    tradeoffs: [
      {
        label: "wire transfer",
        value: "$35.00 vs $20.00 Custom CU peers median (+$15.00)",
      },
    ],
    recommendation:
      "Use the $35 wire row as a provisional diligence lead until the source is approved.",
    implementationNotes: [
      "Selected institution evidence policy: provisional-first",
      "Verified benchmark conclusions exclude provisional rows unless explicitly labeled otherwise.",
    ],
    exportControls: {
      pdfEnabled: true,
      shareEnabled: false,
    },
    ...overrides,
  };
}

describe("validateHamiltonReportArtifact", () => {
  it("accepts provisional-only selected-institution reports when caveats and labels are present", () => {
    const result = validateHamiltonReportArtifact({
      report: baseReport(),
      selectedInstitutionId: 2945,
      selectedFeeDeltas: [{ evidence_tier: "provisional" }],
      canGenerateVerifiedBenchmarkConclusions: false,
    });

    expect(result).toEqual({ ok: true });
  });

  it("rejects generic consulting phrases before saving a report", () => {
    const result = validateHamiltonReportArtifact({
      report: baseReport({
        recommendation: `Use this category to ${REPORT_BANNED_GENERIC_PHRASES[7]}.`,
      }),
      selectedInstitutionId: 2945,
      selectedFeeDeltas: [{ evidence_tier: "provisional" }],
      canGenerateVerifiedBenchmarkConclusions: false,
    });

    expect(result).toEqual({
      ok: false,
      error:
        'Report artifact failed quality gate: generic phrase "create sustainable competitive advantage" is not allowed.',
    });
  });

  it("rejects provisional-only reports that present a verified benchmark claim", () => {
    const result = validateHamiltonReportArtifact({
      report: baseReport({
        recommendation: "This $35 wire fee is a verified benchmark score.",
      }),
      selectedInstitutionId: 2945,
      selectedFeeDeltas: [{ evidence_tier: "provisional" }],
      canGenerateVerifiedBenchmarkConclusions: false,
    });

    expect(result).toEqual({
      ok: false,
      error:
        "Report artifact failed quality gate: provisional-only evidence cannot be presented as a verified benchmark conclusion.",
    });
  });

  it("rejects selected-institution delta reports without labeled snapshot rows", () => {
    const result = validateHamiltonReportArtifact({
      report: baseReport({
        snapshot: [
          {
            label: "wire transfer",
            current: "$35.00",
            proposed: "$20.00 Custom CU peers median",
          },
        ],
      }),
      selectedInstitutionId: 2945,
      selectedFeeDeltas: [{ evidence_tier: "provisional" }],
      canGenerateVerifiedBenchmarkConclusions: false,
    });

    expect(result).toEqual({
      ok: false,
      error:
        "Report artifact failed quality gate: selected-institution snapshot rows must label verified or provisional evidence.",
    });
  });
});
