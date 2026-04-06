/**
 * wrapReport — wraps component HTML in a complete, standalone HTML document.
 *
 * Output is ready for Playwright page.setContent() + page.pdf().
 * All styles are inlined; no external CSS dependencies.
 */

import { REPORT_CSS } from "./styles";

export interface ReportMetadata {
  title: string;
  author?: string;  // Defaults to "Bank Fee Index — Hamilton"
  date: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wraps component HTML in a complete standalone HTML document with all fonts
 * and styles inlined. The output string can be passed directly to Playwright's
 * page.setContent() for PDF generation.
 *
 * @param body - HTML string from composing component functions
 * @param meta - Report title, author, and date for <head> metadata
 */
export function wrapReport(body: string, meta: ReportMetadata): string {
  const author = meta.author ?? "Bank Fee Index \u2014 Hamilton";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(meta.title)}</title>
<meta name="author" content="${escapeHtml(author)}"/>
<meta name="date" content="${escapeHtml(meta.date)}"/>
<style>
${REPORT_CSS}
</style>
</head>
<body>
${body}
</body>
</html>`;
}
