---
status: investigating
trigger: "Still getting failures for every Vercel thing, roughly one every hour"
created: 2026-04-18T00:00:00Z
updated: 2026-04-18T01:00:00Z
---

## Current Focus

hypothesis: Hourly failure cadence is NOT a rebuild — it is a runtime invocation that fires on the hour. The strongest candidate on the record is the pg_cron `agent-review-darwin` job, which fires `'0 * * * *'`. It inserts a row into `agent_events` (not a Vercel call), but its downstream effects may surface on Vercel if pg_cron sends a webhook or if something else is firing hourly.
test: Enumerate every `0 * * * *` schedule in the repo and trace what each one does.
expecting: A specific job that either calls a Vercel endpoint or causes Vercel to log an error on the hour.
next_action: Report findings — user must correlate against Vercel dashboard to confirm.

## Symptoms

expected: Push 3d35503 -> green Vercel deploy, no module-not-found, no Function runtime errors.
actual: "Still getting failures for every Vercel thing, roughly one every hour"
errors: User did not paste specific error messages.
reproduction: UAT Test 1 — Phase 62B UAT; user observes hourly failure notifications.
started: After Phase 62B merged (~2026-04-17). Note: HEAD is now 0cf412d — 22 commits past 3d35503. Several new Vercel-touching pieces shipped after 3d35503: job-runner rewire to Modal (9752c46), Darwin UI (multiple), Magellan coverage UI (multiple). The real cause may have landed after 3d35503.

## Eliminated

- hypothesis: Hourly Vercel Cron Job is firing and failing at runtime.
  evidence: No `vercel.json` exists in repo root. No `src/app/api/cron/**` directory. No Next.js route handlers declare a Vercel cron. Vercel Cron is not configured at all.
  timestamp: 2026-04-18T00:30:00Z

- hypothesis: GitHub Actions fires hourly and hits Vercel.
  evidence: Only 3 workflows: `unit-tests.yml` (push/PR only), `test.yml` (push/PR only), `e2e-tests.yml` (cron `'0 2 * * *'` nightly + `'0 4 * * 0'` weekly). None are hourly. None touch Vercel endpoints.
  timestamp: 2026-04-18T00:35:00Z

- hypothesis: Modal scheduled job fires hourly.
  evidence: All Modal schedules in `fee_crawler/modal_app.py` are `0 2 * * *` (discovery), `0 3 * * *` (pdf), `0 4 * * *` (browser), `* * * * *` (every-minute post-processing), `0 10 * * *` (ingest_data). NONE are hourly. The every-minute tick calls `dispatch_ticks()` which talks to Postgres, not Vercel.
  timestamp: 2026-04-18T00:40:00Z

- hypothesis: Vercel builds rebuilding hourly via deploy hook.
  evidence: Recent commit timestamps are bursty (02:00-02:34 AM, 07:30-08:48 AM) — not hourly. No deploy hook reference in repo.
  timestamp: 2026-04-18T00:45:00Z

- hypothesis: ISR revalidate=3600 page is the failure source.
  evidence: `src/app/(public)/reports/page.tsx:12` and `src/app/(public)/reports/[slug]/page.tsx:17` both set `revalidate = 3600`. BUT: Next.js ISR revalidates on-demand (first visitor after cache expires), NOT on a timer. These pages would only re-render hourly if traffic is steady. Both wrap their DB calls in try/catch so they render empty instead of 500-ing. Unlikely to be source of hourly failure alerts. RETAIN as secondary hypothesis — if traffic is steady and one of these pages DOES throw past the try/catch, it would error approximately hourly.
  timestamp: 2026-04-18T00:50:00Z

## Evidence

- timestamp: 2026-04-18T00:00:00Z
  checked: git HEAD and commits since 3d35503
  found: HEAD is 0cf412d, 22 commits past 3d35503. Many commits after the merge: Magellan coverage UI, Darwin UI, job-runner rewire.
  implication: The failure may actually be caused by a post-3d35503 commit. Most suspicious: `9752c46 feat(ops): rewire job-runner to Modal web endpoint` — replaces `child_process.spawn` (which never worked on Vercel). Vercel function logs pre-3d35503 may have included "ENOENT: python" errors that are now replaced by "Modal ops_run failed: <status>" errors if `OPS_RUN_URL` is unreachable.

- timestamp: 2026-04-18T00:30:00Z
  checked: vercel.json and src/app/api/cron/** existence
  found: Neither exists. No Vercel Cron Jobs are configured.
  implication: Hourly cadence is NOT a Vercel-native cron.

- timestamp: 2026-04-18T00:45:00Z
  checked: GitHub workflow cron schedules
  found: e2e-tests.yml has `'0 2 * * *'` (nightly fast) and `'0 4 * * 0'` (weekly full). unit-tests.yml and test.yml fire on push/PR only.
  implication: No hourly GitHub Action. Hourly cadence is NOT from GitHub Actions.

- timestamp: 2026-04-18T00:50:00Z
  checked: fee_crawler/modal_app.py Modal schedules
  found: `0 2 * * *`, `0 3 * * *`, `0 4 * * *`, `* * * * *`, `0 10 * * *`. No `0 * * * *`.
  implication: No hourly Modal cron. Hourly cadence is NOT from Modal.

- timestamp: 2026-04-18T00:55:00Z
  checked: supabase/migrations/20260502_agent_registry_lifecycle_state.sql + supabase/migrations/20260511_pg_cron_review_dispatcher.sql
  found: `UPDATE agent_registry SET review_schedule = '0 * * * *' WHERE agent_name = 'darwin';` — darwin review ticks are seeded HOURLY in Postgres. Other schedules: knox `*/15 * * * *` (every 15 min), state_agent `0 */4 * * *` (every 4 hours). The 62B-08 pg_cron migration creates one `cron.schedule('agent-review-<agent_name>', review_schedule, 'INSERT INTO agent_events ...')` per active agent.
  implication: Found the ONLY hourly schedule in the entire repo. But this schedule inserts a row into `agent_events` (DB only) — it does not call Vercel directly.

- timestamp: 2026-04-18T01:00:00Z
  checked: fee_crawler/agent_base/dispatcher.py — what happens when the hourly darwin review_tick is picked up by the Modal every-minute dispatcher
  found: `AGENT_CLASSES: dict = {}` is EMPTY. When `dispatch_ticks()` processes a review_tick for `agent_name='darwin'`, the `info = AGENT_CLASSES.get(agent_name)` returns None, and the code calls `_mark_error(event_id, created_at, f"no agent class registered for {agent_name}")`, incrementing `stats["errors"]`.
  implication: The hourly darwin review_tick (and every-15-min knox review_tick, every-4-hours state_agent review_tick) fires in Postgres, gets picked up by Modal within 1 minute, and is marked 'error' because no Python agent class is registered. These errors land in Modal logs and the `agent_events.output_payload` column — NOT in Vercel logs. However, the UI at `/admin/agents` reads these events and may surface them. This is a red herring for the "Vercel failures" claim but an important parallel bug.

- timestamp: 2026-04-18T01:05:00Z
  checked: pending todos and deployment state
  found: `.planning/todos/pending/2026-04-18-finish-darwin-v1-deployment.md` says `DARWIN_SIDECAR_URL` is NOT set on Vercel. `.env.example` lists three new env vars added post-3d35503: `DARWIN_SIDECAR_URL`, `MAGELLAN_SIDECAR_URL`, `OPS_RUN_URL`. The code at `src/app/admin/coverage/actions.ts:15` throws "MAGELLAN_SIDECAR_URL not set" if unset. `src/app/api/admin/darwin/stream/route.ts:12` returns 500 "sidecar not configured" if `DARWIN_SIDECAR_URL` unset.
  implication: If a client-side polling loop (`src/app/admin/coverage/components/magellan-console.tsx:63` — `setInterval(refresh, 10_000)` every 10s, `src/app/admin/darwin/components/darwin-console.tsx:101` — same, `budget-gauge.tsx:22`) is active in any open tab, it will spam 500s to Vercel. That would look like MANY failures per hour, not one per hour.

- timestamp: 2026-04-18T01:10:00Z
  checked: src/app/api/extract/route.ts
  found: Still uses `import { spawn } from "child_process"` (line 2) — runs `python -c "..."` subprocess on Vercel. Vercel has no Python and a read-only filesystem — this endpoint is guaranteed to 500 when called. Commit 9752c46 rewired `/admin/ops` job-runner away from child_process but left `/api/extract` broken.
  implication: If `/api/extract` is called (e.g., by a user clicking "extract" on an institution page), it will fail on Vercel. Not inherently hourly, but a latent landmine.

- timestamp: 2026-04-18T01:15:00Z
  checked: Vercel ISR pages (export const revalidate)
  found: Two pages at revalidate = 3600: `/reports` and `/reports/[slug]`. Both wrap their DB calls in try/catch and render empty state on failure. `/hamilton` at revalidate = 86400 (daily).
  implication: If public traffic is steady, these pages re-render roughly hourly. They swallow DB errors, so they should not 500. HOWEVER if `generateMetadata` for `/reports/[slug]` throws (DB error outside try/catch would surface) Vercel logs a runtime error each time the cache expires and a visitor hits the page. This could appear as ~hourly failures per trafficked slug.

## Resolution

root_cause: INCONCLUSIVE. No hourly trigger in the repo targets a Vercel endpoint directly. The only `'0 * * * *'` schedule is pg_cron's darwin review_tick (Postgres-side, does not call Vercel). Without access to Vercel's function logs, deployment logs, or notification stream, the specific hourly failure cannot be identified. Prioritized hypotheses for user to confirm via Vercel dashboard:
  1. Vercel email notifications for failed DEPLOYMENTS — the user pushed 22 commits in bursts; Vercel may be retrying failed builds with exponential/hourly backoff, OR the user's perception of "hourly" is actually bursty-push-triggered failures.
  2. ISR revalidation of `/reports/[slug]` (revalidate=3600) errors in `generateMetadata` for a specific slug that receives steady traffic. DB error in generateMetadata is NOT wrapped in try/catch for the metadata path beyond the fetchReport function.
  3. Client-side polling loops in `/admin/coverage` or `/admin/darwin` (10-second setInterval) hitting a 500 because `MAGELLAN_SIDECAR_URL` / `DARWIN_SIDECAR_URL` are unset on Vercel. One admin tab open for an hour = 360 failures/hour, not ~1/hour, BUT if an admin tab is only opened briefly once an hour, the cadence would match.
  4. External uptime monitor (Pingdom, UptimeRobot, BetterStack) configured outside the repo — hitting a broken route hourly. Not discoverable from repo code.
  5. `/api/extract` still uses child_process.spawn — latent landmine. Not inherently hourly.

fix: (not applied — find_root_cause_only mode)
verification: (pending user confirmation from Vercel dashboard)
files_changed: []
