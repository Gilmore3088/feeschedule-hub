/**
 * Fee Insight brand explainer — deterministic frame renderer.
 *
 * Drives scene.html's seek(t) one frame at a time in headless Chromium and
 * pipes JPEG frames straight into ffmpeg. No frames ever touch disk.
 *
 *   node render.mjs                     full 81s render at 1920x1080/30
 *   node render.mjs --stills 0,14,30    write PNG stills at those timestamps
 *   node render.mjs --fps 30 --scale .5 half-size proof render
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import ffmpegPath from "ffmpeg-static";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i === -1 ? d : argv[i + 1]; };

const FPS      = Number(flag("fps", 30));
const SCALE    = Number(flag("scale", 1));
const OUT      = flag("out", path.join(HERE, "out", "feeinsight-explainer.mp4"));
const STILLS   = flag("stills", null);
const W = Math.round(1920 * SCALE), H = Math.round(1080 * SCALE);

fs.mkdirSync(path.dirname(OUT), { recursive: true });

const browser = await chromium.launch({
  args: ["--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text"],
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: SCALE,
});
await page.goto("file://" + path.join(HERE, "scene.html"));
await page.waitForFunction(() => window.__ready === true);
await page.evaluate(() => document.fonts.ready);

const DURATION = await page.evaluate(() => window.DURATION ?? 81);

/* ── stills mode: quick visual proof before the long render ── */
if (STILLS) {
  const dir = path.join(HERE, "out", "stills");
  fs.mkdirSync(dir, { recursive: true });
  for (const raw of STILLS.split(",")) {
    const t = Number(raw.trim());
    await page.evaluate((tt) => window.seek(tt), t);
    const f = path.join(dir, `t${String(t).padStart(5, "0")}.png`);
    await page.screenshot({ path: f, type: "png" });
    console.log("still", t + "s →", f);
  }
  await browser.close();
  process.exit(0);
}

/* ── full render ── */
const TOTAL = Math.round(DURATION * FPS);
console.log(`rendering ${TOTAL} frames · ${DURATION}s @ ${FPS}fps · ${W}x${H}`);

// Optional narration track. Absent by default — the cut is designed to read
// silent, with the VO lines burned in as captions.
const VO = flag("vo", null);
if (VO && !fs.existsSync(path.resolve(HERE, VO))) {
  console.error(`voice-over not found: ${VO}`);
  process.exit(1);
}
const ff = spawn(ffmpegPath, [
  "-y",
  "-f", "image2pipe", "-framerate", String(FPS), "-i", "pipe:0",
  ...(VO ? ["-i", path.resolve(HERE, VO)] : []),
  "-c:v", "libx264",
  "-preset", "slow",
  "-crf", "17",
  "-pix_fmt", "yuv420p",
  "-vf", `scale=${W}:${H}:flags=lanczos`,
  ...(VO ? ["-c:a", "aac", "-b:a", "192k", "-shortest", "-map", "0:v:0", "-map", "1:a:0"] : []),
  "-movflags", "+faststart",
  "-r", String(FPS),
  OUT,
], { stdio: ["pipe", "ignore", "pipe"] });
if (VO) console.log(`muxing narration: ${VO}`);

let ffErr = "";
ff.stderr.on("data", (d) => { ffErr += d.toString(); if (ffErr.length > 40000) ffErr = ffErr.slice(-20000); });
const ffDone = once(ff, "close");

const started = Date.now();
for (let i = 0; i < TOTAL; i++) {
  const t = i / FPS;
  await page.evaluate((tt) => window.seek(tt), t);
  const buf = await page.screenshot({ type: "jpeg", quality: 96 });
  if (!ff.stdin.write(buf)) await once(ff.stdin, "drain");
  if (i % 150 === 0 || i === TOTAL - 1) {
    const done = i + 1;
    const rate = done / ((Date.now() - started) / 1000);
    const eta = Math.round((TOTAL - done) / rate);
    console.log(`  ${done}/${TOTAL}  ${(100 * done / TOTAL).toFixed(1)}%  ${rate.toFixed(1)} fps  eta ${eta}s`);
  }
}

ff.stdin.end();
const [code] = await ffDone;
await browser.close();

if (code !== 0) {
  console.error(ffErr.slice(-3000));
  process.exit(code);
}
const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
console.log(`\ndone → ${OUT}  (${mb} MB, ${(Date.now() - started) / 1000 | 0}s)`);
