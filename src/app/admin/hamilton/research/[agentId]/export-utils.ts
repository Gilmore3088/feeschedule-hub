import { getBrand } from "@/lib/brand";

/**
 * Extract all markdown tables from text and convert to CSV with branded header.
 */
export function markdownTablesToCsv(markdown: string, brandId?: string): string {
  const brand = getBrand(brandId);
  const date = new Date().toISOString().split("T")[0];

  const tableRegex = /(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/g;
  const csvSections: string[] = [];

  // Branded header rows
  csvSections.push(
    `"${brand.name} Research Export"`,
    `"Generated: ${date}"`,
    `"Source: ${brand.url}"`,
    `""`
  );

  let match;
  while ((match = tableRegex.exec(markdown)) !== null) {
    const headerLine = match[1];
    const bodyLines = match[3].trim().split("\n");

    const parseRow = (line: string) =>
      line
        .split("|")
        .filter(Boolean)
        .map((cell) => `"${cell.trim().replace(/"/g, '""')}"`)
        .join(",");

    const rows = [parseRow(headerLine), ...bodyLines.map(parseRow)];
    csvSections.push(rows.join("\n"));
  }

  return csvSections.join("\n");
}

/**
 * Check if markdown contains at least one table.
 */
export function hasMarkdownTable(markdown: string): boolean {
  return /\|.+\|\n\|[-| :]+\|\n\|.+\|/m.test(markdown);
}

/**
 * Download a string as a file in the browser.
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Build a branded HTML report from markdown content.
 */
export function buildReportHtml(
  markdown: string,
  agentName: string,
  opts?: { brandId?: string; preparedFor?: string }
): string {
  const brand = getBrand(opts?.brandId);
  const date = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  let html = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr />');

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Tables
  html = html.replace(
    /^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_match: string, header: string, _sep: string, body: string) => {
      const headers = header
        .split("|")
        .filter((c: string) => c.trim())
        .map((c: string) => `<th>${c.trim()}</th>`)
        .join("");
      const rows = body
        .trim()
        .split("\n")
        .map((row: string) => {
          const cells = row
            .split("|")
            .filter((c: string) => c.trim())
            .map((c: string) => `<td>${c.trim()}</td>`)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    }
  );

  // Numbered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => {
    if (!m.includes("list-disc")) return `<ol>${m}</ol>`;
    return m;
  });

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li class="list-disc">$1</li>');
  html = html.replace(/(<li class="list-disc">.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // Paragraphs
  html = html.replace(/\n\n/g, "</p><p>");
  html = `<p>${html}</p>`;

  // Clean up
  html = html.replace(/<p>\s*(<h[1-3]|<table|<ul|<ol|<hr)/g, "$1");
  html = html.replace(/(<\/h[1-3]>|<\/table>|<\/ul>|<\/ol>|<hr\s*\/?>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*<\/p>/g, "");

  const preparedForLine = opts?.preparedFor
    ? `<p class="prepared-for">Prepared for: ${opts.preparedFor}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${brand.name} Research Report</title>
<style>
  @page { margin: 0.75in; size: letter; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    max-width: 750px;
    margin: 0 auto;
    padding: 48px 32px;
    color: #1e293b;
    line-height: 1.7;
  }
  .report-header {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    border-bottom: 3px solid ${brand.primaryColor};
    padding-bottom: 20px;
    margin-bottom: 36px;
  }
  .report-header .logo {
    color: ${brand.accentColor};
    flex-shrink: 0;
    margin-top: 2px;
  }
  .report-header .meta h1 {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: ${brand.primaryColor};
    letter-spacing: -0.01em;
    margin: 0;
  }
  .report-header .tagline {
    font-size: 11px;
    color: #94a3b8;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-top: 2px;
  }
  .report-header .date {
    font-size: 12px;
    color: #64748b;
    margin-top: 6px;
  }
  .report-header .agent {
    font-size: 11px;
    color: #94a3b8;
    margin-top: 2px;
  }
  .prepared-for {
    font-size: 12px;
    color: #475569;
    font-weight: 600;
    margin-top: 4px;
  }
  h1 { font-size: 22px; margin: 28px 0 12px; color: #0f172a; }
  h2 { font-size: 17px; margin: 24px 0 10px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  h3 { font-size: 14px; margin: 18px 0 8px; color: #334155; }
  p { font-size: 13.5px; margin-bottom: 12px; }
  strong { color: #0f172a; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 16px 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
  }
  th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
  th {
    background: #f8fafc;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.05em;
  }
  ul, ol { margin: 8px 0 16px 20px; }
  li { font-size: 13.5px; margin-bottom: 4px; }
  .report-footer {
    margin-top: 56px;
    padding-top: 16px;
    border-top: 2px solid ${brand.primaryColor};
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .report-footer .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .report-footer .brand-name {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    font-weight: 700;
    color: ${brand.primaryColor};
  }
  .report-footer .brand-url {
    font-size: 11px;
    color: #94a3b8;
  }
  .report-footer .confidential {
    font-size: 10px;
    color: #cbd5e1;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  @media print {
    body { padding: 0; max-width: none; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="report-header">
  <div class="logo">${brand.logoSvg}</div>
  <div class="meta">
    <h1>${brand.name}</h1>
    <p class="tagline">${brand.tagline}</p>
    <p class="date">${date}</p>
    <p class="agent">Analysis by ${agentName}</p>
    ${preparedForLine}
  </div>
</div>
${html}
<div class="report-footer">
  <div class="brand">
    <span class="brand-name">${brand.name}</span>
    <span class="brand-url">${brand.url}</span>
  </div>
  <span class="confidential">Confidential</span>
</div>
</body>
</html>`;
}
