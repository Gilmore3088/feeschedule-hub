# feeschedule-hub — Bank Fee Index

## Brand
Fee Insight is the company and site (feeinsight.com). Bank Fee Index is its product
(the dataset/index); Hamilton is the Pro workspace. Never name the site as the product.
Brand strings live in `src/lib/constants.ts`; `scripts/ci-guards.sh brand-kill` enforces it.
Contact stays hello@bankfeeindex.com until feeinsight.com mail exists.

## Money-Thesis
A bank/CU marketing or product manager pays ~$300 for a competitive fee report for
their market. Why us: live verified fee data (published_fee_catalog) + banking domain
expertise. Kept fully separate from the CSI day job.

## Status
ACTIVE (slot 1 of 1). Milestone: the Competitive Fee Position report is generated
**on demand** by Hamilton Reports (`/pro/reports`), carrying the studio design —
Newsreader/IBM Plex, terracotta spine, cover page, position map, divergences, full
ledger, sources. The manual studio pipeline that produced the original batch is
retired; the 25 batch PDFs are discarded.

Still served: the 25 hosted HTML reports at `/r/<token>` (tokens live until
2026-11-14) and the public sample at `/reports/sample-competitive-fee-position`.
Delete `Reports/studio/out/*.html` and `hosted-reports.json` after that date.

## Next action
Working the outward turn plan (`docs/plans/2026-08-23-outward-turn-plan.md`).
Workstreams E, A and C1–C3 are done. Next up: B — demand instrumentation
(`/admin/demand`), then D — the publishability threshold and re-rank.

Distribution — who these reports go to and how — is your call and is deliberately
not planned here. `Reports/studio/outreach-template.md` and `outreach-log.md`
remain for that purpose.

# Agent Guidance

This repo no longer uses the Python `fee_crawler` runtime, Modal workers,
`ops_jobs`, or generic CLI job launchers as active execution paths.

## Current Runtime

- Next.js 16 / React 19 / TypeScript is the application and agent control plane.
- Vercel/Next API routes are the runtime boundary; Supabase Edge Functions are
  not an active product or agent execution surface in this repo.
- Supabase Postgres is the source of truth for institutions, fee data,
  `agent_runs`, `agent_run_steps`, `agent_run_events`, provider usage, and
  review queues.
- The active worker contract is `EXECUTION_BACKEND=agentic_v1`.
- Provider SDK/model construction is centralized in `src/lib/ai-provider.ts`;
  direct Anthropic SDK imports elsewhere are blocked by `provider-kill`.
- Current Postgres data access is `src/lib/data-store`; do not reintroduce the
  retired crawler-named data module.
- App code uses the physical semantic tables `institution_sources`,
  `source_documents`, `source_collection_runs`, and `agent_source_texts` for
  source/institution/document/text access.
- Knox, Darwin, and Hamilton use `raw_fee_observations`,
  `verified_fee_observations`, and `published_fee_records` as their fee-tier
  write/read boundaries.
- Atlas creates visible runs; Magellan discovers/fetches; Rosetta reads
  fetched HTML/text and extractable PDF text, while scanned/image-only PDFs are
  marked `needs_ocr`; Knox extracts conservative raw fee observations and
  performs conservative ready-review; Darwin verifies canonical-hinted raw rows;
  Hamilton publishes eligible verified observations into published fee records.
  Product/report/research fee reads use `published_fee_catalog`.
  Scanned-PDF OCR, provider-assisted extraction, adversarial handling for
  ambiguous rows, report rendering, and durable queue fan-out remain explicit
  follow-up work.

## Hard Rules

- Do not add Modal endpoints, Modal env vars, or `.modal.run` URLs.
- Do not reintroduce `fee_crawler`, `python -m fee_crawler`, Python crawler
  tests, or pytest setup.
- Do not add Supabase Edge Functions as a parallel runtime; use typed Next
  routes and agent modules with run-ledger visibility.
- Do not use `ops_jobs`, `ops_job_id`, `modal_call_id`, `modalCallId`, or
  `spawnJob`.
- Do not make hidden provider calls while billing/provider health is broken.
- Every agent action must create or update a visible agent run/step/event.
- Do not reintroduce a public prelaunch proxy gate that serves a parallel static
  site instead of the App Router pages.
- Do not read `extracted_fees` for product, report, Scout, public API,
  research, market, peer, state, or analytics data. Those reads must use
  `published_fee_catalog`. `extracted_fees` is only a temporary staged
  review bridge for Knox ready-review, fee review actions, and explicit review
  queue diagnostics.
- Do not query historical source tables directly from app code. `source-read-model-kill`
  scans all of `src/`; use the semantic source contracts instead.
- Document agents must use `institution_id`, `source_document_id`, and
  `agent_source_texts`. `agent-source-contract-kill` blocks crawler-era source
  column names in Magellan fetch, Rosetta read, Knox extract, and Atlas run-store.
- Fee-tier agents must use semantic tier contracts. `fee-tier-contract-kill` blocks
  direct `fees_raw`, `fees_verified`, `fees_published`, and `crawl_event_id`
  usage in Knox extract, Darwin verify, Hamilton publish, and Atlas run-store.

## Current Source Of Truth

- `AGENTS.md` (agent roster, data boundaries, product rules, verification gates)
- `src/lib/agents/AGENTS.md` and per-agent `AGENTS.md` files (pipeline architecture:
  Atlas -> Magellan -> Rosetta -> Knox -> Darwin -> Hamilton)
- `docs/plans/agentic-codebase-cleanup-2026-08-13.md`
- `src/lib/agents/run-store.ts`
- `src/lib/ai-provider.ts`
- `src/lib/data-store/connection.ts`
- `src/lib/execution-backend.ts`
- `scripts/ci-guards.sh`

Historical docs that reference Modal, `fee_crawler`, SQLite, or `ops_jobs` live
under `docs/archive/` and are not current implementation guidance.

The only current scripts are the production-route build check and CI guardrails.
Do not add one-off data mutation, dedupe, migration, crawler, or provider
scripts; those belong in typed agent modules with run-ledger visibility.
