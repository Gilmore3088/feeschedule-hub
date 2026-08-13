# Outstanding Agentic Cleanup Tasks

This file tracks active work only. Historical launch, crawler, and deployment notes belong under `docs/archive/`.

## Goal

Make Fee Insight run through one visible agentic system:

1. Operator or cron creates an `agent_runs` record.
2. Work advances through `agent_run_steps`.
3. Every meaningful state change writes `agent_run_events`.
4. Provider usage and provider failures attach to `ai_api_usage_events`.
5. No active runtime, prompt, config, script, or current plan points at retired external launchers or local crawler tooling.

## Current Priorities

| Priority | Owner | Task | Done When |
|---|---|---|---|
| P0 | Atlas | Durable queue pickup and stale-run visibility | Queued runs show pickup window, heartbeat, stale warning, and terminal blocked reason. |
| P0 | Magellan | Rotate rescue batches instead of retrying the same failures | Batch selection claims work, honors retry windows, and records attempted URLs per institution. |
| P0 | Provider boundary | Stop credit-error loops before calls repeat | Recent provider credit failures block new calls visibly through automation control and usage events. |
| P1 | Rosetta | Add PDF/OCR text path | PDF rows move from `needs_ocr` to readable document text or explicit terminal failure. |
| P1 | Knox | Add bounded provider-assisted extraction fallback | Deterministic misses on readable documents get one metered fallback, with only anomalies sent to human review. |
| P1 | Darwin | Thin review pressure | Verification routes ordinary canonical rows forward and challenges only suspicious rows. |
| P1 | Hamilton | Publish data-quality summaries | Admin can distinguish no source, source fetched, PDF pending OCR, extracted, verified, and published. |
| P2 | Schema | Create fresh agentic schema baseline | Empty database can be built without recreating retired execution tables as active infrastructure. |
| P2 | Docs | Keep active docs current-only | `npm run guard:legacy` blocks stale active guidance and historical docs stay in archive. |

## Verification Gates

- `npm run guard:legacy`
- `npm run test:agentic`
- focused UI tests for agent launch receipts and live status
- `npm run build`
- production smoke: `/api/health` OK and unauthenticated admin execution routes return 401

## Not Active Guidance

Historical snapshots, old launch checklists, previous crawler planning, and retired deployment notes are archived under `docs/archive/`. Do not use them as implementation guidance.
