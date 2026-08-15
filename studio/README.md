# Fee Insight Studio — brand explainer renderer

Renders the 81-second Fee Insight brand explainer to MP4. **This is not part of
the Next.js application.** It is a standalone build tool that happens to be
parked in this repo so the source is not lost; see *Where this belongs* below.

Evaluation and rationale: `docs/plans/openmontage-video-evaluation-2026-08-15.md`.

## What it produces

`out/feeinsight-explainer.mp4` — 1920×1080, H.264, 30fps, silent, ~2.5 MB.
Sound-off by design: the story is carried by motion and type, so it works as a
muted-autoplay landing hero.

Seven beats. Each middle beat shows a product surface rather than describing
one; the agent pipeline is deliberately not shown at all.

| Time | Beat | Shows |
| --- | --- | --- |
| 0:00 | Fees are published, but scattered across mismatched PDFs | — |
| 0:09 | They resolve into one indexed record — the Bank Fee Index | — |
| 0:19 | **Institution data** — a bank profile with its fee schedule | Per-fee amounts with peer deltas and a verified badge |
| 0:32 | **Peer comparison** — one fee, priced very differently | Distribution plot, P25 / median / P75 |
| 0:45 | **State data** — what you pay depends on where you bank | 50-state tile cartogram shaded by median |
| 0:59 | **Reports** — board-ready, straight from the index | Four report types, and a report's real section list |
| 1:12 | Call to action | — |

Four of the seven beats are product surfaces. Headlines animate word by word
(`typeIn()`), so type carries motion rather than sitting still and fading.

The state map is a **tile-grid cartogram** — one square per state on an 11×8
lattice, which is standard editorial practice for state choropleths. It reads
at a glance, gives small states equal visual weight, and needs no geographic
boundary data (nothing can be fetched at render time anyway). The lattice is
in `TILES`.

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
