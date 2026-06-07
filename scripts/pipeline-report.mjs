#!/usr/bin/env node
// Pipeline report — editorial consulting layout (FT / McKinsey / Connected FINS).
// Self-contained, light, professional. Read-only. Writes docs/pipeline-report.html.
//
// Usage:  node scripts/pipeline-report.mjs

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ processEnv: process.env });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const generatedAt = new Date();

async function scalar(query, fallback = 0) {
  try {
    const [row] = await query;
    return Number(Object.values(row)[0] ?? fallback);
  } catch {
    return fallback;
  }
}
async function rows(query) {
  try {
    return await query;
  } catch {
    return [];
  }
}
const fmt = (n) => Number(n).toLocaleString("en-US");
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function durationOf(start, end) {
  if (!start) return "—";
  const ms = new Date(end ?? Date.now()).getTime() - new Date(start).getTime();
  if (ms < 0) return "—";
  if (ms < 1000) return ms + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  return Math.floor(ms / 60000) + "m " + Math.round((ms % 60000) / 1000) + "s";
}

try {
  const discover = await scalar(sql`
    SELECT count(*)::int FROM crawl_targets
     WHERE (fee_schedule_url IS NULL OR fee_schedule_url='') AND website_url IS NOT NULL AND website_url<>''`);
  const extract = await scalar(sql`
    SELECT count(*)::int FROM crawl_targets ct
     WHERE ct.fee_schedule_url IS NOT NULL AND ct.fee_schedule_url<>''
       AND NOT EXISTS (SELECT 1 FROM fees_raw fr WHERE fr.institution_id=ct.id)`);
  const classify = await scalar(sql`
    SELECT count(*)::int FROM fees_raw fr LEFT JOIN fees_verified fv ON fv.fee_raw_id=fr.fee_raw_id
     WHERE fv.fee_verified_id IS NULL`);
  const review = await scalar(sql`
    SELECT count(*)::int FROM fees_verified v
     WHERE NOT EXISTS (SELECT 1 FROM agent_messages m WHERE m.sender_agent='knox' AND m.payload->>'fee_verified_id'=v.fee_verified_id::text)`);
  const publish = await scalar(sql`
    SELECT count(*)::int FROM fees_verified v LEFT JOIN fees_published p ON p.lineage_ref=v.fee_verified_id
     WHERE p.fee_published_id IS NULL AND v.extraction_confidence>=0.9 AND COALESCE(v.review_status,'pending')<>'rejected'`);

  const institutions = await scalar(sql`SELECT count(*)::int FROM crawl_targets`);
  const withUrl = await scalar(sql`SELECT count(*)::int FROM crawl_targets WHERE fee_schedule_url IS NOT NULL AND fee_schedule_url<>''`);
  const rawTotal = await scalar(sql`SELECT count(*)::int FROM fees_raw`);
  const verifiedTotal = await scalar(sql`SELECT count(*)::int FROM fees_verified`);
  const publishedTotal = await scalar(sql`SELECT count(*)::int FROM fees_published`);

  const recentRuns = await rows(sql`
    SELECT id, trigger_source, triggered_by, status, stages_done, stages_total, started_at, finished_at
      FROM pipeline_runs ORDER BY created_at DESC LIMIT 8`);

  const stages = [
    { key: "Discover", backlog: discover, sub: "no fee URL" },
    { key: "Extract", backlog: extract, sub: "awaiting extraction" },
    { key: "Classify", backlog: classify, sub: "awaiting classification" },
    { key: "Review", backlog: review, sub: "awaiting review" },
    { key: "Publish", backlog: publish, sub: "ready to publish" },
  ];
  const maxBacklog = Math.max(1, ...stages.map((s) => s.backlog));

  const tierMax = Math.max(rawTotal, 1);
  const bw = (v) => Math.max(0.6, (v / tierMax) * 100); // honest linear scale; bottleneck shows
  const verifiedPct = rawTotal > 0 ? ((verifiedTotal / rawTotal) * 100).toFixed(1) : "0.0";
  const publishedPct = rawTotal > 0 ? ((publishedTotal / rawTotal) * 100).toFixed(1) : "0.0";

  const statusWord = {
    succeeded: "color:#2f7d52", running: "color:#1f4e5f", queued: "color:#8a857c",
    failed: "color:#b23b2e", canceled: "color:#9a6a1a", pending: "color:#8a857c", skipped: "color:#9a6a1a",
  };

  const kpi = (label, value, note) =>
    `<div class="kpi reveal"><div class="kl">${label}</div><div class="kv" data-target="${value}">0</div>${note ? `<div class="kn">${note}</div>` : ""}</div>`;

  const stageCol = (s, i) =>
    `<div class="stage reveal" style="--d:${120 + i * 80}ms">
       <div class="snum">${String(i + 1).padStart(2, "0")}</div>
       <div class="sname">${s.key}</div>
       <div class="sval" data-target="${s.backlog}">0</div>
       <div class="strack"><span style="--w:${Math.max(3, Math.round((s.backlog / maxBacklog) * 100))}%"></span></div>
       <div class="ssub">${s.sub}</div>
     </div>`;
  const stagesHtml = stages
    .map((s, i) => stageCol(s, i) + (i < stages.length - 1 ? '<div class="arrow reveal" style="--d:' + (160 + i * 80) + 'ms">→</div>' : ""))
    .join("");

  const funnelRow = (label, value, pct, accent) =>
    `<div class="frow reveal">
       <div class="flab">${label}</div>
       <div class="ftrack"><span class="ffill ${accent}" style="--w:${bw(value)}%"></span></div>
       <div class="fval" data-target="${value}">0</div>
       <div class="fpct">${pct}</div>
     </div>`;

  const runRows = recentRuns.length
    ? recentRuns.map((r) =>
        `<tr class="reveal"><td class="rid">#${r.id}</td><td>${esc(r.trigger_source)}</td><td>${esc(r.triggered_by)}</td>
          <td style="${statusWord[r.status] || ""};font-weight:600">${esc(r.status)}</td>
          <td class="num">${r.stages_done}/${r.stages_total}</td>
          <td class="num">${durationOf(r.started_at, r.finished_at)}</td></tr>`).join("")
    : '<tr><td colspan="6" class="muted" style="padding:22px 0">No runs recorded yet.</td></tr>';

  const dateline = generatedAt.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Pipeline Report — Bank Fee Index</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&family=Libre+Franklin:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--paper:#fbf9f5;--ink:#211e1a;--mut:#6f6a62;--faint:#9a948a;--line:#e8e1d6;--accent:#b4541f;--cool:#1f4e5f;--pos:#2f7d52;}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:"Libre Franklin",-apple-system,sans-serif;-webkit-font-smoothing:antialiased;
  background-image:linear-gradient(var(--paper),var(--paper)),radial-gradient(120% 60% at 100% 0%,rgba(180,84,31,.04),transparent 60%);}
.serif{font-family:"Newsreader",Georgia,serif}
.wrap{max-width:880px;margin:0 auto;padding:64px 32px 96px}
.reveal{opacity:0;transform:translateY(12px);animation:rv .8s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:var(--d,0ms)}
@keyframes rv{to{opacity:1;transform:none}}
/* masthead */
.top{display:flex;justify-content:space-between;align-items:baseline;border-top:2px solid var(--ink);padding-top:12px;font-size:11px;letter-spacing:.18em;text-transform:uppercase}
.top .brand{font-weight:700}.top .when{color:var(--mut);letter-spacing:.1em}
h1{font-family:"Newsreader",Georgia,serif;font-weight:600;font-size:clamp(46px,7.5vw,84px);line-height:1.02;letter-spacing:-.015em;margin:30px 0 0}
.uline{height:3px;width:0;background:var(--accent);margin-top:18px;animation:grow 1s cubic-bezier(.2,.8,.2,1) .25s forwards}
@keyframes grow{to{width:96px}}
.dek{font-family:"Newsreader",serif;font-size:clamp(18px,2.4vw,23px);line-height:1.5;color:#3a352e;max-width:42ch;margin:22px 0 0}
.dek b{color:var(--accent);font-weight:600}
/* section heads */
.sec{display:flex;align-items:baseline;gap:14px;margin:62px 0 22px}
.sec .no{font-family:"Newsreader",serif;font-style:italic;font-size:15px;color:var(--accent)}
.sec h2{font-size:12px;letter-spacing:.2em;text-transform:uppercase;font-weight:700;margin:0}
.sec .rule{flex:1;height:1px;background:var(--line)}
/* kpis */
.kpis{display:grid;grid-template-columns:repeat(4,1fr)}
.kpi{padding:4px 20px 4px 0;border-right:1px solid var(--line)}
.kpi:last-child{border-right:0}
.kl{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);font-weight:600}
.kv{font-family:"Newsreader",serif;font-weight:600;font-size:clamp(34px,5vw,52px);line-height:1.05;margin-top:8px;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.kn{font-size:11.5px;color:var(--faint);margin-top:4px}
@media(max-width:680px){.kpis{grid-template-columns:repeat(2,1fr);gap:18px 0}.kpi{border-right:0}}
/* funnel */
.insight{font-family:"Newsreader",serif;font-size:19px;line-height:1.5;color:#3a352e;border-left:3px solid var(--accent);padding:2px 0 2px 18px;margin:0 0 26px}
.frow{display:grid;grid-template-columns:96px 1fr 92px 64px;align-items:center;gap:16px;padding:15px 0;border-bottom:1px solid var(--line)}
.frow:last-child{border-bottom:0}
.flab{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);font-weight:600}
.ftrack{height:22px;background:#f0ebe2;border-radius:3px;overflow:hidden}
.ffill{display:block;height:100%;width:0;border-radius:3px;animation:fill 1.2s cubic-bezier(.2,.8,.2,1) .35s forwards}
.ffill.a1{background:var(--accent)}.ffill.a2{background:var(--cool)}.ffill.a3{background:var(--pos)}
@keyframes fill{to{width:var(--w)}}
.fval{font-family:"Newsreader",serif;font-size:22px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums}
.fpct{font-size:12px;color:var(--faint);text-align:right;font-variant-numeric:tabular-nums}
/* stages */
.stages{display:flex;align-items:stretch;gap:0;overflow-x:auto;padding-bottom:6px}
.stage{flex:1 0 0;min-width:104px;padding:0 14px}
.snum{font-family:"Newsreader",serif;font-style:italic;font-size:13px;color:var(--accent)}
.sname{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);font-weight:600;margin-top:6px}
.sval{font-family:"Newsreader",serif;font-weight:600;font-size:30px;margin:6px 0 10px;font-variant-numeric:tabular-nums}
.strack{height:4px;background:#efe9df;border-radius:3px;overflow:hidden}
.strack>span{display:block;height:100%;width:0;background:var(--ink);opacity:.85;border-radius:3px;animation:fill 1.1s cubic-bezier(.2,.8,.2,1) .5s forwards}
.ssub{font-size:10.5px;color:var(--faint);margin-top:9px;line-height:1.3}
.arrow{display:flex;align-items:center;color:var(--faint);font-size:18px;padding:0 2px;align-self:flex-start;margin-top:46px}
@media(max-width:680px){.arrow{display:none}.stages{flex-wrap:wrap;gap:20px}.stage{flex:0 0 40%}}
/* runs */
table{width:100%;border-collapse:collapse;font-size:13px}
thead th{text-align:left;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);font-weight:700;padding:0 14px 10px 0;border-bottom:1.5px solid var(--ink)}
tbody td{padding:13px 14px 13px 0;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
.rid{color:var(--faint)} .num{text-align:right} .muted{color:var(--faint);text-align:center}
tbody tr:hover td{background:rgba(180,84,31,.025)}
.foot{margin-top:54px;border-top:1px solid var(--line);padding-top:16px;display:flex;justify-content:space-between;color:var(--faint);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;flex-wrap:wrap;gap:8px}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.ffill,.strack>span{width:var(--w)}.uline{width:96px}}
</style></head>
<body><div class="wrap">

  <div class="top reveal"><span class="brand">Bank Fee Index</span><span class="when">Pipeline Report · ${esc(dateline)}</span></div>
  <h1 class="reveal serif" style="--d:60ms">The Pipeline,<br/>at a glance</h1>
  <div class="uline"></div>
  <p class="dek reveal" style="--d:160ms"><b>${fmt(rawTotal)}</b> fees collected across <b>${fmt(institutions)}</b> institutions; <b>${fmt(publishedTotal)}</b> live in the published index.</p>

  <div class="sec reveal"><span class="no">01</span><h2>Headline figures</h2><span class="rule"></span></div>
  <div class="kpis">
    ${kpi("Institutions", institutions, fmt(withUrl) + " with a fee URL")}
    ${kpi("Raw fees", rawTotal, "tier 1 — collected")}
    ${kpi("Verified", verifiedTotal, "tier 2 — classified")}
    ${kpi("Published", publishedTotal, "tier 3 — live")}
  </div>

  <div class="sec reveal"><span class="no">02</span><h2>Coverage funnel</h2><span class="rule"></span></div>
  <p class="insight reveal">Of ${fmt(rawTotal)} fees collected, only ${verifiedPct}% are verified and ${publishedPct}% are published — the pipeline is throttled at classification.</p>
  ${funnelRow("Raw", rawTotal, "100%", "a1")}
  ${funnelRow("Verified", verifiedTotal, verifiedPct + "%", "a2")}
  ${funnelRow("Published", publishedTotal, publishedPct + "%", "a3")}

  <div class="sec reveal"><span class="no">03</span><h2>Stage backlog</h2><span class="rule"></span></div>
  <div class="stages">${stagesHtml}</div>

  <div class="sec reveal"><span class="no">04</span><h2>Recent runs</h2><span class="rule"></span></div>
  <table>
    <thead><tr><th>Run</th><th>Trigger</th><th>By</th><th>Status</th><th class="num">Steps</th><th class="num">Duration</th></tr></thead>
    <tbody>${runRows}</tbody>
  </table>

  <div class="foot reveal"><span>Discover · Extract · Classify · Review · Publish</span><span>pipeline_runs / pipeline_steps</span></div>

</div>
<script>
(function(){
  var fmt=function(n){return Math.round(n).toLocaleString('en-US')};
  function run(el){
    var target=parseFloat(el.getAttribute('data-target'))||0,dur=1300,t0=performance.now();
    function step(t){var p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3);el.textContent=fmt(target*e);if(p<1)requestAnimationFrame(step);}
    requestAnimationFrame(step);
  }
  var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){run(en.target);io.unobserve(en.target);}});},{threshold:.4});
  document.querySelectorAll('[data-target]').forEach(function(el){io.observe(el);});
})();
</script>
</body></html>`;

  const outDir = path.join("docs");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "pipeline-report.html");
  fs.writeFileSync(outFile, html, "utf8");
  console.log("Report written to " + outFile);
  console.log("Tiers — raw:" + fmt(rawTotal) + " verified:" + fmt(verifiedTotal) + " published:" + fmt(publishedTotal) + " · institutions:" + fmt(institutions));
} catch (err) {
  console.error("Report generation failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
