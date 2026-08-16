import { formatAssets, formatCompactDollars } from "@/lib/format";
import type { ReportSummaryResponse } from "@/lib/hamilton/types";

export interface InsufficientEvidenceReportParams {
  institutionName: string;
  period: string;
  statusLabel: string;
  verifiedCount: number;
  provisionalCount: number;
  assetSize: number | null;
  latestSourceStatus: string | null;
  latestFinancial: {
    report_date: string;
    total_assets: number | null;
    service_charge_income: number | null;
  } | null;
}

export function buildInsufficientEvidenceReport(
  params: InsufficientEvidenceReportParams,
): ReportSummaryResponse {
  const financialSummary = params.latestFinancial
    ? `Financial context is available through ${params.latestFinancial.report_date}: assets are ${formatCompactDollars(params.latestFinancial.total_assets)} and reported service charge income is ${formatCompactDollars(params.latestFinancial.service_charge_income)}.`
    : "Financial context is not available in the current dataset.";

  return {
    title: `Data Readiness Brief - ${params.institutionName}`,
    executiveSummary: [
      `${params.institutionName} is tracked, but Hamilton does not have verified or provisional fee rows sufficient for a competitive fee brief.`,
      financialSummary,
      "A consulting-grade brief should start with source acquisition and validation before drawing pricing, peer-positioning, or revenue conclusions.",
    ],
    snapshot: [
      {
        label: "Fee evidence",
        current: `${params.verifiedCount} verified / ${params.provisionalCount} provisional`,
        proposed: "Submit and validate official source",
      },
      {
        label: "Publication status",
        current: params.statusLabel,
        proposed: "Ready or directional",
      },
      {
        label: "Assets",
        current: params.assetSize ? formatAssets(params.assetSize) : "N/A",
        proposed: "Use for peer-set selection",
      },
    ],
    strategicRationale:
      `${params.institutionName} should not receive a generic competitive position when fee evidence is empty. ` +
      "The next high-value work is deterministic: confirm the official fee schedule, extract rows, label evidence tier and confidence, then rerun peer deltas once benchmark-eligible rows exist.",
    tradeoffs: [
      {
        label: "Use now",
        value: "Identity, asset tier, financial context, and source diligence",
      },
      {
        label: "Do not use yet",
        value: "Fee benchmark score, pricing recommendations, or peer fee deltas",
      },
      {
        label: "Next diligence",
        value: "Official fee schedule URL, account type coverage, effective date, and row-level source labels",
      },
    ],
    recommendation:
      "Submit the official fee schedule, validate source coverage, classify extracted rows, then rerun a competitive positioning report with provisional-first evidence labels. Until then, keep the output as a diligence brief.",
    implementationNotes: [
      `Analysis period requested: ${params.period}`,
      `Latest source status: ${params.latestSourceStatus ?? "no source record"}`,
      "No provider generation was used for this thin-or-empty-evidence report.",
      "Verified benchmark conclusions must exclude provisional rows unless explicitly labeled otherwise.",
    ],
    exportControls: {
      pdfEnabled: true,
      shareEnabled: false,
    },
  };
}
