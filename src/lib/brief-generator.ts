import { getDisplayName, isFeaturedFee } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import type { IndexEntry } from "@/lib/crawler-db/fee-index";

interface BriefOptions {
  title: string;
  subtitle: string;
  peerIndex: IndexEntry[];
  nationalIndex: IndexEntry[];
  generatedAt?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function generatePeerBrief(opts: BriefOptions): string {
  const { title, subtitle, peerIndex, nationalIndex } = opts;
  const now = opts.generatedAt || new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const nationalMap = new Map(
    nationalIndex.map((e) => [e.fee_category, e])
  );

  // Build comparison rows
  const rows = peerIndex
    .filter((e) => e.median_amount !== null)
    .map((e) => {
      const nat = nationalMap.get(e.fee_category);
      const natMedian = nat?.median_amount ?? null;
      const delta =
        e.median_amount !== null && natMedian !== null && natMedian !== 0
          ? ((e.median_amount - natMedian) / Math.abs(natMedian)) * 100
          : null;
      return {
        category: e.fee_category,
        peerMedian: e.median_amount!,
        p25: e.p25_amount,
        p75: e.p75_amount,
        nationalMedian: natMedian,
        delta,
        peerCount: e.institution_count,
        featured: isFeaturedFee(e.fee_category),
      };
    })
    .sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return (b.peerCount ?? 0) - (a.peerCount ?? 0);
    });

  const featured = rows.filter((r) => r.featured);
  const extended = rows.filter((r) => !r.featured);

  const belowNational = rows.filter((r) => r.delta !== null && r.delta < -2);
  const aboveNational = rows.filter((r) => r.delta !== null && r.delta > 2);
  const totalInstitutions = Math.max(...peerIndex.map((e) => e.institution_count), 0);
  const totalObservations = peerIndex.reduce((s, e) => s + e.observation_count, 0);

  function deltaCell(delta: number | null): string {
    if (delta === null) return '<td style="text-align:right;color:#a0a0a0;">--</td>';
    const color = delta < -2 ? "#059669" : delta > 2 ? "#dc2626" : "#6b7280";
    const sign = delta > 0 ? "+" : "";
    return `<td style="text-align:right;font-weight:600;color:${color};">${sign}${delta.toFixed(1)}%</td>`;
  }

  function tableRows(data: typeof rows): string {
    return data.map((r) => `
      <tr>
        <td style="font-weight:500;">${escapeHtml(getDisplayName(r.category))}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${formatAmount(r.peerMedian)}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:#6b7280;">${r.p25 !== null ? formatAmount(r.p25) : "--"}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:#6b7280;">${r.p75 !== null ? formatAmount(r.p75) : "--"}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:#6b7280;">${r.nationalMedian !== null ? formatAmount(r.nationalMedian) : "--"}</td>
        ${deltaCell(r.delta)}
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:#9ca3af;">${r.peerCount}</td>
      </tr>
    `).join("");
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)} - Bank Fee Index</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    color: #1a1815;
    background: #fff;
    line-height: 1.6;
    max-width: 800px;
    margin: 0 auto;
    padding: 48px 32px;
  }
  .header {
    border-bottom: 2px solid #1a1815;
    padding-bottom: 16px;
    margin-bottom: 32px;
  }
  .header h1 {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 4px;
  }
  .header .subtitle {
    font-size: 14px;
    color: #7a7062;
  }
  .header .meta {
    font-size: 11px;
    color: #a09788;
    margin-top: 8px;
    font-family: -apple-system, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 32px;
  }
  .summary-card {
    border: 1px solid #e8dfd1;
    border-radius: 8px;
    padding: 12px 16px;
    text-align: center;
  }
  .summary-card .value {
    font-size: 22px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .summary-card .label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #a09788;
    font-family: -apple-system, sans-serif;
    margin-top: 2px;
  }
  h2 {
    font-size: 16px;
    font-weight: 600;
    margin: 32px 0 12px;
    color: #1a1815;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-family: -apple-system, sans-serif;
  }
  thead th {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #a09788;
    font-weight: 600;
    padding: 8px 12px;
    border-bottom: 1px solid #e8dfd1;
    text-align: left;
  }
  thead th:not(:first-child) { text-align: right; }
  tbody td {
    padding: 6px 12px;
    border-bottom: 1px solid #f0e8dc;
    color: #1a1815;
  }
  .section-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #c44b2e;
    font-weight: 700;
    font-family: -apple-system, sans-serif;
    margin: 24px 0 8px;
  }
  .methodology {
    margin-top: 40px;
    padding: 16px 20px;
    border: 1px solid #e8dfd1;
    border-radius: 8px;
    background: #faf7f2;
    font-size: 12px;
    color: #7a7062;
    font-family: -apple-system, sans-serif;
  }
  .methodology strong {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #a09788;
    margin-bottom: 6px;
  }
  .footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid #e8dfd1;
    font-size: 11px;
    color: #a09788;
    font-family: -apple-system, sans-serif;
    text-align: center;
  }
  @media print {
    body { padding: 24px 16px; }
    .no-print { display: none; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>${escapeHtml(title)}</h1>
  <div class="subtitle">${escapeHtml(subtitle)}</div>
  <div class="meta">Bank Fee Index &mdash; ${escapeHtml(now)}</div>
</div>

<div class="summary">
  <div class="summary-card">
    <div class="value">${totalInstitutions.toLocaleString()}</div>
    <div class="label">Institutions</div>
  </div>
  <div class="summary-card">
    <div class="value">${totalObservations.toLocaleString()}</div>
    <div class="label">Observations</div>
  </div>
  <div class="summary-card">
    <div class="value" style="color:#059669;">${belowNational.length}</div>
    <div class="label">Below national</div>
  </div>
  <div class="summary-card">
    <div class="value" style="color:#dc2626;">${aboveNational.length}</div>
    <div class="label">Above national</div>
  </div>
</div>

${featured.length > 0 ? `
<div class="section-label">Featured Fees</div>
<table>
  <thead>
    <tr>
      <th>Category</th>
      <th>Peer Median</th>
      <th>P25</th>
      <th>P75</th>
      <th>National</th>
      <th>Delta</th>
      <th>n</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows(featured)}
  </tbody>
</table>
` : ""}

${extended.length > 0 ? `
<div class="section-label">Extended Fees</div>
<table>
  <thead>
    <tr>
      <th>Category</th>
      <th>Peer Median</th>
      <th>P25</th>
      <th>P75</th>
      <th>National</th>
      <th>Delta</th>
      <th>n</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows(extended)}
  </tbody>
</table>
` : ""}

<div class="methodology">
  <strong>Methodology</strong>
  Peer median computed from ${totalObservations.toLocaleString()} fee observations across
  ${totalInstitutions.toLocaleString()} institutions matching the selected segment filters.
  National median includes all tracked institutions regardless of segment.
  Delta represents the percentage difference between peer and national medians.
  Data includes approved, staged, and pending observations with maturity classification.
</div>

<div class="footer">
  Bank Fee Index &mdash; bankfeeindex.com &mdash; Generated ${escapeHtml(now)}
</div>

</body>
</html>`;
}
