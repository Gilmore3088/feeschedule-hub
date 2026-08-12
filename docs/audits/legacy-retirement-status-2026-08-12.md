# Legacy Retirement Status - 2026-08-12

## Current Decision

The repo is moving to a single agentic execution model. The old Python crawler,
Modal worker app, generic job runner, and `ops_jobs` launch model are retired.

The current working tree implements the control-plane cutover, visibility
ledger, and first deterministic `agentic_v1` worker pass. New admin actions
create visible `agent_runs` records, create step/event ledgers, and either:

- advance through database inventory/status checks when
  `EXECUTION_BACKEND=agentic_v1`, or
- block honestly when the backend is disabled.

The first worker pass now includes bounded Magellan, Rosetta, and Knox worker
slices:

- Magellan `discover`/`rescue` steps run deterministic TypeScript homepage/link
  discovery for active institutions missing `fee_schedule_url`, update
  `crawl_targets`, and write `discovery_cache` evidence.
- Magellan `fetch` steps run deterministic TypeScript source document fetches
  for institutions with fee URLs, insert `crawl_results`, update target crawl
  health, and record content hashes/status codes.
- Rosetta `read` steps normalize fetched HTML/text source documents into
  internal `agent_document_texts` artifacts and mark PDF sources as `needs_ocr`
  instead of pretending OCR has run.
- Knox `extract` steps parse conservative fee-like text lines from Rosetta
  artifacts into `fees_raw` with idempotency guards and Darwin-verification
  flags. This is deterministic and does not call a provider while billing is
  unhealthy.
- Darwin `classify`/`verify` steps promote Knox raw rows that already have valid
  canonical hints into `fees_verified` with deterministic idempotency guards.
- Hamilton `publish` steps publish eligible, already-verified agentic rows into
  `fees_published` with live-lineage idempotency guards. This is a
  deterministic low-risk policy gate, not provider-assisted adversarial review
  for ambiguous rows.
- Knox can auto-approve staged fee rows that are already high-confidence,
  categorized, named, unflagged, and untouched by human review, while writing
  `fee_reviews` audit rows. That directly reduces the staged agent backlog
  without asking for a 26k-row manual review.

This first worker pass does not yet run durable queue fan-out, persist fetched
documents to blob storage, OCR PDFs, call providers, adversarially review
ambiguous rows, or render reports. Public/pro/report/research fee reads now go
through the `published_fee_observations` Tier-3 read model; the only remaining
`extracted_fees` runtime path is the temporary staged-review bridge.

## Removed From Active Code

- `fee_crawler/` tracked Python package, including Modal app, command CLI,
  workers, agent tools, tests, and requirements.
- Modal operational helpers:
  - `scripts/apply_migrations_via_modal.py`
  - `scripts/inspect_schema_via_modal.py`
- Generic crawler launch helpers:
  - `scripts/run_pipeline.sh`
  - SQLite-to-Postgres migration scripts that could recreate `ops_jobs`
- Python-schema TypeScript bridge:
  - `src/lib/agent-tools/*`
  - `scripts/codegen.sh`
  - `scripts/gen-agent-tool-types.sh`
- Old TypeScript execution model:
  - `src/lib/job-runner.ts`
  - `src/lib/crawler-db/ops.ts`
  - `src/lib/modal-endpoints.ts`
- Old admin pipeline/ops panels that exposed legacy operations.
- Legacy one-off scripts for direct migration application, data audit, staged
  review, auto-approval, dedupe, gap analysis, schema generation, and demo
  seeding. The only current scripts are CI/build guardrails.
- Pre-cleanup operational audits that described Modal as live have been moved to
  `docs/archive/legacy-docs/audits/`.
- Python GitHub Actions workflows. CI now checks the Next app guardrails and
  focused agentic run tests.

## Rewired To Agentic Runs

- Atlas start/resume/workflow/cancel controls now create or cancel `agent_runs`.
- Magellan repair, Darwin repair, data-quality repair, Scout agent, institution
  extraction, and Hamilton report generation create visible agentic run records.
- Atlas live status reads `agent_runs`, `agent_run_steps`, and
  `agent_run_events`.
- Admin command center reads active/recent `agent_runs`, not `ops_jobs`.
- Provider usage writes `agent_run_id`, not `ops_job_id`.
- Report jobs link through `report_jobs.agent_run_id`.
- When `EXECUTION_BACKEND=agentic_v1`, Atlas/Magellan/Darwin/Knox/Hamilton runs
  move queued steps through running/completed states and write committed
  event-stream summaries as each step starts and finishes.
- Magellan `discover`/`rescue` steps no longer just measure a queue. They run a
  capped deterministic discovery pass, update rescued fee URLs, mark dead/retry
  states, and write `discovery_cache` rows.
- Magellan `fetch` steps no longer just count known URLs. They run capped source
  document fetches, insert `crawl_results`, write content hashes/status codes,
  and update `crawl_targets` crawl health.
- Rosetta `read` steps no longer just count successful crawl results. They run
  capped HTML/text normalization, insert/update `agent_document_texts`, and
  route PDF documents to `needs_ocr` until OCR is wired.
- Knox `extract` steps no longer just count `fees_raw`. They run capped
  deterministic extraction from Rosetta text artifacts, write Tier-1
  observations to `fees_raw`, and mark rows for Darwin verification.
- Darwin `classify`/`verify` steps no longer just count `fees_verified`. They
  run capped deterministic verification for canonical-hinted Knox rows and
  write Tier-2 observations to `fees_verified`.
- Knox `review` steps can reduce safe staged rows from the compatibility
  `extracted_fees` table and insert `fee_reviews` rows with
  `action='agentic_ready_approve'`. This is intentionally conservative and is
  not a substitute for the future tiered fee write path.
- Product, report, Scout, Edge Function, research, state, market, peer, and
  admin analytics reads now use `published_fee_observations`, a compatibility
  view over live `fees_published` rows with raw/verified lineage.

## Database Retirement

New migrations:

- `20260813000100_agentic_run_contract.sql`
  - Formalizes `agent_runs`.
  - Adds `agent_run_steps` and `agent_run_events`.
  - Adds `report_jobs.agent_run_id`.
- `20260813000200_provider_usage_agent_runs.sql`
  - Adds `ai_api_usage_events.agent_run_id`.
  - Drops legacy `ops_job_id` / `modal_call_id` columns from report/provider
    linkage.
  - Drops `pipeline_runs.ops_job_id`.
  - Drops `ops_jobs` without `CASCADE`, so unexpected production dependencies
    fail loudly.
- `20260813000300_agent_document_texts.sql`
  - Adds the internal Rosetta text artifact table.
  - Enables RLS and revokes anon/authenticated access so normalized source text
    is not exposed through the public Data API.
- `20260812231005_hamilton_agentic_publish_dedup.sql`
  - Adds live-lineage idempotency for Hamilton agentic Tier-3 publishes.
- `20260812231722_published_fee_observations_view.sql`
  - Adds the current published-fee observation view for product/report/research
    reads.
  - Revokes anon/authenticated/public Data API access; server-side reads use the
    Postgres/service role path.

Historical migrations still contain old names because migration history is not
the active runtime. The retirement migration is the forward schema boundary.

## Guardrails

`scripts/ci-guards.sh` now includes:

- `sqlite-kill`
- `modal-kill`
- `legacy-kill`
- `fee-read-model-kill`
- `script-kill`

The runtime guard blocks reintroduction of:

- `spawnJob(`
- exact `@/lib/job-runner` imports
- `ops_jobs`, `ops_job_id`, `modal_call_id`, `modalCallId`
- `python -m fee_crawler`
- Modal endpoint env vars and `.modal.run`
- legacy one-off scripts that reference `fee_crawler`, `ops_jobs`,
  `modal_call_id`, Modal env vars, or the retired `extracted_fees` mutation path
- product/runtime `extracted_fees` reads outside the explicit review bridge
  allowlist

Verified in this working tree:

```text
sqlite-kill: OK
modal-kill: OK
legacy-kill: OK
fee-read-model-kill: OK
script-kill: OK
```

## What Is Still Not Done

This is the honest remaining work:

1. Implement the remaining real agent modules under `src/lib/agents/*` for
   Atlas orchestration, durable queue fan-out, Rosetta PDF/OCR,
   provider-assisted extraction, adversarial review for ambiguous rows, and
   Hamilton report rendering/context.
2. Choose and wire the durable execution substrate. Preferred direction remains
   Vercel Workflows plus Vercel Queues, with Supabase as the ledger.
3. Finish retiring the temporary staged-review bridge. Product/report/research
   fee reads now use `published_fee_observations`, backed by `fees_published`.
   The current Knox ready-review write uses `SET LOCAL
   app.allow_legacy_writes='true'` only inside the agent transaction because
   the staged backlog still lives in `extracted_fees`; remove this bridge once
   human exceptions move to the tiered Knox/Darwin exception model.
4. Replace federal/market data ingestion that used to live in the deleted Python
   commands with TypeScript agentic ingestion jobs.
5. Apply migrations to production and verify `ops_jobs` is dropped there.
6. Audit deployment environment variables and remove old Modal secrets/URLs from
   Vercel, Supabase, and local env files.

## Agentic Build Plan

### Phase 1 - Worker Contract

- Add `appendAgentEvent`, `startStep`, `completeStep`, `failStep`, `retryStep`,
  and `recordAgentCost` helpers around the run-store.
- Add API routes under `src/app/api/agents/runs`.
- Make every worker update the run ledger before and after work.
- Acceptance: Atlas can create a multi-step run, mark steps running/completed,
  and stream events without any external worker.
- Current status: implemented for committed step visibility, database
  inventory/status steps, capped Magellan URL discovery/fetch, and conservative
  Knox ready-review. Rosetta HTML/text read, Knox deterministic raw extraction,
  Darwin deterministic verification, and Hamilton deterministic Tier-3 publish
  for eligible verified rows are implemented. Durable queue fan-out,
  provider-assisted extraction, PDF/OCR, adversarial review for ambiguous rows,
  and report rendering still need the real modules.

### Phase 2 - Queue And Orchestration

- Wire Vercel Queues/Workflows or the selected durable substrate.
- Atlas owns scheduling and fan-out. No route or UI directly calls a worker
  function except through the run API.
- Acceptance: a dry run over 10 institutions completes with visible step
  transitions and no provider calls unless enabled.

### Phase 3 - Magellan And Rosetta

- Rebuild discovery/fetch/read in TypeScript.
- Persist documents, hashes, content type, final URL, extracted text, and
  artifacts.
- Current status: first deterministic fee URL discovery and source fetch passes
  exist; Rosetta HTML/text read exists; PDF/OCR and blob artifact persistence
  still need implementation.
- Acceptance: a 100-institution dry run produces document records and readable
  event streams with deterministic retries.

### Phase 4 - Knox And Darwin

- Rebuild fee extraction, taxonomy mapping, adversarial review, and verification
  against the new run/event/cost ledger.
- Current status: Knox deterministic raw extraction exists for high-signal
  HTML/text lines and writes `fees_raw`; Darwin deterministic verification
  exists for canonical-hinted rows and writes `fees_verified`; Hamilton
  deterministic publish exists for eligible verified rows and writes
  `fees_published`; provider-assisted extraction and adversarial extraction
  review are still pending.
- Acceptance: raw observations become verified/published fees only through the
  agentic path.

### Phase 5 - Hamilton And Public Data

- Move report generation and research context to published agentic outputs.
- Remove stale product reads that bypass the verified/published path.
- Current status: Hamilton can publish eligible verified fee rows to
  `fees_published`; report rendering and the product read-flip are still
  pending.
- Acceptance: Hamilton explains current fee data with citations and visible
  source lineage.

### Phase 6 - Production Cutover

- Apply migrations.
- Remove old Modal env vars/secrets.
- Run agentic dry run, then limited live run.
- Verify public coverage metrics and admin run visibility.
- Keep provider emergency stop enabled until billing/provider health is clean.

## Acceptance Definition

The job is done only when:

- No active code, script, CI workflow, or deployment env can launch Modal or the
  retired Python crawler.
- Starting Atlas/Magellan/Darwin/Hamilton always creates a visible run record.
- Provider failures attach to an agent run with accurate timestamps and cost
  metadata.
- The 26k-fee backlog is reduced by agentic review flows, not manual review.
  Current implementation starts that path with high-confidence ready-review and
  deterministic Tier-3 publish for eligible verified rows; the rest of the
  backlog needs adversarial review/provider modules.
- Production no longer has `ops_jobs` as an execution dependency.
