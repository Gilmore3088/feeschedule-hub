# Plan: Remove Modal and Legacy Pipeline, Rebuild Around Agentic Experience

Date: 2026-08-12
Target branch: `main`
Primary audit input: `docs/audits/codebase-current-vs-legacy-2026-08-12.md`

Status note: this plan has moved from stop-gap into retirement. The current
working tree removes the tracked Python crawler/Modal runtime, old job runner,
old generated Python schema bridge, Python CI workflows, and old admin pipeline
panels, old one-off scripts, and pre-cleanup operational audits that described
Modal as current. It also adds the agentic run ledger and rewires launch actions
to create visible `agent_runs`. A first deterministic `agentic_v1` pass now
commits step events as the run advances, performs bounded Magellan fee URL
discovery, and performs bounded Magellan source document fetches into
`crawl_results`. It also runs a bounded Rosetta HTML/text read pass into
`agent_document_texts`, routes PDFs to `needs_ocr`, and runs a bounded Knox
ready-review bridge that can approve safe staged rows with `fee_reviews` audit
rows. Knox now also runs a bounded deterministic raw extraction pass from
Rosetta text into `fees_raw`. Darwin now runs deterministic verification for
canonical-hinted Knox rows into `fees_verified`. Hamilton now runs
deterministic Tier-3 publish for eligible verified rows into `fees_published`.
Real PDF/OCR, provider-assisted extraction, adversarial review for ambiguous
rows, report rendering, and durable fan-out are still the next build phase.
Product/report/research fee reads now use the `published_fee_observations`
view over live Tier-3 rows.
When the backend is disabled, new runs block honestly instead of launching a
hidden legacy worker. Current status is tracked in
`docs/audits/legacy-retirement-status-2026-08-12.md`.

## Goal

End state:

- No Modal dependency in runtime code, env vars, admin UI, schedules, reports, or docs.
- No generic `python -m fee_crawler <command>` admin launcher.
- No legacy `jobs` queue, extraction stub, Batch worker ghost path, or SQLite-era query translator.
- One agentic ingestion system: Atlas orchestrates; Magellan finds/fetches; Rosetta reads/OCRs; Knox extracts/checks; Darwin classifies/verifies; Hamilton consumes published intelligence.
- One observable job model with durable run IDs, step events, logs, progress, retries, cost, and cancellation visible in admin.
- One fee data path: raw document -> raw fee observation -> verified fee -> published fee.
  Temporary audited compatibility writes to `extracted_fees` are allowed only
  for Knox ready-review until the staged backlog moves to the tiered exception
  model. Product/report/research reads must use `published_fee_observations`.

## Non-negotiables

- Do not resume automation while Anthropic billing/provider routing is broken.
- Do not keep Modal as a hidden fallback.
- Do not call legacy CLI commands from the new agent UI.
- Do not reintroduce deleted crawler/Modal launchers as a fallback.
- Every phase must leave the product deployable.

## Target architecture

Use the existing Next/Vercel app as the control plane and runtime:

- Vercel Workflows for durable multi-step agent runs.
- Vercel Queues for fan-out work, retries, delayed retry, and worker isolation.
- Vercel Cron for scheduled kicks only, not business logic.
- Supabase Postgres as the source of truth for institutions, fee data, agent runs, events, costs, and review queues.
- R2 or a selected blob store for documents/artifacts, with a single document registry in Postgres.
- Vercel AI SDK / existing provider wrappers for LLM calls, with one shared budget ledger.

External docs to check during implementation:
- Vercel Workflows: https://vercel.com/docs/workflows
- Vercel Queues: https://vercel.com/docs/queues
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs
- Vercel Function duration/runtime limits: https://vercel.com/docs/functions/configuring-functions/duration

## New source layout

Create these first; migrate into them gradually:

```text
src/lib/agents/
  atlas/
    workflow.ts
    scheduler.ts
  magellan/
    discover.ts
    fetch.ts
  rosetta/
    read-document.ts
    ocr.ts
  knox/
    extract-fees.ts
    review.ts
  darwin/
    classify.ts
    verify.ts
  hamilton/
    publish-context.ts
  shared/
    events.ts
    budget.ts
    provider.ts
    artifacts.ts
    schemas.ts
    retries.ts

src/app/api/agents/
  runs/route.ts
  runs/[id]/route.ts
  runs/[id]/events/route.ts
  atlas/start/route.ts
  atlas/cancel/route.ts
  queues/[agent]/route.ts
```

The exact route names can change, but the principle cannot: one agent backend, one run contract, one event stream.

## Database model

Add new tables before removing old ones:

| Table | Purpose |
|---|---|
| `agent_runs` | Durable top-level run records replacing `ops_jobs` as the source of truth. |
| `agent_steps` | Per-agent/step state: queued, running, completed, failed, cancelled, retrying. |
| `agent_events_v2` | Append-only progress/log stream for admin visibility. |
| `agent_artifacts` | Documents, screenshots, parsed text, prompts, outputs, R2/blob keys. |
| `agent_cost_ledger` | Provider requests, tokens, estimated/actual cost, budget decisions. |
| `documents` | Canonical fetched source documents by institution/version/hash. |
| `fee_observations_raw` | Replacement or strict alias for `fees_raw`. |
| `fee_observations_verified` | Replacement or strict alias for `fees_verified`. |
| `fee_observations_published` | Replacement/current view for published consumers. |

Decision needed during implementation: whether to rename existing `fees_raw`, `fees_verified`, `fees_published` or keep them and add cleaner views. Prefer views first, destructive rename later.

## Phase 0: Hard stop legacy from doing more damage

Deliverable: old backend cannot silently run.

Tasks:

1. Add `EXECUTION_BACKEND=disabled | agentic_v1`.
2. Change `src/lib/job-runner.ts` so `modal_legacy` is not a valid default.
3. Remove hardcoded Modal fallback URLs from `src/lib/job-runner.ts` and `src/lib/modal-endpoints.ts`.
4. Disable Start Atlas/Magellan/Darwin/Knox buttons when backend is `disabled`; show the exact reason.
5. Add `/admin/system/runtime` or an admin banner showing backend, automation flag, provider health, and active run count.
6. Mark current Modal-triggered actions as disabled/deprecated in UI until replaced.
7. Keep `automation_control.enabled=false`.

Delete in this phase only if no import remains:
- Modal fallback constants.
- UI copy that says "contacting Modal".
- Modal call-id specific labels in the new runtime panel.

Acceptance:
- Clicking Start Atlas cannot call Modal.
- Missing backend config fails loudly.
- Admin clearly says "backend disabled" instead of appearing inert.

## Phase 1: Build the new agent run contract

Deliverable: agentic run shell works with no crawling yet.

Tasks:

1. Create `agent_runs`, `agent_steps`, `agent_events_v2`, `agent_cost_ledger`, and `agent_artifacts` migrations.
2. Add typed TS access layer under `src/lib/agents/shared`.
3. Implement `startAgentRun`, `appendAgentEvent`, `completeAgentStep`, `failAgentStep`, `cancelAgentRun`.
4. Add API routes for start/status/events/cancel.
5. Convert the admin live panel from `ops_jobs`/`modal_call_id` to `agent_runs`/`agent_events_v2`.
6. Add streaming/polling UI that shows each agent step even before work completes.

Acceptance:
- Start Atlas creates a durable run and visible first event.
- Cancel marks the run and pending steps cancelled.
- No Modal URL, Modal call id, or Python command appears in this path.

## Phase 2: Port Atlas orchestration

Deliverable: Atlas orchestrates the ladder without touching legacy commands.

Workflow:

1. Build candidate set.
2. Enqueue Magellan discovery/fetch tasks.
3. Enqueue Rosetta document-read tasks.
4. Enqueue Knox extraction tasks.
5. Enqueue Darwin classify/verify tasks.
6. Publish only after checks pass.

Tasks:

1. Implement `src/lib/agents/atlas/workflow.ts`.
2. Implement step boundaries with retries and idempotency keys.
3. Use queue fan-out for institutions and bounded concurrency.
4. Write events for every state transition.
5. Store every provider call in `agent_cost_ledger`.
6. Add a hard daily budget and per-run cap.

Acceptance:
- Atlas can run a dry-run over 10 institutions and show all steps.
- Run can resume after failure without redoing completed steps.
- Every step has owner, status, duration, cost, and latest event.

## Phase 3: Replace Magellan discovery/fetch

Deliverable: Magellan can find/fetch fee documents without Python/Modal.

Tasks:

1. Port useful URL heuristics from:
   - `fee_crawler/pipeline/url_discoverer.py`
   - `fee_crawler/workers/discovery_worker.py`
   - `fee_crawler/agents/magellan/*`
2. Write TypeScript implementations under `src/lib/agents/magellan`.
3. Add document registry writes.
4. Add HTTP fetch with content hash, content type, final URL, response status, and retry metadata.
5. Add browser/JS-heavy fallback decision state, even if the first implementation punts those to `needs_strategy`.
6. Stop creating `jobs.queue='extract'`.

Acceptance:
- 100-institution discovery/fetch dry run updates documents and events.
- Duplicate runs do not duplicate documents.
- No `fee_crawler` process is spawned.

## Phase 4: Replace Rosetta document reading

Deliverable: documents become normalized text/artifacts in the agentic path.

Tasks:

1. Implement PDF text extraction in Node.
2. Implement HTML text extraction/readability.
3. Add OCR pathway decisioning for scanned PDFs.
4. Store raw text, normalized text, page count, content hash, and extraction confidence.
5. Keep screenshots/artifacts where useful for review.

Current bridge:
- `src/lib/agents/rosetta/read.ts` performs capped HTML/text reads from
  successful `crawl_results`, stores normalized text in
  `agent_document_texts`, and records failures/empty reads.
- PDF URLs and PDF content types are recorded as `needs_ocr` without a provider
  call, so the run is honest about the remaining gap.
- Blob persistence, page-level PDF extraction, OCR, screenshots, and extraction
  confidence are still pending.

Acceptance:
- PDF and HTML fixtures produce deterministic text artifacts.
- Scanned/empty documents are routed to retry/OCR/needs_strategy, not silent success.

## Phase 5: Replace Knox extraction and Darwin verification

Deliverable: fee rows flow through the new agentic path.

Tasks:

1. Port/replace extraction prompt and schema from `fee_crawler/pipeline/extract_llm.py`.
2. Port/replace taxonomy rules from `fee_crawler/fee_analysis.py` and align with `src/lib/fee-taxonomy.ts`.
3. Make the TypeScript taxonomy the source of truth, or generate both TS and agent schema from one file.
4. Knox extracts raw fee candidates from Rosetta text.
5. Darwin classifies/verifies candidates into canonical categories.
6. Low-confidence or anomalous rows go to the human exception queue only.
7. Routine rows auto-publish after policy checks.

Acceptance:
- New path produces raw -> verified -> published rows for a golden sample.
- Human queue size is anomaly-only, not tens of thousands of routine staged rows.
- Provider credit/budget failure stops the run before repeated doomed calls.

Current bridge:
- `src/lib/agents/knox/extract.ts` can parse high-signal, fee-like HTML/text
  lines from Rosetta artifacts into `fees_raw` without provider calls. Rows are
  marked with `needs_darwin_verification` and canonical hints for the next gate.
- `src/lib/agents/darwin/verify.ts` can verify canonical-hinted Knox raw rows
  into `fees_verified` without provider calls. It skips rows without valid
  canonical hints instead of guessing.
- `src/lib/agents/knox/review.ts` can auto-approve only staged rows that are
  high-confidence, categorized, named, unflagged, and have no conflicting human
  review history.
- The bridge writes `fee_reviews.action='agentic_ready_approve'` and uses
  `SET LOCAL app.allow_legacy_writes='true'` only inside that transaction
  because the existing staged backlog is still stored in `extracted_fees`.
- This is not the final fee data path. It is the first agentic backlog reducer
  while provider-assisted extraction and adversarial review modules are rebuilt.

## Phase 6: Replace Hamilton/report workers

Deliverable: no Modal report worker.

Tasks:

1. Replace `src/lib/report-job-runner.ts` Modal trigger with a Workflow/Queue run.
2. Move report render steps into Vercel-compatible workers or use a selected rendering service.
3. Store report progress in `agent_runs`/`agent_steps`.
4. Remove `MODAL_REPORT_URL`, `REPORT_INTERNAL_SECRET` Modal semantics, and `modal_call_id` from report UI.
5. Use `src/lib/agents/hamilton/publish.ts` as the Tier-3 publish module for
   eligible verified rows; keep report rendering as separate pending work.

Current bridge:
- `src/lib/agents/hamilton/publish.ts` publishes eligible Darwin-verified
  agentic rows to `fees_published` with a deterministic batch id and live
  lineage idempotency. It intentionally bypasses old `promote_to_tier3` because
  that function writes legacy `agent_events`.

Acceptance:
- `/api/reports/generate` returns a run id.
- Report generation status is visible in the same agent run UI.
- Failed report jobs end terminally with a visible error.

## Phase 7: Cut over reads away from `extracted_fees`

Deliverable: product reads only current published data.

Current status: implemented for product/report/research/admin analytics surfaces
via `published_fee_observations`. The remaining runtime `extracted_fees` usage is
the explicit staged-review bridge: Knox ready-review, fee review actions,
review-queue counts/details, and bridge status diagnostics.

Tasks:

1. Inventory and patch all product/report/research references to `extracted_fees`.
2. Create a single `published_fee_observations` view.
3. Repoint public pages, pro pages, API v1, reports, research tools, Scout, and admin analytics.
4. Add `fee-read-model-kill` so new product/runtime references fail CI unless they are in the review bridge allowlist.
5. Keep `extracted_fees` frozen but readable for the review bridge until the staged backlog is migrated or discarded.

Acceptance:
- `rg "\bextracted_fees\b" src` returns only the explicit review bridge allowlist.
- Public/pro/admin analytics pages render from the new published view.

## Phase 8: Delete Modal and legacy code

Deliverable: Modal and old CLI runtime are gone from source.

Delete:

- `fee_crawler/modal_app.py`
- `fee_crawler/modal_preflight.py`
- `fee_crawler/darwin_api.py`
- `fee_crawler/magellan_api.py`
- `src/lib/modal-endpoints.ts`
- Modal env vars from `.env.example`, docs, and deployment settings docs.
- `src/lib/job-runner.ts` or reduce it to a compatibility shim over `agent_runs`.
- `src/lib/report-job-runner.ts` Modal-specific code.
- `fee_crawler/workers/extraction_worker.py`
- `fee_crawler/workers/llm_batch_worker.py` if not intentionally rebuilt.
- `fee_crawler/workers/discovery_worker.py` after Magellan replacement is live.
- Legacy CLI commands not used by the new agent backend.
- SQLite migration scripts and `better-sqlite3` migration utilities.
- SQLite dialect translator in `fee_crawler/db.py`.
- Admin UI pages/actions that only launch legacy commands.
- Stale docs that describe Fly.io, SQLite, Modal sidecars, or old command workflows as current.
- One-off data mutation/audit/dedupe/schema scripts that bypass the agentic
  ledger.

Acceptance:
- `rg -n "modal|Modal|MODAL|modal_call_id|python3? -m fee_crawler|fee_crawler/modal_app|OPS_RUN_URL|MODAL_REPORT_URL" src scripts .github` has no worker-platform matches, except guard/test assertions and UI components whose name contains `Modal`.
- Historical docs with Modal/`fee_crawler` guidance live under `docs/archive/`.
- `python -m fee_crawler` is not part of production execution.
- `package.json`, Vercel env, and docs describe one backend.

## Phase 9: Repo hygiene

Deliverable: no stale noise.

Tasks:

1. Delete local build artifacts and committed cruft if tracked.
2. Add TS tests to CI.
3. Add workflow/queue integration tests.
4. Add golden extraction regression tests.
5. Keep `script-kill` in CI so legacy one-off data/process scripts are not
   reintroduced.

Acceptance:
- CI fails if Modal imports, hardcoded Modal URLs, `python -m fee_crawler`
  runtime calls, or legacy data/process scripts reappear.
- CI runs lint, typecheck, TS tests, agent tests, and smoke flows.

## Cutover order

1. Stop legacy from launching.
2. Build new run/event model.
3. Replace agent execution step by step.
4. Prove new extraction on a small golden cohort.
5. Expand by state/cohort.
6. Flip reads.
7. Delete Modal.
8. Delete old queues/CLI/shims.

## Implemented in this cleanup

Completed scope:

- Add `EXECUTION_BACKEND`.
- Delete the tracked Python crawler/Modal runtime and old TypeScript job runner.
- Remove hardcoded Modal fallbacks and Modal-specific report/discovery triggers.
- Rewire admin launch actions to `agent_runs`, `agent_run_steps`, and `agent_run_events`.
- Point Atlas live status and command-center visibility at the agentic run ledger.
- Add migrations that add the agent run contract, link provider usage/report jobs
  to `agent_run_id`, and drop `ops_jobs` without `CASCADE`.
- Add CI guards that fail on runtime Modal URLs, `ops_jobs`, `spawnJob`, and
  `python -m fee_crawler` reintroduction.
- Add a deterministic ledger worker pass for `EXECUTION_BACKEND=agentic_v1` so
  Atlas/Magellan/Darwin/Knox/Hamilton starts show step transitions and current
  queue/corpus counts immediately.
- Commit run and step events between steps, so the admin live panel can see
  progress during execution instead of only after the worker transaction ends.
- Add a deterministic Magellan fee URL discovery worker slice that fetches
  homepages, scores fee-like links/common paths, updates rescued
  `crawl_targets.fee_schedule_url`, and writes `discovery_cache` evidence.
- Add a deterministic Magellan source fetch worker slice that fetches known fee
  schedule URLs, inserts `crawl_results`, records content hashes/status codes,
  and updates `crawl_targets` crawl health.
- Add a deterministic Rosetta HTML/text read worker slice that normalizes
  fetched source documents into `agent_document_texts` and routes PDFs to
  `needs_ocr`.
- Add a deterministic Knox raw extraction worker slice that writes conservative
  fee observations to `fees_raw` with idempotency guards.
- Add a deterministic Darwin verification worker slice that writes
  canonical-hinted Knox raw observations to `fees_verified` with idempotency
  guards.
- Add a conservative Knox ready-review worker slice so a live review step can
  approve safe staged rows, write review audit rows, and report the remaining
  staged backlog and human exceptions in the agent event stream.

After this cleanup, the user can click Start Atlas or Magellan and see what was
accepted, which step ran, what database state was measured, and whether the run
is blocked or completed. Magellan can now reduce the missing fee URL queue and
fetch known source documents into the crawl ledger. Knox review can reduce safe
staged backlog rows. Rosetta can now produce HTML/text artifacts from fetched
documents. Knox can now create conservative raw observations from those
artifacts. Darwin can now verify canonical-hinted raw observations. Hamilton can
now publish eligible verified rows. The system still will not OCR, run
provider-assisted extraction, adversarially review ambiguous rows, render
reports, or flip all product reads until the remaining real agent modules are
implemented.

## Next implementation PR

Build the real worker modules:

- Atlas orchestration using durable Workflow/Queue semantics.
- Magellan durable queue fan-out without Python/Modal.
- Rosetta PDF/OCR document reading and blob artifact persistence.
- Provider-assisted Knox extraction and adversarial extraction review.
- Darwin provider-backed classification for ambiguous rows with budget checks.
- Hamilton report rendering workers.
- Remove the `extracted_fees` compatibility write once review and product reads
  use the tiered fee tables end to end.

Acceptance: a constrained run over a small institution cohort creates new
document artifacts, raw observations, verified rows, published rows, cost
events, and terminal run status with no Modal or `fee_crawler` dependency.

## Final success criteria

- No Modal in runtime.
- No hidden legacy command execution.
- No massive routine human review queue.
- No invisible agent clicks.
- No unowned queue backlogs.
- No duplicated fee tables in product reads.
- No undocumented backend.
- Agentic experience is the product: every run shows plan, current step, evidence, cost, failure reason, and next action.
