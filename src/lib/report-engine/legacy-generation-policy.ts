import type { ReportType } from "./types";

export const LEGACY_GENERATABLE_REPORT_TYPES = [
  "national_index",
  "state_index",
  "monthly_pulse",
] as const;

const LEGACY_GENERATABLE_REPORT_TYPE_SET: ReadonlySet<string> = new Set(
  LEGACY_GENERATABLE_REPORT_TYPES,
);

export type LegacyGeneratableReportType =
  (typeof LEGACY_GENERATABLE_REPORT_TYPES)[number];

export function isLegacyGeneratableReportType(
  value: unknown,
): value is LegacyGeneratableReportType {
  return (
    typeof value === "string" &&
    LEGACY_GENERATABLE_REPORT_TYPE_SET.has(value)
  );
}

export function assertLegacyGeneratableReportType(
  reportType: ReportType,
): { ok: true } | { ok: false; error: string } {
  if (isLegacyGeneratableReportType(reportType)) {
    return { ok: true };
  }

  return {
    ok: false,
    error:
      "Legacy peer brief generation has moved to Hamilton Reports because peer briefs require a selected institution, evidence policy, and peer baseline. Use /pro/reports?intent=peer-brief instead.",
  };
}

export function legacyReportTypeError(): string {
  return `Invalid report_type. Legacy report jobs can only generate: ${LEGACY_GENERATABLE_REPORT_TYPES.join(", ")}. Peer briefs now use Hamilton Reports with institution-aware evidence gates.`;
}
