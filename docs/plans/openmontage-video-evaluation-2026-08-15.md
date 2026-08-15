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

## 4. Video Products, Mapped To Existing Skills

Every Fee Insight content skill has a natural video counterpart. Ranked by
effort-to-value:

| # | Product | Source | Length | Cadence |
| --- | --- | --- | --- | --- |
| 1 | **Monthly Pulse motion graphic** — "what moved in bank fees this month" | `monthly-pulse` assembler | 45–75s | Monthly |
| 2 | **Consumer explainer shorts** — "Why did I get a $35 overdraft fee?" | `consumer-guide` skill | 30–60s vertical | Weekly, evergreen |
| 3 | **Quarterly National Index report film** | `national-quarterly` assembler | 3–5 min | Quarterly |
| 4 | **Institution/peer benchmark clips** — auto-rendered per bank | `peer-competitive` assembler | 30s | On demand, sales |
| 5 | **District economic outlook** — Fed district maps + fee overlays | `district-economic-outlook` skill | 2–3 min | Quarterly |
| 6 | **Methodology trust film** — how Atlas→Hamilton verifies a fee | agent run ledger | 90s | Once, evergreen |

\#1 is the recommended pilot: highest recurrence, fully automatable, and the
data contract is already typed and tested.

\#6 deserves note — the agent pipeline (Atlas discovers, Magellan fetches,
Rosetta reads, Knox extracts, Darwin verifies, Hamilton publishes) is a genuinely
differentiating story. Most fee-data vendors cannot show their provenance chain.
An animated walkthrough of a single fee's journey from PDF to published record
is a credibility asset for the `for-institutions` funnel.

### Cost posture

OpenMontage runs with **zero paid API keys** on the path that matters here:
Piper TTS for narration, Remotion for data-driven motion graphics, FFmpeg for
post, auto-generated captions. Data-viz video needs no generative video model —
charts, transitions, and typography are React components. Paid providers (Kling,
Veo, ElevenLabs) are strictly optional upgrades for B-roll and premium voice.

A realistic pilot budget is **$0 in API spend**, with the only cost being setup
time and optionally ~$50–200/mo for ElevenLabs-grade narration if the Piper
voice is judged too synthetic for a financial-research brand.

---

## 5. Recommendation

**Proceed, with the separate-repo boundary as a hard requirement.**

Suggested sequencing:

1. Fork OpenMontage to a private repo, **pinned to a reviewed commit**. Do not
   track `main`; re-review before each bump, with attention to the markdown
   skill diffs.
2. Run it in a container with no Fee Insight credentials mounted. It needs a
   JSON payload and nothing else — not the database, not Supabase keys.
3. Remove or neuter the `npx --yes` cache-warm and vendor `hyperframes` at a
   pinned version, or skip HyperFrames entirely and use only Remotion (which is
   already pinned in `package.json` and is the better fit for chart-driven work).
4. Build one Remotion composition against a **checked-in sample**
   `MonthlyPulsePayload` fixture. No live data, no network.
5. Render one Monthly Pulse video end to end. Judge quality before investing
   further.
6. If it holds up, add a thin export step so a published Monthly Pulse writes
   its payload JSON to the studio repo's input directory.

### What this does not change

- No new dependency, script, or Python in `feeschedule-hub`.
- No new agent, run type, or database table.
- No change to `published_fee_catalog` reads or the agent run ledger.
- If the pilot fails, the sunk cost is one throwaway repo.

### Open questions for the user

- Is video for **top-of-funnel marketing** (consumer shorts, SEO, social) or
  **product deliverable** (subscriber-facing report companions)? The answer
  changes which product from §4 to pilot, and whether renders must be
  per-institution automated or hand-curated.
- Is a synthetic narration voice acceptable for a research brand, or is
  human/premium voice required from the start?
