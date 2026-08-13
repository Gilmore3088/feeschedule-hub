# Agentic Codebase Cleanup Plan - 2026-08-13

## Goal

Make the public/admin product run through one understandable agentic system:

1. User action creates an `agent_runs` record.
2. Every step writes `agent_run_steps` and `agent_run_events`.
3. Vercel Cron or the admin execute API advances queued work.
4. Provider calls are metered in `ai_api_usage_events` and blocked by `automation_control` when billing/circuit state is unsafe.
5. No tracked runtime path, config, script, Supabase Edge Function product endpoint, or local artifact can reintroduce Modal, `fee_crawler`, `ops_jobs`, or one-off mutation scripts.

## Current State From Audit

### Current Agentic Runtime

- `vercel.json` schedules `/api/admin/agents/tick` every five minutes.
- `src/app/api/admin/agents/tick/route.ts` advances queued `agent_runs`.
- `src/app/api/admin/agents/runs/[id]/execute/route.ts` lets the UI advance a visible run after a button click.
- Product and agent runtime endpoints live in Next/Vercel routes, not Supabase Edge Functions.
- `src/lib/agents/run-store.ts` is the current execution envelope and event ledger.
- `src/lib/automation-control.ts` is the global safety stop.
- `src/lib/ai-provider.ts` is the only active provider SDK/model construction boundary.
- `institution_sources`, `source_documents`, `source_collection_runs`, and `agent_source_texts` are now the physical semantic source tables for app-code source/institution/document/text access.
- `raw_fee_observations`, `verified_fee_observations`, and `published_fee_records` are now the physical semantic fee-tier tables for Knox, Darwin, and Hamilton.
- `published_fee_catalog` is the current semantic product/admin/research read model for Hamilton-published fee records. The old `published_fee_observations` compatibility view is retired and removed by the semantic-view tightening migration.
- `institution_financial_records`, `institution_complaint_records`, `institution_branch_deposits`, `fee_change_records`, `institution_fee_snapshot_records`, `institution_analysis_results`, `institution_fee_alert_subscriptions`, and `agent_institution_run_results` are now the physical semantic institution-data tables.
- `gold_standard_verifications` is the current semantic gold-standard decision table for human verification decisions.
- `community_fee_submissions` is the current public fee-submission queue. The old request-time `community_submissions` DDL is retired and dropped after optional migration backfill.
- `agent_url_discovery_attempts` is the current Magellan URL discovery ledger. The old `discovery_cache` table is retired and dropped after optional migration backfill.
- `src/lib/ai-provider-usage.ts` records provider usage/failures, trips the same safety stop for Anthropic credit failures, and blocks new Anthropic calls when a recent credit-balance failure is already in the ledger.
- Current fee flow modules:
  - `src/lib/agents/magellan/discovery.ts`
  - `src/lib/agents/magellan/fetch.ts`
  - `src/lib/agents/rosetta/read.ts`
  - `src/lib/agents/knox/extract.ts`
  - `src/lib/agents/darwin/verify.ts`
  - `src/lib/agents/hamilton/publish.ts`

### No Longer Active Runtime

- Runtime/source guard passes for Modal URLs/env vars, `fee_crawler`, `ops_jobs`, `modal_call_id`, and runtime reads from `extracted_fees`.
- Active env example exposes `EXECUTION_BACKEND` and `AUTOMATION_CONTROL_ENABLED`, not retired worker URLs.
- Production execution should not launch Modal or Python workers.
- Tracked Supabase Edge Function source is retired so there is no second product API runtime outside the Next app.

### Legacy Or Confusing Material Still Present

- Historical Supabase migrations still mention or temporarily depend on `ops_jobs` before the later migration drops it. This is migration history, not an active runtime call, but it makes fresh-schema reasoning fragile.
- Current Postgres data access now lives under `src/lib/data-store/*`; the retired crawler-named data module is guard-blocked in active code and planning docs.
- `.claude/skills/*` is currently loaded by `src/lib/research/skills.ts`; it is current app prompt content unless we move it to first-class app config. Active `.claude` prompts are now guarded by `prompt-kill` so they cannot point agents at retired crawler/database tooling.
- `Hamilton-Design/` and `Reports/` are reference/design assets, not executable code. They should be moved to `docs/reference/` or external storage, not silently deleted.
- Direct Anthropic model usage in Hamilton/Scout/research surfaces now flows through `src/lib/ai-provider.ts`, and `provider-kill` blocks direct SDK/provider imports elsewhere.
- App code no longer queries the historical source tables directly. Magellan fetch, Rosetta read, Knox extract, Darwin verify, Hamilton publish, and Atlas run receipts use semantic source-document/text and fee-tier names. Remaining legacy is in migration history, public backup/archive tables, stale environment values, and archived docs.
- Active source now has zero runtime matches for Modal URLs, `fee_crawler`, `ops_jobs`, `modal_call_id`, `ops_job_id`, `fees_raw`, `fees_verified`, `fees_published`, `agent_document_texts`, `crawl_targets`, `crawl_results`, `crawl_runs`, `crawl_target_id`, `crawl_result_id`, `crawl_run_id`, `crawl_event_id`, `published_fee_observations`, and `discovery_cache` outside guard/test/history text.
- Active source has zero `crawl_target_id` references and zero direct reads/writes against the old physical institution-keyed data tables. Remaining legacy is in public backup/archive tables, historical migrations, archived docs, and compatibility storage that will be removed by the schema-baseline pass.
- Production Vercel env still has stale/malformed URL configuration to clean up separately: `BFI_APP_URL` pulled as an old `bankfeeindex.com` value with a literal `\n`.

### Removed In This Cleanup Pass

- Tracked `.claude/worktrees/.../fee_crawler` Python payload.
- Tracked `.superpowers/brainstorm/...` stale generated output and server state.
- Stale Docker ignore comments that described `fee_crawler` as needed.
- Added `artifact-kill` to `npm run guard:legacy` so tracked local worktrees, stale tool output, crawler packages, caches, and local DB files fail CI.
- Added `provider-kill` to `npm run guard:legacy` so direct Anthropic SDK/model construction fails CI outside `src/lib/ai-provider.ts`.
- Renamed the retired crawler-named data module to `src/lib/data-store` and added `legacy-name-kill` so active source/planning docs cannot reintroduce the old boundary name.
- Added `prompt-kill` to `npm run guard:legacy` and rewrote active `.claude` data-audit guidance so agents stop being instructed to use retired local crawler/database paths.
- Shipped visible Atlas and Magellan run receipts so button clicks immediately show the run id, owner, scope, plan, and live-status tracking path.
- Archived historical baseline/gap docs out of active docs and replaced stale outstanding tasks with the current agentic backlog.
- Added `active-doc-kill` and `migration-history-kill` so current docs/plans and post-decommission migrations cannot drift back toward retired runtime concepts.
- Added provider circuit checks so recent Anthropic credit-balance failures fail closed before the next provider call and record visible `blocked` `ai_api_usage_events` rows.
- Removed the production public prelaunch proxy shell so public routes reach the App Router pages instead of a stale parallel static page.
- Removed the local Supabase Edge Function `fee-lookup` source and added `edge-function-kill` to prevent tracked Edge Function runtimes from returning.
- Removed unreferenced standalone `scripts/migrations/*.sql` artifacts; canonical database history remains under `supabase/migrations`.
- Added semantic source views for `institution_sources`, `source_documents`, and `source_collection_runs`.
- Moved public stats/freshness, collection health, Hamilton internal status tools, admin query presets, and Magellan admin status counts onto the semantic source views.
- Moved active Magellan discovery/fetch, Rosetta read, and Atlas/run-store inventory paths onto semantic source views.
- Added `source-read-model-kill` to keep migrated read/write boundaries from querying historical source tables directly.
- Moved app-code reporting, admin queries, data-store modules, Scout, institution commands, submit-fees lookups, alerts, and report APIs onto the semantic source views.
- Expanded `source-read-model-kill` so it scans all of `src/` instead of a handpicked migrated-file list.
- Added semantic `agent_source_texts` over Rosetta text artifacts, added semantic aliases to `source_documents`, moved Magellan fetch/Rosetta read/Knox extract/Atlas run receipts to `institution_id` and `source_document_id`, and added `agent-source-contract-kill`.
- Added semantic fee-tier views, moved Knox/Darwin/Hamilton/Atlas fee-tier access onto them, and added `fee-tier-contract-kill`.
- Added `published_fee_catalog` and moved product, report, public API, Scout, research, market, peer, state, analytics, and admin reads off `published_fee_observations`.
- Moved `published_fee_catalog` consumers from crawler-era `crawl_target_id` aliases to semantic `institution_id` and added `catalog-contract-kill`.
- Moved Scout and institution source-document reads onto semantic `institution_id` where the current `source_documents` view supports it.
- Added semantic institution-keyed data views/functions, moved financial, complaint, branch, fee-change, snapshot, alert, analysis, agent-run-result, MSA report, Scout, and gold-standard verification code off crawler-era key/table names, and added `legacy-data-contract-kill`.
- Added semantic `community_fee_submissions`, removed request-time DDL from `/submit-fees`, and backfilled from `community_submissions` when present.
- Added semantic `agent_url_discovery_attempts`, moved Magellan discovery and discovery stats off `discovery_cache`, and expanded `agent-source-contract-kill` to include Magellan discovery.
- Rewrote active `.claude` fee/data audit prompts to use `institution_sources`, `source_documents`, `agent_source_texts`, semantic fee-tier tables, and `published_fee_catalog`.
- Added a semantic-view tightening migration that removes crawler-era alias columns from semantic source/text/fee views, makes `published_fee_catalog` independent of `published_fee_observations`, drops empty retired compatibility tables, and preserves the 124,246-row historical extracted-fee table as `historical_fee_observation_archive`.
- Verified the current workspace contains no `.fmd` or `*fmd*` files to audit.
- Converted the source/document/fee-tier spine from semantic compatibility views into physical semantic tables in production:
  - `crawl_targets` -> `institution_sources`
  - `crawl_runs` -> `source_collection_runs`
  - `crawl_results` -> `source_documents`
  - `agent_document_texts` -> `agent_source_texts`
  - `fees_raw` -> `raw_fee_observations`
  - `fees_verified` -> `verified_fee_observations`
  - `fees_published` -> `published_fee_records`
  - `fees_published_rollback_log` -> `published_fee_record_rollback_log`
- Renamed source/tier lineage columns (`source_collection_run_id`, `institution_id`, `source_document_id`), dropped duplicate `verified_fee_observations.id` and `verified_fee_observations.crawl_target_id`, rebuilt `published_fee_catalog`, and rewired `promote_to_tier2`, `promote_to_tier3`, and `lineage_graph` to semantic physical tables.
- Enabled RLS and revoked anon/authenticated access on the semantic physical source/document/fee-tier tables and their sequences after the physical cutover.
- Production verification after the cutover: zero old physical relation names for this spine; counts held at 8,750 institution sources, 12,058 source documents, 104,370 raw observations, 6,401 verified observations, and 13,317 published/catalog records.
- Converted the institution-data contracts from semantic compatibility views into physical semantic tables in production:
  - `institution_financials` -> `institution_financial_records`
  - `institution_complaints` -> `institution_complaint_records`
  - `branch_deposits` -> `institution_branch_deposits`
  - `fee_change_events` -> `fee_change_records`
  - `fee_snapshots` -> `institution_fee_snapshot_records`
  - `analysis_results` -> `institution_analysis_results`
  - `fee_alert_subscriptions` -> `institution_fee_alert_subscriptions`
  - `agent_run_results` -> `agent_institution_run_results`
- Renamed institution-data lineage columns to `institution_id` and `source_document_id`, dropped empty retired `crawl_target_changes` and `upload_jobs`, rebuilt the alert subscription functions on semantic tables, enabled RLS, and revoked anon/authenticated access.
- Production verification after the institution-data cutover: zero old physical relation names for this batch; counts held at 60,787 financial records, 4,782 complaint records, 152,847 branch deposits, 128 fee change records, 38,505 fee snapshots, and 77,334 agent institution run results.

## Retirement Plan

### Phase 1 - Make Legacy Impossible To Reintroduce

Status: implemented for current runtime source and config.

- Keep `npm run guard:legacy` in CI.
- Keep `artifact-kill` in the guard chain.
- Keep `provider-kill` in the guard chain.
- Keep `legacy-name-kill` in the guard chain.
- Keep `edge-function-kill` in the guard chain.
- Keep `source-read-model-kill` in the guard chain so all app code keeps using semantic source contracts.
- Keep `agent-source-contract-kill` in the guard chain so active document agents do not reintroduce crawler-era source column names.
- Keep `fee-tier-contract-kill` in the guard chain so active fee-tier agents do not reintroduce physical tier tables or crawler-era lineage column names.
- Keep `fee-read-model-kill` in the guard chain so runtime fee reads use `published_fee_catalog` and do not reintroduce `published_fee_observations` or `extracted_fees`.
- Keep `catalog-contract-kill` in the guard chain so `published_fee_catalog` consumers use `institution_id` rather than crawler-era aliases.
- Keep `legacy-data-contract-kill` in the guard chain so active source cannot reintroduce crawler-era ID aliases or old physical institution-keyed data table contracts.
- Add a lightweight architecture assertion test that checks:
  - `vercel.json` has only `/api/admin/agents/tick`.
  - runtime source does not import `job-runner`.
  - no source file reads `OPS_*`, `MODAL_*`, sidecar URLs, or `EXTRACT_SINGLE_URL`.
- Keep `migration-history-kill` enforcing that migrations after `20260813000200_provider_usage_agent_runs.sql` do not reintroduce retired runtime concepts.

### Phase 2 - Centralize Provider Calls

Target: no direct provider SDK construction outside a single provider module.

Status: implemented for active Anthropic provider paths.

- `src/lib/ai-provider.ts` is the only place that constructs Anthropic SDK clients or AI SDK language models.
- Direct Anthropic calls were moved from:
  - `src/lib/hamilton/generate.ts`
  - `src/lib/report-engine/editor.ts`
  - `src/lib/scout/agents.ts`
  - `src/lib/scout/audit-agents.ts`
  - `src/app/api/hamilton/chat/route.ts`
  - `src/app/api/hamilton/simulate/route.ts`
  - `src/app/api/research/hamilton/route.ts`
- Provider health is enforced before active Anthropic calls:
  - automation stop active means no provider request.
  - recent credit-balance failure means no retry loop.
  - every blocked call records a visible `ai_api_usage_events` row.
- Add env-driven model selection only through the provider module when model routing is needed.

### Phase 3 - Fix The Agentic User Experience

Target: when an operator clicks an agent action, the screen immediately shows exactly what is happening.

- Status: partially shipped for Atlas full-cycle, Atlas workflow lanes, and Magellan repair.
- Replace vague "Start Atlas" copy with the actual queued lane and step list.
- Show a run receipt with:
  - run id
  - current step
  - last event timestamp
  - next scheduled pickup
  - stop/circuit state
  - exact block reason when halted
- On run creation, optimistically attach to `/admin#atlas-live-status` and poll events until terminal.
- Add stale-run banners when no event arrives within the expected pickup window.
- Surface queue windows so Magellan does not keep choosing the same 50 institutions.

### Phase 4 - Make The Fee Pipeline Actually Comprehensive

Target: agent backlog shrinks without asking a human to review 26k rows.

- Magellan:
  - add durable claim/backoff logic so batches rotate and do not reprocess the same failures.
  - track attempted URLs per institution and avoid repeat attempts inside the retry window.
- Rosetta:
  - wire PDF text extraction/OCR.
  - keep HTML/text deterministic path for cheap cases.
- Knox:
  - keep deterministic extraction for obvious fee rows.
  - add a bounded AI extraction fallback only for documents Rosetta can read but deterministic rules under-extract.
  - send only anomalies, low-confidence rows, and policy conflicts to human review.
- Darwin:
  - verify canonical hints, amount reasonableness, lineage, and duplicate policy.
  - challenge only suspicious rows instead of flooding Knox.
- Hamilton:
  - publish strong/provisional observations from verified rows.
  - produce data-quality summaries that distinguish "no document", "PDF pending OCR", "extracted", "verified", and "published".

### Phase 5 - Schema Baseline Cleanup

Target: a fresh database should not recreate retired execution/read-model infrastructure just to drop it later.

- Status: started. Semantic source/document/text tables, semantic fee-tier tables, semantic institution-data tables, published fee catalog, public submission storage, and Magellan discovery-attempt storage exist. App-code read/write SQL now uses those semantic contracts for active agent/admin/product paths. The source/document/text, fee-tier, and institution-data physical storage names are cut over in production. Public historical backup/archive tables and stale env values remain.
- Do not edit production-applied migrations in place.
- Create a new agentic baseline migration set or squashed schema dump for fresh environments.
- Archive older compatibility migrations under a clearly named historical folder once the baseline is verified.
- Audit remaining public backup/archive tables before moving them out of the active public schema.
- Remove active references to:
  - `ops_jobs`
  - `ops_job_id`
  - `modal_call_id`
  - old extracted-fee active table names; historical data is retained only as `historical_fee_observation_archive`
- Next rename targets:
  - public historical backup tables: `extracted_fees_dedup_backup_20260418`, `extracted_fees_promote_backup_20260418`, `fee_reviews_dedup_backup_20260418`, and `pipeline_runs_legacy_20260603`
  - remaining crawler-worded columns on active semantic source tables such as `last_crawl_at`, `crawl_strategy`, `targets_crawled`, and `crawled_at`
  - stale production/local environment values that point at old Supabase refs or old public domains
- Verify from an empty database:
  - migrations apply cleanly.
  - `agent_runs`, `agent_run_steps`, `agent_run_events`, `automation_control`, `ai_api_usage_events`, `source_documents`, `agent_source_texts`, `raw_fee_observations`, `verified_fee_observations`, `published_fee_records`, `published_fee_catalog`, `community_fee_submissions`, `agent_url_discovery_attempts`, institution-data semantic tables, and `gold_standard_verifications` exist.
  - `ops_jobs` does not exist at the end.

### Phase 6 - Rename Or Quarantine Non-Runtime Legacy Names

Target: reduce cognitive load without breaking working code.

- Keep `src/lib/data-store` as the current data access boundary; do not reintroduce the retired crawler-named module.
- Move `Hamilton-Design/` to `docs/reference/hamilton-design/` or external design storage.
- Move `Reports/` PDFs to external storage unless a tracked fixture is required.
- Keep `.claude/skills` only if product Hamilton skills continue to load from disk; otherwise move skills into app-owned prompt templates.

## Validation Gates

- `npm run guard:legacy`
- `scripts/ci-guards.sh source-read-model-kill`
- `scripts/ci-guards.sh agent-source-contract-kill`
- `scripts/ci-guards.sh fee-tier-contract-kill`
- direct-provider search returns no provider SDK/model imports outside `src/lib/ai-provider.ts`
- `npm run lint`
- `npm run test:agentic`
- proxy regression test proving public routes pass through to the App Router while admin auth redirects still work
- focused route tests for Hamilton/research provider blocking
- smoke click test:
  - click an agent lane
  - see a run id immediately
  - see `run.created`
  - see either step progress or an explicit blocked reason
  - no Modal id and no provider 400 loop
- migration baseline test from empty Postgres before deleting or moving any migration history.

## Operating Rule

Do not call a path "agentic" unless it writes its state to `agent_runs`, advances through `agent_run_steps`, records events in `agent_run_events`, and either completes work or gives the operator a visible blocked/failed reason.
