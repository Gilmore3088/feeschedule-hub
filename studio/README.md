# Fee Insight Studio — brand explainer renderer

Renders the 81-second Fee Insight brand explainer to MP4. **This is not part of
the Next.js application.** It is a standalone build tool that happens to be
parked in this repo so the source is not lost; see *Where this belongs* below.

Evaluation and rationale: `docs/plans/openmontage-video-evaluation-2026-08-15.md`.

## What it produces

`out/feeinsight-explainer.mp4` — 1920×1080, H.264, 30fps, silent, ~2.5 MB.
Sound-off by design: the story is carried by motion and type, so it works as a
muted-autoplay landing hero.

Eight beats on a marketing arc — hook, stakes, resolution, proof, credibility,
segmented CTA — rather than a capability tour.

| Time | Beat | Role |
| --- | --- | --- |
| 0:00 | Two prices for one overdraft fee, $30 apart | **Hook** — a number in tension, not a definition |
| 0:07 | Both public, both buried in PDFs nobody reads | Stakes |
| 0:15 | The Bank Fee Index | Resolution |
| 0:23 | Institution profile with per-fee peer deltas | Proof |
| 0:33 | One fee priced across the market | Proof |
| 0:42 | 50-state tile cartogram | Proof |
| 0:50 | Four report types and a report's section list | Proof |
| 0:58 | Every figure traced to its source → segmented CTA | **Credibility, then the ask** |

Why this shape:

- **The hook is the whole gamble.** Muted autoplay buys about two seconds. The
  film opens on a concrete price gap because a number in tension is the only
  thing that earns the next five. The earlier cut opened on "Every bank
  publishes its fees" — a fact nobody disputes, carrying no tension.
- **The credibility line is the close.** Provenance is the only differentiation
  claim in the film, so it gets its own beat immediately before the CTA rather
  than sitting as a footnote.
- **The CTA is segmented.** The film serves consumers and institutions, whose
  intents are opposite. Naming both lets each viewer self-select instead of
  guessing which half was meant for them.
- **66 seconds, not 83.** Retention on a landing hero collapses well before a
  minute and a half.

Headlines animate word by word (`typeIn()`), so type carries motion rather than
fading in as blocks.

The state map is a **tile-grid cartogram** — one square per state on an 11×8
lattice, which is standard editorial practice for state choropleths. It reads
at a glance, gives small states equal visual weight, and needs no geographic
boundary data (nothing can be fetched at render time anyway). The lattice is
in `TILES`.

## Voice-over

The script lives in [`vo-script.md`](vo-script.md) — 143 words, timed line by
line. Every line is also burned into the film as a caption, so the cut works
with sound off and the VO drops on top without re-timing.

**There is no audio track yet.** The build container cannot reach a voice
model: HuggingFace (where Piper voices are hosted) returns 403 through the
agent proxy, and the offline packages reachable from npm and PyPI phonemise
but do not synthesise. Adding narration is one command once a track exists:

```bash
npm run render -- --vo vo/narration.wav
```

That muxes the audio as AAC. Prefer a human read — a synthetic voice on a
research brand undercuts the credibility the film is selling.

If the caption timings in `scene.html` (`CAPTIONS`) change, update
`vo-script.md` to match. They are the same script in two forms.

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

**This video must not be published as-is.** Every dollar amount in it — the
medians, the ranges, the P25/P75 marks — is an illustrative industry-typical
value used to build and prove the layout. **None of it was read from the Fee
Insight database.**

Replace the `DATA` object at the top of `scene.html` with real output from
`getNationalIndex()` before this goes anywhere public. Publishing invented
medians on a site whose proposition is *verified* fee data would undercut the
exact claim the film is making.

Real and safe to keep: category display names and family names (copied from
`src/lib/fee-taxonomy.ts`), and the counts 49 categories / 14 families /
50 states.

Also **do not burn live counts into the film.** Institution and observation
totals are dynamic props, so a hardcoded figure dates the video the week it
ships. They are deliberately absent from the current cut.

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
