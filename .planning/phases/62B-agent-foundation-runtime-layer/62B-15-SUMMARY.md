---
phase: 62B
plan: 15
status: closed_not_reproduced
closed_at: 2026-04-18T19:00:00Z
closed_reason: "Failure not reproducible in this project's logs. User suspects failure emails may originate from a different Vercel project."
---

# 62B-15 Summary — Vercel Hourly Failure Triage (CLOSED, not reproduced)

## Resolution

Plan closed without applying any code changes. The failure signal could not be reproduced in this project's Vercel logs.

## Evidence

Two CSV exports were pulled from Vercel Observability:

- `feeschedule-hub-log-export-2026-04-18T18-55-50.csv` (157 rows, 29-minute window 18:26–18:55 UTC)
- `feeschedule-hub-log-export-2026-04-18T18-57-57.csv` (identical export, 2 minutes later)

**Findings:**
- 146 responses with status 200, 10 with status 304, **zero with 4xx or 5xx**
- 60 hits on `/admin/coverage` in 29 minutes (consistent with active admin tab + 10s Magellan poller) — all 200 responses, eliminating the primary hypothesis (unset `MAGELLAN_SIDECAR_URL`) from `.planning/debug/vercel-hourly-failures.md`
- No function errors, no timeouts, no memory issues
- Institution pages returning in 60–90ms (healthy)

## Hypothesis Space After Evidence Review

Debugger's original 5 hypotheses (see `.planning/debug/vercel-hourly-failures.md`):

| # | Hypothesis | Status after log review |
|---|------------|-------------------------|
| 1 | Perception artifact — bursty commits triggering many deploy-failure emails misread as "hourly" | Still plausible — not disproven |
| 2 | `MAGELLAN_SIDECAR_URL` / `DARWIN_SIDECAR_URL` unset → admin pollers 500 | **DISPROVEN** — 60 `/admin/coverage` hits returned 200 |
| 3 | ISR regeneration on `/reports/[slug]` (revalidate=3600) erroring hourly | No `/reports/*` hits observed in 29-min window; inconclusive (low-traffic path) |
| 4 | External uptime monitor hitting broken endpoint | No suspect User-Agent strings or unusual paths observed |
| 5 | `child_process.spawn` in `/api/extract/route.ts` | No `/api/extract` hits in window; latent landmine only triggered on manual invocation |

**User re-framed the problem:** "maybe its another vercal instance." If failure emails originate from a separate Vercel project (earlier experiment, staging deploy, or stale brand-rename deploy), this project's logs would correctly show zero errors while the user's inbox still filled up.

## Action Taken

- No source files modified
- No commits beyond this SUMMARY
- UAT gap 1 updated to `status: not_reproduced` with the above evidence

## Recommended Next Steps (for user, not this plan)

1. Check **Vercel Dashboard → All Projects** for other projects that might be sending the failure emails (look for an old `feeschedule-hub-*` deploy, a renamed project, or a staging URL)
2. Check Vercel email notification settings — which project is configured to email on failure?
3. If the emails stop on their own over the next 24h, the problem was bursty-commit-related (hypothesis 1) and is already resolved
4. If failures persist and we can identify the source project, revisit triage with logs from THAT project

## Re-open Criteria

Re-open 62B-15 (or create a fresh plan) if:
- User identifies which Vercel project is actually failing
- A concrete 5xx event is captured from THIS project's logs
- The hourly cadence continues past 2026-04-25 (one week)
