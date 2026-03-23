import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/crawler-db/connection";
import {
  getDisplayName,
  getFeeFamily,
  getSpotlightCategories,
  FEE_FAMILIES,
} from "@/lib/fee-taxonomy";
import { TIER_LABELS, DISTRICT_NAMES } from "@/lib/fed-districts";
import { STATE_NAMES } from "@/lib/us-states";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InstitutionRow {
  id: number;
  institution_name: string;
  state_code: string | null;
  charter_type: string;
  asset_size: number | null;
  asset_size_tier: string | null;
  fed_district: number | null;
  city: string | null;
}

interface FeeRow {
  fee_name: string;
  amount: number;
  frequency: string | null;
  conditions: string | null;
  fee_category: string | null;
}

interface PeerFeeRow {
  fee_category: string;
  amount: number;
}

interface FeeComparison {
  category: string;
  displayName: string;
  family: string | null;
  amount: number;
  frequency: string | null;
  conditions: string | null;
  peerMedian: number | null;
  peerP25: number | null;
  peerP75: number | null;
  peerCount: number;
  delta: number | null;
  deltaPct: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function fmt(amount: number | null): string {
  if (amount === null) return "-";
  if (amount === 0) return "$0.00";
  return `$${amount.toFixed(2)}`;
}

function fmtAssets(assets: number | null): string {
  if (!assets) return "N/A";
  if (assets > 1_000_000) return `$${(assets / 1_000_000).toFixed(1)}B`;
  if (assets > 1_000) return `$${(assets / 1_000).toFixed(0)}M`;
  return `$${assets}K`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadInstitution(id: number): Promise<InstitutionRow | null> {
  const rows = await sql<InstitutionRow[]>`
    SELECT id, institution_name, state_code, charter_type,
           asset_size, asset_size_tier, fed_district, city
    FROM crawl_targets
    WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

async function loadApprovedFees(targetId: number): Promise<FeeRow[]> {
  return await sql<FeeRow[]>`
    SELECT fee_name, amount, frequency, conditions, fee_category
    FROM extracted_fees
    WHERE crawl_target_id = ${targetId}
      AND review_status = 'approved'
      AND amount IS NOT NULL
      AND amount > 0
    ORDER BY fee_name
  `;
}

async function loadPeerFees(
  inst: InstitutionRow,
  limit: number,
): Promise<Map<string, number[]>> {
  // Find closest peers: same charter type, ordered by asset size proximity,
  // with same-state institutions preferred (sorted first at equal distance).
  const assetSize = inst.asset_size ?? 0;

  const peerInstitutions = await sql.unsafe(
    `SELECT id FROM crawl_targets
     WHERE charter_type = $1
       AND id != $2
       AND fee_schedule_url IS NOT NULL
     ORDER BY
       CASE WHEN state_code = $3 THEN 0 ELSE 1 END,
       ABS(COALESCE(asset_size, 0) - $4)
     LIMIT $5`,
    [inst.charter_type, inst.id, inst.state_code ?? "", assetSize, limit],
  ) as { id: number }[];

  if (peerInstitutions.length === 0) {
    return new Map();
  }

  const peerIds = peerInstitutions.map((p) => p.id);

  const rows = await sql<PeerFeeRow[]>`
    SELECT fee_category, amount
    FROM extracted_fees
    WHERE crawl_target_id IN ${sql(peerIds)}
      AND review_status != 'rejected'
      AND fee_category IS NOT NULL
      AND amount IS NOT NULL
      AND amount > 0
  `;

  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    if (!grouped.has(row.fee_category)) {
      grouped.set(row.fee_category, []);
    }
    grouped.get(row.fee_category)!.push(row.amount);
  }

  // Sort each array for median/percentile computation
  for (const amounts of grouped.values()) {
    amounts.sort((a, b) => a - b);
  }

  return grouped;
}

function buildComparisons(
  fees: FeeRow[],
  peerData: Map<string, number[]>,
): FeeComparison[] {
  const comparisons: FeeComparison[] = [];

  for (const fee of fees) {
    const category = fee.fee_category ?? fee.fee_name;
    const peerAmounts = peerData.get(category) ?? [];
    const peerMed = median(peerAmounts);
    const peerP25 = percentile(peerAmounts, 25);
    const peerP75 = percentile(peerAmounts, 75);
    const delta = peerMed !== null ? fee.amount - peerMed : null;
    const deltaPct =
      peerMed !== null && peerMed > 0
        ? ((fee.amount - peerMed) / peerMed) * 100
        : null;

    comparisons.push({
      category,
      displayName: getDisplayName(category),
      family: getFeeFamily(category),
      amount: fee.amount,
      frequency: fee.frequency,
      conditions: fee.conditions,
      peerMedian: peerMed,
      peerP25,
      peerP75,
      peerCount: peerAmounts.length,
      delta,
      deltaPct,
    });
  }

  return comparisons;
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

function generateHtml(
  inst: InstitutionRow,
  comparisons: FeeComparison[],
  peerCount: number,
): string {
  const charterLabel = inst.charter_type === "bank" ? "Bank" : "Credit Union";
  const stateName = inst.state_code ? STATE_NAMES[inst.state_code] ?? inst.state_code : null;
  const tierLabel = inst.asset_size_tier ? TIER_LABELS[inst.asset_size_tier] ?? inst.asset_size_tier : null;
  const districtName = inst.fed_district ? DISTRICT_NAMES[inst.fed_district] : null;
  const generatedAt = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Summary counts
  const withPeerData = comparisons.filter((c) => c.peerMedian !== null);
  const belowMedian = withPeerData.filter(
    (c) => c.deltaPct !== null && c.deltaPct < -0.5,
  );
  const aboveMedian = withPeerData.filter(
    (c) => c.deltaPct !== null && c.deltaPct > 0.5,
  );
  const atMedian = withPeerData.filter(
    (c) => c.deltaPct !== null && Math.abs(c.deltaPct) <= 0.5,
  );
  const competitiveScore =
    withPeerData.length > 0
      ? Math.round(
          ((belowMedian.length + atMedian.length) / withPeerData.length) * 100,
        )
      : null;

  // Spotlight fees
  const spotlightCategories = new Set(getSpotlightCategories());
  const spotlightFees = comparisons.filter((c) =>
    spotlightCategories.has(c.category),
  );

  // Group by family
  const familyOrder = Object.keys(FEE_FAMILIES);
  const byFamily = new Map<string, FeeComparison[]>();
  for (const comp of comparisons) {
    const fam = comp.family ?? "Other";
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam)!.push(comp);
  }

  function deltaCell(comp: FeeComparison): string {
    if (comp.deltaPct === null) {
      return `<td class="delta-cell neutral">-</td>`;
    }
    if (Math.abs(comp.deltaPct) <= 0.5) {
      return `<td class="delta-cell neutral">At median</td>`;
    }
    const cls = comp.deltaPct < 0 ? "below" : "above";
    const sign = comp.deltaPct > 0 ? "+" : "";
    return `<td class="delta-cell ${cls}">${sign}${comp.deltaPct.toFixed(0)}%</td>`;
  }

  function deltaBadge(comp: FeeComparison): string {
    if (comp.deltaPct === null) return "";
    if (Math.abs(comp.deltaPct) <= 0.5) {
      return `<span class="badge badge-neutral">At median</span>`;
    }
    const cls = comp.deltaPct < 0 ? "badge-below" : "badge-above";
    const sign = comp.deltaPct > 0 ? "+" : "";
    return `<span class="badge ${cls}">${sign}${comp.deltaPct.toFixed(0)}%</span>`;
  }

  function spotlightCard(comp: FeeComparison): string {
    const peerStr = comp.peerMedian !== null ? fmt(comp.peerMedian) : "N/A";
    return `
      <div class="spotlight-card">
        <div class="spotlight-label">${escapeHtml(comp.displayName)}</div>
        <div class="spotlight-amount">${fmt(comp.amount)}</div>
        <div class="spotlight-peer">Peer median: ${peerStr}</div>
        <div class="spotlight-delta">${deltaBadge(comp)}</div>
      </div>`;
  }

  function feeTableRows(): string {
    const rows: string[] = [];

    for (const family of familyOrder) {
      const familyFees = byFamily.get(family);
      if (!familyFees || familyFees.length === 0) continue;

      rows.push(`
        <tr class="family-header">
          <td colspan="5">${escapeHtml(family)}</td>
        </tr>`);

      for (const comp of familyFees) {
        rows.push(`
          <tr>
            <td class="fee-name">
              ${escapeHtml(comp.displayName)}
              ${comp.conditions ? `<span class="conditions">${escapeHtml(comp.conditions)}</span>` : ""}
            </td>
            <td class="amount">${fmt(comp.amount)}</td>
            <td class="amount peer">${comp.peerMedian !== null ? fmt(comp.peerMedian) : "-"}</td>
            <td class="amount peer-range">${comp.peerP25 !== null && comp.peerP75 !== null ? `${fmt(comp.peerP25)} - ${fmt(comp.peerP75)}` : "-"}</td>
            ${deltaCell(comp)}
          </tr>`);
      }
    }

    // "Other" family for uncategorized fees
    const otherFees = byFamily.get("Other");
    if (otherFees && otherFees.length > 0) {
      rows.push(`
        <tr class="family-header">
          <td colspan="5">Other</td>
        </tr>`);
      for (const comp of otherFees) {
        rows.push(`
          <tr>
            <td class="fee-name">
              ${escapeHtml(comp.displayName)}
              ${comp.conditions ? `<span class="conditions">${escapeHtml(comp.conditions)}</span>` : ""}
            </td>
            <td class="amount">${fmt(comp.amount)}</td>
            <td class="amount peer">${comp.peerMedian !== null ? fmt(comp.peerMedian) : "-"}</td>
            <td class="amount peer-range">${comp.peerP25 !== null && comp.peerP75 !== null ? `${fmt(comp.peerP25)} - ${fmt(comp.peerP75)}` : "-"}</td>
            ${deltaCell(comp)}
          </tr>`);
      }
    }

    return rows.join("");
  }

  const scoreHtml =
    competitiveScore !== null
      ? `
      <div class="score-section">
        <div class="score-grid">
          <div class="score-card score-main">
            <div class="score-value ${competitiveScore >= 70 ? "score-good" : competitiveScore >= 40 ? "score-mixed" : "score-high"}">${competitiveScore}</div>
            <div class="score-label">Competitive Score</div>
          </div>
          <div class="score-card">
            <div class="score-value score-good">${belowMedian.length}</div>
            <div class="score-label">Below Median</div>
          </div>
          <div class="score-card">
            <div class="score-value score-neutral">${atMedian.length}</div>
            <div class="score-label">At Median</div>
          </div>
          <div class="score-card">
            <div class="score-value score-high">${aboveMedian.length}</div>
            <div class="score-label">Above Median</div>
          </div>
        </div>
        <p class="score-footnote">${withPeerData.length} of ${comparisons.length} fees benchmarked against ${peerCount} peer institutions.</p>
      </div>`
      : "";

  const spotlightHtml =
    spotlightFees.length > 0
      ? `
      <div class="section">
        <h2>Spotlight Fees</h2>
        <p class="section-subtitle">The six most-watched fee categories in U.S. retail banking.</p>
        <div class="spotlight-grid">
          ${spotlightFees.map(spotlightCard).join("")}
        </div>
      </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Fee Report Card - ${escapeHtml(inst.institution_name)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #FAFAF8;
      color: #1A1815;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    .page {
      max-width: 860px;
      margin: 0 auto;
      padding: 48px 40px 64px;
    }

    @media print {
      .page { padding: 24px; max-width: 100%; }
      .no-print { display: none !important; }
    }

    /* Header */
    .header {
      border-bottom: 2px solid #1A1815;
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    .brand {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .brand-name {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #C44B2E;
    }
    .brand-date {
      font-size: 12px;
      color: #7A7062;
    }
    .inst-name {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 32px;
      font-weight: 500;
      line-height: 1.15;
      letter-spacing: -0.02em;
      color: #1A1815;
    }
    .inst-subtitle {
      margin-top: 6px;
      font-size: 14px;
      color: #7A7062;
    }

    /* Info grid */
    .info-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-top: 20px;
    }
    .info-card {
      background: #fff;
      border: 1px solid #E8DFD1;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .info-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #A09788;
    }
    .info-value {
      margin-top: 4px;
      font-size: 15px;
      font-weight: 600;
      color: #1A1815;
      font-variant-numeric: tabular-nums;
    }

    /* Score section */
    .score-section {
      margin-top: 32px;
    }
    .score-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
    .score-card {
      background: #fff;
      border: 1px solid #E8DFD1;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .score-main {
      border-color: #1A1815;
      border-width: 2px;
    }
    .score-value {
      font-size: 28px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
    }
    .score-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #A09788;
      margin-top: 4px;
    }
    .score-good { color: #059669; }
    .score-mixed { color: #D97706; }
    .score-high { color: #DC2626; }
    .score-neutral { color: #7A7062; }
    .score-footnote {
      margin-top: 10px;
      font-size: 12px;
      color: #A09788;
      text-align: center;
    }

    /* Sections */
    .section {
      margin-top: 36px;
    }
    .section h2 {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 20px;
      font-weight: 500;
      color: #1A1815;
      margin-bottom: 4px;
    }
    .section-subtitle {
      font-size: 13px;
      color: #7A7062;
      margin-bottom: 16px;
    }

    /* Spotlight grid */
    .spotlight-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .spotlight-card {
      background: #fff;
      border: 1px solid #E8DFD1;
      border-radius: 8px;
      padding: 16px;
    }
    .spotlight-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #7A7062;
    }
    .spotlight-amount {
      font-size: 24px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #1A1815;
      margin-top: 4px;
    }
    .spotlight-peer {
      font-size: 12px;
      color: #A09788;
      margin-top: 2px;
    }
    .spotlight-delta {
      margin-top: 6px;
    }

    /* Badges */
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 100px;
    }
    .badge-below { background: #ECFDF5; color: #059669; }
    .badge-above { background: #FEF2F2; color: #DC2626; }
    .badge-neutral { background: #F5F5F4; color: #7A7062; }

    /* Fee table */
    .fee-table-wrap {
      border: 1px solid #E8DFD1;
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    thead th {
      background: #FAFAF8;
      border-bottom: 1px solid #E8DFD1;
      padding: 10px 14px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #A09788;
      text-align: left;
    }
    thead th.right { text-align: right; }
    tbody td {
      padding: 9px 14px;
      border-bottom: 1px solid #F0EBE3;
      vertical-align: top;
    }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: #FAFAF8; }

    .family-header td {
      background: #FAF7F2;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #7A7062;
      padding: 8px 14px;
      border-bottom: 1px solid #E8DFD1;
    }

    .fee-name {
      font-weight: 500;
      color: #1A1815;
    }
    .conditions {
      display: block;
      font-size: 11px;
      color: #A09788;
      font-weight: 400;
      margin-top: 2px;
      max-width: 260px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .amount {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 500;
      white-space: nowrap;
    }
    .amount.peer { color: #7A7062; font-weight: 400; }
    .amount.peer-range { color: #A09788; font-weight: 400; font-size: 12px; }

    .delta-cell {
      text-align: right;
      font-weight: 600;
      font-size: 12px;
      white-space: nowrap;
    }
    .delta-cell.below { color: #059669; }
    .delta-cell.above { color: #DC2626; }
    .delta-cell.neutral { color: #A09788; font-weight: 400; }

    /* Footer */
    .footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid #E8DFD1;
    }
    .footer-brand {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #C44B2E;
    }
    .footer-text {
      margin-top: 8px;
      font-size: 12px;
      color: #A09788;
      line-height: 1.6;
    }
    .methodology {
      margin-top: 24px;
      background: #FAF7F2;
      border: 1px solid #E8DFD1;
      border-radius: 8px;
      padding: 16px 20px;
    }
    .methodology h3 {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #A09788;
      margin-bottom: 8px;
    }
    .methodology p {
      font-size: 12px;
      color: #7A7062;
      line-height: 1.6;
    }

    /* Responsive */
    @media (max-width: 640px) {
      .page { padding: 24px 16px 40px; }
      .inst-name { font-size: 24px; }
      .info-grid { grid-template-columns: repeat(2, 1fr); }
      .score-grid { grid-template-columns: repeat(2, 1fr); }
      .spotlight-grid { grid-template-columns: 1fr; }
      .amount.peer-range { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="brand">
        <span class="brand-name">Bank Fee Index</span>
        <span class="brand-date">Report generated ${generatedAt}</span>
      </div>
      <h1 class="inst-name">${escapeHtml(inst.institution_name)}</h1>
      <p class="inst-subtitle">
        ${escapeHtml(charterLabel)}${inst.city ? ` in ${escapeHtml(inst.city)}` : ""}${stateName ? `, ${escapeHtml(stateName)}` : ""}${districtName ? ` &middot; Fed District ${inst.fed_district} (${escapeHtml(districtName)})` : ""}
      </p>
      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">Charter Type</div>
          <div class="info-value">${escapeHtml(charterLabel)}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Asset Tier</div>
          <div class="info-value">${tierLabel ? escapeHtml(tierLabel) : "Unknown"}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Total Assets</div>
          <div class="info-value">${fmtAssets(inst.asset_size)}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Published Fees</div>
          <div class="info-value">${comparisons.length}</div>
        </div>
      </div>
    </div>

    <!-- Competitive Score -->
    ${scoreHtml}

    <!-- Spotlight Fees -->
    ${spotlightHtml}

    <!-- Full Fee Comparison -->
    <div class="section">
      <h2>Fee-by-Fee Peer Comparison</h2>
      <p class="section-subtitle">
        All published fees compared against the median of ${peerCount} closest peer institutions
        (same charter type, nearest asset size, same state preferred).
      </p>
      <div class="fee-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fee</th>
              <th class="right">Amount</th>
              <th class="right">Peer Median</th>
              <th class="right">P25 - P75</th>
              <th class="right">vs. Peers</th>
            </tr>
          </thead>
          <tbody>
            ${feeTableRows()}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div class="methodology">
        <h3>Methodology</h3>
        <p>
          Peer group: ${peerCount} ${escapeHtml(charterLabel.toLowerCase())}s selected by closest asset size
          to ${escapeHtml(inst.institution_name)}, with same-state institutions prioritized.
          Fee amounts extracted from published fee schedules using automated extraction
          with manual review. Medians computed from non-rejected observations only.
          Percentile ranges (P25-P75) represent the interquartile range of peer fees.
        </p>
      </div>
      <div style="margin-top: 20px; display: flex; justify-content: space-between; align-items: center;">
        <span class="footer-brand">Bank Fee Index</span>
        <span class="footer-text">bankfeeindex.com &middot; ${generatedAt}</span>
      </div>
      <p class="footer-text" style="margin-top: 8px;">
        This report is for informational purposes only. Fee data is sourced from
        publicly available fee schedules and may not reflect all current fees or
        promotional pricing. Contact your financial institution for the most
        up-to-date fee information.
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// JSON response shape
// ---------------------------------------------------------------------------

interface ReportJson {
  institution: {
    id: number;
    name: string;
    charter_type: string;
    state: string | null;
    city: string | null;
    asset_size: number | null;
    asset_tier: string | null;
    fed_district: number | null;
  };
  peer_count: number;
  generated_at: string;
  summary: {
    total_fees: number;
    benchmarked_fees: number;
    below_median: number;
    at_median: number;
    above_median: number;
    competitive_score: number | null;
  };
  fees: FeeComparison[];
}

function buildJson(
  inst: InstitutionRow,
  comparisons: FeeComparison[],
  peerCount: number,
): ReportJson {
  const withPeerData = comparisons.filter((c) => c.peerMedian !== null);
  const belowMedian = withPeerData.filter(
    (c) => c.deltaPct !== null && c.deltaPct < -0.5,
  );
  const aboveMedian = withPeerData.filter(
    (c) => c.deltaPct !== null && c.deltaPct > 0.5,
  );
  const atMedian = withPeerData.filter(
    (c) => c.deltaPct !== null && Math.abs(c.deltaPct) <= 0.5,
  );
  const competitiveScore =
    withPeerData.length > 0
      ? Math.round(
          ((belowMedian.length + atMedian.length) / withPeerData.length) * 100,
        )
      : null;

  return {
    institution: {
      id: inst.id,
      name: inst.institution_name,
      charter_type: inst.charter_type,
      state: inst.state_code,
      city: inst.city,
      asset_size: inst.asset_size,
      asset_tier: inst.asset_size_tier,
      fed_district: inst.fed_district,
    },
    peer_count: peerCount,
    generated_at: new Date().toISOString(),
    summary: {
      total_fees: comparisons.length,
      benchmarked_fees: withPeerData.length,
      below_median: belowMedian.length,
      at_median: atMedian.length,
      above_median: aboveMedian.length,
      competitive_score: competitiveScore,
    },
    fees: comparisons,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

const PEER_LIMIT = 50;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const instId = parseInt(id, 10);

  if (isNaN(instId)) {
    return NextResponse.json({ error: "Invalid institution ID" }, { status: 400 });
  }

  const format = request.nextUrl.searchParams.get("format") ?? "html";

  try {
    const inst = await loadInstitution(instId);
    if (!inst) {
      return NextResponse.json(
        { error: "Institution not found" },
        { status: 404 },
      );
    }

    const fees = await loadApprovedFees(instId);
    if (fees.length === 0) {
      return NextResponse.json(
        { error: "No approved fees found for this institution" },
        { status: 404 },
      );
    }

    const peerData = await loadPeerFees(inst, PEER_LIMIT);
    const comparisons = buildComparisons(fees, peerData);

    if (format === "json") {
      return NextResponse.json(buildJson(inst, comparisons, PEER_LIMIT));
    }

    const html = generateHtml(inst, comparisons, PEER_LIMIT);
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate report", detail: message },
      { status: 500 },
    );
  }
}
