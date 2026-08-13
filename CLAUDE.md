# Agent Guidance

This repo no longer uses the Python `fee_crawler` runtime, Modal workers,
`ops_jobs`, or generic CLI job launchers as active execution paths.

## Current Runtime

- Next.js 16 / React 19 / TypeScript is the application and agent control plane.
- Supabase Postgres is the source of truth for institutions, fee data,
  `agent_runs`, `agent_run_steps`, `agent_run_events`, provider usage, and
  review queues.
- The active worker contract is `EXECUTION_BACKEND=agentic_v1`.
- Provider SDK/model construction is centralized in `src/lib/ai-provider.ts`;
  direct Anthropic SDK imports elsewhere are blocked by `provider-kill`.
- Current Postgres data access is `src/lib/data-store`; do not reintroduce the
  retired crawler-named data module.
- Atlas creates visible runs; Magellan discovers/fetches; Rosetta reads
  fetched HTML/text and marks PDFs as `needs_ocr`; Knox extracts conservative
  raw fee observations and performs conservative ready-review; Darwin verifies
  canonical-hinted raw rows; Hamilton publishes eligible verified rows into
  `fees_published`. Product/report/research fee reads use
  `published_fee_observations`. PDF/OCR, provider-assisted extraction,
  adversarial handling for ambiguous rows, report rendering, and durable queue
  fan-out remain explicit follow-up work.

## Hard Rules

- Do not add Modal endpoints, Modal env vars, or `.modal.run` URLs.
- Do not reintroduce `fee_crawler`, `python -m fee_crawler`, Python crawler
  tests, or pytest setup.
- Do not use `ops_jobs`, `ops_job_id`, `modal_call_id`, `modalCallId`, or
  `spawnJob`.
- Do not make hidden provider calls while billing/provider health is broken.
- Every agent action must create or update a visible agent run/step/event.
- Do not read `extracted_fees` for product, report, Scout, public API,
  research, market, peer, state, or analytics data. Those reads must use
  `published_fee_observations`. `extracted_fees` is only a temporary staged
  review bridge for Knox ready-review, fee review actions, and explicit review
  queue diagnostics.

## Current Source Of Truth

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
