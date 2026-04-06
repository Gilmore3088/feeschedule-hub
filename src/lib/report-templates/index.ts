/**
 * Public entry point for the report template system.
 *
 * Import from here rather than from individual base files:
 *   import { wrapReport, coverPage, hamiltonNarrativeBlock } from "@/lib/report-templates";
 */

export { wrapReport } from "./base/layout";
export type { ReportMetadata } from "./base/layout";

export {
  coverPage,
  sectionHeader,
  dataTable,
  chartContainer,
  pullQuote,
  footnote,
  hamiltonNarrativeBlock,
  pageBreak,
} from "./base/components";

export type {
  CoverPageProps,
  SectionHeaderProps,
  DataTableProps,
  DataTableColumn,
  ChartContainerProps,
} from "./base/components";

export { PALETTE, TYPOGRAPHY, REPORT_CSS } from "./base/styles";

// ─── Report Templates ──────────────────────────────────────────────────────────

export { renderPeerCompetitiveReport } from "./templates/peer-competitive";
export type { PeerCompetitiveReportInput } from "./templates/peer-competitive";

export { renderNationalOverviewReport } from "./templates/national-overview";
export type { NationalOverviewReportInput } from "./templates/national-overview";
