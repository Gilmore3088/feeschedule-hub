# Outstanding Agentic Cleanup Tasks

This file tracks active work only. Historical launch, crawler, and deployment notes belong under `docs/archive/`.

## Goal

Make Fee Insight run through one visible agentic system:

1. Operator or cron creates an `agent_runs` record.
2. Work advances through `agent_run_steps`.
3. Every meaningful state change writes `agent_run_events`.
4. Provider usage and provider failures attach to `ai_api_usage_events`.
5. No active runtime, prompt, config, script, or current plan points at retired external launchers, Supabase Edge Function product endpoints, or local crawler tooling.

## Current Priorities

| Priority | Owner | Task | Done When |
|---|---|---|---|
| P1 | Rosetta | Add scanned-PDF OCR fallback | Image-only PDF rows move from `needs_ocr` to readable document text or explicit terminal failure. |
| P1 | Knox | Add bounded provider-assisted extraction fallback | Deterministic misses on readable documents get one metered fallback, with only anomalies sent to human review. |
| P1 | Darwin | Thin review pressure | Verification routes ordinary canonical rows forward and challenges only suspicious rows. |
| P1 | Hamilton | Publish data-quality summaries | Admin can distinguish no source, source fetched, PDF pending OCR, extracted, verified, and published. |
| P2 | Schema | Create fresh agentic schema baseline | Empty database can be built without recreating retired execution tables as active infrastructure. |
| P2 | Docs | Keep active docs current-only | `npm run guard:legacy` blocks stale active guidance and historical docs stay in archive. |

## Recently Shipped

| Owner | Shipped |
|---|---|
| Atlas | Visible run launch receipts plus pickup/stale status on `/admin/atlas/status`. |
| Magellan | Rescue/fetch batches rotate through retry windows instead of retrying the same failed rows. |
| Provider boundary | Recent Anthropic credit-balance failures block new calls before provider execution and record visible `blocked` usage events. |
| Rosetta | Readable HTML, text, and extractable PDF documents become `agent_document_texts`; scanned/image-only PDFs are explicitly marked `needs_ocr`. |
| Public runtime | Production proxy no longer serves the retired static prelaunch page over public App Router routes. |
| Runtime boundary | Local Supabase Edge Function source removed; `guard:legacy` now fails if a tracked Edge Function runtime returns. |
| Script artifacts | Unreferenced standalone `scripts/migrations/*.sql` files removed; canonical DB history remains under `supabase/migrations`. |

## Verification Gates

- `npm run guard:legacy`
- `npm run test:agentic`
- focused UI tests for agent launch receipts and live status
- `npm run build`
- production smoke: `/api/health` OK and unauthenticated admin execution routes return 401

## Not Active Guidance

Historical snapshots, old launch checklists, previous crawler planning, and retired deployment notes are archived under `docs/archive/`. Do not use them as implementation guidance.
