# Modal / Cron Outage Audit

Date: 2026-08-10  
Repository: `feeschedule-hub`  
Purpose: current-state handoff for cron, Modal, and report-job failures

## Executive Summary

The Modal scheduler was not down.

The outage on August 9-10, 2026 was a combination of:

1. stale production worker deploys
2. masked report-job trigger failures
3. a production web deploy path that was failing remotely but succeeded locally
4. a drifted Vercel `DATABASE_URL` that no longer matched the working Modal credential

As of this handoff update:

1. Modal workers have been redeployed.
2. Modal preflight has been redeployed and passes.
3. Vercel production has been redeployed successfully.
4. Vercel production `DATABASE_URL` has been rotated to the working Modal value.
5. `https://feeinsight.com/api/health` is back to `{"status":"ok", ...}`.

## Confirmed Live Facts

### Modal worker deployment is current again

- Current deployed app: `bank-fee-index-workers`
- Current worker version: `v36`
- Redeployed: **2026-08-09 21:20 PDT**

The stale `v34` deployment from **2026-06-06 17:47 PDT** has been superseded.

### Modal cron infrastructure is active

Live Modal logs on **2026-08-10** show the dispatcher firing. The problem is not “cron never runs”; the problem is “jobs start and then fail inside the running system.”

### Local database credentials are repaired on this machine

A direct database check using the original local `DATABASE_URL` failed on **2026-08-10** with password authentication failure for user `postgres`.

That local drift has since been corrected by updating `.env.local` to the same working `DATABASE_URL` used by the live Modal workers and Vercel production deployment. Direct local verification now works again from this checkout.

### Vercel production web deploy is current again

- Latest production deployment: `dpl_5pTbUJEzE89qs8gHb2uXeuew8wpN`
- Public alias live: `https://feeinsight.com`
- Deployment status: `Ready`
- Deployed: **2026-08-09 21:40 PDT**

### Vercel production health endpoint is healthy again

Validated on **2026-08-10 04:41 UTC**:

```json
{"status":"ok","fee_count":"124246","timestamp":"2026-08-10T04:41:43.664Z"}
```

## Reproduced Production Failure Classes

### 1. Stale Modal deployment

The repo already contains fixes for:

- subprocess failures in Modal cron jobs
- `workers_last_run` markers for crawler jobs
- `monthly_pulse` URL/env consistency
- CI using `fee_crawler/requirements.txt`

That was true before remediation. The worker app has now been redeployed on **2026-08-09**.

### 2. Live database/schema drift

Recent Modal logs show live failures including:

- missing table: `hamilton_digest_subscriptions`
- missing column: `responded_at`
- check-constraint failure on `agent_events_status_check`
- foreign-key failure on `agent_lessons_agent_name_fkey` for agent name `discoverer`

These are not scheduler failures. They are live schema/data-contract failures inside scheduled work.

### 3. Transaction-pooler asyncpg failures

Live logs also show asyncpg prepared-statement errors such as:

- `DuplicatePreparedStatementError`
- `InvalidSQLStatementNameError`

The repo already documents that Supabase transaction pooling requires `statement_cache_size=0`, but some remaining direct `asyncpg.connect(...)` call sites were still using the default behavior.

### 4. Ghost `pending` report jobs

The report-generation path inserted `report_jobs` rows as `pending`, then launched Modal asynchronously. If `MODAL_REPORT_URL` was missing, the fetch threw, or Modal returned non-200, the code logged the issue but did not transition the job to `failed`.

Result: dead jobs could sit in `pending` forever.

### 5. False-red admin cron health

`/admin/pipeline` job freshness logic still treated:

- `run_discovery`
- `run_pdf_extraction`
- `run_browser_extraction`

as `crawl_runs`-backed, even though `modal_app.py` now writes `workers_last_run` markers for all three.

Result: the dashboard could claim jobs were stale or ambiguous even when marker writes were the real source of truth.

## Code Fixes Applied In This Checkout

These changes are now present locally but are not live until deployed:

### Report trigger failure handling

Files:

- `src/app/api/reports/generate/route.ts`
- `src/app/admin/hamilton/actions.ts`

Changes:

- mark report jobs `failed` on every Modal trigger failure path
- return `503` immediately when `MODAL_REPORT_URL` is missing
- mark retry jobs `failed` if retry trigger launch fails
- stop creating silent ghost jobs that remain `pending` forever

### Admin cron health source-of-truth fix

File:

- `src/lib/admin-queries.ts`

Changes:

- switch `run_discovery`, `run_pdf_extraction`, and `run_browser_extraction` freshness checks to `workers_last_run`
- remove obsolete shared `crawl_runs` freshness fallback for those jobs

### asyncpg / Supabase transaction-pool fix

Files:

- `fee_crawler/modal_app.py`
- `fee_crawler/agent_base/agent_adapters.py`
- `fee_crawler/commands/darwin_drain.py`

Changes:

- disable asyncpg prepared statement caching on the remaining direct connection paths by setting `statement_cache_size=0`

### Vercel deploy-path hardening

File:

- `.vercelignore`

Changes:

- exclude local build/install artifacts such as `node_modules` and `.next`
- reduce deployment payload
- stop pushing local machine artifacts into Vercel production deploys

### Vercel production credential reconciliation

Changes:

- compared the working Modal `DATABASE_URL` and the broken Vercel `DATABASE_URL` by hash
- confirmed they targeted the same Supabase pooler but used different full credentials
- rotated Vercel production `DATABASE_URL` to the known-good Modal value
- redeployed production after the rotation

### Local credential reconciliation

Changes:

- updated local `.env.local` `DATABASE_URL` to the same working value used by Modal and Vercel production
- revalidated direct local database access after the update

### Agent registry seed + preflight hardening

Files:

- `supabase/migrations/20260810_seed_scout_agents.sql`
- `fee_crawler/modal_preflight.py`

Changes:

- seed `validator`, `discoverer`, `ai_scout`, and `reporter` into `agent_registry`
- widen Modal preflight to check crawler/report tables, `workers_last_run`, `report_jobs`, and required agent identities
- make preflight fail early on missing runtime schema instead of reporting a narrower false-green

## Validation Run After Local Fixes

Validated successfully on **2026-08-10**:

- `npx eslint src/app/api/reports/generate/route.ts src/app/admin/hamilton/actions.ts src/lib/admin-queries.ts`
- `python -m py_compile fee_crawler/modal_app.py fee_crawler/agent_base/agent_adapters.py`
- `python -m py_compile fee_crawler/commands/darwin_drain.py fee_crawler/modal_preflight.py`
- `modal run fee_crawler/modal_app.py::test_connection`
- `modal run fee_crawler/modal_preflight.py::run_preflight`
- `curl -sS https://feeinsight.com/api/health`
- direct local query against `extracted_fees` using the repaired `.env.local`

## What Still Requires Follow-Up

### 1. Reconcile production schema/migrations

Required because live logs indicate schema drift in agent-related tables/columns and constraint expectations.

### 2. Propagate the repaired database credential anywhere else it drifted

The original local `DATABASE_URL` did not authenticate on **2026-08-10**. This machine is fixed now, but any other developer machines or external runbooks that copied the stale credential should be updated too.

### 3. Investigate non-fatal Hamilton build-time API errors

Local and prebuilt production builds completed, but they logged a non-fatal message during static generation:

- `[Hamilton] Thesis generation failed { errorType: 'api_error', scope: 'monthly_pulse' }`

That did not block deployment, but it should be investigated separately.

## Recommended Follow-Up Order

1. Reconcile any remaining production schema drift indicated by live logs.
2. Re-check Modal logs after the new worker deploy has had time to run scheduled cycles.
3. Verify that new report trigger failures now land in `failed` rather than staying `pending`.
4. Propagate the repaired database credential to any other stale environments or runbooks.
5. Investigate the non-fatal Hamilton monthly-pulse API error separately from the cron outage.

## Bottom Line

The problem was not “Modal cron is not firing.”

The evidence now supports this final state:

- Modal scheduling is alive.
- Modal workers and preflight are redeployed and current.
- Vercel production is redeployed and live.
- Vercel production database auth has been repaired.
- Local database auth on this machine has been repaired.
- `feeinsight.com` and `feeinsight.com/api/health` are back up.

The remaining work is narrower now:

- clean up any residual schema drift still visible in worker logs
- propagate the repaired credential to any other stale environments
- monitor scheduled runs on the fresh deploys
