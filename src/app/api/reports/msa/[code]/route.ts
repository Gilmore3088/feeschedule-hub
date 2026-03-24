import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/crawler-db/connection";
import { getDisplayName } from "@/lib/fee-taxonomy";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MsaRow {
  msa_code: number;
  msa_name: string;
  total_deposits: number;
  institution_count: number;
  hhi: number;
  top3_share: number;
  year: number;
}

interface InstitutionDeposit {
  crawl_target_id: number;
  institution_name: string;
  total_deposits: number;
  branch_count: number;
  deposit_share: number;
}

interface FeeData {
  crawl_target_id: number;
  fee_category: string;
  amount: number;
}

interface InstitutionEntry {
  id: number;
  name: string;
  totalDeposits: number;
  branchCount: number;
  depositShare: number;
  fees: Record<string, number | null>;
}

interface CategoryWinner {
  category: string;
  displayName: string;
  cheapest: { name: string; amount: number } | null;
  mostExpensive: { name: string; amount: number } | null;
}

// ---------------------------------------------------------------------------
// Key fee categories for the MSA report
// ---------------------------------------------------------------------------

const KEY_CATEGORIES = [
  "overdraft",
  "nsf",
  "monthly_maintenance",
  "wire_domestic_outgoing",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  overdraft: "Overdraft",
  nsf: "NSF",
  monthly_maintenance: "Monthly Maint.",
  wire_domestic_outgoing: "Wire (Dom. Out)",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: number | null): string {
  if (amount === null || amount === undefined) return "-";
  if (amount === 0) return "$0.00";
  return `$${amount.toFixed(2)}`;
}

function fmtDeposits(amount: number | null): string {
  if (!amount) return "N/A";
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(0)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

function fmtPct(value: number | null): string {
  if (value === null || value === undefined) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function fmtHhi(hhi: number): string {
  if (hhi >= 2500) return "Highly Concentrated";
  if (hhi >= 1500) return "Moderately Concentrated";
  return "Unconcentrated";
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

async function loadMsa(code: string): Promise<MsaRow | null> {
  const rows = await sql<MsaRow[]>`
    SELECT msa_code, msa_name, total_deposits, institution_count, hhi, top3_share, year
    FROM market_concentration
    WHERE msa_code = ${parseInt(code, 10)}
    ORDER BY year DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function loadInstitutionsFromBranches(msaCode: number): Promise<InstitutionDeposit[]> {
  const rows = await sql`
    SELECT
      bd.crawl_target_id,
      ct.institution_name,
      SUM(bd.deposits) as total_deposits,
      COUNT(DISTINCT bd.branch_number) as branch_count,
      0.0 as deposit_share
    FROM branch_deposits bd
    JOIN crawl_targets ct ON ct.id = bd.crawl_target_id
    WHERE bd.msa_code = ${msaCode}
      AND bd.crawl_target_id IS NOT NULL
      AND bd.year = (SELECT MAX(year) FROM branch_deposits WHERE msa_code = ${msaCode})
    GROUP BY bd.crawl_target_id, ct.institution_name
    ORDER BY total_deposits DESC
  `;

  const institutions = [...rows] as unknown as InstitutionDeposit[];

  // Compute deposit shares
  const totalDeposits = institutions.reduce(
    (sum, inst) => sum + (Number(inst.total_deposits) || 0),
    0,
  );
  if (totalDeposits > 0) {
    for (const inst of institutions) {
      inst.deposit_share = (Number(inst.total_deposits) || 0) / totalDeposits;
    }
  }

  return institutions;
}

async function loadInstitutionsFromCbsa(cbsaCode: string): Promise<InstitutionDeposit[]> {
  const rows = await sql`
    SELECT
      id as crawl_target_id,
      institution_name,
      0 as total_deposits,
      0 as branch_count,
      0.0 as deposit_share
    FROM crawl_targets
    WHERE cbsa_code = ${cbsaCode}
      AND status = 'active'
    ORDER BY asset_size DESC NULLS LAST
  `;
  return [...rows] as unknown as InstitutionDeposit[];
}

async function loadFees(targetIds: number[]): Promise<FeeData[]> {
  if (targetIds.length === 0) return [];

  const rows = await sql<FeeData[]>`
    SELECT crawl_target_id, fee_category, amount
    FROM extracted_fees
    WHERE crawl_target_id IN ${sql(targetIds)}
      AND review_status != 'rejected'
      AND fee_category IS NOT NULL
      AND amount IS NOT NULL
      AND amount > 0
  `;
  return [...rows] as FeeData[];
}

// ---------------------------------------------------------------------------
// Build report data
// ---------------------------------------------------------------------------

function buildEntries(
  institutions: InstitutionDeposit[],
  fees: FeeData[],
): InstitutionEntry[] {
  // Group fees by target ID and category (take median if multiple)
  const feeMap = new Map<number, Map<string, number[]>>();
  for (const f of fees) {
    if (!feeMap.has(f.crawl_target_id)) feeMap.set(f.crawl_target_id, new Map());
    const catMap = feeMap.get(f.crawl_target_id)!;
    if (!catMap.has(f.fee_category)) catMap.set(f.fee_category, []);
    catMap.get(f.fee_category)!.push(f.amount);
  }

  return institutions.map((inst) => {
    const catMap = feeMap.get(inst.crawl_target_id);
    const feeObj: Record<string, number | null> = {};

    for (const cat of KEY_CATEGORIES) {
      const amounts = catMap?.get(cat);
      if (amounts && amounts.length > 0) {
        amounts.sort((a, b) => a - b);
        const mid = Math.floor(amounts.length / 2);
        feeObj[cat] =
          amounts.length % 2 === 0
            ? (amounts[mid - 1] + amounts[mid]) / 2
            : amounts[mid];
      } else {
        feeObj[cat] = null;
      }
    }

    return {
      id: inst.crawl_target_id,
      name: inst.institution_name,
      totalDeposits: Number(inst.total_deposits) || 0,
      branchCount: Number(inst.branch_count) || 0,
      depositShare: Number(inst.deposit_share) || 0,
      fees: feeObj,
    };
  });
}

function findCategoryWinners(entries: InstitutionEntry[]): CategoryWinner[] {
  return KEY_CATEGORIES.map((cat) => {
    const withFee = entries.filter((e) => e.fees[cat] !== null);
    if (withFee.length === 0) {
      return {
        category: cat,
        displayName: CATEGORY_LABELS[cat] || getDisplayName(cat),
        cheapest: null,
        mostExpensive: null,
      };
    }

    const sorted = [...withFee].sort(
      (a, b) => (a.fees[cat] ?? 0) - (b.fees[cat] ?? 0),
    );
    return {
      category: cat,
      displayName: CATEGORY_LABELS[cat] || getDisplayName(cat),
      cheapest: { name: sorted[0].name, amount: sorted[0].fees[cat]! },
      mostExpensive: {
        name: sorted[sorted.length - 1].name,
        amount: sorted[sorted.length - 1].fees[cat]!,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

function generateHtml(
  msa: MsaRow,
  entries: InstitutionEntry[],
  winners: CategoryWinner[],
  hasBranchData: boolean,
): string {
  const generatedAt = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const instWithFees = entries.filter((e) =>
    KEY_CATEGORIES.some((cat) => e.fees[cat] !== null),
  );

  function institutionRow(entry: InstitutionEntry, rank: number): string {
    const depositCell = hasBranchData
      ? `<td class="amount">${fmtDeposits(entry.totalDeposits)}</td>
         <td class="amount">${fmtPct(entry.depositShare)}</td>
         <td class="amount">${entry.branchCount || "-"}</td>`
      : "";

    const feeCells = KEY_CATEGORIES.map((cat) => {
      const val = entry.fees[cat];
      if (val === null) return `<td class="amount muted">-</td>`;

      // Highlight cheapest/most expensive
      const winner = winners.find((w) => w.category === cat);
      let cls = "amount";
      if (winner?.cheapest && val <= winner.cheapest.amount) cls += " best";
      else if (winner?.mostExpensive && val >= winner.mostExpensive.amount)
        cls += " worst";

      return `<td class="${cls}">${fmt(val)}</td>`;
    }).join("\n            ");

    return `
          <tr>
            <td class="rank">${rank}</td>
            <td class="inst-name">
              <a href="/api/reports/institution/${entry.id}?format=html">${escapeHtml(entry.name)}</a>
            </td>
            ${depositCell}
            ${feeCells}
          </tr>`;
  }

  function winnerCard(w: CategoryWinner): string {
    if (!w.cheapest && !w.mostExpensive) return "";
    return `
        <div class="winner-card">
          <div class="winner-category">${escapeHtml(w.displayName)}</div>
          ${w.cheapest ? `
          <div class="winner-row best">
            <span class="winner-label">Lowest</span>
            <span class="winner-value">${fmt(w.cheapest.amount)}</span>
            <span class="winner-inst">${escapeHtml(w.cheapest.name)}</span>
          </div>` : ""}
          ${w.mostExpensive ? `
          <div class="winner-row worst">
            <span class="winner-label">Highest</span>
            <span class="winner-value">${fmt(w.mostExpensive.amount)}</span>
            <span class="winner-inst">${escapeHtml(w.mostExpensive.name)}</span>
          </div>` : ""}
        </div>`;
  }

  const depositHeaders = hasBranchData
    ? `<th class="right">Deposits</th>
              <th class="right">Share</th>
              <th class="right">Branches</th>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MSA Market Report - ${escapeHtml(msa.msa_name)}</title>
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
      max-width: 960px;
      margin: 0 auto;
      padding: 48px 40px 64px;
    }

    @media print {
      .page { padding: 24px; max-width: 100%; }
      .no-print { display: none !important; }
      a { color: inherit; text-decoration: none; }
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
    .report-type {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #7A7062;
      margin-bottom: 6px;
    }
    .msa-name {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 32px;
      font-weight: 500;
      line-height: 1.15;
      letter-spacing: -0.02em;
      color: #1A1815;
    }
    .msa-subtitle {
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
    .info-detail {
      margin-top: 2px;
      font-size: 11px;
      color: #A09788;
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

    /* Winner cards */
    .winner-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    .winner-card {
      background: #fff;
      border: 1px solid #E8DFD1;
      border-radius: 8px;
      padding: 16px;
    }
    .winner-category {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #7A7062;
      margin-bottom: 10px;
    }
    .winner-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      padding: 4px 0;
    }
    .winner-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      width: 60px;
      flex-shrink: 0;
    }
    .winner-row.best .winner-label { color: #059669; }
    .winner-row.worst .winner-label { color: #DC2626; }
    .winner-value {
      font-size: 15px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      width: 60px;
      flex-shrink: 0;
    }
    .winner-row.best .winner-value { color: #059669; }
    .winner-row.worst .winner-value { color: #DC2626; }
    .winner-inst {
      font-size: 12px;
      color: #7A7062;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Table */
    .table-wrap {
      border: 1px solid #E8DFD1;
      border-radius: 8px;
      overflow-x: auto;
      background: #fff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      min-width: 700px;
    }
    thead th {
      background: #FAFAF8;
      border-bottom: 1px solid #E8DFD1;
      padding: 10px 12px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #A09788;
      text-align: left;
      white-space: nowrap;
    }
    thead th.right { text-align: right; }
    tbody td {
      padding: 9px 12px;
      border-bottom: 1px solid #F0EBE3;
      vertical-align: middle;
    }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: #FAFAF8; }

    .rank {
      font-size: 11px;
      color: #A09788;
      font-weight: 600;
      width: 30px;
      text-align: center;
    }
    .inst-name {
      font-weight: 500;
      color: #1A1815;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 220px;
    }
    .inst-name a {
      color: #1A1815;
      text-decoration: none;
      border-bottom: 1px dashed #E8DFD1;
    }
    .inst-name a:hover {
      color: #C44B2E;
      border-bottom-color: #C44B2E;
    }
    .amount {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 500;
      white-space: nowrap;
    }
    .amount.muted { color: #A09788; font-weight: 400; }
    .amount.best { color: #059669; }
    .amount.worst { color: #DC2626; }

    /* No-data message */
    .no-data {
      background: #FAF7F2;
      border: 1px solid #E8DFD1;
      border-radius: 8px;
      padding: 32px;
      text-align: center;
    }
    .no-data p {
      font-size: 14px;
      color: #7A7062;
      margin-bottom: 8px;
    }
    .no-data .label {
      font-size: 12px;
      color: #A09788;
    }

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
      .msa-name { font-size: 24px; }
      .info-grid { grid-template-columns: repeat(2, 1fr); }
      .winner-grid { grid-template-columns: 1fr; }
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
      <div class="report-type">MSA Market Report</div>
      <h1 class="msa-name">${escapeHtml(msa.msa_name)}</h1>
      <p class="msa-subtitle">CBSA Code ${msa.msa_code} &middot; ${msa.year} Summary of Deposits</p>
      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">Total Deposits</div>
          <div class="info-value">${fmtDeposits(msa.total_deposits)}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Institutions</div>
          <div class="info-value">${msa.institution_count}</div>
          <div class="info-detail">${instWithFees.length} with fee data</div>
        </div>
        <div class="info-card">
          <div class="info-label">HHI</div>
          <div class="info-value">${msa.hhi.toLocaleString()}</div>
          <div class="info-detail">${fmtHhi(msa.hhi)}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Top 3 Share</div>
          <div class="info-value">${fmtPct(msa.top3_share)}</div>
        </div>
      </div>
    </div>

    <!-- Fee Comparison -->
    ${winners.some((w) => w.cheapest) ? `
    <div class="section">
      <h2>Fee Comparison</h2>
      <p class="section-subtitle">Which institutions charge the lowest and highest fees in this market.</p>
      <div class="winner-grid">
        ${winners.map(winnerCard).join("")}
      </div>
    </div>` : ""}

    <!-- Institution Table -->
    <div class="section">
      <h2>Institutions in Market</h2>
      <p class="section-subtitle">
        ${entries.length} institution${entries.length !== 1 ? "s" : ""}${hasBranchData ? " ranked by deposit share" : " in this CBSA"}.
        Fee amounts are median values from non-rejected observations.
      </p>
      ${entries.length > 0 ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Institution</th>
              ${depositHeaders}
              ${KEY_CATEGORIES.map((cat) => `<th class="right">${CATEGORY_LABELS[cat] || cat}</th>`).join("\n              ")}
            </tr>
          </thead>
          <tbody>
            ${entries.map((e, i) => institutionRow(e, i + 1)).join("")}
          </tbody>
        </table>
      </div>` : `
      <div class="no-data">
        <p>No institution data available for this MSA yet.</p>
        <span class="label">MSA data is currently being ingested. Check back soon.</span>
      </div>`}
    </div>

    <!-- Footer -->
    <div class="footer">
      <div class="methodology">
        <h3>Methodology</h3>
        <p>
          Deposit data sourced from FDIC Summary of Deposits (SOD) for ${msa.year}.
          HHI (Herfindahl-Hirschman Index) computed from individual institution deposit shares;
          values above 2,500 indicate high concentration, 1,500-2,500 moderate concentration.
          Fee amounts extracted from published fee schedules using automated extraction
          with manual review. Green indicates the lowest fee in this market; red indicates
          the highest.
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

interface MsaReportJson {
  msa: {
    code: number;
    name: string;
    year: number;
    total_deposits: number;
    institution_count: number;
    hhi: number;
    hhi_classification: string;
    top3_share: number;
  };
  institutions: {
    id: number;
    name: string;
    total_deposits: number;
    branch_count: number;
    deposit_share: number;
    fees: Record<string, number | null>;
  }[];
  fee_comparison: CategoryWinner[];
  generated_at: string;
  has_branch_data: boolean;
}

function buildJson(
  msa: MsaRow,
  entries: InstitutionEntry[],
  winners: CategoryWinner[],
  hasBranchData: boolean,
): MsaReportJson {
  return {
    msa: {
      code: msa.msa_code,
      name: msa.msa_name,
      year: msa.year,
      total_deposits: msa.total_deposits,
      institution_count: msa.institution_count,
      hhi: msa.hhi,
      hhi_classification: fmtHhi(msa.hhi),
      top3_share: msa.top3_share,
    },
    institutions: entries.map((e) => ({
      id: e.id,
      name: e.name,
      total_deposits: e.totalDeposits,
      branch_count: e.branchCount,
      deposit_share: e.depositShare,
      fees: e.fees,
    })),
    fee_comparison: winners,
    generated_at: new Date().toISOString(),
    has_branch_data: hasBranchData,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const format = request.nextUrl.searchParams.get("format") ?? "html";

  if (!/^\d+$/.test(code)) {
    return NextResponse.json(
      { error: "Invalid MSA/CBSA code. Must be numeric." },
      { status: 400 },
    );
  }

  try {
    const msa = await loadMsa(code);
    if (!msa) {
      return NextResponse.json(
        { error: `No market concentration data found for CBSA code ${code}` },
        { status: 404 },
      );
    }

    // Try branch_deposits first
    let institutions = await loadInstitutionsFromBranches(msa.msa_code);
    let hasBranchData = true;

    // Fallback to cbsa_code on crawl_targets
    if (institutions.length === 0) {
      institutions = await loadInstitutionsFromCbsa(code);
      hasBranchData = false;
    }

    // Load fees for all found institutions
    const targetIds = institutions
      .map((inst) => inst.crawl_target_id)
      .filter((id) => id != null);
    const fees = await loadFees(targetIds);

    const entries = buildEntries(institutions, fees);
    const winners = findCategoryWinners(entries);

    if (format === "json") {
      return NextResponse.json(buildJson(msa, entries, winners, hasBranchData));
    }

    const html = generateHtml(msa, entries, winners, hasBranchData);
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate MSA report", detail: message },
      { status: 500 },
    );
  }
}
