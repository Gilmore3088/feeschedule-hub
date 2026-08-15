# Fee Insight Studio — brand explainer renderer

Renders the 70-second Fee Insight institutional explainer to MP4. **This is not
part of the Next.js application.** It is a standalone build tool that happens to
be parked in this repo so the source is not lost; see *Where this belongs* below.

Evaluation and rationale: `docs/plans/openmontage-video-evaluation-2026-08-15.md`.

## What it produces

`out/feeinsight-explainer.mp4` — 1920×1080, H.264, 30fps, silent, ~3.5 MB.
Sound-off by design: the story is carried by motion, type and burned-in
captions, so it works muted on a landing page or in a sales deck.

Six beats aimed at **the buyer** — a retail/deposit executive or CFO who does
not shop for fees but has to defend every one of them once a year.

| Time | Beat | Role |
| --- | --- | --- |
| 0:00 | "It's time for the annual fee review. Who's going to benchmark every fee?" | **Hook** — a meeting they have actually sat in |
| 0:09 | PDFs piling up, week counter climbing, "stale on arrival" | The cost of doing it by hand |
| 0:19 | "With Fee Insight — it's already done." | The turn |
| 0:26 | Peer distribution, your position, live metric tiles | **Benchmark, then simulate** |
| 0:51 | Hamilton's four modes and a cited Peer Brief | The deliverable |
| 1:02 | "Your annual fee review, in an afternoon." | Close |

Rules this cut follows:

- **Never quote a count.** No "49 fees", no "48 more". Counts invite arithmetic
  about the product rather than the decision, and they date the film the moment
  the taxonomy changes. Say "every fee" and let the frame show the volume.
- **The simulate beat is the demonstration.** It is the only place the product
  visibly *does* something — the fee moves, the dot travels the axis, the
  percentile climbs, the risk chip flips Low to Medium, the revenue figure
  resolves. Percentile and risk mirror `src/lib/hamilton/simulation.ts`
  (`estimatePercentile`, `classifyRisk`), so what the film shows is the model
  the product actually runs.
- **No pricing.** The film sells the afternoon, not the invoice.
- **Hamilton is named**, with its real modes — Analyze, Simulate, Report,
  Monitor (`src/lib/hamilton/modes.ts`).
- **Don't caption what the frame already says.** The open and close are display
  headlines and carry no caption.

Headlines animate word by word (`typeIn()`), so type carries motion rather
than fading in as blocks.

## Voice-over

The script lives in [`vo-script.md`](vo-script.md) — 116 words at ~110 wpm,
timed line by line. Deliberately slower than consumer video: the pauses are
where the numbers land. Most lines are burned into the film as captions, so the
cut works with sound off and the VO drops on top without re-timing. The open
and close are the exception — they are set as display headlines, so captioning
them would only double the words.

### Generating it

`vo/lines.json` holds the `{t, text}` cues. `narrate.py` synthesises each line
with **Kokoro v1.0** (Python-only, hence the split); `narrate.mjs` places each
one at its exact cue time via ffmpeg `adelay`, masters the result, and reports
any cue that overruns its slot.

```bash
npm run narrate                           # → vo/narration.wav
npm run narrate -- --voice af_heart       # different voice
npm run narrate -- --speed 0.92           # slower read
npm run narrate:remix                     # re-mix existing parts, no re-synthesis
npm run render -- --vo vo/narration.wav   # muxes as AAC
```

**Cues are pinned to the film, not concatenated.** A line that runs long
overlaps the next rather than shifting everything after it — the visuals are
fixed, so the audio has to be nailed to them. `narrate.mjs` prints per-cue slack
and flags overruns; fix one by shortening the line, raising `--speed`, or moving
the cue in `vo/lines.json` **and** the matching `CAPTIONS` entry in `scene.html`.

### Pronunciation

`lines.json` carries a `pronunciation` map applied to the spoken text only, so
captions keep the readable form. Initialisms are the usual offender — `PDF` is
rewritten to `P D F` so it is spelled out rather than attempted as a word. Any
cue can also carry an explicit `say` field that overrides its spoken form
entirely. Em dashes are converted to commas automatically; the phonemiser
otherwise swallows the following word.

### Getting the models

**HuggingFace is blocked through the agent proxy (403), but GitHub is not** —
GitHub releases are the way in:

```bash
mkdir -p voices && cd voices
curl -sSLO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -sSLO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

Kokoro ships ~50 voices — `am_michael` (default), `am_onyx`, `am_eric`,
`bm_george`, `af_heart`, `bf_emma` and more; list them with
`Kokoro.get_voices()`.

One environment quirk: `espeakng-loader` ships a library with a build-machine
data path compiled in, so phonemisation fails with a missing `phontab`.
`narrate.py` sets `ESPEAK_DATA_PATH`; if the library still ignores it, symlink
the shipped data to the path it demands.

### Still a synthetic voice

Kokoro is far closer to human than the older open models and reads the script
cleanly, but it is not a voice actor. For anything customer-facing:

| Option | Cost | Quality |
| --- | --- | --- |
| **Record it yourself** | free | Genuine and on-brand; a quiet room and a decent mic beat any synthetic voice |
| **Hire a VO artist** (Voice123, Voices.com) | ~$150–400 for 70s | Broadcast |
| **ElevenLabs / OpenAI TTS** | ~$5–30/mo | Best synthetic available; needs an API key this container does not have |

Swapping in a human read changes nothing but the WAV — the cue timings, captions
and render command all stay as they are.

## Music

```bash
npm run render -- --vo vo/narration.wav --music music/bed.mp3
```

The bed is trimmed to length, faded at both ends, and **ducked by a sidechain
compressor keyed off the narration**, so speech always sits on top without
anyone riding a fader. Level defaults to −21 dB; override with `--music-db`.

No track is committed — music needs a licence, and an unlicensed bed on a
commercial video is a liability. Sources that are safe for commercial use:
YouTube Audio Library (free), Epidemic Sound, Artlist, Musicbed. Keep it sparse
and low; this is a research brand, not an ad.

If the caption timings in `scene.html` (`CAPTIONS`) change, update
`vo/lines.json` and `vo-script.md` to match. They are one script in three forms.

## Running it

Requires Node 18+ and `playwright` (resolved from the global install if present).

```bash
cd studio
npm install
npm run stills     # PNG stills at key timestamps — fast visual check
npm run proof      # half-size proof render
npm run render     # full 1920x1080 render (~100s)
```

Chromium comes from `PLAYWRIGHT_BROWSERS_PATH`; do not run `playwright install`.
`ffmpeg-static` supplies an H.264-capable ffmpeg — Playwright's bundled build is
VP8/WebM only and cannot produce MP4.

## How it works

`scene.html` exposes a single deterministic entry point:

```js
window.seek(t)   // t in seconds → sets every element's state for that instant
```

Nothing animates on its own. There are no CSS transitions or keyframes, and no
`Date.now()` or `Math.random()` at render time — scattered document positions
come from a seeded PRNG fixed at build. Frame *n* is therefore always identical,
which makes renders reproducible and lets any frame be inspected in isolation.

`render.mjs` drives that function in headless Chromium, screenshots each frame,
and pipes the JPEGs straight into ffmpeg over stdin. No frames touch disk.

To change the film, edit `scene.html` — the scene windows in `WIN` control
timing, and each beat's block inside `seek()` controls its motion.

## Design constraints

Brand tokens are copied verbatim from `src/app/globals.css` (warm-\* / terra) and
must stay in sync with it; the video loses its credibility if it does not match
the site. Headlines set in Bitstream Charter, the closest editorial serif
available to the render container — substitute Newsreader if the font is
installed where this is next run.

## ⚠️ The dollar figures are placeholders

**This video must not be shown to a prospect as-is.** Every dollar amount — the
peer distribution, the median, the simulated position, the account volume and
the revenue figure it produces — is illustrative. **None of it was read from
the Fee Insight database.**

The simulate beat is where this bites. It is the most persuasive thing in the
film precisely because it looks like live output, so a prospect who checks the
numbers against their own book and finds them hollow loses more than the deal.
Replace the `DATA` object at the top of `scene.html` with real
`getNationalIndex()` output before any sales use.

Better still, re-derive the simulation per prospect: their fee, their peer set,
their account volume. The math already runs live off `DATA.dist` and
`DATA.sim`, so a personalised cut is a data swap, not a re-edit.

Real and safe to keep: fee display names (`src/lib/fee-taxonomy.ts`), Hamilton's
modes (`src/lib/hamilton/modes.ts`), and the percentile/risk model, which
mirrors `src/lib/hamilton/simulation.ts`.

**No counts anywhere.** No "49 fees", no "48 more", no institution or
observation totals. Counts date the film and invite arithmetic about the
product instead of the decision. Keep it that way.

The distribution dots are generated from the quartiles themselves — an even
quarter of the dots in each quartile band — so the cloud a viewer sees always
agrees with the P25/median/P75 marks drawn over it. Keep that property when
swapping in real data; a scatter that contradicts its own summary statistics is
worse than no scatter.

## Where this belongs

Per the evaluation, video tooling should live in a separate private repo rather
than in the application. Nothing here is imported by the app, nothing here reads
the database, and no build step depends on it — so moving this directory out is a
`git mv` with no follow-up work.

This renderer contains no OpenMontage code. It applies the same architecture
(deterministic scenes → headless frames → ffmpeg) with a purpose-built script, so
no AGPL obligation attaches to it or to the videos it produces.
