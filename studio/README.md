# Fee Insight Studio — brand explainer renderer

Renders the 72-second Fee Insight institutional explainer to MP4. **This is not
part of the Next.js application.** It is a standalone build tool that happens to
be parked in this repo so the source is not lost; see *Where this belongs* below.

Evaluation and rationale: `docs/plans/openmontage-video-evaluation-2026-08-15.md`.

## What it produces

`out/feeinsight-explainer.mp4` — 1920×1080, H.264, 30fps, silent, ~2.2 MB.
Sound-off by design: the story is carried by motion, type and burned-in
captions, so it works muted on a landing page or in a sales deck.

Seven beats aimed at **the buyer, not the end user** — a retail/deposit
executive or CFO deciding on a $5,000/year seat. They do not shop for fees;
they set them.

| Time | Beat | Role |
| --- | --- | --- |
| 0:00 | "You set 49 prices. You benchmark three." | **Hook** — an accusation about their own practice |
| 0:09 | Priced too high vs priced too low | Two-sided stakes |
| 0:20 | Your dot in the peer cloud, against the median | Where you actually sit |
| 0:33 | 12,000 x $3.00 x 12 = **$432,000** | **The sale** — arithmetic, not adjectives |
| 0:45 | Your full schedule vs peers, traced to source | Defensibility |
| 0:56 | Four report types | Board-readiness |
| 1:04 | **$5,000/year** — "less than one analyst-week" | Price, anchored |

Why this shape, and why the earlier consumer cut failed:

- **The hook must indict, not inform.** The previous cut opened on "the same
  overdraft fee costs $35 at one bank and $5 at another" — a shopper's
  observation, useless to the person setting the price. "You set 49 prices,
  you benchmark three" is uncomfortable because the viewer knows it is true of
  their own shop.
- **Stakes are two-sided deliberately.** Over-priced is an examiner and
  attrition problem; under-priced is forgone revenue. Naming only one halves
  the audience.
- **The arithmetic beat is the whole sale.** $432,000 against $5,000 is an 86x
  return, shown as a calculation rather than claimed as a benefit. If one beat
  survives editing, it is this one.
- **The price is said out loud and anchored.** "$5,000" alone is a purchase;
  "less than one analyst-week, and an analyst can't do this" reframes it as
  cheaper than the status quo — a junior analyst hand-collecting competitor
  PDFs, which costs more and goes stale on delivery.
- **The institution card says "Your institution"**, not a fictional bank, so
  the viewer projects themselves into it.

Headlines animate word by word (`typeIn()`), so type carries motion rather
than fading in as blocks.

## Voice-over

The script lives in [`vo-script.md`](vo-script.md) — 118 words at ~110 wpm,
timed line by line. Deliberately slower than consumer video: executives are
persuaded by arithmetic delivered calmly, and the pauses are where the numbers
land. Every line is burned into the film as a caption, so the cut works with
sound off and the VO drops on top without re-timing.

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

**This video must not be shown to a prospect as-is.** Every dollar amount — the
peer median, the P25/P75 marks, the "you" position, the 214 peer count, and the
whole 12,000 × $3.00 × 12 worked example — is illustrative. **None of it was
read from the Fee Insight database.**

This matters more in this cut than in any earlier one. The film now closes a
$5,000 sale on a specific arithmetic claim; if a bank executive checks that
arithmetic against their own book and it does not hold, the credibility loss is
larger than the deal. Replace the `DATA` object at the top of `scene.html` with
real output from `getNationalIndex()` before any sales use.

Ideally the worked example is re-derived per prospect: their account count,
their gap against their own peer set. That turns a generic claim into a
personalised one, which is what actually closes.

Real and safe to keep: the **$5,000/year per seat** price
(`src/app/subscribe/page.tsx`), category display names
(`src/lib/fee-taxonomy.ts`), the report types
(`src/app/api/reports/catalog/route.ts`), the report section titles
(`src/lib/report-engine/`), and the count of 49 fee categories.

Also **do not burn live counts into the film.** Institution and observation
totals are dynamic props, so a hardcoded figure dates the video the week it
ships. They are deliberately absent.

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
