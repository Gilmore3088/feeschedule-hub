/**
 * Build the narration track from vo/lines.json.
 *
 * Synthesises each line separately with Piper, then places it at its exact cue
 * time with ffmpeg's adelay and sums the result. Lines are timed to the film,
 * not concatenated end to end — a cue that runs long overlaps the next rather
 * than shifting everything after it, which is what you want when the visuals
 * are fixed.
 *
 *   node narrate.mjs                    → vo/narration.wav
 *   node narrate.mjs --rate 1.08        → slower read (length_scale)
 *
 * Requires a Piper voice at voices/*.onnx — see README, "Voice-over".
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import ffmpegPath from "ffmpeg-static";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i === -1 ? d : argv[i + 1]; };

const RATE   = flag("rate", "1.06");          // >1 slows the read
const VOICE  = flag("voice", path.join(HERE, "voices", "en-us-ryan-high.onnx"));
const PY     = flag("python", path.join(HERE, ".venv", "bin", "python"));
const OUT    = path.join(HERE, "vo", "narration.wav");
const PARTS  = path.join(HERE, "vo", "parts");
const LINES  = JSON.parse(fs.readFileSync(path.join(HERE, "vo", "lines.json"), "utf8"));

for (const p of [path.dirname(OUT), PARTS]) fs.mkdirSync(p, { recursive: true });
if (!fs.existsSync(VOICE)) {
  console.error(`voice model not found: ${VOICE}\nSee README → Voice-over for how to fetch one.`);
  process.exit(1);
}

// Piper reads punctuation literally enough that an em dash lands as a hard
// stop; a comma gives the pause without the swallowed word.
const forSpeech = (s) => s.replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim();

console.log(`synthesising ${LINES.cues.length} cues at rate ${RATE}`);
const parts = [];
LINES.cues.forEach((cue, i) => {
  const wav = path.join(PARTS, `cue-${String(i).padStart(2, "0")}.wav`);
  execFileSync(PY, [
    "-m", "piper",
    "--model", VOICE,
    "--length_scale", RATE,
    "--sentence_silence", "0.25",
    "--output_file", wav,
  ], { input: forSpeech(cue.text) });
  parts.push({ wav, t: cue.t });
  console.log(`  ${cue.t.toFixed(1).padStart(5)}s  ${cue.text.slice(0, 62)}`);
});

// Place each cue at its timestamp and sum. normalize=0 keeps levels intact —
// the cues do not overlap, so summing cannot clip.
const inputs = parts.flatMap((p) => ["-i", p.wav]);
const delays = parts
  .map((p, i) => `[${i}:a]adelay=${Math.round(p.t * 1000)}|${Math.round(p.t * 1000)}[a${i}]`)
  .join(";");
const mixIn = parts.map((_, i) => `[a${i}]`).join("");
// Raw TTS is bone dry and mid-heavy, which is most of what reads as "robotic".
// Rolling off the mud, lifting presence, levelling, and adding a very short
// room reflection does not make it human — but it stops it sounding like it was
// recorded inside a calculator.
const POLISH = [
  "highpass=f=85",                             // rumble
  "equalizer=f=260:t=q:w=1.1:g=-2.5",          // boxiness
  "equalizer=f=3200:t=q:w=1.8:g=2",            // consonant clarity
  "equalizer=f=7000:t=q:w=2:g=-1.5",           // sibilance
  "acompressor=threshold=-18dB:ratio=3:attack=8:release=180",
  "aecho=0.9:0.92:22:0.055",                   // a small room, not an effect
  "loudnorm=I=-18:TP=-1.5:LRA=11",
].join(",");

const filter = `${delays};${mixIn}amix=inputs=${parts.length}:normalize=0:dropout_transition=0[mix];` +
               `[mix]apad,atrim=0:${LINES.duration},${POLISH}[out]`;

execFileSync(ffmpegPath, [
  "-y", ...inputs,
  "-filter_complex", filter,
  "-map", "[out]", "-ac", "1", "-ar", "48000",
  OUT,
], { stdio: ["ignore", "ignore", "pipe"] });

const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
console.log(`\ndone → ${OUT}  (${mb} MB, ${LINES.duration}s)`);
console.log(`now: npm run render -- --vo vo/narration.wav`);
