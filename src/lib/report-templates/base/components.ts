/**
 * Pure HTML component builder functions for report templates.
 *
 * All functions are pure: given the same inputs they return the same HTML string.
 * No side effects, no async operations, no AI calls.
 * All user-provided strings pass through escapeHtml to prevent XSS.
 */

import { PALETTE } from "./styles";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Cover Page ────────────────────────────────────────────────────────────────

export interface CoverPageProps {
  title: string;
  subtitle: string;
  report_date: string;
  series?: string;           // e.g., "National Fee Index — Q1 2026"
  confidentiality?: string;  // e.g., "Prepared exclusively for [Client]"
}

/**
 * Full visual cover with title, subtitle, date, and issuer block.
 * Per D-03: titles should state the conclusion, not the topic.
 */
export function coverPage(props: CoverPageProps): string {
  return `
<div class="report-cover">
  <div class="report-cover-inner">
    <div class="report-cover-label">${escapeHtml(props.series ?? "Bank Fee Index Research")}</div>
    <h1 class="report-cover-title">${escapeHtml(props.title)}</h1>
    <div class="report-cover-subtitle">${escapeHtml(props.subtitle)}</div>
    <div class="report-cover-meta">
      <span>Bank Fee Index</span>
      <span>${escapeHtml(props.report_date)}</span>
      ${props.confidentiality ? `<span>${escapeHtml(props.confidentiality)}</span>` : ""}
    </div>
  </div>
</div>`;
}

// ─── Section Header ────────────────────────────────────────────────────────────

export interface SectionHeaderProps {
  label: string;        // e.g., "Findings" — terracotta small caps above heading
  title: string;        // Conclusion-first heading per D-03
  subheading?: string;  // Optional italic subheading for additional context
}

/**
 * Terracotta label + Newsreader heading + optional italic subheading.
 * Use conclusion-first titles per D-03: "Montana overdraft fees run 23% above national median"
 * not "Overdraft Fee Analysis".
 */
export function sectionHeader(props: SectionHeaderProps): string {
  return `
<div class="report-section-header">
  <div class="report-section-label">${escapeHtml(props.label)}</div>
  <h2 class="report-heading">${escapeHtml(props.title)}</h2>
  ${props.subheading ? `<div class="report-subheading">${escapeHtml(props.subheading)}</div>` : ""}
</div>`;
}

// ─── Data Table ────────────────────────────────────────────────────────────────

export interface DataTableColumn {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  format?: "amount" | "percent" | "integer" | "text";
}

export interface DataTableProps {
  columns: DataTableColumn[];
  rows: Array<Record<string, string | number | null>>;
  caption?: string;
}

function formatCell(val: string | number | null | undefined, fmt?: string): string {
  if (val === null || val === undefined) return "\u2014"; // em dash for missing values
  if (fmt === "amount" && typeof val === "number") return `$${val.toFixed(2)}`;
  if (fmt === "percent" && typeof val === "number") {
    const sign = val > 0 ? "+" : "";
    return `${sign}${val.toFixed(1)}%`;
  }
  if (fmt === "integer" && typeof val === "number") return val.toLocaleString();
  return escapeHtml(String(val));
}

/**
 * Full-width data table with warm styling matching brief-generator.ts visual language.
 * Null values render as "—" (em dash). Positive percent values get "+" prefix.
 */
export function dataTable(props: DataTableProps): string {
  const headers = props.columns
    .map((c) => `<th style="text-align:${c.align ?? "left"}">${escapeHtml(c.label)}</th>`)
    .join("");

  const rows = props.rows
    .map((row) => {
      const cells = props.columns
        .map((c) => {
          const val = row[c.key] ?? null;
          return `<td style="text-align:${c.align ?? "left"}">${formatCell(val, c.format)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
<div class="report-table-wrapper">
  ${props.caption ? `<div class="report-table-caption">${escapeHtml(props.caption)}</div>` : ""}
  <table class="report-table">
    <thead><tr>${headers}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// ─── Chart Container ───────────────────────────────────────────────────────────

export interface ChartContainerProps {
  caption: string;
  src?: string;     // base64 data URI or path — omit for placeholder
  alt?: string;
  width?: string;   // CSS width, default "100%"
}

/**
 * Placeholder for Matplotlib-generated chart images.
 * When src is provided, renders the image. When omitted, renders a dashed placeholder.
 * src is only embedded from server-side code; no user-controlled src input in this plan's scope.
 */
export function chartContainer(props: ChartContainerProps): string {
  if (props.src) {
    return `
<figure class="chart-container">
  <img src="${props.src}" alt="${escapeHtml(props.alt ?? props.caption)}" style="width:${props.width ?? "100%"};height:auto;" />
  <figcaption class="chart-caption">${escapeHtml(props.caption)}</figcaption>
</figure>`;
  }
  return `
<figure class="chart-container chart-placeholder">
  <div class="chart-placeholder-inner">Chart: ${escapeHtml(props.caption)}</div>
  <figcaption class="chart-caption">${escapeHtml(props.caption)}</figcaption>
</figure>`;
}

// ─── Pull Quote ────────────────────────────────────────────────────────────────

/**
 * Large Newsreader italic text with terracotta left border.
 * Use for the single most important finding in a section.
 */
export function pullQuote(text: string): string {
  return `<blockquote class="report-pull-quote">${escapeHtml(text)}</blockquote>`;
}

// ─── Footnote ──────────────────────────────────────────────────────────────────

/**
 * Small muted text below a section with top border rule.
 * Use for methodology notes, data sources, limitations.
 */
export function footnote(text: string): string {
  return `<footer class="footnote">${escapeHtml(text)}</footer>`;
}

// ─── Hamilton Narrative Block ──────────────────────────────────────────────────

/**
 * Wraps Hamilton's AI-generated prose with a subtle terracotta left rule.
 * escapeHtml applied defensively — Claude output should be plain text
 * but this prevents XSS if the prose is ever served in a browser frame.
 */
export function hamiltonNarrativeBlock(prose: string): string {
  return `<div class="hamilton-block"><p class="report-narrative">${escapeHtml(prose)}</p></div>`;
}

// ─── Page Break ───────────────────────────────────────────────────────────────

/**
 * Print-only page break. Has no visual effect in browser; forces new page in PDF.
 */
export function pageBreak(): string {
  return `<div class="page-break"></div>`;
}

// ─── Stat Card Row ─────────────────────────────────────────────────────────────

export interface StatCard {
  label: string;
  value: string;
  delta?: string;
  deltaColor?: "positive" | "negative" | "neutral";
  source?: string;
}

/**
 * Renders 2-3 stat cards in a responsive CSS grid.
 * Use for key metrics at the top of a section.
 */
export function statCardRow(cards: StatCard[]): string {
  const cardHtml = cards
    .map((card) => {
      const deltaClass = card.deltaColor ? ` delta-${card.deltaColor}` : "";
      return `
  <div class="stat-card">
    <div class="stat-card-label">${escapeHtml(card.label)}</div>
    <div class="stat-card-value">${escapeHtml(card.value)}</div>
    ${card.delta ? `<div class="stat-card-delta${deltaClass}">${escapeHtml(card.delta)}</div>` : ""}
    ${card.source ? `<div class="stat-card-source">${escapeHtml(card.source)}</div>` : ""}
  </div>`;
    })
    .join("");

  return `<div class="stat-cards">${cardHtml}\n</div>`;
}

// ─── Key Finding ───────────────────────────────────────────────────────────────

/**
 * Terracotta-bordered callout box for a single critical finding.
 * Use sparingly — one per section maximum.
 */
export function keyFinding(text: string, label?: string): string {
  return `
<div class="key-finding">
  ${label ? `<div class="key-finding-label">${escapeHtml(label)}</div>` : ""}
  <div class="key-finding-text">${escapeHtml(text)}</div>
</div>`;
}

// ─── Horizontal Bar Chart ──────────────────────────────────────────────────────

export interface BarChartBar {
  label: string;
  value: number;
  displayValue?: string;
}

export interface HorizontalBarChartProps {
  bars: BarChartBar[];
  title?: string;
  source?: string;
}

/**
 * CSS-only horizontal bar chart (no SVG). Bar widths are calculated as a
 * percentage of the maximum value. Bars decrease in opacity from top to bottom.
 */
export function horizontalBarChart(props: HorizontalBarChartProps): string {
  const maxValue = Math.max(...props.bars.map((b) => b.value));
  const barHtml = props.bars
    .map((bar, i) => {
      const widthPct = maxValue > 0 ? (bar.value / maxValue) * 100 : 0;
      const opacity = 1 - i * (0.6 / Math.max(props.bars.length - 1, 1));
      const display = bar.displayValue ?? String(bar.value);
      return `
  <div class="h-bar-row">
    <div class="h-bar-label">${escapeHtml(bar.label)}</div>
    <div class="h-bar-track">
      <div class="h-bar-fill" style="width:${widthPct.toFixed(1)}%;opacity:${opacity.toFixed(2)};"></div>
    </div>
    <div class="h-bar-value">${escapeHtml(display)}</div>
  </div>`;
    })
    .join("");

  return `
<div class="h-bar-chart">
  ${props.title ? `<div class="h-bar-title">${escapeHtml(props.title)}</div>` : ""}
  ${barHtml}
  ${props.source ? `<div class="h-bar-source">${escapeHtml(props.source)}</div>` : ""}
</div>`;
}

// ─── Two Column ────────────────────────────────────────────────────────────────

/**
 * CSS grid wrapper for a two-column layout.
 * ratio defaults to "1.2fr 1fr" for a slightly wider left column.
 * Left and right are pre-rendered HTML strings.
 */
export function twoColumn(left: string, right: string, ratio = "1.2fr 1fr"): string {
  return `
<div class="two-column" style="grid-template-columns:${ratio};">
  <div class="two-column-left">${left}</div>
  <div class="two-column-right">${right}</div>
</div>`;
}

// ─── Chapter Divider ───────────────────────────────────────────────────────────

/**
 * Full-width chapter opener with terracotta accent number and large heading.
 * Use at the start of major report sections.
 */
export function chapterDivider(number: string, title: string): string {
  return `
<div class="chapter-divider">
  <div class="chapter-number">${escapeHtml(number)}</div>
  <h2 class="chapter-title">${escapeHtml(title)}</h2>
</div>`;
}

// ─── Table of Contents ─────────────────────────────────────────────────────────

export interface TocEntry {
  title: string;
  page: string;
}

/**
 * Dot-leader table of contents. Typically placed after the cover page.
 */
export function tableOfContents(chapters: TocEntry[]): string {
  const entries = chapters
    .map(
      (ch) => `
  <div class="toc-entry">
    <span class="toc-title">${escapeHtml(ch.title)}</span>
    <span class="toc-dots"></span>
    <span class="toc-page">${escapeHtml(ch.page)}</span>
  </div>`,
    )
    .join("");

  return `<nav class="table-of-contents">${entries}\n</nav>`;
}

// ─── Compact Table ─────────────────────────────────────────────────────────────

/**
 * Same as dataTable but uses the "compact-table" CSS class for tighter spacing.
 * Use inside sidebar panels or when vertical space is limited.
 */
export function compactTable(props: DataTableProps): string {
  const headers = props.columns
    .map((c) => `<th style="text-align:${c.align ?? "left"}">${escapeHtml(c.label)}</th>`)
    .join("");

  const rows = props.rows
    .map((row) => {
      const cells = props.columns
        .map((c) => {
          const val = row[c.key] ?? null;
          return `<td style="text-align:${c.align ?? "left"}">${formatCell(val, c.format)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
<div class="report-table-wrapper">
  ${props.caption ? `<div class="report-table-caption">${escapeHtml(props.caption)}</div>` : ""}
  <table class="compact-table">
    <thead><tr>${headers}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// ─── Trend Indicator ───────────────────────────────────────────────────────────

/**
 * Inline colored up/down/flat indicator for a numeric change value.
 * Values with abs(value) > 0.5 render as up or down; otherwise flat.
 * format: 'percent' adds % suffix; 'amount' adds $ prefix.
 */
export function trendIndicator(value: number, format: "percent" | "amount" = "percent"): string {
  const absVal = Math.abs(value);
  const isUp = value > 0.5;
  const isDown = value < -0.5;

  let displayVal: string;
  if (format === "amount") {
    displayVal = `$${absVal.toFixed(2)}`;
  } else {
    displayVal = `${absVal.toFixed(1)}%`;
  }

  if (isUp) {
    return `<span class="trend-indicator trend-up">\u25b2 ${displayVal}</span>`;
  }
  if (isDown) {
    return `<span class="trend-indicator trend-down">\u25bc ${displayVal}</span>`;
  }
  return `<span class="trend-indicator trend-flat">\u2014 ${displayVal}</span>`;
}

// ─── Numbered Findings ─────────────────────────────────────────────────────────

export interface NumberedFinding {
  number: string;
  title: string;
  detail: string;
}

/**
 * Ordered list of key findings with a prominent number, bold title, and
 * supporting detail paragraph. Use for executive summary sections.
 */
export function numberedFindings(findings: NumberedFinding[]): string {
  const items = findings
    .map(
      (f) => `
  <div class="numbered-finding">
    <div class="finding-number">${escapeHtml(f.number)}</div>
    <div class="finding-body">
      <div class="finding-title">${escapeHtml(f.title)}</div>
      <div class="finding-detail">${escapeHtml(f.detail)}</div>
    </div>
  </div>`,
    )
    .join("");

  return `<div class="numbered-findings">${items}\n</div>`;
}

// Keep PALETTE accessible to any component that needs inline style overrides
export { PALETTE };
