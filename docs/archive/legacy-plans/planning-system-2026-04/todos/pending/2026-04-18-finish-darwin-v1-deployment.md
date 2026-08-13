---
created: 2026-04-18T07:57:17.204Z
title: Finish Darwin v1 deployment
area: infrastructure
files:
  - src/app/admin/darwin/page.tsx
  - src/app/admin/darwin/actions.ts
  - fee_crawler/darwin_api.py
  - .env.example
---

## Problem

Darwin v1 code shipped to `main` (merged commit `2c333ac`) and the FastAPI sidecar is deployed to Modal at
`https://gilmore3088--bank-fee-index-workers-darwin-api.modal.run` (status endpoint returns
`pending=102,965`). But the `/admin/darwin` page is not yet reachable in production because:

1. `DARWIN_SIDECAR_URL` env var is not set on Vercel — without it, the server action throws.
2. `main` has not been pushed to `origin` — Vercel still serves the pre-Darwin build.

Until both of these happen, Darwin can't drain the 102,965-row `fees_raw` backlog into `fees_verified`,
which means Hamilton / reports still have no Tier-2 data to consume.

## Solution

Four steps:

1. **Vercel env var:** Settings → Environment Variables →
   `DARWIN_SIDECAR_URL=https://gilmore3088--bank-fee-index-workers-darwin-api.modal.run`
   in both Production and Preview environments.
2. **Push main:** `git push origin main` — triggers Vercel redeploy automatically.
3. **Smoke test:** Visit `/admin/darwin` on the deployed site; run a batch with size=100, chain=1.
   Verify `fees_verified` row count increases and `/admin/darwin` decision stream shows promoted rows.
4. **At-scale validation:** If smoke passes, queue a chain-10 run (10 × 500 = 5,000 rows) and watch
   for circuit breaker trips or cost anomalies. Full backlog drain will take ~30 chains.

Related context: `docs/superpowers/specs/2026-04-17-darwin-v1-design.md`,
`docs/superpowers/plans/2026-04-17-darwin-v1.md`, memory `project_darwin_v1.md`.
