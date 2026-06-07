#!/usr/bin/env node
// Pipeline console — animated, interactive, self-contained HTML built from the
// live control plane. Read-only. Writes docs/pipeline-report.html.
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

// Stage icons (inline SVG path bodies, 24x24, stroke=currentColor).
const ICONS = {
  discover: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>',
  extract: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M9 13h6M9 17h4"/>',
  classify: '<path d="M3 12.5 11 4l9 9-7.5 7.5z"/><circle cx="8.5" cy="8.5" r="1.4"/>',
  review: '<path d="M12 3 5 6v5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  publish: '<path d="M12 20V8"/><path d="m6.5 12.5 5.5-5.5 5.5 5.5"/><path d="M5 21h14"/>',
};

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
  const rawTotal = await scalar(sql`SELECT count(*)::int FROM fees_raw`);
  const verifiedTotal = await scalar(sql`SELECT count(*)::int FROM fees_verified`);
  const publishedTotal = await scalar(sql`SELECT count(*)::int FROM fees_published`);

  const recentRuns = await rows(sql`
    SELECT id, trigger_source, triggered_by, status, stages_done, stages_total, started_at, finished_at
      FROM pipeline_runs ORDER BY created_at DESC LIMIT 8`);
  const latestSteps = recentRuns.length
    ? await rows(sql`SELECT stage, status, rows_in, rows_out, started_at, finished_at, notes_json
                       FROM pipeline_steps WHERE run_id=${recentRuns[0].id} ORDER BY seq`)
    : [];

  const stages = [
    { key: "discover", c: "#6aa9ff", backlog: discover, sub: "no fee URL" },
    { key: "extract", c: "#a98bff", backlog: extract, sub: "to extract" },
    { key: "classify", c: "#ffab40", backlog: classify, sub: "to classify" },
    { key: "review", c: "#34d8a8", backlog: review, sub: "to review" },
    { key: "publish", c: "#ff6f5e", backlog: publish, sub: "ready" },
  ];
  const maxBacklog = Math.max(1, ...stages.map((s) => s.backlog));
  const barW = (v) => Math.max(4, Math.round((v / maxBacklog) * 100));
  const tierMax = Math.max(rawTotal, verifiedTotal, publishedTotal, 1);
  const wlog = (v) => Math.max(7, Math.round((Math.log(v + 1) / Math.log(tierMax + 1)) * 100));

  const statusColor = {
    succeeded: "#34d8a8", running: "#6aa9ff", queued: "#8a8f98",
    failed: "#ff6f5e", canceled: "#ffab40", pending: "#8a8f98", skipped: "#ffab40",
  };

  const stageNode = (s, i) =>
    `<div class="node" style="--c:${s.c};--d:${i * 90}ms">
       <div class="ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[s.key]}</svg></div>
       <div class="nm">${s.key}</div>
       <div class="ct" data-target="${s.backlog}">0</div>
       <div class="bar"><span style="--w:${barW(s.backlog)}%"></span></div>
       <div class="sub">${s.sub}</div>
     </div>`;
  const wire = (s) => `<div class="wire" style="--c:${s.c}"><i></i><i></i><i></i></div>`;

  let flow = "";
  stages.forEach((s, i) => {
    flow += stageNode(s, i);
    if (i < stages.length - 1) flow += wire(s);
  });

  const tier = (label, v, sub) =>
    `<div class="trow">
       <div class="tlab">${label}</div>
       <div class="ttrack"><span class="tfill" style="--w:${wlog(v)}%"></span><b class="tnum" data-target="${v}">0</b></div>
       <div class="tsub">${sub}</div>
     </div>`;

  const runChips = recentRuns.length
    ? recentRuns.map((r) =>
        `<div class="chip" title="${esc(r.triggered_by)} · ${r.stages_done}/${r.stages_total} steps">
           <span class="dot" style="background:${statusColor[r.status] || "#8a8f98"}"></span>
           <b>#${r.id}</b><span class="cmeta">${esc(r.trigger_source)}</span>
           <span class="cdur">${durationOf(r.started_at, r.finished_at)}</span>
         </div>`).join("")
    : '<div class="empty">No runs yet</div>';

  const stepStrip = latestSteps.length
    ? latestSteps.map((s) => {
        const note = s.notes_json && typeof s.notes_json.message === "string" ? s.notes_json.message : "";
        const io = (s.rows_in ?? "—") + " → " + (s.rows_out ?? "—");
        return `<div class="seg" style="--sc:${statusColor[s.status] || "#8a8f98"}" title="${esc(s.stage)}: ${esc(s.status)} · ${io} ${esc(note)}">
                  <span class="segbar"></span><span class="seglab">${esc(s.stage)}</span><span class="segio">${io}</span>
                </div>`;
      }).join("")
    : "";

  const ts = generatedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const verifiedPct = rawTotal > 0 ? ((verifiedTotal / rawTotal) * 100).toFixed(1) : "0";

  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Pipeline Console — Bank Fee Index</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#0a0c10;--panel:rgba(255,255,255,.025);--line:rgba(255,255,255,.09);--ink:#ecebe6;--mut:#7e858f;--acc:#e0653a;}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"IBM Plex Mono",ui-monospace,monospace;overflow-x:hidden;
  background-image:radial-gradient(120% 80% at 50% -20%,rgba(224,101,58,.16),transparent 55%),radial-gradient(80% 60% at 90% 10%,rgba(106,169,255,.08),transparent 50%);}
.grain{position:fixed;inset:0;z-index:0;opacity:.05;pointer-events:none;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.dots{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.5;
  background-image:radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px);background-size:34px 34px;mask-image:linear-gradient(180deg,#000,transparent 70%)}
main{position:relative;z-index:1;max-width:1080px;margin:0 auto;padding:60px 26px 90px}
.rise{opacity:0;transform:translateY(16px);animation:rise .7s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:var(--d,0ms)}
@keyframes rise{to{opacity:1;transform:none}}
.eyebrow{font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:var(--acc);font-weight:600}
h1{font-family:"Fraunces",Georgia,serif;font-weight:900;font-size:clamp(44px,8vw,92px);line-height:.92;letter-spacing:-.02em;margin:14px 0 0;
  background:linear-gradient(180deg,#fff,#c9b8ad);-webkit-background-clip:text;background-clip:text;color:transparent}
.live{display:flex;align-items:center;gap:10px;margin-top:18px;color:var(--mut);font-size:12.5px;letter-spacing:.04em}
.pulse{width:8px;height:8px;border-radius:50%;background:#34d8a8;box-shadow:0 0 0 0 rgba(52,216,168,.6);animation:pulse 2s infinite}
@keyframes pulse{70%{box-shadow:0 0 0 9px rgba(52,216,168,0)}100%{box-shadow:0 0 0 0 rgba(52,216,168,0)}}
.h{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--mut);font-weight:600;margin:64px 0 20px;display:flex;align-items:center;gap:12px}
.h::after{content:"";height:1px;flex:1;background:linear-gradient(90deg,var(--line),transparent)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.stat{padding:20px 18px;border:1px solid var(--line);border-radius:16px;background:var(--panel);position:relative;overflow:hidden;transition:transform .3s,border-color .3s}
.stat:hover{transform:translateY(-4px);border-color:rgba(255,255,255,.22)}
.stat::before{content:"";position:absolute;inset:0;background:radial-gradient(80% 60% at 0% 0%,rgba(224,101,58,.10),transparent 60%);opacity:0;transition:opacity .3s}
.stat:hover::before{opacity:1}
.stat .k{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--mut)}
.stat .v{font-family:"Fraunces",serif;font-weight:600;font-size:clamp(30px,4.5vw,46px);margin-top:8px;line-height:1;font-variant-numeric:tabular-nums}
/* pipeline flow */
.flow{display:flex;align-items:stretch;gap:0;overflow-x:auto;padding:8px 2px 14px;scrollbar-width:thin}
.node{flex:0 0 150px;text-align:center;padding:18px 10px;border:1px solid var(--line);border-radius:18px;background:var(--panel);
  position:relative;transition:transform .3s,border-color .3s,box-shadow .3s;opacity:0;transform:translateY(16px);animation:rise .7s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:var(--d)}
.node:hover{transform:translateY(-6px);border-color:var(--c);box-shadow:0 14px 40px -16px var(--c)}
.ring{width:52px;height:52px;margin:0 auto 12px;border-radius:50%;display:grid;place-items:center;color:var(--c);
  border:1px solid color-mix(in srgb,var(--c) 45%,transparent);background:radial-gradient(closest-side,color-mix(in srgb,var(--c) 16%,transparent),transparent);
  box-shadow:0 0 24px -6px var(--c)}
.ring svg{width:24px;height:24px}
.nm{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.ct{font-family:"Fraunces",serif;font-weight:700;font-size:30px;margin:6px 0 10px;color:#fff;font-variant-numeric:tabular-nums}
.bar{height:5px;border-radius:4px;background:rgba(255,255,255,.07);overflow:hidden}
.bar>span{display:block;height:100%;width:0;border-radius:4px;background:linear-gradient(90deg,var(--c),color-mix(in srgb,var(--c) 50%,#fff));
  animation:fill 1.2s cubic-bezier(.2,.8,.2,1) .5s forwards}
@keyframes fill{to{width:var(--w)}}
.sub{font-size:10.5px;color:var(--mut);margin-top:9px;letter-spacing:.04em}
.wire{flex:1 0 34px;min-width:34px;align-self:center;position:relative;height:2px;margin:0 -2px;
  background:linear-gradient(90deg,transparent,var(--line),transparent)}
.wire i{position:absolute;top:50%;width:5px;height:5px;border-radius:50%;background:var(--c);box-shadow:0 0 10px var(--c);transform:translateY(-50%);animation:flow 2.4s linear infinite}
.wire i:nth-child(2){animation-delay:.8s}.wire i:nth-child(3){animation-delay:1.6s}
@keyframes flow{0%{left:-4%;opacity:0}12%{opacity:1}88%{opacity:1}100%{left:104%;opacity:0}}
/* funnel */
.funnel{border:1px solid var(--line);border-radius:18px;background:var(--panel);padding:10px 22px}
.trow{display:grid;grid-template-columns:120px 1fr 130px;align-items:center;gap:18px;padding:16px 0;border-bottom:1px solid var(--line)}
.trow:last-child{border-bottom:0}
.tlab{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--mut)}
.ttrack{position:relative;height:34px;display:flex;align-items:center}
.tfill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:9px;background:linear-gradient(90deg,rgba(224,101,58,.85),rgba(224,101,58,.25));
  box-shadow:inset 0 0 20px rgba(255,160,120,.2);animation:fill 1.3s cubic-bezier(.2,.8,.2,1) .4s forwards}
.tnum{position:relative;font-family:"Fraunces",serif;font-weight:700;font-size:22px;color:#fff;padding-left:14px;font-variant-numeric:tabular-nums}
.tsub{font-size:11px;color:var(--mut);text-align:right}
/* runs */
.chips{display:flex;flex-wrap:wrap;gap:10px}
.chip{display:flex;align-items:center;gap:9px;padding:9px 13px;border:1px solid var(--line);border-radius:11px;background:var(--panel);font-size:12px;transition:transform .25s,border-color .25s}
.chip:hover{transform:translateY(-3px);border-color:rgba(255,255,255,.25)}
.chip .dot{width:7px;height:7px;border-radius:50%}
.chip b{color:#fff}.cmeta{color:var(--mut)}.cdur{color:var(--mut);font-size:11px}
.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-top:16px}
.seg{border:1px solid var(--line);border-left:3px solid var(--sc);border-radius:10px;padding:11px 13px;background:var(--panel);transition:transform .25s}
.seg:hover{transform:translateY(-3px)}
.segbar{display:none}
.seglab{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.segio{display:block;font-family:"Fraunces",serif;font-size:18px;color:#fff;margin-top:3px}
.empty{color:var(--mut);font-size:12px;padding:14px 0}
.foot{margin-top:60px;color:var(--mut);font-size:11px;letter-spacing:.05em;border-top:1px solid var(--line);padding-top:18px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
@media(max-width:720px){.stats{grid-template-columns:repeat(2,1fr)}.trow{grid-template-columns:80px 1fr;gap:12px}.tsub{display:none}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.bar>span,.tfill{width:var(--w)}}
</style></head>
<body>
<div class="grain"></div><div class="dots"></div>
<main>
  <header>
    <div class="eyebrow rise">Bank Fee Index · Data Pipeline</div>
    <h1 class="rise" style="--d:80ms">Pipeline Console</h1>
    <div class="live rise" style="--d:200ms"><span class="pulse"></span> live control-plane snapshot · ${esc(ts)}</div>
  </header>

  <div class="h rise" style="--d:120ms">Signal</div>
  <section class="stats">
    <div class="stat rise" style="--d:140ms"><div class="k">Institutions</div><div class="v" data-target="${institutions}">0</div></div>
    <div class="stat rise" style="--d:210ms"><div class="k">Raw fees</div><div class="v" data-target="${rawTotal}">0</div></div>
    <div class="stat rise" style="--d:280ms"><div class="k">Verified</div><div class="v" data-target="${verifiedTotal}">0</div></div>
    <div class="stat rise" style="--d:350ms"><div class="k">Published</div><div class="v" data-target="${publishedTotal}">0</div></div>
  </section>

  <div class="h rise">Flow · work waiting at each stage</div>
  <section class="flow">${flow}</section>

  <div class="h rise">Funnel · raw → verified → published</div>
  <section class="funnel rise">
    ${tier("Raw", rawTotal, "extracted")}
    ${tier("Verified", verifiedTotal, verifiedPct + "% of raw")}
    ${tier("Published", publishedTotal, "live in index")}
  </section>

  <div class="h rise">Recent runs</div>
  <section class="chips rise">${runChips}</section>
  ${latestSteps.length ? '<section class="strip rise">' + stepStrip + "</section>" : ""}

  <div class="foot rise">
    <span>discover → extract → classify → review → publish · pipeline_runs / pipeline_steps</span>
    <span>node scripts/pipeline-report.mjs</span>
  </div>
</main>
<script>
(function(){
  var fmt=function(n){return Math.round(n).toLocaleString('en-US')};
  function run(el){
    var target=parseFloat(el.getAttribute('data-target'))||0,dur=1400,t0=performance.now();
    function step(t){var p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3);el.textContent=fmt(target*e);if(p<1)requestAnimationFrame(step);}
    requestAnimationFrame(step);
  }
  var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){run(en.target);io.unobserve(en.target);}});},{threshold:.35});
  document.querySelectorAll('[data-target]').forEach(function(el){io.observe(el);});
})();
</script>
</body></html>`;

  const outDir = path.join("docs");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "pipeline-report.html");
  fs.writeFileSync(outFile, html, "utf8");

  console.log("Pipeline console written to " + outFile);
  console.log("Backlog — " + stages.map((s) => s.key + ":" + fmt(s.backlog)).join("  "));
  console.log("Tiers — raw:" + fmt(rawTotal) + " verified:" + fmt(verifiedTotal) + " published:" + fmt(publishedTotal));
} catch (err) {
  console.error("Report generation failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
