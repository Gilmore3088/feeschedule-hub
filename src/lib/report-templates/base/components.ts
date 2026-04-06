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

// Keep PALETTE accessible to any component that needs inline style overrides
export { PALETTE };
