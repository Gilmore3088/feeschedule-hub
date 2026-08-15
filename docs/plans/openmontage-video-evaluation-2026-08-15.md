# OpenMontage Evaluation — Video Production For Fee Insight

**Date:** 2026-08-15
**Repo reviewed:** https://github.com/calesthio/OpenMontage @ `95e1c3d` (2026-08-13)
**Status:** Evaluation only. No code adopted. No dependency added to this repo.

---

## 1. Security Review

A malicious-code scan was run before any evaluation of usefulness. **No malicious
code found.** The repository behaves as described.

### What was scanned

| Check | Result |
| --- | --- |
| Install/build hooks (`Makefile`, `setup.py`, npm lifecycle scripts) | Clean — no `postinstall`/`preinstall` anywhere |
| `curl \| bash` piping | 1 occurrence, documentation only (see residual risks) |
| `eval()` / `exec()` in Python | 2 hits, both benign (a comment; PyTorch `model.eval()`) |
| Base64 decode / obfuscated blobs | 11 hits, all decoding provider API responses (images, audio, video) |
| Outbound network destinations | ~150 distinct hosts, all named AI/media providers, stock-footage archives, or `example.com` test placeholders. No pastebin, webhook relay, Telegram/Discord, or bare-IP callback |
| Credential harvesting (`.ssh`, `.aws/credentials`, `.netrc`, `.git-credentials`, `.npmrc`, keychain) | Zero hits |
| Bulk env exfiltration (`dict(os.environ)` → network) | 3 hits, all passing env to a local subprocess (screenshot/eval harnesses) |
| Reverse shells (`socket`, `/dev/tcp/`, `pty.spawn`) | Only in the test *network guard* — a defensive control |
| `subprocess(shell=True)` | Zero. Two comments explaining the deliberate avoidance |
| Prompt injection across 1,095 markdown agent files | Zero. The only hits for "without telling the user" are instructions telling the agent to *ask permission first* |
| GitHub Actions | `permissions: contents: read`, no `pull_request_target`, no secrets consumed |
| Vendored binaries / minified JS | One file: genuine GSAP 3.15.0, zero `fetch`/`XHR`/`eval` |
| Secret hygiene | `.env` is gitignored; `.env.example` holds key *names* only |

### Positive signals

- `tests/conftest.py` installs a **socket-layer network guard** that blocks all
  non-loopback connections during tests, so a test cannot silently bill a paid
  API. That is a deliberate, user-protective control — the opposite of malware.
- The Makefile is fully transparent: venv → `pip install -r requirements.txt` →
  `npm install` → copy `.env.example`. No hidden steps.
- Dependencies are mainstream and unpinned-but-ordinary (`pyyaml`, `pydantic`,
  `requests`, `openai`, `google-genai`, `fastapi`, `remotion`).
- Provenance: 48.2k stars, 6.0k forks, 218 open issues, active PR merges.
  Not a freshly minted typosquat.

### Residual risks (real, but not malicious)

1. **`npx --yes hyperframes`** runs during `make setup` and again at render time.
   `--yes` auto-installs a third-party npm package with no prompt. This is the
   largest supply-chain surface in the project. It is disclosed in the Makefile
   output, but it is a live remote-fetch on every warm.
2. **`curl -fsSL https://static.heygen.ai/cli/install.sh | bash`** appears in
   `.agents/skills/media-use/SKILL.md`. It is documentation for an optional
   provider CLI, not executed by setup — but an agent following that skill
   verbatim would run it.
3. **Unpinned dependency ranges** (`>=` in `requirements.txt`, `^` in
   `package.json`) mean a future upstream compromise flows through.
4. **Agent-executed markdown is the runtime.** 1,095 instruction files are the
   real program. They are clean today; they are also the surface that a future
   malicious PR would target, and diffs there read as prose rather than code.

**Mitigation if adopted:** run it in a container, without access to Fee Insight
credentials, on a pinned commit — see §3.

---

## 2. Licensing — The Binding Constraint

OpenMontage is **AGPL-3.0**. This decides the architecture, not preference.

- **Rendering videos with it is safe.** Output files are not derivative works,
  the same way a Blender render is not GPL. MP4s produced by OpenMontage are
  Fee Insight's property, usable commercially with no disclosure obligation.
- **Embedding it in the Fee Insight app is not.** AGPL §13 triggers when users
  interact with the software over a network. Wiring OpenMontage into a Next.js
  route so subscribers click "generate video" would obligate Fee Insight to
  release the source of the combined work.

This aligns with the existing repo rules rather than fighting them. `CLAUDE.md`
already bars reintroducing a Python runtime and one-off scripts, and
`scripts/ci-guards.sh` scans `*.py` and `*.sh` across the tree. Vendoring a
507-file Python project here would violate both the letter and the intent.

**Conclusion: OpenMontage lives in a separate private repo — a studio, not a
feature.** Fee Insight stays a pure Next.js/TypeScript app.

---

## 3. Proposed Architecture

> **Scope note.** The v1 deliverable (§4) is an evergreen brand explainer with
> **no data binding** — it needs none of the payload plumbing below. The
> architecture is recorded here because it is what a later data-driven video
> would use, and because it defines the AGPL boundary that applies either way.


```
feeschedule-hub (this repo, unchanged)
  └── report assemblers already emit typed JSON
        assembleMonthlyPulse()   → MonthlyPulsePayload
        national-quarterly.ts    → quarterly payload
        peer-competitive.ts      → peer payload
                    │
                    │  export as JSON via existing API routes
                    │  (/api/reports/...) — read-only, no new surface
                    ▼
feeinsight-studio (NEW separate private repo, AGPL-isolated)
  └── OpenMontage pinned to a reviewed commit
        └── Remotion composer with Fee Insight brand components
              → renders MP4 / social cuts
                    ▼
              CDN / YouTube / LinkedIn / embedded <video> in marketing pages
```

The boundary is a **JSON file handoff**. Nothing from OpenMontage is imported
into this repo; nothing from this repo runs inside OpenMontage except an
exported payload. That keeps the AGPL wall clean and the CI guards satisfied.

### Why the data side is already done

`src/lib/report-assemblers/monthly-pulse.ts` emits exactly the shape a Remotion
composition wants as props:

```ts
interface MonthlyPulsePayload {
  period_label: string;        // "April 2026"           → title card
  movers_up: PulseMover[];     // sorted by |change_pct| → animated bar race
  movers_down: PulseMover[];   //                        → contrast panel
  total_categories_tracked: number;
  manifest: DataManifest;      // provenance             → citation footer
}
```

Each `PulseMover` carries `display_name`, `current_median`, `prior_median`,
`change_pct`, `direction`, and `current_institution_count` — enough to drive a
data-viz scene with no additional queries. **No new database work is required
for a first video.** This is the single strongest argument for the approach:
the expensive half already exists.

---

## 4. The Deliverable — A General Brand Explainer

**Direction (confirmed): a general add to highlight the feature and value.**
This is top-of-funnel marketing, not a subscriber deliverable and not
per-institution automation. That simplifies the build considerably — one
evergreen hero video plus cut-downs, rather than a recurring render pipeline.

### Spec

| | |
| --- | --- |
| **Primary** | 60–90s landing-page hero explainer, 16:9, muted-autoplay-safe |
| **Cuts** | 30s vertical (9:16) for social; 15s teaser for paid/retargeting |
| **Placement** | `src/app/page.tsx` hero, `/for-institutions`, YouTube, LinkedIn |
| **Constraint** | Must read with **sound off** — captions burned in, story carried by motion + type |
| **Render** | Remotion only. No generative video model needed |

### Script beats (grounded in existing site copy)

Every claim below already exists on the site — nothing invented.

1. **The problem (0–12s).** Bank fees are published, but scattered across
   thousands of PDFs in inconsistent formats. Nobody can compare them.
   *Visual: a wall of mismatched fee-schedule PDFs.*
2. **The positioning (12–22s).** "Public Evidence Layer." The Bank Fee Index.
   *Visual: the chaos resolves into one clean indexed table.*
3. **The scale (22–38s).** Institutions tracked · **49** fee categories ·
   **50** states · verified fee observations.
   *Visual: the four counters from `landing-trust-stats.tsx`, animating up.*
4. **The differentiator (38–60s) — the strongest beat.** How a fee becomes a
   verified record: Atlas discovers → Magellan fetches → Rosetta reads → Knox
   extracts → Darwin verifies → Hamilton publishes.
   *Visual: one real fee traced from source PDF to published row.*
5. **The value, per audience (60–78s).** Consumers search free. Institutions get
   the Pro workflow — Find or claim → Benchmark → Analyze → Report.
   *Visual: split screen, the four `WorkflowStep` items from `landing-hero.tsx`.*
6. **CTA (78–90s).** Search your institution. `FeeInsight.com`.

Beat 4 is the one to spend the most frames on. Your own code comment says it:
*"Bankers buy on provenance, not on testimonials."* The agent chain is the
proof, and no competitor can show an equivalent. Most fee-data vendors cannot
show provenance at all. A video is the ideal medium for it — a six-stage
pipeline is tedious as prose and immediately legible as motion.

### Brand style guide (from `src/app/globals.css`)

The video must match the site or it undercuts the credibility it is selling.

| Token | Hex | Use in video |
| --- | --- | --- |
| `warm-100` | `#FAF7F2` | Background |
| `warm-900` | `#1A1815` | Headlines |
| `warm-700` | `#5A5347` | Body / subtitles |
| `warm-500` | `#A09788` | Eyebrow labels, uppercase tracked |
| `warm-300` | `#E0D7C9` | Dividers, table rules |
| `terra` | `#C44B2E` | Accent — highlights, the single moving element |
| `terra-soft` | `#FDF0ED` | Tinted panel fills |

Type: **Newsreader** serif for headlines (`--font-newsreader`, as in the H1),
Geist Sans for body, Geist Mono for figures and fee amounts. Motion should be
restrained and editorial — this is a research brand, not a fintech ad.

### One practical warning

Do **not** burn live counts into the video. `total_institutions` and
`total_observations` are dynamic props, so a hardcoded "12,431 institutions"
dates the film the week it ships and quietly becomes a false claim. Either
render the counters as rounded, durable framing ("thousands of institutions",
"all 50 states"), or keep them in a single isolated scene that can be
re-rendered cheaply when the numbers move. The static facts — **49** categories,
**50** states — are safe to burn in.

### Cost posture

OpenMontage runs with **zero paid API keys** on the path that matters here:
Piper TTS for narration, Remotion for data-driven motion graphics, FFmpeg for
post, auto-generated captions. Data-viz video needs no generative video model —
charts, transitions, and typography are React components. Paid providers (Kling,
Veo, ElevenLabs) are strictly optional upgrades for B-roll and premium voice.

A realistic pilot budget is **$0 in API spend**, with the only cost being setup
time and optionally ~$50–200/mo for ElevenLabs-grade narration if the Piper
voice is judged too synthetic for a financial-research brand.

For a sound-off hero explainer, narration may not be needed at all — burned-in
captions and motion carry the whole story. That removes the only line item
worth paying for, and removes the risk of a synthetic voice undercutting a
research brand. Recommend shipping v1 silent (music bed optional) and adding
voice only if the cut-downs demand it.

---

## 5. Recommendation

**Proceed, with the separate-repo boundary as a hard requirement.**

Suggested sequencing:

1. Fork OpenMontage to a private repo, **pinned to a reviewed commit**. Do not
   track `main`; re-review before each bump, with attention to the markdown
   skill diffs.
2. Run it in a container with no Fee Insight credentials mounted. A brand
   explainer needs no live data at all — not the database, not Supabase keys.
3. Remove or neuter the `npx --yes` cache-warm and vendor `hyperframes` at a
   pinned version, or skip HyperFrames entirely and use only Remotion (which is
   already pinned in `package.json` and is the better fit for typographic and
   chart-driven work).
4. Port the brand tokens from §4 into a Remotion theme file, then build the
   six beats as compositions against **static copy** — no data binding.
5. Render the 60–90s hero cut. Judge quality before investing further.
6. If it holds up, produce the 9:16 and 15s cut-downs from the same
   compositions, and drop the MP4 into the landing hero.

Because the explainer is evergreen and data-free, steps 4–6 are a one-time
build. There is no recurring render pipeline to maintain, no export step from
this repo, and no ongoing coupling between the two codebases.

### What this does not change

- No new dependency, script, or Python in `feeschedule-hub`.
- No new agent, run type, or database table.
- No change to `published_fee_catalog` reads or the agent run ledger.
- If the pilot fails, the sunk cost is one throwaway repo.

### Later, if v1 lands

The report assemblers described in §3 stay the natural second phase — a
recurring **Monthly Pulse** motion graphic driven by `assembleMonthlyPulse()`,
reusing the same brand theme and compositions built for the explainer. That is
the point at which the JSON handoff becomes worth wiring. It is explicitly
out of scope for this pass.

### Open question

- Silent-with-captions or narrated? Recommendation is silent for v1 (see cost
  posture). If narration is wanted, the follow-on question is whether Piper's
  free offline voice is acceptable or premium TTS is required.
