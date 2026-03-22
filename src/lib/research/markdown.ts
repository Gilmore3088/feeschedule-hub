/** Markdown to HTML with headings, tables, lists, and inline formatting */
export function simpleMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr class="my-4 border-[#E8DFD1]" />');

  // Tables
  html = html.replace(
    /^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_match, header: string, _sep: string, body: string) => {
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

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-[13px] font-bold text-[#1A1815] mt-4 mb-1">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-[14px] font-bold text-[#1A1815] mt-5 mb-1.5">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-[15px] font-bold text-[#1A1815] mt-6 mb-2 pb-1 border-b border-[#E8DFD1]">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-[16px] font-extrabold text-[#1A1815] mt-6 mb-2">$1</h1>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-[#E8DFD1]/40 px-1 text-[11px]">$1</code>'
  );

  // Links
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[#C44B2E] underline">$1</a>'
  );

  // Numbered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="list-decimal">$1</li>');
  html = html.replace(
    /(<li class="list-decimal">.*<\/li>\n?)+/g,
    '<ol class="list-decimal ml-4 space-y-0.5">$&</ol>'
  );

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>(?!.*class=).*<\/li>\n?)+/g, '<ul class="list-disc ml-4 space-y-0.5">$&</ul>');

  // Paragraphs
  html = html.replace(/\n\n/g, "</p><p>");
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs around block elements
  html = html.replace(/<p>\s*(<h[1-4]|<table|<ul|<ol|<hr)/g, "$1");
  html = html.replace(/(<\/h[1-4]>|<\/table>|<\/ul>|<\/ol>|<hr[^>]*\/>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*<\/p>/g, "");

  return html;
}

/** Extract markdown tables as structured data for rendering */
export function extractTableData(markdown: string): { headers: string[]; rows: string[][] }[] {
  const tables: { headers: string[]; rows: string[][] }[] = [];
  const tableRegex = /(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/g;
  let match;

  while ((match = tableRegex.exec(markdown)) !== null) {
    const headers = match[1].split("|").filter(Boolean).map((h) => h.trim());
    const rows = match[3].trim().split("\n").map((line) =>
      line.split("|").filter(Boolean).map((c) => c.trim())
    );
    tables.push({ headers, rows });
  }

  return tables;
}

/** Extract key metrics (dollar amounts, percentages) from text */
export function extractMetrics(text: string): { label: string; value: string }[] {
  const metrics: { label: string; value: string }[] = [];

  // Match patterns like "median is $35.00" or "Median: $28.00"
  const patterns = [
    /(?:median|average|mean)\s+(?:is|:)\s*\$[\d,.]+/gi,
    /\$[\d,.]+\s+(?:median|average|national)/gi,
    /(?:P25|P75|25th|75th)[^$]*\$[\d,.]+/gi,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches.slice(0, 4)) {
        const dollarMatch = m.match(/\$[\d,.]+/);
        const labelMatch = m.replace(/\$[\d,.]+/, "").replace(/[:/]/g, "").trim();
        if (dollarMatch) {
          metrics.push({
            label: labelMatch || "Value",
            value: dollarMatch[0],
          });
        }
      }
    }
  }

  return metrics.slice(0, 6);
}
