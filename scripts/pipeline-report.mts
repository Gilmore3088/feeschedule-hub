/**
 * Pipeline report — rendered through the project's REAL report design system
 * (src/lib/report-templates/base): same REPORT_CSS, palette, fonts, and
 * components as every other Bank Fee Index report. Read-only.
 *
 * Run:  npx tsx scripts/pipeline-report.mts
 */

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

const { REPORT_CSS } = await import("@/lib/report-templates/base/styles");
const c = await import("@/lib/report-templates/base/components");

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const fmt = (n: number) => Number(n).toLocaleString("en-US");
const durationOf = (s: Date | null, e: Date | null) => {
  if (!s) return "—";
  const ms = new Date(e ?? Date.now()).getTime() - new Date(s).getTime();
  if (ms < 0) return "—";
  if (ms < 1000) return ms + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  return Math.floor(ms / 60000) + "m " + Math.round((ms % 60000) / 1000) + "s";
};
async function scalar(q: Promise<Record<string, unknown>[]>): Promise<number> {
  try { const [r] = await q; return Number(Object.values(r)[0] ?? 0); } catch { return 0; }
}
async function many<T>(q: Promise<T[]>): Promise<T[]> { try { return await q; } catch { return []; } }

try {
  const discover = await scalar(sql`SELECT count(*)::int FROM crawl_targets WHERE (fee_schedule_url IS NULL OR fee_schedule_url='') AND website_url IS NOT NULL AND website_url<>''`);
  const extract = await scalar(sql`SELECT count(*)::int FROM crawl_targets ct WHERE ct.fee_schedule_url IS NOT NULL AND ct.fee_schedule_url<>'' AND NOT EXISTS (SELECT 1 FROM fees_raw fr WHERE fr.institution_id=ct.id)`);
  const classify = await scalar(sql`SELECT count(*)::int FROM fees_raw fr LEFT JOIN fees_verified fv ON fv.fee_raw_id=fr.fee_raw_id WHERE fv.fee_verified_id IS NULL`);
  const review = await scalar(sql`SELECT count(*)::int FROM fees_verified v WHERE NOT EXISTS (SELECT 1 FROM agent_messages m WHERE m.sender_agent='knox' AND m.payload->>'fee_verified_id'=v.fee_verified_id::text)`);
  const publish = await scalar(sql`SELECT count(*)::int FROM fees_verified v LEFT JOIN fees_published p ON p.lineage_ref=v.fee_verified_id WHERE p.fee_published_id IS NULL AND v.extraction_confidence>=0.9 AND COALESCE(v.review_status,'pending')<>'rejected'`);
  const institutions = await scalar(sql`SELECT count(*)::int FROM crawl_targets`);
  const withUrl = await scalar(sql`SELECT count(*)::int FROM crawl_targets WHERE fee_schedule_url IS NOT NULL AND fee_schedule_url<>''`);
  const rawTotal = await scalar(sql`SELECT count(*)::int FROM fees_raw`);
  const verifiedTotal = await scalar(sql`SELECT count(*)::int FROM fees_verified`);
  const publishedTotal = await scalar(sql`SELECT count(*)::int FROM fees_published`);
  const recentRuns = await many<{ id: number; trigger_source: string; triggered_by: string; status: string; stages_done: number; stages_total: number; started_at: Date | null; finished_at: Date | null }>(
    sql`SELECT id, trigger_source, triggered_by, status, stages_done, stages_total, started_at, finished_at FROM pipeline_runs ORDER BY created_at DESC LIMIT 8` as never);

  const now = new Date();
  const dateline = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const verifiedPct = rawTotal > 0 ? ((verifiedTotal / rawTotal) * 100).toFixed(1) : "0.0";
  const publishedPct = rawTotal > 0 ? ((publishedTotal / rawTotal) * 100).toFixed(1) : "0.0";

  const body =
    c.coverPage({
      series: "Pipeline Operations",
      title: `${fmt(publishedTotal)} fees live; ${fmt(classify)} await classification`,
      subtitle: "A snapshot of the fee pipeline — collection, classification, review, and publication — across the index.",
      report_date: dateline,
    }) +
    `<div class="report-section">` +
    c.sectionHeader({ label: "01 · Headline figures", title: `${fmt(rawTotal)} fees collected across ${fmt(institutions)} institutions` }) +
    c.statCardRow([
      { label: "Institutions", value: fmt(institutions), source: `${fmt(withUrl)} with a fee URL` },
      { label: "Raw fees", value: fmt(rawTotal), source: "Tier 1 — collected" },
      { label: "Verified", value: fmt(verifiedTotal), source: "Tier 2 — classified" },
      { label: "Published", value: fmt(publishedTotal), delta: `${publishedPct}% of raw`, deltaColor: "negative", source: "Tier 3 — live in index" },
    ]) +
    `</div>` +
    `<div class="report-section">` +
    c.sectionHeader({ label: "02 · Coverage funnel", title: "Classification is the bottleneck", subheading: `Only ${verifiedPct}% of collected fees are verified and ${publishedPct}% are published.` }) +
    c.horizontalBarChart({
      title: "Fees by tier",
      bars: [
        { label: "Raw — collected", value: rawTotal, displayValue: fmt(rawTotal) },
        { label: "Verified — classified", value: verifiedTotal, displayValue: fmt(verifiedTotal) },
        { label: "Published — live", value: publishedTotal, displayValue: fmt(publishedTotal) },
      ],
      source: "Tiers 1 → 3, full pipeline",
    }) +
    c.soWhatBox(`${fmt(classify)} verified-ready fees are stuck at classification. Draining that backlog is the single highest-leverage move to grow published coverage.`) +
    `</div>` +
    `<div class="report-section">` +
    c.sectionHeader({ label: "03 · Stage backlog", title: "Where work is waiting" }) +
    c.horizontalBarChart({
      title: "Backlog by stage",
      bars: [
        { label: "Discover — no fee URL", value: discover, displayValue: fmt(discover) },
        { label: "Extract — awaiting", value: extract, displayValue: fmt(extract) },
        { label: "Classify — awaiting", value: classify, displayValue: fmt(classify) },
        { label: "Review — awaiting", value: review, displayValue: fmt(review) },
        { label: "Publish — ready", value: publish, displayValue: fmt(publish) },
      ],
      source: "Discover → Extract → Classify → Review → Publish",
    }) +
    `</div>` +
    `<div class="report-section">` +
    c.sectionHeader({ label: "04 · Operations", title: "Recent pipeline runs" }) +
    c.dataTable({
      columns: [
        { key: "id", label: "Run" },
        { key: "trigger", label: "Trigger" },
        { key: "by", label: "By" },
        { key: "status", label: "Status" },
        { key: "steps", label: "Steps", align: "right" },
        { key: "dur", label: "Duration", align: "right" },
      ],
      rows: recentRuns.length
        ? recentRuns.map((r) => ({
            id: "#" + r.id, trigger: r.trigger_source, by: r.triggered_by, status: r.status,
            steps: `${r.stages_done}/${r.stages_total}`, dur: durationOf(r.started_at, r.finished_at),
          }))
        : [{ id: "—", trigger: "no runs yet", by: "—", status: "—", steps: "—", dur: "—" }],
    }) +
    `</div>` +
    c.footnote(`Generated ${now.toLocaleString("en-US")} from live pipeline_runs / pipeline_steps. Discover → Extract → Classify → Review → Publish.`);

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Pipeline Report — Bank Fee Index</title>
<style>${REPORT_CSS}</style></head><body>${body}</body></html>`;

  const outDir = path.join("docs");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "pipeline-report.html"), html, "utf8");
  console.log("Report written to docs/pipeline-report.html (via report-templates design system)");
  console.log(`Tiers — raw:${fmt(rawTotal)} verified:${fmt(verifiedTotal)} published:${fmt(publishedTotal)} · institutions:${fmt(institutions)}`);
} catch (err) {
  console.error("Report generation failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
