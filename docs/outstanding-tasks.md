# Outstanding Agentic Cleanup Tasks

This file tracks active work only. Historical launch, crawler, and deployment notes belong under `docs/archive/`.

## Goal

Make Fee Insight run through one visible agentic system:

1. Operator or cron creates an `agent_runs` record.
2. Work advances through `agent_run_steps`.
3. Every meaningful state change writes `agent_run_events`.
4. Provider usage and provider failures attach to `ai_api_usage_events`.
5. No active runtime, prompt, config, script, or current plan points at retired external launchers, Supabase Edge Function product endpoints, or local crawler tooling.

## The Publishability Line

The stop rule, so that "the data isn't good enough yet" stops being available as
a reason forever.

**Metric.** An institution is *report-ready* when it publishes at least **9 of the
15 featured fee categories** a Competitive Fee Position report is built from
(`src/lib/data-quality/publishability.ts`, ported from the studio's
`coverage.sql`). Twelve of fifteen is the stricter bar for a report with no
visible gaps.

**Target.** **50 report-ready institutions.** A count, not a share: a report is
sold to an institution, not to a percentage of a state.

**Stop rule.** Below the target, coverage work is the constraint on revenue and
outranks all other inward work. At or above it, pipeline work ranks below
anything outward — there are enough institutions to sell to, and further
polishing is no longer what stands between the product and a customer.

**Where it stands — measured 2026-08-24, first run against production:**

| | Institutions |
|---|---|
| On file | 8,750 |
| Publish any featured fee | 508 |
| Report-ready (>= 9 of 15) | **30** |
| No visible gaps (>= 12 of 15) | 9 |

Read on `/admin/demand`.

**What that means, plainly.** Thirty addressable institutions nationally. The
studio picked its original 25 from exactly this set, which is why it was 25 and
not 250. Coverage is not housekeeping — it is what creates customers, and the
line says so with a number instead of a feeling.

## Priority Tiers

Every task here states its completion as something observable. A task whose
completion can only be observed from inside the system is **internal** and ranks
below outward work no matter how much it needs doing.

### P0 — Outward

Reserved for work whose completion is visible to someone outside this building.
**An empty P0 is a reading, not a failure** — it means nothing currently in flight
changes what an institution or a visitor can do, and that is worth knowing at a
glance rather than discovering two weeks later.

| Priority | Owner | Task | Done when |
|---|---|---|---|
| P0 | Reports | On-demand competitive report matches the batch report's quality | An institution can generate its own competitive fee position report and the output is one you would put in front of a prospect. Tracked as C1–C3 in `docs/plans/2026-08-23-outward-turn-plan.md`. |
| P0 | Rosetta | Scanned fee schedules stop producing blank institution pages | An institution whose only fee schedule is an image-only PDF still shows real fee amounts on its public page, instead of an empty one. |
| P0 | Knox | Oddly formatted schedules stop producing partial fee lists | An institution whose schedule is readable but non-standard shows a complete fee list on its public page, not a truncated one. |
| P0 | Darwin | Published fee changes reach the public site without waiting on a queue | A fee change that has been fetched and verified appears publicly without an operator clearing a review backlog first. |

**Re-ranked against the line (D5).** The three promoted P0 rows are the ones
that move report-ready count: OCR unlocks scanned schedules, the extraction
fallback unlocks oddly formatted ones, and thinning review pressure gets verified
rows published instead of parked. They are P0 on outward grounds *and* they are
the work the line says is binding. The four rows below move no institution across
the line and stay ranked under it.

### P1 — Internal

Necessary work whose completion is only observable inside the system. These rank
below every P0. They are not deprioritized because they are unimportant; they are
ranked here because finishing all of them changes nothing an outsider can see.

| Priority | Owner | Task | Done when | Rewrite attempted |
|---|---|---|---|---|
| P1 | Hamilton | Publish data-quality summaries | Admin can distinguish no source, source fetched, PDF pending OCR, extracted, verified, and published. | Yes — resists. An admin screen has no outward form. **Internal — not a priority candidate.** |
| P1 | Schema | Rename or baseline physical source storage | Empty database can be built around agentic source names without recreating retired table names as active infrastructure. | Yes — resists. **Internal — not a priority candidate.** |
| P2 | Schema | Audit FK/column compatibility names | Remaining physical FK/storage names are documented or replaced without breaking existing data. | Yes — resists. **Internal — not a priority candidate.** |
| P2 | Docs | Keep active docs current-only | `npm run guard:legacy` blocks stale active guidance and historical docs stay in archive. | Yes — resists. **Internal — not a priority candidate.** |

Three of the original seven priorities (Rosetta OCR, Knox extraction fallback,
Darwin review pressure) had an outward form and were promoted to P0 with rewritten
completion criteria. Four did not and stay here, labelled.

## Recently Shipped

| Owner | Shipped |
|---|---|
| Atlas | Visible run launch receipts plus pickup/stale status on `/admin/atlas/status`. |
| Magellan | Rescue/fetch batches rotate through retry windows instead of retrying the same failed rows. |
| Provider boundary | Recent Anthropic credit-balance failures block new calls before provider execution and record visible `blocked` usage events. |
| Rosetta | Readable HTML, text, and extractable PDF documents flow through semantic `agent_source_texts`; scanned/image-only PDFs are explicitly marked `needs_ocr`. |
| Public runtime | Production proxy no longer serves the retired static prelaunch page over public App Router routes. |
| Runtime boundary | Local Supabase Edge Function source removed; `guard:legacy` now fails if a tracked Edge Function runtime returns. |
| Script artifacts | Unreferenced standalone `scripts/migrations/*.sql` files removed; canonical DB history remains under `supabase/migrations`. |
| Source read model | Added `institution_sources`, `source_documents`, and `source_collection_runs`; migrated public stats, collection health, Hamilton admin status tools, admin query presets, and Magellan status counts; added `source-read-model-kill`. |
| Agent source paths | Magellan discovery/fetch, Rosetta read, and Atlas/run-store inventory now use semantic source views instead of historical source tables. |
| App source paths | Reporting, admin queries, data-store modules, Scout, institution commands, submit-fees lookups, alerts, and report APIs now use semantic source views; `source-read-model-kill` scans all of `src/`. |
| Agent document path | Magellan fetch, Rosetta read, Knox extract, and Atlas run receipts now use semantic `institution_id` / `source_document_id`; `agent-source-contract-kill` guards the path. |
| Agent fee tiers | Knox, Darwin, Hamilton, and Atlas run receipts now use semantic fee-tier views; `fee-tier-contract-kill` guards the path. |
| FMD audit | Rechecked the workspace; no `.fmd` or `*fmd*` files are present to audit. |

## Verification Gates

- `npm run guard:legacy`
- `npm run test:agentic`
- focused UI tests for agent launch receipts and live status
- `npm run build`
- production smoke: `/api/health` OK and unauthenticated admin execution routes return 401

## Not Active Guidance

Historical snapshots, old launch checklists, previous crawler planning, and retired deployment notes are archived under `docs/archive/`. Do not use them as implementation guidance.
