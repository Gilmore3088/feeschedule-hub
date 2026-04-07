/**
 * National Quarterly Report — HTML Template (V3 Strategic Intelligence)
 *
 * Pure function: (input) => HTML string.
 * No async, no AI calls — narratives are pre-computed and injected.
 *
 * V3 Chapter Structure:
 *   Cover -> TOC -> Executive Summary ("5 Truths") ->
 *   Ch1: The Illusion of Fee Differentiation ->
 *   Ch2: Banks vs Credit Unions: Two Models ->
 *   Ch3: Where the Money Actually Comes From ->
 *   Ch4: The Industry Blind Spot ->
 *   Ch5: The Future of Fee Strategy ->
 *   Playbook -> Methodology -> Appendix
 */

import {
  wrapReport,
  coverPage,
  tableOfContents,
  statCardRow,
  keyFinding,
  horizontalBarChart,
  chapterDivider,
  hamiltonNarrativeBlock,
  compactTable,
  footnote,
  pageBreak,
  soWhatBox,
  insightCardRow,
  comparisonChart,
  playbook,
} from "../index";

import type { DerivedAnalytics, NationalQuarterlyPayload } from "@/lib/report-assemblers/national-quarterly";

// ─── Input Type ────────────────────────────────────────────────────────────────

export interface NationalQuarterlyReportInput {
  data: NationalQuarterlyPayload;
  narratives: {
    executive_summary: { narrative: string };
    fee_differentiation: { narrative: string };
    banks_vs_credit_unions: { narrative: string };
    revenue_reality: { narrative: string };
    industry_blind_spot: { narrative: string };
    future_strategy: { narrative: string };
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

function fmtPct(value: number | null): string {
  if (value === null) return "\u2014";
  return `${value.toFixed(1)}%`;
}

// ─── Appendix Column Definitions ──────────────────────────────────────────────

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
  const d: DerivedAnalytics = data.derived;

  const formattedDate = new Date(data.report_date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // ── Cover ──────────────────────────────────────────────────────────────────
  const cover = coverPage({
    title: "The Death of Fee-Based Differentiation",
    subtitle: `${data.total_institutions.toLocaleString()} Institutions \u2014 49 Fee Categories \u2014 National Benchmark Analysis`,
    report_date: formattedDate,
    series: `National Quarterly Report \u2014 ${data.quarter}`,
  });

  // ── Table of Contents ──────────────────────────────────────────────────────
  const toc = tableOfContents([
    {
      title: "5 Truths About Banking Fees in 2026",
      description: "A structural shift in how banks generate fee revenue",
      page: 3,
      sectionLabel: "EXECUTIVE SUMMARY",
    },
    {
      number: "01",
      title: "The Illusion of Fee Differentiation",
      description: "Why pricing no longer creates competitive advantage",
      page: 4,
    },
    {
      number: "02",
      title: "Banks vs Credit Unions: Two Models",
      description: "Divergent strategies, convergent outcomes",
      page: 5,
    },
    {
      number: "03",
      title: "Where the Money Actually Comes From",
      description: "Revenue concentration and the proxy model",
      page: 6,
    },
    {
      number: "04",
      title: "The Industry Blind Spot",
      description: "Why no institution can benchmark fee revenue nationally",
      page: 7,
    },
    {
      number: "05",
      title: "The Future of Fee Strategy",
      description: "Behavioral pricing, bundling, and segmentation",
      page: 8,
    },
    {
      title: "What Winning Institutions Will Do Next",
      description: "Actionable recommendations by charter type",
      page: 9,
      sectionLabel: "PLAYBOOK",
    },
    {
      title: "Methodology",
      description: "Data sources, computation methods, and maturity definitions",
      page: 10,
    },
    {
      title: "Full 49-Category Index",
      description: "Complete national benchmark data for all tracked fee categories",
      page: 11,
      sectionLabel: "APPENDIX",
    },
  ]);

  // ── Executive Summary: "5 Truths About Banking Fees" ──────────────────────
  const commoditizedPct = d.total_priced_categories > 0
    ? Math.round((d.commoditized_count / d.total_priced_categories) * 100)
    : 0;

  // Build 5 Truths as individual insight cards — each: bold claim, proof stat, arrow implication
  const fiveTruths = [
    {
      number: `${commoditizedPct}%`,
      insight: "Pricing is not a competitive advantage",
      supporting: `${d.commoditized_count} of ${d.total_priced_categories} categories cluster within narrow IQR ranges. Competing on price alone is ineffective.`,
    },
    {
      number: String(d.bank_higher_count),
      insight: "Credit unions win perception, not pricing",
      supporting: `Banks charge more in ${d.bank_higher_count} of ${d.comparable_count} comparable categories, yet CUs carry higher penalty exposure. Fee strategy must align with customer behavior.`,
    },
    {
      number: d.bank_revenue_share_pct !== null ? `${d.bank_revenue_share_pct.toFixed(0)}%` : "\u2014",
      insight: "Revenue visibility is broken",
      supporting: d.bank_revenue_share_pct !== null
        ? `Banks hold ${d.bank_revenue_share_pct.toFixed(0)}% of fee revenue, yet no standardized benchmarking exists. Institutions are pricing without context.`
        : "No standardized fee revenue benchmarking exists. Institutions are pricing without context.",
    },
    {
      number: String(d.strong_maturity_count),
      insight: "Fee income is concentrated",
      supporting: `Only ${d.strong_maturity_count} categories have strong data maturity out of ${d.total_priced_categories}. Optimization must focus on high-impact fees.`,
    },
    {
      number: d.avg_iqr_spread_pct !== null ? `${d.avg_iqr_spread_pct.toFixed(0)}%` : "\u2014",
      insight: "Behavior beats pricing",
      supporting: `Average IQR spread of ${d.avg_iqr_spread_pct !== null ? d.avg_iqr_spread_pct.toFixed(0) + "%" : "N/A"} confirms static fee schedules cannot capture value. Future advantage = segmentation + behavior.`,
    },
  ];

  const execSummary = [
    chapterDivider("", "5 Truths About Banking Fees in 2026"),
    insightCardRow(fiveTruths),
    hamiltonNarrativeBlock(narratives.executive_summary.narrative),
  ].join("\n");

  // ── Ch1: The Illusion of Fee Differentiation ──────────────────────────────
  const tightestBars = d.tightest_spreads.slice(0, 10).map((s) => ({
    label: s.display_name,
    value: s.spread_pct,
    displayValue: `${s.spread_pct.toFixed(1)}%`,
  }));

  const ch1 = [
    pageBreak(),
    chapterDivider("01", "The Illusion of Fee Differentiation"),
    horizontalBarChart({
      bars: tightestBars,
      title: "Top 10 Functionally Undifferentiated Fees (Smallest IQR Spread)",
      source: `Bank Fee Index \u2014 ${data.total_institutions.toLocaleString()} institutions`,
    }),
    hamiltonNarrativeBlock(narratives.fee_differentiation.narrative),
    soWhatBox("Stop competing on price alone. Differences exist but are too small to influence customer choice. Differentiation must come from experience, packaging, and targeting."),
  ].join("\n");

  // ── Ch2: Banks vs Credit Unions — Two Models ─────────────────────────────
  const comparisonBars = data.categories
    .filter((c) => c.bank_count > 0 && c.cu_count > 0 && c.bank_median !== null && c.cu_median !== null)
    .sort((a, b) => Math.abs((b.bank_median ?? 0) - (b.cu_median ?? 0)) - Math.abs((a.bank_median ?? 0) - (a.cu_median ?? 0)))
    .slice(0, 8)
    .map((c) => ({
      label: c.display_name,
      leftValue: c.bank_median!,
      rightValue: c.cu_median!,
      leftDisplay: fmtFee(c.bank_median),
      rightDisplay: fmtFee(c.cu_median),
    }));

  const ch2 = [
    pageBreak(),
    chapterDivider("02", "Banks vs Credit Unions: Two Models"),
    comparisonChart({
      bars: comparisonBars,
      leftLabel: "Banks",
      rightLabel: "Credit Unions",
      title: "Fee Medians by Charter Type",
      source: `${d.comparable_count} categories with both bank and CU data`,
    }),
    statCardRow([
      {
        label: "Banks Charge More",
        value: String(d.bank_higher_count),
        source: "categories",
      },
      {
        label: "CUs Charge More",
        value: String(d.cu_higher_count),
        source: "categories",
      },
      {
        label: "Comparable Categories",
        value: String(d.comparable_count),
        source: "with both charter types",
      },
    ]),
    hamiltonNarrativeBlock(narratives.banks_vs_credit_unions.narrative),
    soWhatBox("Banks monetize convenience; credit unions monetize penalties. Neither model is sustainable without intentional fee architecture."),
  ].join("\n");

  // ── Ch3: Where the Money Actually Comes From ─────────────────────────────
  const ch3Sections: string[] = [
    pageBreak(),
    chapterDivider("03", "Where the Money Actually Comes From"),
  ];

  if (data.revenue) {
    const revPerInst = d.revenue_per_institution !== null
      ? `$${(d.revenue_per_institution / 1_000_000).toFixed(1)}M`
      : "\u2014";

    ch3Sections.push(
      statCardRow([
        {
          label: "Total Service Charges",
          value: fmtBillions(data.revenue.total_service_charges),
          source: data.revenue.latest_quarter,
        },
        {
          label: "Revenue per Institution",
          value: revPerInst,
          source: `${data.revenue.total_institutions.toLocaleString()} reporting institutions`,
        },
        {
          label: "Bank Share",
          value: fmtPct(d.bank_revenue_share_pct),
          source: "of total service charges",
        },
      ])
    );
    ch3Sections.push(
      horizontalBarChart({
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
    );
  } else {
    ch3Sections.push(
      keyFinding(
        "Call Report revenue data will be included when available from FDIC and NCUA filings.",
        "Data Pending",
      )
    );
  }

  ch3Sections.push(hamiltonNarrativeBlock(narratives.revenue_reality.narrative));
  ch3Sections.push(soWhatBox("Fee revenue is concentrated in a handful of categories. Optimize the few that matter; ignore the noise."));

  const ch3 = ch3Sections.join("\n");

  // ── Ch4: The Industry Blind Spot ──────────────────────────────────────────
  const ch4 = [
    pageBreak(),
    chapterDivider("04", "The Industry Blind Spot"),
    statCardRow([
      {
        label: "Categories with Data",
        value: String(d.categories_with_data_count),
        source: `of ${data.categories.length} total`,
      },
      {
        label: "Strong Maturity",
        value: String(d.strong_maturity_count),
        source: "10+ approved observations",
      },
      {
        label: "Provisional",
        value: String(d.provisional_maturity_count),
        source: "10+ total observations",
      },
    ]),
    hamiltonNarrativeBlock(narratives.industry_blind_spot.narrative),
    soWhatBox("No institution can benchmark fee revenue nationally today. This is the competitive blind spot Bank Fee Index exists to close."),
  ].join("\n");

  // ── Ch5: The Future of Fee Strategy ───────────────────────────────────────
  const ch5 = [
    pageBreak(),
    chapterDivider("05", "The Future of Fee Strategy"),
    statCardRow([
      {
        label: "Avg Price Spread",
        value: d.avg_iqr_spread_pct !== null ? `${d.avg_iqr_spread_pct.toFixed(0)}%` : "\u2014",
        source: "IQR as % of median",
      },
      {
        label: "Effectively Commoditized",
        value: `${commoditizedPct}%`,
        source: `${d.commoditized_count} of ${d.total_priced_categories} categories`,
      },
      {
        label: "Institutions Tracked",
        value: data.total_institutions.toLocaleString(),
        source: "national coverage",
      },
    ]),
    hamiltonNarrativeBlock(narratives.future_strategy.narrative),
    soWhatBox("Future revenue growth comes from behavior design, bundling, and segmentation — not static price sheets."),
  ].join("\n");

  // ── Playbook ──────────────────────────────────────────────────────────────
  const playbookSection = [
    pageBreak(),
    playbook([
      {
        title: "If You Are a Bank",
        recommendations: [
          "Monetize convenience fees where you hold pricing power (wires, specialized services)",
          "Reduce reliance on penalty fees — regulatory and reputational risk is growing",
          "Build fee bundles that align price with customer segment behavior",
        ],
      },
      {
        title: "If You Are a Credit Union",
        recommendations: [
          "Rebalance penalty fee exposure — NSF and overdraft concentration creates regulatory vulnerability",
          "Expand digital and convenience monetization (mobile, instant transfers)",
          "Leverage member data for behavior-based fee strategies",
        ],
      },
      {
        title: "If You Are Behind",
        recommendations: [
          "Stop benchmarking on price alone — your peers are already effectively commoditized",
          "Start with segmentation: know which customers generate fee revenue and why",
          "Invest in behavioral pricing models before competitors capture the advantage",
        ],
      },
    ]),
  ].join("\n");

  // ── Methodology ───────────────────────────────────────────────────────────
  const methodologyText = [
    "National medians computed from all non-rejected fee observations in the Bank Fee Index pipeline.",
    `Maturity: "strong" = 10+ approved observations; "provisional" = 10+ total; "insufficient" = below threshold.`,
    "Charter split computed from charter_type field on crawl_targets.",
    "IQR spread = (P75 - P25) / Median. Categories with median below $0.50 excluded from spread analysis.",
    "Revenue data sourced from FDIC Call Reports and NCUA 5300 filings.",
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
    playbookSection,
    methodology,
    appendix,
  ]
    .filter(Boolean)
    .join("\n\n");

  return wrapReport(body, {
    title: "The Death of Fee-Based Differentiation",
    author: "Bank Fee Index \u2014 Hamilton",
    date: data.report_date,
  });
}
