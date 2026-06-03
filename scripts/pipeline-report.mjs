#!/usr/bin/env node
// Pipeline log + report generator.
//
// Pulls the live control-plane state (pipeline_runs / pipeline_steps) and the
// per-stage backlog, and writes a self-contained editorial HTML report to
// docs/pipeline-report.html. Read-only.
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
const generatedAt = new Date().toISOString();

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
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

try {
  // ── Per-stage backlog (what each stage would process) ────────────────────
  const discover = await scalar(sql`
    SELECT count(*)::int FROM crawl_targets
     WHERE (fee_schedule_url IS NULL OR fee_schedule_url = '')
       AND website_url IS NOT NULL AND website_url <> ''`);
  const extract = await scalar(sql`
    SELECT count(*)::int FROM crawl_targets ct
     WHERE ct.fee_schedule_url IS NOT NULL AND ct.fee_schedule_url <> ''
       AND NOT EXISTS (SELECT 1 FROM fees_raw fr WHERE fr.institution_id = ct.id)`);
  const classify = await scalar(sql`
    SELECT count(*)::int FROM fees_raw fr
     LEFT JOIN fees_verified fv ON fv.fee_raw_id = fr.fee_raw_id
     WHERE fv.fee_verified_id IS NULL`);
  const review = await scalar(sql`
    SELECT count(*)::int FROM fees_verified v
     WHERE NOT EXISTS (SELECT 1 FROM agent_messages m
        WHERE m.sender_agent = 'knox' AND m.payload->>'fee_verified_id' = v.fee_verified_id::text)`);
  const publish = await scalar(sql`
    SELECT count(*)::int FROM fees_verified v
     LEFT JOIN fees_published p ON p.lineage_ref = v.fee_verified_id
     WHERE p.fee_published_id IS NULL AND v.extraction_confidence >= 0.9
       AND COALESCE(v.review_status, 'pending') <> 'rejected'`);

  // ── Tier totals ──────────────────────────────────────────────────────────
  const institutions = await scalar(sql`SELECT count(*)::int FROM crawl_targets`);
  const withUrl = await scalar(sql`SELECT count(*)::int FROM crawl_targets WHERE fee_schedule_url IS NOT NULL AND fee_schedule_url <> ''`);
  const rawTotal = await scalar(sql`SELECT count(*)::int FROM fees_raw`);
  const verifiedTotal = await scalar(sql`SELECT count(*)::int FROM fees_verified`);
  const publishedTotal = await scalar(sql`SELECT count(*)::int FROM fees_published`);

  // ── Recent runs + latest steps ───────────────────────────────────────────
  const recentRuns = await rows(sql`
    SELECT id, trigger_source, triggered_by, status, stages_done, stages_total,
           started_at, finished_at, created_at
      FROM pipeline_runs ORDER BY created_at DESC LIMIT 10`);
  const latestSteps = recentRuns.length
    ? await rows(sql`
        SELECT stage, status, rows_in, rows_out, started_at, finished_at, notes_json
          FROM pipeline_steps WHERE run_id = ${recentRuns[0].id} ORDER BY seq`)
    : [];

  const stages = [
    { key: "discover", label: "Discover", backlog: discover, desc: "targets missing a fee URL" },
    { key: "extract", label: "Extract", backlog: extract, desc: "targets awaiting extraction" },
    { key: "classify", label: "Classify", backlog: classify, desc: "raw fees awaiting classification" },
    { key: "review", label: "Review", backlog: review, desc: "verified fees awaiting review" },
    { key: "publish", label: "Publish", backlog: publish, desc: "verified fees ready to publish" },
  ];
  const maxBacklog = Math.max(1, ...stages.map((s) => s.backlog));

  const statusColor = {
    succeeded: "#0f7b46", running: "#1d4ed8", queued: "#6b7280",
    failed: "#b42318", canceled: "#b45309", pending: "#6b7280", skipped: "#b45309",
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Bank Fee Index — Pipeline Report</title>
<style>
  :root { --ink:#16181d; --muted:#6b7280; --line:#e6e7ea; --bg:#fbfbfa; --accent:#b4541f; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 920px; margin: 0 auto; padding: 56px 28px 80px; }
  .eyebrow { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-size: 38px; line-height: 1.1; margin: 10px 0 6px; letter-spacing: -.01em; }
  .sub { color: var(--muted); font-size: 14px; }
  .rule { height:1px; background:var(--line); margin:28px 0; }
  h2 { font-size: 12px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:700; margin: 36px 0 14px; }
  .cards { display:grid; grid-template-columns: repeat(5, 1fr); gap:10px; }
  .card { border:1px solid var(--line); background:#fff; border-radius:10px; padding:14px; }
  .card .k { font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); font-weight:700; }
  .card .v { font-size:24px; font-weight:700; margin-top:4px; font-variant-numeric: tabular-nums; }
  .funnel { border:1px solid var(--line); background:#fff; border-radius:12px; padding:8px 18px; }
  .frow { display:grid; grid-template-columns: 110px 1fr 92px; align-items:center; gap:14px; padding:13px 0; border-bottom:1px solid var(--line); }
  .frow:last-child { border-bottom:0; }
  .fname { font-weight:700; font-size:14px; }
  .fdesc { color:var(--muted); font-size:11.5px; margin-top:2px; }
  .bar { height:9px; background:#eceae6; border-radius:6px; overflow:hidden; }
  .bar > span { display:block; height:100%; background:linear-gradient(90deg,#c8642a,#b4541f); }
  .fnum { text-align:right; font-variant-numeric: tabular-nums; font-weight:700; font-size:16px; }
  table { width:100%; border-collapse:collapse; font-size:13px; background:#fff; border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  th { text-align:left; font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); font-weight:700; padding:11px 14px; background:#f6f6f5; border-bottom:1px solid var(--line); }
  td { padding:11px 14px; border-bottom:1px solid var(--line); font-variant-numeric: tabular-nums; }
  tr:last-child td { border-bottom:0; }
  .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:700; color:#fff; }
  .foot { color:var(--muted); font-size:12px; margin-top:34px; line-height:1.7; }
  code { background:#f1f1ef; padding:1px 6px; border-radius:5px; font-size:12px; }
  @media (max-width:720px){ .cards{grid-template-columns:repeat(2,1fr)} .frow{grid-template-columns:90px 1fr 70px} h1{font-size:30px} }
</style>
</head>
<body>
<div class="wrap">
  <div class="eyebrow">Bank Fee Index · Data Pipeline</div>
  <h1>Pipeline Status Report</h1>
  <div class="sub">Generated ${esc(generatedAt)} · live control-plane snapshot</div>
  <div class="rule"></div>

  <h2>Fee data, by tier</h2>
  <div class="cards">
    <div class="card"><div class="k">Institutions</div><div class="v">${fmt(institutions)}</div></div>
    <div class="card"><div class="k">With fee URL</div><div class="v">${fmt(withUrl)}</div></div>
    <div class="card"><div class="k">Raw fees</div><div class="v">${fmt(rawTotal)}</div></div>
    <div class="card"><div class="k">Verified</div><div class="v">${fmt(verifiedTotal)}</div></div>
    <div class="card"><div class="k">Published</div><div class="v">${fmt(publishedTotal)}</div></div>
  </div>

  <h2>Stage backlog — work waiting at each step</h2>
  <div class="funnel">
    ${stages
      .map(
        (s) => `<div class="frow">
      <div><div class="fname">${s.label}</div><div class="fdesc">${esc(s.desc)}</div></div>
      <div class="bar"><span style="width:${Math.max(2, Math.round((s.backlog / maxBacklog) * 100))}%"></span></div>
      <div class="fnum">${fmt(s.backlog)}</div>
    </div>`,
      )
      .join("\n    ")}
  </div>

  <h2>Recent pipeline runs</h2>
  ${
    recentRuns.length
      ? `<table>
    <thead><tr><th>Run</th><th>Trigger</th><th>By</th><th>Status</th><th>Steps</th><th>Started</th><th>Duration</th></tr></thead>
    <tbody>
      ${recentRuns
        .map(
          (r) => `<tr>
        <td>#${r.id}</td><td>${esc(r.trigger_source)}</td><td>${esc(r.triggered_by)}</td>
        <td><span class="pill" style="background:${statusColor[r.status] || "#6b7280"}">${esc(r.status)}</span></td>
        <td>${r.stages_done}/${r.stages_total}</td>
        <td>${r.started_at ? esc(new Date(r.started_at).toLocaleString("en-US")) : "—"}</td>
        <td>${durationOf(r.started_at, r.finished_at)}</td>
      </tr>`,
        )
        .join("\n      ")}
    </tbody></table>`
      : `<div class="funnel"><div class="fdesc" style="padding:10px 0">No runs recorded yet. Trigger one from <code>/admin/pipeline</code>.</div></div>`
  }

  ${
    latestSteps.length
      ? `<h2>Latest run · step detail (run #${recentRuns[0].id})</h2>
  <table>
    <thead><tr><th>Stage</th><th>Status</th><th>In</th><th>Out</th><th>Duration</th><th>Detail</th></tr></thead>
    <tbody>
      ${latestSteps
        .map((s) => {
          const note = s.notes_json && typeof s.notes_json.message === "string" ? s.notes_json.message : "";
          return `<tr>
        <td style="font-weight:700">${esc(s.stage)}</td>
        <td><span class="pill" style="background:${statusColor[s.status] || "#6b7280"}">${esc(s.status)}</span></td>
        <td>${s.rows_in ?? "—"}</td><td>${s.rows_out ?? "—"}</td>
        <td>${durationOf(s.started_at, s.finished_at)}</td>
        <td style="color:var(--muted)">${esc(note)}</td>
      </tr>`;
        })
        .join("\n      ")}
    </tbody></table>`
      : ""
  }

  <div class="foot">
    Pipeline rebuild — Phases 1–3 shipped. Stages: discover → extract → classify → review → publish,
    each an engine-neutral unit recorded in <code>pipeline_runs</code> / <code>pipeline_steps</code>.<br/>
    Trigger &amp; monitor at <code>/admin/pipeline</code>. Regenerate this report with
    <code>node scripts/pipeline-report.mjs</code>.
  </div>
</div>
</body>
</html>`;

  // Write to docs/ — note the repo already has a case-insensitively-colliding
  // Reports/ directory of research PDFs, so we avoid "reports/" entirely.
  const outDir = path.join("docs");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "pipeline-report.html");
  fs.writeFileSync(outFile, html, "utf8");

  console.log(`Pipeline report written to ${outFile}`);
  console.log("Backlog —",
    stages.map((s) => `${s.label}:${fmt(s.backlog)}`).join("  "));
  console.log(`Tiers — institutions:${fmt(institutions)} raw:${fmt(rawTotal)} verified:${fmt(verifiedTotal)} published:${fmt(publishedTotal)}`);
  console.log(`Recent runs: ${recentRuns.length}`);
} catch (err) {
  console.error("Report generation failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
