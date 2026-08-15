/**
 * Build the narration track from vo/lines.json.
 *
 * Synthesis is delegated to narrate.py (Kokoro is Python-only); this script
 * places each cue at its exact timestamp with ffmpeg's adelay, sums them, and
 * applies a light mastering pass.
 *
 * Cues are pinned to the film, not concatenated. A line that runs long overlaps
 * the next rather than shifting everything after it — the visuals are fixed, so
 * the audio has to be nailed to them. Overruns are reported, not silently
 * absorbed.
 *
 *   node narrate.mjs                          → vo/narration.wav
 *   node narrate.mjs --voice af_heart         → different voice
 *   node narrate.mjs --speed 0.92             → slower read
 *   node narrate.mjs --skip-synth             → re-mix existing parts only
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import ffmpegPath from "ffmpeg-static";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i === -1 ? d : argv[i + 1]; };
const has  = (n) => argv.includes("--" + n);

const VOICE = flag("voice", "am_michael");
const SPEED = flag("speed", "0.95");
const PY    = flag("python", path.join(HERE, ".venv", "bin", "python"));
const OUT   = path.join(HERE, "vo", "narration.wav");
const PARTS = path.join(HERE, "vo", "parts");
const SPEC  = JSON.parse(fs.readFileSync(path.join(HERE, "vo", "lines.json"), "utf8"));

fs.mkdirSync(path.dirname(OUT), { recursive: true });

if (!has("skip-synth")) {
  execFileSync(PY, [path.join(HERE, "narrate.py"), "--voice", VOICE, "--speed", SPEED],
    { stdio: "inherit" });
}

/* WAV duration straight from the header — no probe subprocess needed. */
function wavSeconds(file) {
  const b = fs.readFileSync(file);
  const rate = b.readUInt32LE(24), ch = b.readUInt16LE(22), bits = b.readUInt16LE(34);
  return (b.length - 44) / (rate * ch * (bits / 8));
}

const parts = SPEC.cues.map((cue, i) => {
  const wav = path.join(PARTS, `cue-${String(i).padStart(2, "0")}.wav`);
  if (!fs.existsSync(wav)) { console.error(`missing part: ${wav}`); process.exit(1); }
  return { wav, t: cue.t, dur: wavSeconds(wav), text: cue.text };
});

let overruns = 0;
console.log("\ncue fit:");
parts.forEach((p, i) => {
  const next = SPEC.cues[i + 1]?.t ?? SPEC.duration;
  const slack = next - (p.t + p.dur);
  if (slack < 0) overruns++;
  console.log(
    `  ${String(i).padStart(2)}  t=${p.t.toFixed(1).padStart(5)}  dur=${p.dur.toFixed(2).padStart(5)}` +
    `  slack=${slack.toFixed(2).padStart(6)}${slack < 0 ? "   <-- OVERRUN" : ""}`
  );
});
if (overruns) {
  console.error(`\n${overruns} cue(s) overrun their slot. Shorten the line, raise --speed, ` +
                `or move the cue in vo/lines.json (and the matching CAPTIONS entry in scene.html).`);
}

/* Place each cue, sum, then master. Kokoro needs far less repair than older
   models — a gentle de-mud, a touch of presence, light levelling, and a small
   room so it is not bone dry. Over-processing makes it sound worse, not better. */
const MASTER = [
  "highpass=f=75",
  "equalizer=f=280:t=q:w=1.1:g=-1.5",
  "equalizer=f=3400:t=q:w=1.8:g=1.2",
  "acompressor=threshold=-19dB:ratio=2.5:attack=12:release=220",
  "aecho=0.92:0.94:18:0.035",
  "loudnorm=I=-17:TP=-1.5:LRA=11",
].join(",");

const inputs = parts.flatMap((p) => ["-i", p.wav]);
const delays = parts
  .map((p, i) => `[${i}:a]adelay=${Math.round(p.t * 1000)}|${Math.round(p.t * 1000)}[a${i}]`)
  .join(";");
const mixIn = parts.map((_, i) => `[a${i}]`).join("");

execFileSync(ffmpegPath, [
  "-y", ...inputs,
  "-filter_complex",
  `${delays};${mixIn}amix=inputs=${parts.length}:normalize=0:dropout_transition=0[mix];` +
  `[mix]apad,atrim=0:${SPEC.duration},${MASTER}[out]`,
  "-map", "[out]", "-ac", "1", "-ar", "48000",
  OUT,
], { stdio: ["ignore", "ignore", "pipe"] });

console.log(`\ndone → ${OUT}  (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB, ${SPEC.duration}s)`);
console.log(`next: npm run render -- --vo vo/narration.wav`);
