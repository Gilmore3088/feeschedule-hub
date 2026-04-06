/**
 * Report template palette, typography, and inline CSS constants.
 *
 * All color references in REPORT_CSS use PALETTE interpolation to ensure
 * consistency if the palette changes. Reports are standalone HTML files
 * rendered by Playwright to PDF — no Next.js CSS variables available.
 */

export const PALETTE = {
  text: "#1A1815",           // warm black — all body copy
  textSecondary: "#7A7062",  // secondary text
  textMuted: "#A09788",      // labels, captions, footnotes
  background: "#FDFBF8",     // cream page background
  sectionBg: "#F5EFE6",      // alternating section background
  accent: "#C44B2E",         // terracotta — section labels, highlights
  accentLight: "#FDF0ED",    // terracotta tint — callout backgrounds
  border: "#E8DFD1",         // warm border — cards, tables
  borderLight: "#F0E8DC",    // lighter border — table rows
  textDark2: "#2D2A26",      // heading level 2
  textDark3: "#3D3830",      // heading level 3
} as const;

export const TYPOGRAPHY = {
  // Newsreader loads via @import in REPORT_CSS — fallback for pre-load
  serif: '"Newsreader", "Georgia", "Times New Roman", serif',
  sans: '"Inter", "Helvetica Neue", system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", "Courier New", monospace',
} as const;

export const REPORT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500;1,600&display=swap');

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: ${TYPOGRAPHY.sans};
  color: ${PALETTE.text};
  background: ${PALETTE.background};
  line-height: 1.6;
  max-width: 800px;
  margin: 0 auto;
  padding: 48px 32px;
}

@media print {
  body {
    padding: 24px 16px;
    max-width: 100%;
    margin: 0;
  }
  @page {
    margin: 20mm 16mm;
  }
}

/* Cover page */
.report-cover {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${PALETTE.background};
  border-bottom: 3px solid ${PALETTE.accent};
  padding: 80px 48px;
  margin: -48px -32px 48px;
}

.report-cover-inner {
  max-width: 600px;
  width: 100%;
}

.report-cover-label {
  font-family: ${TYPOGRAPHY.sans};
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: ${PALETTE.accent};
  margin-bottom: 24px;
}

.report-cover-title {
  font-family: ${TYPOGRAPHY.serif};
  font-size: 40px;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: ${PALETTE.text};
  margin-bottom: 16px;
}

.report-cover-subtitle {
  font-family: ${TYPOGRAPHY.serif};
  font-size: 18px;
  font-weight: 400;
  font-style: italic;
  color: ${PALETTE.textSecondary};
  margin-bottom: 40px;
  line-height: 1.5;
}

.report-cover-meta {
  display: flex;
  gap: 24px;
  font-family: ${TYPOGRAPHY.sans};
  font-size: 11px;
  color: ${PALETTE.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-top: 1px solid ${PALETTE.border};
  padding-top: 16px;
}

/* Section container */
.report-section {
  padding: 40px 0;
  border-top: 1px solid ${PALETTE.border};
}

.report-section:first-of-type {
  border-top: none;
}

/* Section header */
.report-section-header {
  margin-bottom: 24px;
}

.report-section-label {
  font-family: ${TYPOGRAPHY.sans};
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: ${PALETTE.accent};
  margin-bottom: 8px;
}

.report-heading {
  font-family: ${TYPOGRAPHY.serif};
  font-size: 24px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: ${PALETTE.text};
  margin-bottom: 8px;
}

.report-subheading {
  font-family: ${TYPOGRAPHY.serif};
  font-size: 18px;
  font-weight: 400;
  font-style: italic;
  color: ${PALETTE.textDark2};
  line-height: 1.4;
}

/* Body narrative */
.report-narrative {
  font-family: ${TYPOGRAPHY.sans};
  font-size: 15px;
  line-height: 1.75;
  color: ${PALETTE.text};
  margin-bottom: 16px;
}

.report-narrative:last-child {
  margin-bottom: 0;
}

/* Pull quote */
.report-pull-quote {
  font-family: ${TYPOGRAPHY.serif};
  font-size: 20px;
  font-weight: 400;
  font-style: italic;
  line-height: 1.5;
  color: ${PALETTE.text};
  background: ${PALETTE.accentLight};
  border-left: 4px solid ${PALETTE.accent};
  padding: 20px 24px;
  margin: 32px 0;
  border-radius: 0 4px 4px 0;
}

/* Hamilton narrative block */
.hamilton-block {
  border-left: 3px solid ${PALETTE.accent};
  padding-left: 20px;
  margin: 24px 0;
}

.hamilton-block .report-narrative {
  color: ${PALETTE.text};
}

/* Data table */
.report-table-wrapper {
  margin: 24px 0;
  overflow-x: auto;
}

.report-table-caption {
  font-family: ${TYPOGRAPHY.sans};
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${PALETTE.textMuted};
  margin-bottom: 8px;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
  font-family: ${TYPOGRAPHY.sans};
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.report-table thead tr {
  border-bottom: 1px solid ${PALETTE.border};
}

.report-table th {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${PALETTE.textMuted};
  font-weight: 600;
  padding: 7px 12px;
  text-align: left;
}

.report-table td {
  padding: 7px 12px;
  border-bottom: 1px solid ${PALETTE.borderLight};
  color: ${PALETTE.text};
}

.report-table tbody tr:last-child td {
  border-bottom: none;
}

/* Chart container */
.chart-container {
  margin: 24px 0;
}

.chart-container img {
  display: block;
  max-width: 100%;
  height: auto;
}

.chart-placeholder {
  border: 1px dashed ${PALETTE.border};
  border-radius: 4px;
  background: ${PALETTE.sectionBg};
}

.chart-placeholder-inner {
  padding: 48px 24px;
  text-align: center;
  font-family: ${TYPOGRAPHY.sans};
  font-size: 12px;
  color: ${PALETTE.textMuted};
  font-style: italic;
}

.chart-caption {
  font-family: ${TYPOGRAPHY.sans};
  font-size: 11px;
  color: ${PALETTE.textMuted};
  margin-top: 8px;
  font-style: italic;
}

/* Footnote */
.footnote {
  margin-top: 40px;
  padding-top: 16px;
  border-top: 1px solid ${PALETTE.borderLight};
  font-family: ${TYPOGRAPHY.sans};
  font-size: 11px;
  color: ${PALETTE.textMuted};
  font-style: italic;
  line-height: 1.6;
}

/* Page break (print) */
.page-break {
  page-break-before: always;
  break-before: page;
  height: 0;
  margin: 0;
  padding: 0;
}
`;
