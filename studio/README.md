# Fee Insight Studio — brand explainer renderer

Renders the 81-second Fee Insight brand explainer to MP4. **This is not part of
the Next.js application.** It is a standalone build tool that happens to be
parked in this repo so the source is not lost; see *Where this belongs* below.

Evaluation and rationale: `docs/plans/openmontage-video-evaluation-2026-08-15.md`.

## What it produces

`out/feeinsight-explainer.mp4` — 1920×1080, H.264, 30fps, silent, ~2.5 MB.
Sound-off by design: the story is carried by motion and type, so it works as a
muted-autoplay landing hero.

Six beats, all grounded in existing site copy:

| Time | Beat |
| --- | --- |
| 0:00 | Fees are published, but scattered across mismatched PDFs |
| 0:12 | They resolve into one indexed record — the Bank Fee Index |
| 0:23 | Coverage — 49 fee categories, 50 states |
| 0:37 | **Provenance** — Atlas → Magellan → Rosetta → Knox → Darwin → Hamilton |
| 1:00 | Two audiences — free consumer search, and the Pro workflow |
| 1:13 | Call to action |

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

**Do not burn live counts into the film.** Institution and observation totals are
dynamic, so a hardcoded figure dates the video and becomes a false claim on a
site that sells verified data. Only 49 and 50 are hardcoded; both are static
facts. The `$35.00` overdraft row is illustrative and names no institution.

## Where this belongs

Per the evaluation, video tooling should live in a separate private repo rather
than in the application. Nothing here is imported by the app, nothing here reads
the database, and no build step depends on it — so moving this directory out is a
`git mv` with no follow-up work.

This renderer contains no OpenMontage code. It applies the same architecture
(deterministic scenes → headless frames → ffmpeg) with a purpose-built script, so
no AGPL obligation attaches to it or to the videos it produces.
