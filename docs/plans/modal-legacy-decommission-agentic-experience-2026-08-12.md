# Plan: Finish Legacy Removal And Build The Agentic Experience

Date: 2026-08-12
Target branch: `main`
Current status source: `docs/audits/legacy-retirement-status-2026-08-12.md`

## Goal

Build one clean agentic operating system for the fee database:

```text
Atlas orchestrates -> Magellan finds/fetches -> Rosetta reads/OCRs -> Knox extracts/checks -> Darwin verifies -> Hamilton publishes/reports
```

Non-negotiables:

- No Modal worker fallback.
- No `fee_crawler` process or Python CLI launcher.
- No `ops_jobs` execution model.
- No product read path from `extracted_fees`.
- No invisible agent clicks.
- No routine 25k-row human review queue.

## Current State

Already implemented on `main`:

- Tracked Python crawler/Modal runtime is removed.
- TypeScript job runner and Modal endpoint helpers are removed.
- Admin launches create visible `agent_runs`, steps, and events.
- Admin launches no longer execute the whole worker pass inside the click
  request. They return a queued visible run first, then the admin UI/API calls
  the serverless agent runner.
- `/api/admin/agents/runs/[id]/execute` runs a bounded agentic ledger slice for
  a specific run; `/api/admin/agents/tick` can pick up queued runs from an
  authenticated admin or cron-style bearer caller.
- Product/report/research/admin analytics reads use
  `published_fee_observations`.
- Magellan discovery/fetch, Rosetta HTML/text read, Knox raw extraction, Darwin
  verification, and Hamilton publish have deterministic TypeScript worker
  slices.
- Knox review now uses the current decision queue over
  `agent_messages`/`knox_overrides`.
- Old fee exception editor/action bridge is removed.
- CI guardrails block retired runtime/config/script surfaces.
- Vercel production/preview/development env no longer contains retired worker
  address keys.
- Modal apps `bank-fee-index-workers` and `bank-fee-index-preflight` are stopped
  with zero tasks.
- Production schema no longer has `ops_jobs`; report/provider lineage uses
  `agent_run_id`; agent step/event/document tables and the published fee view
  exist.

Historical baseline audits now live under `docs/archive/legacy-docs/audits/`.

## Phase 1: Seal Deployment

Status: Vercel env cleanup and Modal app stop completed on 2026-08-12.

Purpose: make sure production cannot keep calling old workers through env or
external schedules.

Tasks:

1. List Vercel env vars for production/preview/development.
2. Remove retired keys: `MODAL_*`, `OPS_RUN_URL`, `OPS_CANCEL_URL`,
   `DARWIN_SIDECAR_URL`, `MAGELLAN_SIDECAR_URL`, `EXTRACT_SINGLE_URL`,
   `MODAL_REPORT_URL`, and `MODAL_DISCOVER_URL`.
3. Verify no Modal schedule/app is still active outside this repo.
4. Redeploy `main` after env cleanup.

Acceptance:

- Production env cannot launch or address Modal.
- Admin runtime banner shows the intended backend.
- Clicking an agent action never produces a Modal call id.

## Phase 2: Seal Database Cutover

Status: targeted production schema cutover completed on 2026-08-12. Supabase
migration history remains drifted and should be reconciled separately.

Purpose: make the schema match the runtime.

Tasks:

1. Apply the agent-run and retirement migrations to production.
2. Verify `agent_runs`, `agent_run_steps`, and `agent_run_events` exist.
3. Verify report/provider lineage uses `agent_run_id`.
4. Verify `ops_jobs` is absent or unreachable in production.
5. Verify `published_fee_observations` is the read model for product surfaces.

Acceptance:

- Production has no `ops_jobs` execution dependency.
- Fee reads flow through the published agentic view.
- Any old staged backlog is explicitly classified as historical input, not a
  human review queue.

## Phase 3: Wire Durable Agent Execution

Status: partial. A non-blocking serverless step runner exists; Vercel
Workflow/Queues durability is still not wired.

Purpose: turn the deterministic slices into durable production runs.

Tasks:

1. Upgrade the serverless `executeAgentRun` runner to Vercel Workflows or the
   selected durable runner for Atlas.
2. Wire Vercel Queues or the selected fan-out queue for institution-level work.
3. Persist retries, cancellation, cost, and provider-stop decisions through the
   existing run ledger.
4. Add small-cohort dry-run controls before broad runs.

Acceptance:

- A 10-institution run can resume after failure without duplicating completed
  work.
- Every step has status, duration, owner, evidence, cost, and failure reason.

## Phase 4: Finish Agent Modules

Purpose: reduce manual review by doing real machine work, not hiding backlog.

Tasks:

1. Magellan: add durable fan-out, richer URL heuristics, and browser-heavy
   fallback decision states.
2. Rosetta: add PDF text extraction, OCR routing, page artifacts, and blob
   persistence.
3. Knox: add provider-assisted extraction with strict budget/provider guards.
4. Darwin: add adversarial verification for ambiguous rows.
5. Hamilton: add report rendering workers backed by the same run ledger.

Acceptance:

- Routine rows flow raw -> verified -> published without human action.
- Human review contains only anomaly/decision exceptions.
- Provider credit failures stop new provider work and attach to the run that
  caused them.

## Phase 5: Operator Experience

Status: partial. Clicking launch controls now creates a visible queued run and
the live status panel can kick queued runs. Full per-step cost/retry/provider
detail is still incomplete.

Purpose: make the admin product explain exactly what is happening.

Tasks:

1. Keep Atlas/Magellan/Darwin/Knox/Hamilton controls on one run surface.
2. Show current step, queue size, processed count, skipped count, retry count,
   cost, provider state, and next action.
3. Make terminal failures actionable, not silent.
4. Add visual QA for the admin run pages at desktop and mobile widths.

Acceptance:

- Clicking Start Atlas changes visible state immediately.
- Magellan rescue/fetch explains what it processed and why it stopped.
- Provider/account failures show current timestamps and affected agents.

## Phase 6: Hygiene Enforcement

Purpose: keep the repo from regressing.

Tasks:

1. Keep `npm run guard:legacy` in CI.
2. Keep active docs current and move historical plans/audits to
   `docs/archive/`.
3. Keep generated build output and local SQLite crawler artifacts out of the
   workspace.
4. Add focused tests as each durable agent module lands.

Acceptance:

- CI fails if retired worker URLs, `fee_crawler`, `ops_jobs`,
  `modal_call_id`, or runtime `extracted_fees` reads return.
- Repo search results separate current source from archive/history.
- The active plan matches what production actually runs.
