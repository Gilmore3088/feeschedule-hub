# Build spec — Fee Insight institutional explainer

A complete, self-contained brief for rebuilding this video from nothing. Written
so a fresh session with no memory of the project can reproduce it, and so a
human can see every decision and argue with it.

---

## 1. The task

Produce a ~70-second 1920×1080 explainer video for **Fee Insight**
(feeinsight.com), a bank-fee intelligence product, plus a narration track and
burned-in captions. The film is a sales and top-of-funnel asset: a landing-page
hero and something a founder can open a call with.

Deliverables:

- `out/feeinsight-explainer.mp4` — H.264 + AAC, 30fps
- `vo/narration.wav` — timed narration
- `vo-script.md` — the script with direction notes
- Reproducible source: anyone can re-render after a data or copy change

---

## 2. Who it is for — the single most important constraint

**The buyer is a retail/deposit executive, CFO, or pricing lead at a community
or mid-size bank.** Not a consumer. This has been got wrong repeatedly and it
invalidates everything downstream when it is.

They do not shop for bank fees. **They set them.** Once a year they run an
annual fee review and have to defend every price to a board, an ALCO, or an
examiner.

What they buy:

1. Revenue they are forgoing
2. Risk they are carrying blind
3. Cost and time they are wasting

Anything that is not one of those three is decoration.

**Failure mode to avoid.** An early cut opened on *"the same overdraft fee costs
$35 at one bank and $5 at another."* That is a shopper's observation. It is
worthless to the person setting the price, and it gave the buyer nothing to take
to a budget conversation. If the hook would interest someone choosing a checking
account, it is the wrong hook.

---

## 3. Narrative structure

Six beats. The arc is: **a meeting they have sat in → the cost of the status quo
→ the turn → a live demonstration → the deliverable → the close.**

| # | Time | Beat | Job |
| --- | --- | --- | --- |
| 1 | 0:00–0:09 | "It's time for the annual fee review. Who's going to benchmark every fee?" | Hook |
| 2 | 0:09–0:19 | Competitor PDFs pile up, week counter climbs, `STALE ON ARRIVAL` | Cost of doing it by hand |
| 3 | 0:19–0:26 | "With Fee Insight — it's already done." Clutter resolves into a clean index | The turn |
| 4 | 0:26–0:51 | Peer distribution, your position, then a **live simulation** | Proof and demo |
| 5 | 0:51–1:02 | Hamilton's four modes; a cited Peer Brief assembles | The deliverable |
| 6 | 1:02–1:10 | "Your annual fee review, in an afternoon." | Close |

### Beat 1 — the hook

Open on the buyer's whole fee schedule filling the frame: three columns of real
fee names with amounts, dense enough to feel like work. Over it, in sequence:

> It's time for the annual fee review.
> **Who's going to benchmark every fee?**

The second line is the hook. It is the question nobody in that meeting wants to
answer, and the recognition is what earns the next five seconds. A muted
autoplay buys roughly two seconds; do not spend them on a definition.

### Beat 4 — the simulation is the centrepiece

Give this beat the most time (~25s). It is the only place the product visibly
*does* something, and its credibility comes from watching numbers respond rather
than being told they would.

Sequence: axis draws → peer dots settle → interquartile band and median appear →
the viewer's own position lands as the single accent-coloured dot → four metric
tiles populate → **then the fee moves**, and everything tracks it live:

- the dot travels along the axis
- peer percentile climbs
- gap to median flips sign, and its caption flips with it
- risk chip changes Low → Medium
- annualised revenue impact resolves

### Beat 5 — Hamilton

Name Hamilton. A named analyst that produces a cited, board-ready brief is more
concrete than "reporting features." Show its four real modes and a Peer Brief
titled *Annual Fee Review*, which closes the loop on the opening question.

---

## 4. Hard content rules

These were all learned by getting them wrong first.

**Never quote a count.** No "49 fees", no "48 more", no institution or
observation totals. Counts invite arithmetic about the product instead of the
decision, and they date the film the moment the taxonomy changes. Say "every
fee" and let the frame show the volume.

**No pricing in the film.** The film sells the afternoon, not the invoice.
Naming a number invites a cost judgement before the viewer has felt the problem.
Pricing belongs on the page it links to.

**Do not caption what the frame already says.** The open and close are display
headlines; captioning them doubles the words. Caption the lines that are spoken
over visuals.

**Do not narrate the visuals.** Where the screen shows a distribution, the line
says what it means, not what it is. If the line and the frame say the same
thing, cut the line.

**Never invent product facts.** Every name, label, and mechanic must come from
the codebase. Numbers may be placeholders, but they must be flagged as such
everywhere they appear.

**Never show a figure that contradicts its own caption.** A live simulation will
find these. One real example: a tile read `+$3.00` above a static note saying
"below the peer median." Derived text must be derived.

---

## 5. Grounding — what is real, and where it comes from

Read these before writing a word of copy.

| Element | Source | Status |
| --- | --- | --- |
| Fee display names | `src/lib/fee-taxonomy.ts` → `DISPLAY_NAMES` | Real, use verbatim |
| Fee families | `src/lib/fee-taxonomy.ts` → `FEE_FAMILIES` | Real |
| Hamilton modes | `src/lib/hamilton/modes.ts` | Real — Analyze, Simulate, Report, Monitor |
| Percentile + risk model | `src/lib/hamilton/simulation.ts` | Real — mirror `estimatePercentile`, `classifyRisk` (<50 low, <75 medium, else high) |
| Report types | `src/app/api/reports/catalog/route.ts` | Real |
| Report sections | `src/lib/report-engine/` | Real |
| Brand tokens | `src/app/globals.css` | Real — copy verbatim |
| Pricing | `src/app/subscribe/page.tsx` | Real, but **not shown in the film** |
| **Dollar amounts, distributions, volumes** | — | **Placeholder. Must be replaced.** |

---

## 6. Visual design

Brand tokens copied verbatim from `src/app/globals.css`. The video must match
the site or it undercuts the credibility it is selling.

| Token | Hex | Use |
| --- | --- | --- |
| `warm-100` | `#FAF7F2` | Page ground |
| `warm-50` | `#FDFBF8` | Card and panel fills |
| `warm-200/300` | `#EDE5D8` / `#E0D7C9` | Rules, dividers, inert marks |
| `warm-500/600` | `#A09788` / `#7A7062` | Eyebrows, secondary text |
| `warm-900` | `#1A1815` | Headlines |
| `terra` | `#C44B2E` | The single accent — one idea per frame |
| `terra-soft` | `#FDF0ED` | Tinted bands |
| `green` `#3F6B4A`, `amber` `#8A6220` | | Semantic only (favourable / caution) — never decorative |

**Type.** Newsreader (or the nearest editorial serif available — Bitstream
Charter renders well in headless Linux) for display; a neutral grotesque for
body; monospace for every figure, with `tabular-nums` so digits do not jitter as
they animate.

**Motion.** Restrained and editorial — this is a research brand, not a fintech
ad. Headlines animate word by word rather than fading in as blocks. Data marks
settle rather than bounce. Spend the boldness in one place per frame.

**Layout.** Compose to the optical centre; do not leave a dead bottom third.
Reserve the lower band for captions and keep scene content clear of it.

---

## 7. Technical approach

**Do not use a heavyweight video framework.** The whole renderer is two files.

`scene.html` exposes one deterministic entry point:

```js
window.seek(t)   // t in seconds → sets every element's state for that instant
```

Nothing animates on its own. **No CSS transitions or keyframes, and no
`Date.now()` or `Math.random()` at render time** — scattered positions come from
a seeded PRNG (`mulberry32`) fixed at build. Frame *n* is therefore always
identical, which makes renders reproducible and any frame inspectable alone.

`render.mjs` drives `seek(t)` in headless Chromium, screenshots each frame as
JPEG, and pipes it straight into ffmpeg over stdin. **No frames touch disk.**

```
scene.html  ──seek(t)──>  headless Chromium  ──JPEG frames──>  ffmpeg  ──>  MP4
```

Notes that cost time to discover:

- Playwright's bundled ffmpeg is **VP8/WebM only** and cannot produce MP4. Use
  `ffmpeg-static` for an H.264 build.
- Chromium comes from `PLAYWRIGHT_BROWSERS_PATH`; never run `playwright install`.
- Check composition with `--stills` before committing to a full render.
- Installing an npm package can clobber a symlinked `node_modules/playwright`.

---

## 8. Voice-over

**Script:** ~116 words at ~110 wpm — deliberately slower than consumer video.
The pauses are where the numbers land. Read peer-to-peer, never salesy.

**Pipeline:** `vo/lines.json` holds `{t, text}` cues. `narrate.mjs` synthesises
each line separately with Piper, then places it at its exact cue time using
ffmpeg `adelay` and sums them.

**Cues are timed to the film, not concatenated.** A line that runs long overlaps
the next rather than shifting everything after it — the visuals are fixed, so
the audio must be pinned to them. Verify no cue overruns its slot before
rendering.

```bash
node narrate.mjs                          # → vo/narration.wav
npm run render -- --vo vo/narration.wav   # muxes as AAC
```

**Getting a voice model.** HuggingFace (the usual host) may be blocked by an
egress proxy. **Piper's older GitHub releases bundle voices as tarballs and
GitHub is generally reachable** — that is the workaround:

```bash
curl -sSL -o voice.tar.gz \
  https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-en-us-ryan-high.tar.gz
tar xzf voice.tar.gz -C voices/
```

**The synthetic read is a scratch track.** It is genuinely useful for locking
timing and reviewing pacing. For anything customer-facing, get a human read — a
synthetic voice on a research brand undercuts the credibility being sold.

**Audio still missing:** a music bed. Keep it sparse and low; ducking under the
VO is a one-line ffmpeg `sidechaincompress`.

---

## 9. Constraints from this repo

- **Nothing may be added to the Next.js app.** No new dependency, script, agent,
  route, or table. The renderer is a leaf directory nothing imports.
- **The studio directory is a build tool, not app code.** It is excluded from
  eslint; it must stay excluded, and ideally moves to a separate repo (`git mv`,
  no follow-up work).
- **No OpenMontage code.** The architecture (deterministic scenes → headless
  frames → ffmpeg) was borrowed; no source was. OpenMontage is AGPL-3.0, so
  vendoring it would put copyleft obligations on the application. See
  `docs/plans/openmontage-video-evaluation-2026-08-15.md`.
- **CI guards scan `*.py`, `*.sh`, `*.mjs`.** Run `scripts/ci-guards.sh` before
  committing.

---

## 10. Definition of done

- [ ] Renders end to end without manual intervention
- [ ] Every product name, mode, and mechanic traceable to a file in `src/`
- [ ] No counts, no pricing, anywhere in the film
- [ ] No caption duplicating an on-screen headline
- [ ] Every derived label consistent with its value at **every** frame, not just the first
- [ ] Placeholder figures isolated in one `DATA` object with a blocking comment
- [ ] Narration cues verified against their slots
- [ ] CI guards pass

---

## 11. Known gaps

1. **All dollar figures are placeholders.** The simulation is the most
   persuasive part of the film precisely because it looks like live output,
   which makes invented numbers there the most dangerous. Replace from
   `getNationalIndex()` before any sales use. Better: re-derive per prospect —
   their fee, their peer set, their volume. The math already runs off
   `DATA.dist` and `DATA.sim`, so a personalised cut is a data swap.
2. **Narration is synthetic.** Fine for timing; replace for launch.
3. **No music bed.**
4. **No 9:16 or 15s cut-downs** yet; both derive from the same compositions.
