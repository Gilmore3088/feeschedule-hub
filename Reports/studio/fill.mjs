#!/usr/bin/env node
// Studio filler: template.html + packs/<id>.json + narratives/<id>.json -> out/<id>.html
// No dependencies. Usage: node fill.mjs <institution_id> [--sample]
//   --sample  anonymize the client (name only; peers stay named), swap the back page for
//             the public-sample CTA, and write sample/sample-competitive-fee-position.html
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const DIR = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const SAMPLE = args.includes("--sample");
const id = args.find((a) => !a.startsWith("--"));
if (!id) { console.error("usage: node fill.mjs <institution_id> [--sample]"); process.exit(1); }

const SAMPLE_NAME = "Sample Community Bank";
const SAMPLE_PLACE = "San Francisco Fed district";
const SAMPLE_REQUEST_URL = "https://feeinsight.com/for-institutions#report";

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
// Asset tiers match the site's public segment labels (src/app/(public)/institution/[id]/enum-labels.ts).
const TIER_BANDS = {
  community_small: "under $300M",
  community_mid: "$300M–$1B",
  community_large: "$1B–$10B",
  regional: "$10B–$50B",
};
const tierLabel = (tier, charter, plural = false) => {
  const band = TIER_BANDS[tier];
  const noun = charter === "credit_union" ? "credit union" : "bank";
  const head = plural ? `Community ${noun}s` : `Community ${noun}`;
  return band ? `${head}, ${band}` : `${head} (${String(tier).replaceAll("_", " ")})`;
};
// One date format everywhere: "Aug 16, 2026".
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return iso ?? "—";
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
};
const money = (v) => (v === null || v === undefined) ? "—" : `$${Number(v).toFixed(2)}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const inst = pack.institution;
const fees = pack.fees;
const realName = inst.institution_name;
const shownName = SAMPLE ? SAMPLE_NAME : realName;
// In sample mode the client's name (and its initials, e.g. "CBSM ATMs") is replaced wherever the
// narratives or fee lines mention it; peers keep their real names.
const initials = realName.split(/\s+/).filter((w) => /^[A-Z]/.test(w) && w.length > 2).map((w) => w[0]).join("");
const anon = (text) => {
  if (!SAMPLE) return String(text);
  let out = String(text).replaceAll(realName, SAMPLE_NAME);
  if (initials.length >= 3) out = out.replace(new RegExp(`\\b${initials}\\b`, "g"), "network");
  return out;
};

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
  const size = f.stat.length > 12 ? "13pt" : f.stat.length > 8 ? "18pt" : "24pt";
  return `<div class="finding"><div class="num" style="font-size:${size}">${esc(f.stat)}<small>${esc(f.stat_label)}</small></div>
   <p><b>${esc(anon(f.headline))}</b>${esc(anon(f.body))}</p></div>`;
}).join("\n");

// Callout cards
const callouts = narr.callouts.map((c) =>
  `<div class="callout ${c.kind === "opportunity" ? "opportunity" : ""}">
     <h3>${esc(anon(c.title))}</h3><div class="stat">${esc(anon(c.stat))}</div><p>${esc(anon(c.body))}</p>
   </div>`).join("\n");

// Some registry names arrive fully uppercase (e.g. "FIDELITY BANK"); title-case those
// for display, preserving short acronym tokens (FCU, FSB, N.A.) and lowercase connectives.
const SMALL_WORDS = new Set(["of", "the", "and", "for", "in", "at", "on"]);
const ACRONYMS = new Set(["fcu", "cu", "fsb", "na", "n.a.", "usa", "us", "ny", "la"]);
function displayName(name) {
  if (!name || name !== name.toUpperCase() || !/[A-Z]{3}/.test(name)) return name;
  return name.toLowerCase().split(" ").map((w, i) => {
    if (ACRONYMS.has(w) || (!/[aeiouy]/.test(w) && /[a-z]/.test(w))) return w.toUpperCase();
    if (i > 0 && SMALL_WORDS.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
}

// Peer table: pick 5 headline categories with best coverage
const HEADLINE = ["monthly_maintenance", "overdraft", "nsf", "stop_payment", "wire_domestic_outgoing"];
const peerHead = HEADLINE.map((k) => `<th class="r">${DISPLAY[k]}</th>`).join("");
const selfRow = HEADLINE.map((k) => {
  const f = fees.find((x) => x.category === k);
  return `<td class="r">${money(f?.their_value)}</td>`;
}).join("");
const peerRows = (pack.peers ?? []).map((p) =>
  `<tr><td>${esc(displayName(p.institution_name))} <span class="small muted">(${esc(p.city)}, ${esc(p.state_code)})</span></td>` +
  HEADLINE.map((k) => `<td class="r">${money(p.fees?.[k])}</td>`).join("") + `</tr>`).join("\n");

// Appendix: complete published schedule
const allFees = pack.all_fees ?? [];
const FREQ = { per_occurrence: "per occurrence", one_time: "one-time", monthly: "monthly",
  annual: "annual", daily: "daily", per_item: "per item", per_page: "per page" };
const allFeesRows = allFees.map((a) => {
  let freq = FREQ[a.frequency] ?? (a.frequency ?? "").replaceAll("_", " ");
  // Caps read as limits, not charges ("daily maximum", not a scary bare "daily")
  if (a.is_fee_cap) freq = freq ? `${freq} maximum` : "maximum";
  const terms = [freq, a.conditions].filter(Boolean).join(" · ");
  return `<tr><td>${esc(anon(a.fee_name))}</td><td class="r"><b>${money(a.amount)}</b></td>
    <td class="small muted">${esc(anon(terms || "—"))}</td></tr>`;
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
  card("Fee-income intensity",
    scRatio != null ? `${(scRatio * 10000).toFixed(1)} bps` : "—",
    scMed != null ? `cohort median <b>${(scMed * 10000).toFixed(1)} bps</b> of assets` : "of assets"),
  // NCUA filings often lack ROA — only show the card when both sides are real
  (fl.roa && fc.roa_median)
    ? card("Return on assets", `${fl.roa}%`, `cohort median <b>${fc.roa_median}%</b>`)
    : card("Fee schedule", `${fees.filter((x) => x.their_value !== null).length} of 15`,
        "featured categories published"),
].join("\n");

// Fee economics per the fee-revenue-correlation methodology
const fe = pack.fee_econ ?? {};
const me = fe.mine ?? {}, co = fe.cohort ?? {};
const bps = (v) => (v == null) ? "—" : `${Number(v).toFixed(1)} bps`;
const pc = (v, d = 1) => (v == null) ? "—" : `${(v * 100).toFixed(d)}%`;
const assess = (mine, med, hiWord, loWord) =>
  mine == null || med == null ? "—"
    : mine > med * 1.3 ? hiWord : mine < med * 0.7 ? loWord : "In line";
const econRow = (metric, you, p25, med, p75, pctile, assessment) =>
  `<tr><td>${metric}</td><td class="r"><b>${you}</b></td><td class="r">${p25}</td>
   <td class="r">${med}</td><td class="r">${p75}</td>
   <td>${pctile != null ? `P${pctile}` : "—"}</td><td>${assessment}</td></tr>`;
const econTable = [
  econRow("Service-charge income", kUSD(me.sc), "—", kUSD(co.sc_median), "—", null,
    assess(me.sc, co.sc_median, "Above cohort", "Below cohort")),
  econRow("Fee intensity (income / assets)", bps(me.intensity_bps), bps(co.intensity_p25),
    bps(co.intensity_median), bps(co.intensity_p75), fe.intensity_pctile,
    assess(me.intensity_bps, co.intensity_median, "Fee-reliant", "Light collector")),
  econRow("Fee dependency (share of noninterest income)", pc(me.dependency),
    pc(co.dependency_p25), pc(co.dependency_median), pc(co.dependency_p75),
    fe.dependency_pctile, assess(me.dependency, co.dependency_median, "Concentrated", "Diversified")),
  (me.fee_to_ni != null && co.fee_to_ni_median != null)
    ? econRow("Fee income vs. net income", pc(me.fee_to_ni), "—", pc(co.fee_to_ni_median),
      "—", null, assess(me.fee_to_ni, co.fee_to_ni_median, "Earnings-exposed", "Modest"))
    : "",
].join("\n");

// Discrepancy verdict: posted-price aggressiveness vs realized fee intensity
const pricePcts = fees.filter((x) => x.percentile != null).map((x) => Number(x.percentile));
const avgPricePct = pricePcts.length
  ? Math.round(pricePcts.reduce((a, b) => a + b, 0) / pricePcts.length) : null;
const iPct = fe.intensity_pctile;
let verdict = "";
if (avgPricePct != null && iPct != null) {
  const v = avgPricePct >= 60 && iPct <= 40
    ? `Your posted prices average the ${avgPricePct}th percentile of the cohort, but your realized fee income sits at only the ${iPct}th. <b>You carry the optics of high fees without collecting the revenue</b> — the classic signature of heavy waivers, low incidence, or a mix that never touches the headline fees. Every outlier flagged in this report is reputational cost with little offsetting income; aligning them to market would cost less than it appears.`
    : avgPricePct >= 60 && iPct >= 60
    ? `Your posted prices (${avgPricePct}th percentile) and realized fee income (${iPct}th percentile) are both top-of-cohort. <b>Fees are a genuine earnings engine here</b> — which cuts both ways: repricing decisions carry real revenue consequences, and regulatory or competitive pressure on fee income lands harder on you than on peers.`
    : avgPricePct <= 45 && iPct >= 60
    ? `You post below-market prices (${avgPricePct}th percentile) yet realize top-cohort fee income (${iPct}th percentile). <b>Volume, not price, drives your fee line</b> — an enviable position that makes your customer-friendly schedule affordable to advertise loudly.`
    : avgPricePct <= 45 && iPct <= 45
    ? `Both your posted prices (${avgPricePct}th percentile) and realized fee income (${iPct}th percentile) run below the cohort. <b>You are structurally a low-fee institution</b> — the strategic question is whether that is a chosen identity worth marketing or an unexamined default leaving earnings unclaimed.`
    : `Your posted prices (${avgPricePct}th percentile) and realized fee income (${iPct}th percentile) sit near the cohort middle — <b>fee strategy is neither a risk nor an engine today</b>, which makes the individual outliers in this report the whole story.`;
  verdict = `<p class="narrative" style="margin-top:10pt">${v}</p>`;
}

// Trend line from year-end filings
const hist = pack.fin_history ?? [];
let trendLine = "";
if (hist.length >= 2) {
  const pts = hist.map((h) => `${h.report_date.slice(0, 4)}: ${bps(h.intensity_bps)}`).join(" → ");
  trendLine = `<p class="small muted" style="margin-top:6pt">Fee-intensity trend (year-end filings): ${pts} · cohort median ${bps(co.intensity_median)}.</p>`;
}
const finNarr = "";
const dep = pack.deposits ?? {};
const depositLine = (dep.branch_rows > 0)
  ? `<p class="small muted" style="margin-top:6pt">Deposit footprint (FDIC Summary of Deposits, ${dep.sod_year}): ${dep.branch_rows} branch locations across ${dep.counties} counties holding ${kUSD(dep.total_branch_deposits)} in deposits.</p>`
  : "";

// Cover reconciliation: cohort size vs. per-line comparison sets (not every peer publishes every fee).
const cohortNoun = tierLabel(inst.asset_size_tier, inst.charter_type, true).split(",")[0].toLowerCase();
const lineN = (cat) => fees.find((x) => x.category === cat)?.peer_count ?? null;
const nsfN = lineN("nsf"), odN = lineN("overdraft");
const cohortNote = `Peer cohort: ${pack.meta.cohort_size} comparable ${cohortNoun}. Not every peer publishes every fee`
  + (nsfN != null && odN != null ? `: ${nsfN} publish an NSF fee and ${odN} an overdraft fee, so those are the comparison sets for those lines.`
    : nsfN != null ? `: ${nsfN} publish an NSF fee, so that is the comparison set for that line.`
    : `, so each line is compared against the peers that publish it.`);

// Back page: hosted copies keep the compliments page; the public sample gets a request CTA.
const backHeadline = SAMPLE
  ? `This is what a <em>$300 report</em> looks like.`
  : `This report is yours,<br><em>with our compliments.</em>`;
const backSub = SAMPLE
  ? `A Competitive Fee Position Report is built for your institution and your peer set from source-verified fee data — the same index tracking ${narr.total_institutions ?? "1,100+"} institutions nationwide — and delivered in 48 hours.`
  : `A Competitive Fee Position Report retails for $300, delivered in 48 hours. It was produced from source-verified fee data — the same index tracking ${narr.total_institutions ?? "1,100+"} institutions nationwide.`;
const backCta = SAMPLE
  ? `<div>
      <h4>Retail $300 · quarterly refresh $300 · Request yours</h4>
      <p>Named competitors, every fee benchmarked against a verified peer cohort, the revenue lens
      from your own filings. Or go deeper with Fee Insight Advisory — custom competitor sets, a
      board-ready deck, pricing-change modeling.</p>
    </div>
    <div>
      <p>Request yours at</p>
      <a class="mail" href="${SAMPLE_REQUEST_URL}">feeinsight.com/for-institutions</a>
      <p style="margin-top:8pt">or write ${narr.contact_email}</p>
    </div>`
  : `<div>
      <h4>Refresh it every quarter — $300 per refresh.</h4>
      <p>Or go deeper with Fee Insight Advisory — custom competitor sets, a board-ready deck,
      pricing-change modeling against your own filings.</p>
    </div>
    <div>
      <p>Reply to the email this arrived with, or write</p>
      <span class="mail">${narr.contact_email}</span>
      <p style="margin-top:8pt">feeinsight.com</p>
    </div>`;

const repl = {
  DOC_TITLE: SAMPLE ? "Sample Competitive Fee Position Report" : "Competitive Fee Position Report",
  COHORT_NOTE: cohortNote,
  BACK_HEADLINE: backHeadline,
  BACK_SUB: backSub,
  BACK_CTA: backCta,
  FIN_CARDS: finCards,
  FIN_NARRATIVE: finNarr,
  ECON_TABLE: econTable,
  ECON_VERDICT: verdict,
  TREND_LINE: trendLine,
  DEPOSIT_LINE: depositLine,
  FIN_SOURCE_LABEL: (fl.source ?? "fdic").toUpperCase() + " Call Reports",
  FIN_LATEST_DATE: fmtDate(fl.report_date),
  FIN_YEAR_DATE: fmtDate(fy.report_date),
  FIN_COHORT_N: fc.n != null ? Number(fc.n).toLocaleString("en-US") : "—",
  SOURCE_LIST: sourceList,
  ALL_FEES_ROWS: allFeesRows,
  ALL_FEES_COUNT: allFees.length,
  INSTITUTION_NAME: esc(shownName),
  CITY_STATE: SAMPLE ? SAMPLE_PLACE : `${esc(displayName(inst.city))}, ${esc(inst.state_code)}`,
  CHARTER_LABEL: inst.charter_type === "credit_union" ? "Credit Union" : "Bank",
  TIER_LABEL: tierLabel(inst.asset_size_tier, inst.charter_type),
  PULL_DATE: fmtDate(pack.meta.pull_date),
  COHORT_LABEL: tierLabel(inst.asset_size_tier, inst.charter_type, true),
  COHORT_SIZE: pack.meta.cohort_size,
  TOTAL_INSTITUTIONS: narr.total_institutions ?? "1,100+",
  CONTACT_EMAIL: narr.contact_email,
  EXEC_FINDINGS: execFindings,
  EXEC_NARRATIVE: anon(narr.exec_narrative),
  POSITION_ROWS: positionRows,
  CALLOUTS: callouts,
  PEER_HEAD: peerHead,
  PEER_SELF_ROW: selfRow,
  PEER_ROWS: peerRows,
  CONTEXT_NARRATIVE: anon(narr.context_narrative),
};
for (const [k, v] of Object.entries(repl)) html = html.replaceAll(`{{${k}}}`, String(v));

const leftovers = html.match(/{{[A-Z_]+}}/g);
if (leftovers) { console.error("Unfilled placeholders:", leftovers); process.exit(1); }

if (SAMPLE && html.includes(realName)) {
  console.error(`Sample still mentions the client name "${realName}"`); process.exit(1);
}
const outPath = SAMPLE
  ? join(DIR, "sample", "sample-competitive-fee-position.html")
  : join(DIR, "out", `${id}.html`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);
console.log(outPath);
