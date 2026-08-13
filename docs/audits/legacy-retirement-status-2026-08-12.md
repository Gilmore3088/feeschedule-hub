# Legacy Retirement Status - 2026-08-12

## Current Decision

The public/admin app is now moving on one execution model: visible TypeScript
agent runs. The retired Python crawler, Modal worker app, generic job runner,
old fee review bridge, and `ops_jobs` launch model are not active runtime
surfaces.

Current operator path:

```text
Admin action -> agent_runs -> agent_run_steps -> agent_run_events -> agent modules -> Supabase ledgers
```

Current fee data path:

```text
crawl_targets -> discovery_cache/crawl_results -> agent_document_texts -> fees_raw -> fees_verified -> fees_published -> published_fee_observations
```

Product, report, research, Edge Function, and admin analytics reads use
`published_fee_observations`, not the retired staged fee table.

## Current Runtime

The current committed runtime includes:

- `EXECUTION_BACKEND=disabled | agentic_v1`.
- Visible `agent_runs`, `agent_run_steps`, and `agent_run_events` for
  Atlas/Magellan/Rosetta/Knox/Darwin/Hamilton work.
- Deterministic Magellan discovery/fetch slices in TypeScript.
- Rosetta HTML/text normalization into `agent_document_texts`.
- Knox conservative raw extraction into `fees_raw`.
- Darwin deterministic verification into `fees_verified`.
- Hamilton deterministic publish into `fees_published`.
- Provider usage attached to `agent_run_id` and guarded by automation stop.
- Knox decision review over `agent_messages`/`knox_overrides`, not the old fee
  exception queue.
- Non-blocking admin launches: `startAgentRun` now returns a queued visible run
  first, and the admin UI/API kicks a serverless `executeAgentRun` pass through
  `/api/admin/agents/runs/[id]/execute`.
- `/api/admin/agents/tick` can drain queued agent runs from an authenticated
  admin or cron-style bearer caller without any Modal process.

The backend is intentionally honest when disabled: clicking an agent action
creates or blocks a visible run instead of silently launching an external worker.

## Removed From Active Code

- Tracked `fee_crawler/` Python package, Modal app, CLI, workers, and tests.
- Modal endpoint helpers and report/discovery trigger URLs.
- Generic TypeScript `job-runner` launch/cancel model.
- Runtime `ops_jobs`, `ops_job_id`, `modal_call_id`, and `modalCallId` paths.
- Runtime product/report/research reads from `extracted_fees`.
- Old fee review action bridge and admin fee exception editor surfaces.
- Old one-off scripts that could mutate legacy pipeline data outside the agent
  run ledger.
- Python GitHub Actions workflows.
- Pre-cleanup audits that described Modal/`fee_crawler` as current; those are
  archived under `docs/archive/legacy-docs/audits/`.

## Allowed Historical References

These references are allowed because they are not active runtime:

- Supabase migration history that mentions retired tables/columns.
- Archived docs under `docs/archive/`.
- CI guard patterns that intentionally search for retired names.
- Tests that assert retired tables are not touched.
- UI terms such as `SearchModal`, which refer to a dialog component, not the
  Modal worker platform.

## Local Cleanup Performed

Ignored local artifacts were removed so repo searches reflect current source:

- `.next/`
- `.vercel/output/`
- local `.worktrees/darwin-v1` and `.worktrees/magellan-v1`
- `data/crawler.db*`
- `data/logs/`

Local env files were scrubbed of retired worker keys without printing values:

- `MODAL_*`
- `DARWIN_SIDECAR_URL`
- `MAGELLAN_SIDECAR_URL`
- `OPS_RUN_URL`
- `OPS_CANCEL_URL`
- `EXTRACT_SINGLE_URL`

## External Cutover Performed

Vercel environment variables were checked by name only. Retired worker address
keys were removed from production/preview/development:

- `OPS_RUN_URL`
- `OPS_CANCEL_URL`
- `MODAL_REPORT_URL`
- `DARWIN_SIDECAR_URL`
- `MAGELLAN_SIDECAR_URL`

Verification after removal found no `OPS_*`, `MODAL_*`, Darwin sidecar,
Magellan sidecar, or extraction endpoint keys in the Vercel project env lists.

Modal deployed apps were also checked and stopped:

| App | App ID | State after cleanup |
|---|---|---|
| `bank-fee-index-workers` | `ap-fH95Dxp7F5QRgwUcF7xsAZ` | `stopped`, `Tasks=0` |
| `bank-fee-index-preflight` | `ap-UzPTaiWBsZJjIBaGnkSMHs` | `stopped`, `Tasks=0` |

Production schema was checked directly with `psql` because Supabase API
migration listing returned a project access-control error. The targeted
agentic/retirement migrations were then applied manually. Verification after
application:

- `ops_jobs` is absent.
- `agent_run_steps`, `agent_run_events`, and `agent_document_texts` exist.
- `published_fee_observations` exists and returned 13,317 rows at verification
  time.
- `report_jobs` has `agent_run_id` and no `modal_call_id`/`ops_job_id`.
- `ai_api_usage_events` has `agent_run_id` and no `ops_job_id`.

The Supabase migration history table is still drifted from the local migration
folder and should be reconciled separately; do not use a blind
`supabase db push --include-all` without reviewing the older missing history
entries.

## Guardrails

`npm run guard:legacy` now runs:

- `modal-kill`
- `legacy-kill`
- `fee-read-model-kill`
- `script-kill`
- `config-kill`

The guard covers active runtime, Edge Functions, scripts, GitHub Actions, root
config, and `.env.example`. It fails on retired execution/data surfaces such as
Modal worker URLs, `fee_crawler`, `ops_jobs`, `modal_call_id`, and
`extracted_fees` runtime reads.

## Still Not Done

These are the remaining real gaps, not hidden legacy dependencies:

1. Upgrade the current serverless step runner to the durable execution
   substrate, preferably Vercel Workflows plus Vercel Queues with Supabase as
   the ledger.
2. Finish Rosetta PDF/OCR and blob artifact persistence.
3. Finish provider-assisted Knox extraction and adversarial review for ambiguous
   rows with budget/provider-stop checks.
4. Finish Hamilton report rendering workers.
5. Convert any remaining historical staged backlog into the tiered
   Knox/Darwin exception model or discard it explicitly. The app should never
   ask a human to review tens of thousands of routine rows.

## Acceptance Definition

This cleanup is complete only when:

- No active code, script, CI workflow, Edge Function, env example, or deployment
  config can launch Modal or `fee_crawler`.
- Production env no longer contains retired worker URLs/secrets.
- Production schema no longer depends on `ops_jobs`.
- Atlas/Magellan/Rosetta/Knox/Darwin/Hamilton clicks always create visible run
  records with step state, timestamps, cost, failure reason, and next action.
- Queued run pickup and retries are durable enough to survive browser close,
  function timeout, and deployment restarts without duplicating completed work.
- Product/report/research reads use the published agentic fee view.
- Human review contains anomaly/decision exceptions only, not the routine fee
  corpus backlog.
