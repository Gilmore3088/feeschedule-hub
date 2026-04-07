/**
 * National Quarterly Report — HTML Template (5-Chapter Structure)
 *
 * Pure function: (input) => HTML string.
 * No async, no AI calls — narratives are pre-computed and injected.
 *
 * Chapter order (never reorder):
 *   Cover → TOC → Executive Summary →
 *   Ch1: Economic Landscape →
 *   Ch2: Revenue Landscape →
 *   Ch3: The Fee Index →
 *   Ch4: Market Structure →
 *   Ch5: Outlook & Implications →
 *   Methodology → Appendix
 */

import {
  wrapReport,
  coverPage,
  tableOfContents,
  statCardRow,
  keyFinding,
  horizontalBarChart,
  twoColumn,
  chapterDivider,
  numberedFindings,
  hamiltonNarrativeBlock,
  compactTable,
  dataTable,
  footnote,
  pageBreak,
} from "../index";

// ─── Input Type ────────────────────────────────────────────────────────────────

export interface NationalQuarterlyReportInput {
  data: {
    report_date: string;
    quarter: string;
    total_institutions: number;
    total_bank_institutions: number;
    total_cu_institutions: number;
    categories: Array<{
      fee_category: string;
      display_name: string;
      fee_family: string | null;
      median_amount: number | null;
      p25_amount: number | null;
      p75_amount: number | null;
      institution_count: number;
      maturity_tier: string;
      bank_median: number | null;
      cu_median: number | null;
      bank_count: number;
      cu_count: number;
    }>;
    revenue?: {
      latest_quarter: string;
      total_service_charges: number;
      yoy_change_pct: number | null;
      total_institutions: number;
      bank_service_charges: number;
      cu_service_charges: number;
    } | null;
    fred?: {
      fed_funds_rate: number | null;
      unemployment_rate: number | null;
      cpi_yoy_pct: number | null;
      consumer_sentiment: number | null;
      as_of: string;
    } | null;
    district_headlines: Array<{ district: number; headline: string; release_date: string }>;
  };
  narratives: {
    executive_summary: { narrative: string };
    economic_landscape: { narrative: string };
    revenue_landscape: { narrative: string };
    fee_index: { narrative: string };
    market_structure: { narrative: string };
    outlook: { narrative: string };
  };
}

// ─── Formatters ────────────────────────────────────────────────────────────────

function fmtFee(amount: number | null): string {
  if (amount === null) return "\u2014";
  return `$${amount.toFixed(2)}`;
}

function fmtBillions(amount: number): string {
  return `$${(amount / 1_000_000_000).toFixed(1)}B`;
}

function fmtPct(value: number | null, sign = false): string {
  if (value === null) return "\u2014";
  const prefix = sign && value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

// ─── Column Definitions ────────────────────────────────────────────────────────

const FEATURED_COLUMNS = [
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
  { key: "bank_count", label: "Bank Inst.", align: "right" as const, format: "integer" as const },
  { key: "cu_count", label: "CU Inst.", align: "right" as const, format: "integer" as const },
];

const APPENDIX_COLUMNS = [
  { key: "display_name", label: "Fee Category", align: "left" as const },
  { key: "fee_family", label: "Family", align: "left" as const },
  { key: "median_amount", label: "Median", align: "right" as const, format: "amount" as const },
  { key: "p25_amount", label: "P25", align: "right" as const, format: "amount" as const },
  { key: "p75_amount", label: "P75", align: "right" as const, format: "amount" as const },
  { key: "institution_count", label: "N", align: "right" as const, format: "integer" as const },
  { key: "maturity_tier", label: "Maturity", align: "left" as const },
];

// ─── Renderer ──────────────────────────────────────────────────────────────────

export function renderNationalQuarterlyReport(input: NationalQuarterlyReportInput): string {
  const { data, narratives } = input;

  const formattedDate = new Date(data.report_date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // ── Cover ──────────────────────────────────────────────────────────────────
  const cover = coverPage({
    title: "National Fee Index",
    subtitle: `${data.total_institutions.toLocaleString()} Institutions \u2014 ${data.quarter}`,
    report_date: formattedDate,
    series: `National Quarterly Report \u2014 ${data.quarter}`,
  });

  // ── Table of Contents ──────────────────────────────────────────────────────
  const toc = tableOfContents([
    { title: "Executive Summary", page: "3" },
    { title: "Chapter 1 \u2014 Economic Landscape", page: "4" },
    { title: "Chapter 2 \u2014 The Revenue Landscape", page: "5" },
    { title: "Chapter 3 \u2014 What Banks Charge", page: "6" },
    { title: "Chapter 4 \u2014 Market Structure", page: "8" },
    { title: "Chapter 5 \u2014 Outlook & Implications", page: "9" },
    { title: "Methodology", page: "10" },
    { title: "Appendix \u2014 Full 49-Category Index", page: "11" },
  ]);

  // ── Executive Summary ──────────────────────────────────────────────────────
  const spotlightCategories = ["monthly_maintenance", "overdraft", "nsf", "atm_non_network", "card_foreign_txn", "wire_domestic_outgoing"];
  const spotlightData = data.categories.filter((c) => spotlightCategories.includes(c.fee_category));
  const medians = spotlightData
    .map((c) => c.median_amount)
    .filter((v): v is number => v !== null);
  const avgSpotlightMedian = medians.length > 0
    ? medians.reduce((a, b) => a + b, 0) / medians.length
    : null;

  const execKeyFindings = [
    {
      number: "01",
      title: "Spotlight Fees",
      detail: avgSpotlightMedian !== null
        ? `Average median across 6 spotlight categories is ${fmtFee(avgSpotlightMedian)}, spanning ${data.total_institutions.toLocaleString()} institutions.`
        : `Spotlight fee data covers ${data.total_institutions.toLocaleString()} institutions across 49 categories.`,
    },
    {
      number: "02",
      title: "Charter Divergence",
      detail: (() => {
        const withBoth = data.categories.filter((c) => c.bank_count > 0 && c.cu_count > 0);
        if (withBoth.length === 0) return "Charter-level comparison data is not yet available for this period.";
        const bankHigher = withBoth.filter((c) => (c.bank_median ?? 0) > (c.cu_median ?? 0));
        return `Banks charge higher medians than credit unions in ${bankHigher.length} of ${withBoth.length} comparable fee categories.`;
      })(),
    },
    {
      number: "03",
      title: "Coverage Quality",
      detail: (() => {
        const strong = data.categories.filter((c) => c.maturity_tier === "strong").length;
        const provisional = data.categories.filter((c) => c.maturity_tier === "provisional").length;
        return `${strong} categories have strong data maturity; ${provisional} are provisional. Coverage spans ${data.total_institutions.toLocaleString()} institutions.`;
      })(),
    },
  ];

  const execSummary = [
    numberedFindings(execKeyFindings),
    hamiltonNarrativeBlock(narratives.executive_summary.narrative),
  ].join("\n");

  // ── Chapter 1: Economic Landscape ─────────────────────────────────────────
  const fredCards = data.fred
    ? statCardRow([
        {
          label: "Fed Funds Rate",
          value: data.fred.fed_funds_rate !== null ? fmtPct(data.fred.fed_funds_rate) : "\u2014",
          source: `As of ${data.fred.as_of}`,
        },
        {
          label: "Unemployment Rate",
          value: data.fred.unemployment_rate !== null ? fmtPct(data.fred.unemployment_rate) : "\u2014",
          source: "FRED",
        },
        {
          label: "CPI (YoY)",
          value: data.fred.cpi_yoy_pct !== null ? fmtPct(data.fred.cpi_yoy_pct) : "\u2014",
          source: "FRED",
        },
        {
          label: "Consumer Sentiment",
          value: data.fred.consumer_sentiment !== null ? String(data.fred.consumer_sentiment.toFixed(1)) : "\u2014",
          source: "University of Michigan",
        },
      ])
    : statCardRow([
        { label: "Economic Data", value: "Not available", source: "FRED data pending" },
      ]);

  const ch1 = [
    pageBreak(),
    chapterDivider("01", "Economic Landscape"),
    fredCards,
    hamiltonNarrativeBlock(narratives.economic_landscape.narrative),
  ].join("\n");

  // ── Chapter 2: Revenue Landscape ──────────────────────────────────────────
  const revenueCards = data.revenue
    ? statCardRow([
        {
          label: "Total Service Charges",
          value: fmtBillions(data.revenue.total_service_charges),
          source: data.revenue.latest_quarter,
        },
        {
          label: "YoY Change",
          value: fmtPct(data.revenue.yoy_change_pct, true),
          deltaColor: data.revenue.yoy_change_pct !== null
            ? data.revenue.yoy_change_pct >= 0 ? "negative" : "positive"
            : "neutral",
          source: "Call Report data",
        },
        {
          label: "Reporting Institutions",
          value: data.revenue.total_institutions.toLocaleString(),
          source: "FDIC / NCUA",
        },
      ])
    : statCardRow([
        { label: "Revenue Data", value: "Not available", source: "Call Report data pending" },
      ]);

  const revenueBarChart = data.revenue
    ? horizontalBarChart({
        bars: [
          {
            label: "Banks",
            value: data.revenue.bank_service_charges,
            displayValue: fmtBillions(data.revenue.bank_service_charges),
          },
          {
            label: "Credit Unions",
            value: data.revenue.cu_service_charges,
            displayValue: fmtBillions(data.revenue.cu_service_charges),
          },
        ],
        title: "Service Charge Revenue by Charter",
        source: `Call Report ${data.revenue.latest_quarter}`,
      })
    : "";

  const revenueKeyFinding = data.revenue
    ? keyFinding(
        `Banks collected ${fmtBillions(data.revenue.bank_service_charges)} in service charges vs. ${fmtBillions(data.revenue.cu_service_charges)} for credit unions — a ${(data.revenue.bank_service_charges / Math.max(data.revenue.cu_service_charges, 1)).toFixed(1)}x differential.`,
        "Revenue Concentration",
      )
    : keyFinding(
        "Call Report revenue data will be included when available from FDIC and NCUA filings.",
        "Data Pending",
      );

  const narrativeHtml = hamiltonNarrativeBlock(narratives.revenue_landscape.narrative);
  const revenueMain = data.revenue
    ? twoColumn(narrativeHtml, revenueBarChart)
    : narrativeHtml;

  const ch2 = [
    pageBreak(),
    chapterDivider("02", "The Revenue Landscape"),
    revenueCards,
    revenueMain,
    revenueKeyFinding,
  ].join("\n");

  // ── Chapter 3: The Fee Index ───────────────────────────────────────────────
  const featuredCategories = data.categories
    .filter((c) => c.median_amount !== null)
    .sort((a, b) => (b.institution_count ?? 0) - (a.institution_count ?? 0))
    .slice(0, 15);

  const featuredStatCards = (() => {
    const withMedian = data.categories.filter((c) => c.median_amount !== null);
    const overallMedians = withMedian.map((c) => c.median_amount as number);
    const sortedMedians = [...overallMedians].sort((a, b) => a - b);
    const mid = Math.floor(sortedMedians.length / 2);
    const overallMedian = sortedMedians.length > 0
      ? sortedMedians.length % 2 === 0
        ? (sortedMedians[mid - 1] + sortedMedians[mid]) / 2
        : sortedMedians[mid]
      : null;

    const overdraft = data.categories.find((c) => c.fee_category === "overdraft");
    const maintenance = data.categories.find((c) => c.fee_category === "monthly_maintenance");

    return statCardRow([
      {
        label: "Overall Median Fee",
        value: fmtFee(overallMedian),
        source: `${withMedian.length} categories with data`,
      },
      {
        label: "Overdraft Fee (Median)",
        value: fmtFee(overdraft?.median_amount ?? null),
        source: overdraft ? `${overdraft.institution_count.toLocaleString()} institutions` : "Insufficient data",
      },
      {
        label: "Monthly Maintenance (Median)",
        value: fmtFee(maintenance?.median_amount ?? null),
        source: maintenance ? `${maintenance.institution_count.toLocaleString()} institutions` : "Insufficient data",
      },
    ]);
  })();

  const hasCharterData = data.categories.some((c) => c.bank_count > 0 && c.cu_count > 0);

  const charterTable = hasCharterData
    ? dataTable({
        columns: CHARTER_COLUMNS,
        rows: data.categories
          .filter((c) => c.bank_count > 0 && c.cu_count > 0)
          .map((c) => ({
            display_name: c.display_name,
            bank_median: c.bank_median,
            cu_median: c.cu_median,
            bank_count: c.bank_count,
            cu_count: c.cu_count,
          })),
        caption: "Categories with both bank and credit union observations",
      })
    : "";

  const ch3 = [
    pageBreak(),
    chapterDivider("03", "What Banks Charge"),
    featuredStatCards,
    dataTable({
      columns: FEATURED_COLUMNS,
      rows: featuredCategories.map((c) => ({
        display_name: c.display_name,
        median_amount: c.median_amount,
        p25_amount: c.p25_amount,
        p75_amount: c.p75_amount,
        institution_count: c.institution_count,
        maturity_tier: c.maturity_tier,
      })),
      caption: `Top 15 fee categories by institution coverage \u2014 ${data.report_date}`,
    }),
    hamiltonNarrativeBlock(narratives.fee_index.narrative),
    charterTable,
  ]
    .filter(Boolean)
    .join("\n");

  // ── Chapter 4: Market Structure ────────────────────────────────────────────
  const coveragePct = data.total_institutions > 0
    ? ((data.categories.filter((c) => c.institution_count > 0).length / data.categories.length) * 100).toFixed(1)
    : "0.0";

  const marketStatCards = statCardRow([
    {
      label: "Total Banks",
      value: data.total_bank_institutions.toLocaleString(),
      source: "FDIC",
    },
    {
      label: "Total Credit Unions",
      value: data.total_cu_institutions.toLocaleString(),
      source: "NCUA",
    },
    {
      label: "Category Coverage",
      value: `${coveragePct}%`,
      source: `${data.categories.filter((c) => c.institution_count > 0).length} of ${data.categories.length} categories`,
    },
  ]);

  const ch4 = [
    pageBreak(),
    chapterDivider("04", "Market Structure"),
    marketStatCards,
    hamiltonNarrativeBlock(narratives.market_structure.narrative),
  ].join("\n");

  // ── Chapter 5: Outlook & Implications ─────────────────────────────────────
  const outlookFinding = keyFinding(
    "Fee revenue strategy remains a key lever for institutions navigating margin compression. Monitoring competitive fee positioning relative to peer medians is essential for both compliance and revenue optimization.",
    "Strategic Implication",
  );

  const ch5 = [
    pageBreak(),
    chapterDivider("05", "Outlook & Implications"),
    hamiltonNarrativeBlock(narratives.outlook.narrative),
    outlookFinding,
  ].join("\n");

  // ── Methodology ───────────────────────────────────────────────────────────
  const methodologyText = [
    "National medians computed from all non-rejected fee observations in the Bank Fee Index pipeline.",
    `Maturity: "strong" = 10+ approved observations; "provisional" = 10+ total; "insufficient" = below threshold.`,
    "Charter split computed from charter_type field on crawl_targets.",
    "Revenue data sourced from FDIC Call Reports and NCUA 5300 filings.",
    "Economic indicators sourced from Federal Reserve Economic Data (FRED) and Federal Reserve Beige Book.",
    `Bank Fee Index \u2014 bankfeeindex.com \u2014 Generated ${data.report_date}`,
  ].join(" ");

  const methodology = [
    pageBreak(),
    footnote(methodologyText),
  ].join("\n");

  // ── Appendix ──────────────────────────────────────────────────────────────
  const appendix = [
    pageBreak(),
    chapterDivider("A", "Full 49-Category Index"),
    compactTable({
      columns: APPENDIX_COLUMNS,
      rows: data.categories.map((c) => ({
        display_name: c.display_name,
        fee_family: c.fee_family,
        median_amount: c.median_amount,
        p25_amount: c.p25_amount,
        p75_amount: c.p75_amount,
        institution_count: c.institution_count,
        maturity_tier: c.maturity_tier,
      })),
      caption: `All ${data.categories.length} fee categories \u2014 ${data.total_institutions.toLocaleString()} institutions \u2014 as of ${data.report_date}`,
    }),
  ].join("\n");

  // ── Assemble ───────────────────────────────────────────────────────────────
  const body = [
    cover,
    toc,
    execSummary,
    ch1,
    ch2,
    ch3,
    ch4,
    ch5,
    methodology,
    appendix,
  ]
    .filter(Boolean)
    .join("\n\n");

  return wrapReport(body, {
    title: "National Fee Index",
    author: "Bank Fee Index \u2014 Hamilton",
    date: data.report_date,
  });
}
