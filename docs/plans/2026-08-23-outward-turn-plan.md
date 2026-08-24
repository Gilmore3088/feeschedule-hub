# Outward Turn Plan — 2026-08-23

Turns Fee Insight's roadmap from inward (pipeline, schema, admin) to outward (a person
outside the building can do something). Derived from the 23 August diagnostic.

**Premise:** production is live (`feeinsight.com`, `/register`, `/api/health` all 200). The
commercial surface was completed 17–18 August. Nothing on the current priority table is
pointed at a customer, so work drifted back to the data pipeline.

**Scope decision:** the 25 batch reports in `Reports/studio/out/` are discarded, not
published. The manual studio pipeline is replaced by on-demand generation (Workstream C).

---

## Workstream A — Steering

The priority table cannot produce traction while every "Done When" describes a database row.
Fix the instrument before the work.

| ID | Task | Files | Done when |
|---|---|---|---|
| A1 | Rewrite the "Done When" column for Rosetta OCR and Knox extraction fallback so completion is observable from outside the system | `docs/outstanding-tasks.md` | Each reads as an institution/visitor outcome, not a row state |
| A2 | Attempt the same rewrite on the remaining five P1/P2 rows; mark the ones that cannot be rewritten | `docs/outstanding-tasks.md` | Rows that resist rewriting are explicitly labelled `internal — not a priority candidate` |
| A3 | Add a standing P0 row above P1 that only outward work may occupy | `docs/outstanding-tasks.md` | Table has a P0 slot; an empty P0 is a readable signal, not a failure |
| A4 | Add a "Closed This Week" counter beside the open-item counts | `~/Code/.claude-shared/session-brief.sh` | Session brief opens with what was finished as well as what is waiting |
| A5 | Move the seven current internal priorities below the P0/outward tier without deleting them | `docs/outstanding-tasks.md` | Pipeline work is visibly ranked under customer work |

## Workstream B — Demand instrumentation

117 pages, 39 API routes, ~40 admin pages about data quality, zero about demand.
`NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is already configured and unused as a decision input.

| ID | Task | Files | Done when |
|---|---|---|---|
| B1 | Write a funnel read module: visitors → `/fees` → `/subscribe` → `/register` → paid | `src/lib/analytics/funnel.ts` (new) | One function returns the five counts for a date range |
| B2 | Count registrations and paid conversions from the database rather than analytics | `src/lib/analytics/funnel.ts` | Registration and subscription counts come from `users` / Stripe state |
| B3 | Build `/admin/demand` showing the funnel for the last 7 and 30 days | `src/app/admin/demand/page.tsx` (new) | An operator can answer "did anyone try to buy this week" in one page load |
| B4 | Add per-report-type generation counts to the same page | `src/app/admin/demand/page.tsx` | Shows how many reports were generated on demand, by type |
| B5 | Surface the top funnel number in the session brief | `~/Code/.claude-shared/session-brief.sh` | Weekly visitor and signup counts appear at session start |
| B6 | Add a test covering the funnel query shape | `src/lib/analytics/funnel.test.ts` (new) | `npm run test` covers the module |

## Workstream C — Reports on demand

**Current state.** Three report paths exist:

1. `report_jobs` legacy engine (`/api/reports/generate`) — `national_index`, `state_index`,
   `monthly_pulse`. Has freshness gate, R2 artifacts, presigned download, status polling.
2. **Hamilton Reports** (`/pro/reports`) — institution-aware, LLM-grounded, four templates
   including `competitive_positioning`. This is the real on-demand path.
3. `Reports/studio/` — manual zsh + local headless Chrome. Requires a hand-built
   `packs/<id>.json` and `narratives/<id>.json`. Produced the 25 discarded PDFs.

**The actual gap is output quality, not capability.** Hamilton already generates competitive
positioning on demand, but `AnalysisPdfDocument.tsx` and `PdfDocument.tsx` render through
`@react-pdf/renderer` using built-in **Helvetica only** — no registered brand fonts. The
studio `template.html` carries 144 design declarations, three brand font families, and `@page`
print rules. The good-looking report is the manual one; the on-demand one is generic.

Close that gap, then delete the manual path.

| ID | Task | Files | Done when |
|---|---|---|---|
| C1 | Register the brand typefaces with `Font.register` so PDFs stop rendering in Helvetica | `src/components/hamilton/reports/PdfDocument.tsx`, `AnalysisPdfDocument.tsx` | A generated PDF uses the same faces as the site |
| C2 | Port the studio template's type scale, spacing, and cover-page treatment into the shared PDF stylesheet | `src/components/hamilton/reports/` | Side-by-side, the on-demand PDF is not visibly worse than `Reports/studio/out/*.pdf` |
| C3 | Extract the studio template's section order and callout structure into the Hamilton competitive-positioning template | `src/app/pro/(hamilton)/reports/actions.ts` | Generated competitive report contains the same sections as the studio version |
| C4 | Carry evidence, as-of date, and source notes onto every generated page | PDF components | No figure appears without its as-of date and source |
| C5 | Add a small-n / suppression guard so thin peer sets degrade honestly instead of printing a number | `src/app/pro/(hamilton)/reports/actions.ts` | A peer set under threshold prints a stated limitation, never a fabricated median |
| C6 | Give an authenticated institution a self-serve "generate my report" entry point | `src/app/for-institutions/request-report-form.tsx`, `src/app/pro/reports/new/page.tsx` | A logged-in institution can produce its own report without operator involvement |
| C7 | Unify delivery: route Hamilton output through the same R2 + presigned download path as `report_jobs` | `src/lib/report-engine/presign.ts`, `src/app/api/pro/report-pdf/route.ts` | Both engines deliver via one signed-URL mechanism |
| C8 | Add a progress/status surface for on-demand generation | `src/components/hamilton/reports/GeneratingState.tsx` | A requester sees progress and a terminal state, never an indefinite spinner |
| C9 | Add a golden-output regression test for the competitive report | `src/components/hamilton/reports/*.test.tsx` (new) | A rendering regression fails CI |
| C10 | Add `competitive_positioning` generation counts to `/admin/demand` | `src/app/admin/demand/page.tsx` | On-demand volume is visible next to funnel counts |
| C11 | **Delete** `Reports/studio/out/` (25 HTML + 25 PDF + superseded dir) | `Reports/studio/out/` | Directory is gone; nothing references it |
| C12 | Retire the manual studio pipeline once C1–C3 land | `Reports/studio/{render.sh,fill.mjs,preview.mjs,template.html,packs,narratives}` | Studio is archived or removed; `guard:legacy` fails if it returns as active guidance |
| C13 | Remove studio references from active docs | `docs/`, `CLAUDE.md`, `AGENTS.md` | `npm run guard:legacy` passes |
| C14 | Clear the stale session-brief instruction to review the 25 PDFs | `~/Code/.claude-shared/session-brief.sh` or its state file | Session brief no longer opens with a task that no longer exists |

## Workstream D — Data-quality threshold

Removes "the data isn't good enough yet" as a permanently available reason.

| ID | Task | Files | Done when |
|---|---|---|---|
| D1 | Define the publishability metric in writing | `docs/outstanding-tasks.md` | A single explicit number, e.g. share of institutions in one target state with a verified, current fee row |
| D2 | Write the query that measures it | `Reports/studio/coverage.sql` → `src/lib/data-quality/publishability.ts` (new) | One function returns current coverage against the threshold |
| D3 | Show the number and the threshold on an admin surface | `src/app/admin/data-quality/` | Operator sees "above / below line" at a glance |
| D4 | Write the stop rule: above the line, pipeline work ranks below outward work | `docs/outstanding-tasks.md` | Rule is stated the way the v5 build freeze was stated on 22 August |
| D5 | Re-rank the seven current internal priorities against the threshold | `docs/outstanding-tasks.md` | Each is marked required-to-cross-line or deferred |

## Workstream E — Loose ends

| ID | Task | Files | Done when |
|---|---|---|---|
| E1 | Decide the fate of the uncommitted migration | `supabase/migrations/20270101070000_published_fee_quality_gate.sql` | Committed on a branch and pushed, or deleted — not left untracked |
| E2 | Land or shelve the `fee-quality-gates` branch | 5 modified + 4 untracked files | Branch is merged, or pushed as a named branch; working tree is clean |
| E3 | Resolve `docs/operator-console-mockup.html` | untracked | Committed to `docs/` or removed |
| E4 | Resolve `scripts/generate-fee-quality-seeds.mjs` and `src/app/admin/run/` | untracked | Committed or removed |
| E5 | Run the full verification gate afterwards | — | `guard:legacy`, `test:agentic`, `build`, and the `/api/health` smoke all pass |

---

## Sequence

1. **E1–E4** first — clean tree before touching anything (30 min).
2. **A1–A5** next — the steering fix is cheap and reorders everything after it (1 hour).
3. **C1–C3** — close the PDF quality gap. This is the substantive engineering.
4. **C11–C14** — delete the studio path once C1–C3 prove the replacement.
5. **B1–B6** — demand instrumentation.
6. **D1–D5** — threshold, then re-rank.
7. **C4–C10** — remaining report hardening, ranked against the new P0.

## Explicitly out of scope

Distribution and outreach. How Fee Insight reaches institutions is the owner's call and is
not planned here.
