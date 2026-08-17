#!/usr/bin/env node
// Builds email-preview.html from drafts/*.md. Usage: node preview.mjs
// Nothing here sends anything; it is a review surface only.
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const DIR = dirname(fileURLToPath(import.meta.url));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Escape, then turn hosted URLs into anchors and **bold** into <b> so the link line and Attn: line read as sent.
const rich = (s) => esc(s)
  .replace(/https?:\/\/[^\s<)]+/g, (url) => `<a href="${url}">${url}</a>`)
  .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
// Pre-send check: a form-only variant whose short finding was cut mid-sentence ("$33 vs. It's yours",
// "is 4. It's yours") must never ship. Collected while rendering; the run fails at the end if any exist.
const TRUNCATION_PATTERNS = [/vs\. It's yours/, /\d\. It's yours/];
const truncated = [];
const drafts = readdirSync(join(DIR, "drafts")).filter((f) => f.endsWith(".md")).sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]));
const cards = []; const nav = [];
for (const file of drafts) {
  const id = file.replace(".md", ""); const md = readFileSync(join(DIR, "drafts", file), "utf8");
  const inst = (md.match(/^# (.+?) — outreach draft/m) || [])[1] || id;
  const get = (k) => (md.match(new RegExp(`^- ${k}: (.+)$`, "m")) || [])[1] || "";
  const to = get("To"), conf = get("Contact confidence"), attach = get("Attach").replace(/^out\//, ""), from = get("From"), hosted = get("Hosted");
  const subject = (md.match(/^Subject: (.+)$/m) || [])[1] || "";
  const [, bodyAndRest = ""] = md.split(/^Subject: .+\n\n/m);
  const [body, formVariant] = bodyAndRest.split(/\n---\n## Form-only variant[^\n]*\n/);
  const paras = body.trim().split(/\n\n+/).map((p) => p.startsWith("> ") ? `<blockquote>${esc(p.replace(/^> /gm, ""))}</blockquote>` : `<p>${rich(p).replace(/\n/g, "<br>")}</p>`).join("\n");
  if (formVariant && TRUNCATION_PATTERNS.some((re) => re.test(formVariant))) truncated.push(file);
  const hold = conf !== "exact-email";
  nav.push(`<a href="#i${id}">${esc(inst)}</a>`);
  cards.push(`
<div class="card${hold ? " hold" : ""}" id="i${id}">
  <div class="meta">
    <div class="row"><span class="k">To</span><span>${esc(to)}</span></div>
    <div class="row"><span class="k">From</span><span>${esc(from)}</span></div>
    <div class="row"><span class="k">Subject</span><b>${esc(subject)}</b></div>
    <div class="row"><span class="k">Attach</span><span class="chip">${esc(attach)}</span><span class="conf">${esc(conf)}</span>${hold ? '<span class="holdtag">HOLD: verify a direct address first</span>' : ""}</div>
    ${hosted ? `<div class="row"><span class="k">Hosted</span><span>${esc(hosted)}</span></div>` : ""}
  </div>
  <div class="body">${paras}</div>
  ${formVariant ? `<div class="variant"><div class="k">Form-only variant</div><p>${rich(formVariant.trim())}</p></div>` : ""}
</div>`);
}
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Outreach Email Previews</title>
<style>
:root{--bg:#FAF7F2;--ink:#1A1815;--sec:#5A5347;--mut:#7A7062;--acc:#C44B2E;--accl:#FDF0ED;--line:#E0D7C9;--card:#FDFBF8}
@media (prefers-color-scheme:dark){:root{--bg:#1A1815;--ink:#F5EFE6;--sec:#C9C0B2;--mut:#A09788;--acc:#E0664A;--accl:#3A2620;--line:#3D3830;--card:#221F1B}}
*{box-sizing:border-box;margin:0}body{background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;padding:40px 18px 90px}
.wrap{max-width:760px;margin:0 auto}h1{font-family:Georgia,serif;font-size:1.7rem;margin-bottom:4px}.sub{color:var(--sec);margin-bottom:8px}
.warn{background:var(--accl);border-left:4px solid var(--acc);padding:10px 14px;border-radius:0 8px 8px 0;margin:14px 0 26px;font-size:.92rem}
nav{columns:2;gap:28px;font-size:.85rem;margin-bottom:34px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 18px}
nav a{display:block;color:var(--acc);text-decoration:none;margin:2px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;margin:26px 0;overflow:hidden}.card.hold{border-color:var(--acc)}
.meta{background:var(--bg);border-bottom:1px solid var(--line);padding:14px 20px;font-size:.88rem}
.row{display:flex;gap:10px;margin:3px 0;flex-wrap:wrap;align-items:baseline}
.k{color:var(--mut);min-width:60px;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em}
.chip{background:var(--accl);color:var(--acc);border-radius:999px;padding:1px 10px;font-size:.78rem}
.conf{color:var(--mut);font-size:.75rem;font-style:italic}
.holdtag{background:var(--acc);color:#fff;border-radius:999px;padding:1px 10px;font-size:.72rem;font-weight:700}
.body{padding:18px 22px}.body p{margin:0 0 12px}.body blockquote{margin:0 0 12px;padding:8px 14px;border-left:3px solid var(--acc);color:var(--sec)}
.variant{border-top:1px dashed var(--line);padding:12px 22px 16px;font-size:.9rem;color:var(--sec)}
</style></head><body><div class="wrap">
<h1>Outreach Email Previews</h1>
<div class="sub">${drafts.length} drafts · generated from Reports/studio/drafts/ by preview.mjs · nothing here has been or will be sent by Claude</div>
<div class="warn"><b>Preview only.</b> Sending is yours alone. Cards outlined in terracotta need a direct address (form-only / general inbox) before sending; use the form-only variant where shown.</div>
<nav>${nav.join("")}</nav>
${cards.join("\n")}
</div></body></html>`;
writeFileSync(join(DIR, "email-preview.html"), html);
console.log("wrote email-preview.html with", drafts.length, "cards");
if (truncated.length) {
  console.error("Pre-send check FAILED: form-only variant cut mid-sentence in", truncated.join(", "));
  process.exit(1);
}
