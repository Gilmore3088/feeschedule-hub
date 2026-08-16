#!/usr/bin/env node
// Studio filler: template.html + packs/<id>.json + narratives/<id>.json -> out/<id>.html
// No dependencies. Usage: node fill.mjs <institution_id>
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const DIR = dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];
if (!id) { console.error("usage: node fill.mjs <institution_id>"); process.exit(1); }

const pack = JSON.parse(readFileSync(join(DIR, "packs", `${id}.json`), "utf8"));
const narr = JSON.parse(readFileSync(join(DIR, "narratives", `${id}.json`), "utf8"));
let html = readFileSync(join(DIR, "template.html"), "utf8");

const DISPLAY = {
  monthly_maintenance: "Monthly maintenance", overdraft: "Overdraft",
  nsf: "NSF / returned item", atm_non_network: "Non-network ATM",
  card_foreign_txn: "Foreign transaction", wire_domestic_outgoing: "Outgoing domestic wire",
  stop_payment: "Stop payment", wire_intl_outgoing: "Outgoing intl. wire",
  wire_domestic_incoming: "Incoming domestic wire", cashiers_check: "Cashier's check",
  od_protection_transfer: "OD protection transfer", paper_statement: "Paper statement",
  minimum_balance: "Minimum balance", card_replacement: "Card replacement",
  deposited_item_return: "Deposited item return",
};
const TIERS = {
  community_small: "Community institution (<$500M)",
  community_mid: "Community institution ($500M–$1B)",
  community_large: "Community institution ($1B–$10B)",
};
const money = (v) => (v === null || v === undefined) ? "—" : `$${Number(v).toFixed(2)}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const inst = pack.institution;
const fees = pack.fees;

// Position rows
const positionRows = fees.map((f) => {
  const p = f.percentile === null || f.percentile === undefined ? null : Number(f.percentile);
  const barClass = p === null ? "" : p >= 80 ? "hi" : p <= 20 ? "lo" : "";
  const bar = p === null
    ? `<span class="small muted">not published</span>`
    : `<div class="bar-wrap"><div class="bar ${barClass}" style="width:${p}%"></div></div>`;
  const tag =
    f.flag === "extreme_outlier" || f.flag === "statistical_outlier"
      ? `<span class="tag outlier">outlier</span>`
      : f.flag === "waived" ? `<span class="tag waived">waived</span>`
      : f.flag === "data_gap" ? `<span class="tag gap">no data</span>` : "";
  return `<tr><td>${DISPLAY[f.category] ?? f.category}</td>
    <td class="r"><b>${money(f.their_value)}</b></td>
    <td class="r">${money(f.peer_p25)}</td><td class="r">${money(f.peer_median)}</td>
    <td class="r">${money(f.peer_p75)}</td><td class="r">${money(f.national_median)}</td>
    <td>${bar}${p === null ? "" : `<span class="small muted"> P${p}</span>`}</td><td>${tag}</td></tr>`;
}).join("\n");

// Exec findings (3 numbers) from narratives; shrink long stats so the column holds
const execFindings = narr.findings.map((f) => {
  const size = f.stat.length > 12 ? "12pt" : f.stat.length > 8 ? "16pt" : "21pt";
  return `<div class="finding"><div class="num" style="font-size:${size}">${esc(f.stat)}<small>${esc(f.stat_label)}</small></div>
   <p><b>${esc(f.headline)}</b><br>${esc(f.body)}</p></div>`;
}).join("\n");

// Callout cards
const callouts = narr.callouts.map((c) =>
  `<div class="callout ${c.kind === "opportunity" ? "opportunity" : ""}">
     <h3>${esc(c.title)}</h3><div class="stat">${esc(c.stat)}</div><p>${esc(c.body)}</p>
   </div>`).join("\n");

// Peer table: pick 5 headline categories with best coverage
const HEADLINE = ["monthly_maintenance", "overdraft", "nsf", "stop_payment", "wire_domestic_outgoing"];
const peerHead = HEADLINE.map((k) => `<th class="r">${DISPLAY[k]}</th>`).join("");
const selfRow = HEADLINE.map((k) => {
  const f = fees.find((x) => x.category === k);
  return `<td class="r">${money(f?.their_value)}</td>`;
}).join("");
const peerRows = (pack.peers ?? []).map((p) =>
  `<tr><td>${esc(p.institution_name)} <span class="small muted">(${esc(p.city)}, ${esc(p.state_code)})</span></td>` +
  HEADLINE.map((k) => `<td class="r">${money(p.fees?.[k])}</td>`).join("") + `</tr>`).join("\n");

// Appendix: complete published schedule
const allFees = pack.all_fees ?? [];
const FREQ = { per_occurrence: "per occurrence", one_time: "one-time", monthly: "monthly",
  annual: "annual", daily: "daily", per_item: "per item", per_page: "per page" };
const allFeesRows = allFees.map((a) => {
  const freq = FREQ[a.frequency] ?? (a.frequency ?? "").replaceAll("_", " ");
  const terms = [freq, a.conditions].filter(Boolean).join(" · ");
  return `<tr><td>${esc(a.fee_name)}</td><td class="r"><b>${money(a.amount)}</b></td>
    <td class="small muted">${esc(terms || "—")}</td></tr>`;
}).join("\n");

// Provenance: source documents
const sourceList = (pack.sources ?? []).map((s) =>
  `<li>${esc(s.url)} <span class="muted">(${s.n_fees} fee lines)</span></li>`).join("\n")
  || `<li>Source URLs available on request.</li>`;

// Revenue lens (FDIC/NCUA Call Report data)
const fin = pack.financials ?? {};
const fl = fin.latest ?? {}, fy = fin.last_full_year ?? {}, fc = fin.cohort ?? {};
const isCU = inst.charter_type === "credit_union";
const kUSD = (v) => { // values filed in $thousands
  if (v === null || v === undefined) return "—";
  const d = v * 1000;
  if (d >= 1e9) return `$${(d / 1e9).toFixed(2)}B`;
  if (d >= 1e6) return `$${(d / 1e6).toFixed(1)}M`;
  return `$${Math.round(d).toLocaleString()}`;
};
const pct = (v, d = 2) => (v === null || v === undefined) ? "—" : `${(v * 100).toFixed(d)}%`;
const card = (lbl, val, cmp = "") =>
  `<div class="statcard"><div class="lbl">${lbl}</div><div class="val">${val}</div>${cmp ? `<div class="cmp">${cmp}</div>` : ""}</div>`;

const scRatio = fy.sc_per_assets, scMed = fc.sc_per_assets_median;
const intensity = (scRatio != null && scMed != null && scMed > 0) ? scRatio / scMed : null;
const finCards = [
  card("Total assets", kUSD(fl.total_assets)),
  card("Total deposits", kUSD(fl.total_deposits)),
  card(isCU ? "Members" : "Employees",
    (isCU ? fl.member_count : fl.employee_count)?.toLocaleString?.() ?? "—",
    fl.branch_count ? `${fl.branch_count} branches` : ""),
  card("Service-charge income", kUSD(fy.service_charge_income),
    fy.fee_income_ratio != null ? `${pct(fy.fee_income_ratio, 1)} of revenue` : "as filed"),
  card("Fee-income intensity", pct(scRatio, 3),
    scMed != null ? `cohort median <b>${pct(scMed, 3)}</b> of assets` : "of assets"),
  // NCUA filings often lack ROA — only show the card when both sides are real
  (fl.roa && fc.roa_median)
    ? card("Return on assets", `${fl.roa}%`, `cohort median <b>${fc.roa_median}%</b>`)
    : card("Fee schedule", `${fees.filter((x) => x.their_value !== null).length} of 15`,
        "featured categories published"),
].join("\n");

let finNarr = "";
if (intensity != null) {
  const rel = intensity >= 1.15 ? `about ${intensity.toFixed(1)}× the cohort median — fee income is doing more work in your P&amp;L than at most comparable institutions, which raises the stakes on every outlier flagged in this report`
    : intensity <= 0.7 ? `well below the cohort median (${(intensity * 100).toFixed(0)}% of it) — you are earning less from fees than most comparable institutions even where your posted prices run high, which suggests the pricing conversation is really a volume, waiver, or mix conversation`
    : `roughly in line with the cohort median — your fee earnings match your peers', so the position questions in this report are about risk and story, not missing revenue`;
  finNarr = `<p class="narrative" style="margin-top:8pt">Joining your posted fee schedule to your regulatory filings: your service-charge income runs ${rel}.</p>`;
}
const dep = pack.deposits ?? {};
const depositLine = (dep.branch_rows > 0)
  ? `<p class="small muted" style="margin-top:6pt">Deposit footprint (FDIC Summary of Deposits, ${dep.sod_year}): ${dep.branch_rows} branch locations across ${dep.counties} counties holding ${kUSD(dep.total_branch_deposits)} in deposits.</p>`
  : "";

const repl = {
  FIN_CARDS: finCards,
  FIN_NARRATIVE: finNarr,
  DEPOSIT_LINE: depositLine,
  FIN_SOURCE_LABEL: (fl.source ?? "fdic").toUpperCase() + " Call Reports",
  FIN_LATEST_DATE: fl.report_date ?? "—",
  FIN_YEAR_DATE: fy.report_date ?? "—",
  FIN_COHORT_N: fc.n ?? "—",
  SOURCE_LIST: sourceList,
  ALL_FEES_ROWS: allFeesRows,
  ALL_FEES_COUNT: allFees.length,
  INSTITUTION_NAME: esc(inst.institution_name),
  CITY_STATE: `${esc(inst.city)}, ${esc(inst.state_code)}`,
  CHARTER_LABEL: inst.charter_type === "credit_union" ? "Credit Union" : "Bank",
  TIER_LABEL: TIERS[inst.asset_size_tier] ?? inst.asset_size_tier,
  PULL_DATE: pack.meta.pull_date,
  COHORT_LABEL: pack.meta.cohort.replaceAll("_", " ").replace("credit union", "credit unions"),
  COHORT_SIZE: pack.meta.cohort_size,
  TOTAL_INSTITUTIONS: narr.total_institutions ?? "1,100+",
  CONTACT_EMAIL: narr.contact_email,
  EXEC_FINDINGS: execFindings,
  EXEC_NARRATIVE: narr.exec_narrative,
  POSITION_ROWS: positionRows,
  CALLOUTS: callouts,
  PEER_HEAD: peerHead,
  PEER_SELF_ROW: selfRow,
  PEER_ROWS: peerRows,
  CONTEXT_NARRATIVE: narr.context_narrative,
};
for (const [k, v] of Object.entries(repl)) html = html.replaceAll(`{{${k}}}`, String(v));

const leftovers = html.match(/{{[A-Z_]+}}/g);
if (leftovers) { console.error("Unfilled placeholders:", leftovers); process.exit(1); }

mkdirSync(join(DIR, "out"), { recursive: true });
const outPath = join(DIR, "out", `${id}.html`);
writeFileSync(outPath, html);
console.log(outPath);
