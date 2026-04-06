/**
 * National Quarterly Report — HTML Template
 *
 * Pure function: (payload, narratives) => HTML string.
 * No async, no AI calls — narratives are pre-computed and injected (D-11).
 *
 * Rigid section order (never reorder):
 *   1. Cover page
 *   2. Executive Summary — Hamilton narrative
 *   3. Page break
 *   4. National Index Table — Hamilton narrative + 49-category data table
 *   5. Charter Analysis — conditional (both bank and CU data present)
 *   6. District Economic Context — conditional (district_headlines + narrative present)
 *   7. Methodology footnote
 */

import {
  wrapReport,
  coverPage,
  sectionHeader,
  dataTable,
  hamiltonNarrativeBlock,
  footnote,
  pageBreak,
} from "../index";
import type { NationalQuarterlyPayload, NationalQuarterlySection } from "../../report-assemblers/national-quarterly";
import type { GenerateSectionOutput } from "../../hamilton/types";

// ─── Input Type ────────────────────────────────────────────────────────────────

export interface NationalQuarterlyReportInput {
  data: NationalQuarterlyPayload;
  narratives: {
    executive_summary: GenerateSectionOutput;
    national_index: GenerateSectionOutput;
    /** Only included when both bank_count and cu_count > 0 across categories (D-03) */
    charter_analysis?: GenerateSectionOutput;
    /** Beige Book district context woven into analysis (D-04) */
    district_context?: GenerateSectionOutput;
  };
}

// ─── Table Column Definitions ──────────────────────────────────────────────────

const NATIONAL_INDEX_COLUMNS = [
  { key: "display_name", label: "Fee Category", align: "left" as const },
  { key: "median_amount", label: "Median", align: "right" as const, format: "amount" as const },
  { key: "p25_amount", label: "P25", align: "right" as const, format: "amount" as const },
  { key: "p75_amount", label: "P75", align: "right" as const, format: "amount" as const },
  { key: "institution_count", label: "Institutions", align: "right" as const, format: "integer" as const },
  { key: "maturity_tier", label: "Maturity", align: "left" as const },
];

const CHARTER_COLUMNS = [
  { key: "display_name", label: "Fee Category", align: "left" as const },
  { key: "bank_median", label: "Bank Median", align: "right" as const, format: "amount" as const },
  { key: "cu_median", label: "CU Median", align: "right" as const, format: "amount" as const },
  { key: "bank_count", label: "Bank Institutions", align: "right" as const, format: "integer" as const },
  { key: "cu_count", label: "CU Institutions", align: "right" as const, format: "integer" as const },
];

const DISTRICT_COLUMNS = [
  { key: "district", label: "Fed District", align: "left" as const, format: "integer" as const },
  { key: "headline", label: "Economic Headline", align: "left" as const },
];

// ─── Row Converters ────────────────────────────────────────────────────────────

function toNationalRow(c: NationalQuarterlySection): Record<string, string | number | null> {
  return {
    display_name: c.display_name,
    median_amount: c.median_amount,
    p25_amount: c.p25_amount,
    p75_amount: c.p75_amount,
    institution_count: c.institution_count,
    maturity_tier: c.maturity_tier,
  };
}

function toCharterRow(c: NationalQuarterlySection): Record<string, string | number | null> {
  return {
    display_name: c.display_name,
    bank_median: c.bank_median,
    cu_median: c.cu_median,
    bank_count: c.bank_count,
    cu_count: c.cu_count,
  };
}

// ─── Renderer ──────────────────────────────────────────────────────────────────

export function renderNationalQuarterlyReport(input: NationalQuarterlyReportInput): string {
  const { data, narratives } = input;

  // Section 1: Cover page
  const cover = coverPage({
    title: "National Fee Index",
    subtitle: `${data.total_institutions.toLocaleString()} Institutions — ${data.quarter}`,
    report_date: new Date(data.report_date).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    series: `National Quarterly Report — ${data.quarter}`,
  });

  // Section 2: Executive Summary
  const execSummary = [
    sectionHeader({
      label: "Executive Summary",
      title: "National Fee Landscape — Key Findings",
    }),
    hamiltonNarrativeBlock(narratives.executive_summary.narrative),
  ].join("\n");

  // Section 3: Page break
  const break1 = pageBreak();

  // Section 4: National Index Table
  const nationalTable = [
    sectionHeader({
      label: "National Fee Index",
      title: "49-Category Benchmark — Medians, Distributions, Coverage",
    }),
    hamiltonNarrativeBlock(narratives.national_index.narrative),
    dataTable({
      columns: NATIONAL_INDEX_COLUMNS,
      rows: data.categories.map(toNationalRow),
      caption: `${data.total_institutions.toLocaleString()} institutions — as of ${data.report_date}`,
    }),
  ].join("\n");

  // Section 5: Charter Analysis — conditional
  const hasCharterData = data.categories.some((c) => c.bank_count > 0 && c.cu_count > 0);
  const charterSection =
    hasCharterData && narratives.charter_analysis
      ? [
          sectionHeader({
            label: "Charter Analysis",
            title: "Banks and Credit Unions Diverge on Key Fee Categories",
          }),
          hamiltonNarrativeBlock(narratives.charter_analysis.narrative),
          dataTable({
            columns: CHARTER_COLUMNS,
            rows: data.categories
              .filter((c) => c.bank_count > 0 && c.cu_count > 0)
              .map(toCharterRow),
            caption: "Categories with both bank and credit union observations",
          }),
        ].join("\n")
      : "";

  // Section 6: District Economic Context — conditional
  const districtSection =
    data.district_headlines.length > 0 && narratives.district_context
      ? [
          sectionHeader({
            label: "Economic Context",
            title: "Fed District Conditions Shaping Fee Pressure",
          }),
          hamiltonNarrativeBlock(narratives.district_context.narrative),
          dataTable({
            columns: DISTRICT_COLUMNS,
            rows: data.district_headlines.map((h) => ({
              district: h.district,
              headline: h.headline,
            })),
            caption: "Federal Reserve Beige Book — Summary of Economic Activity by District",
          }),
        ].join("\n")
      : "";

  // Section 7: Methodology footnote
  const methodologyText = [
    "National medians computed from all non-rejected fee observations in the Bank Fee Index pipeline.",
    `Maturity: "strong" = 10+ approved observations; "provisional" = 10+ total; "insufficient" = below threshold.`,
    "Charter split computed from charter_type field on crawl_targets.",
    "Fed economic context sourced from Federal Reserve Beige Book.",
    `Bank Fee Index \u2014 bankfeeindex.com \u2014 Generated ${data.report_date}`,
  ].join(" ");

  const body = [
    cover,
    execSummary,
    break1,
    nationalTable,
    charterSection,
    districtSection,
    footnote(methodologyText),
  ]
    .filter(Boolean)
    .join("\n\n");

  return wrapReport(body, {
    title: "National Fee Index",
    author: "Bank Fee Index \u2014 Hamilton",
    date: data.report_date,
  });
}
