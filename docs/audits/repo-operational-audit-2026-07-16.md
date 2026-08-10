# Bank Fee Index — Operational Audit

**Date:** 2026-07-16
**Scope:** Operational aspects of the whole repo — what it does, its goals, and its flaws, redundancies, duplicates, conflicts, and improvement opportunities.
**Method:** Read-only investigation across four surfaces (Next.js app, Python crawler, CI/testing, repo sprawl). No production changes made. Findings below were spot-verified against source.

> This audit supersedes and extends `docs/audits/repo-audit-2026-04-15.md`. Several P0/P1 items from that audit have been fixed (see §7); the highest-severity findings here are **new** and mostly concern security/auth, not the pipeline reliability that the April audit focused on.

---

## 1. What this repo is and does

Bank Fee Index (package name `fee-insight`, product also called "FeeSchedule Hub" in older docs — see naming conflict in §5) is a two-halves B2B/B2C platform:

1. **Python data pipeline** (`fee_crawler/`, ~245 files / ~50K LOC): discovers, downloads, and LLM-extracts fee schedules from ~4,000–8,750 financial institutions into Supabase Postgres. Runs as **Modal serverless cron workers**. Extraction uses Claude Haiku; a Gen-3 "agent platform" (Darwin/Knox/Magellan) does classification, adversarial review, and dead-URL rescue.
2. **Next.js 16 / React 19 app** (`src/`, 104 pages, 37 API routes, 30 server-action files): public marketing/data pages, a paywalled `/pro` tier (Stripe), an `/admin` operations console, and an AI research analyst ("Hamilton") that streams McKinsey-grade reports via the Vercel AI SDK.

**Goal:** be the authoritative source of bank/CU fee intelligence — accurate, complete, timely data plus consulting-grade analysis — monetized via $2,500/mo subscriptions, consulting, and consumer affiliates.

**Deployment reality:** Vercel (Next.js, `output: "standalone"`) + Supabase Postgres (transaction pooler, port 6543) + Modal (Python crons) + Cloudflare R2 (documents). Note: several docs still describe a **Fly.io + SQLite + Litestream** stack that no longer exists (§5).

---

## 2. Headline findings (ranked by severity)

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| H1 | **Critical** | Unauthenticated content-mutation server actions — anyone can create/update/**delete** published articles | `src/app/admin/research/articles/actions.ts` + byte-identical `src/app/admin/hamilton/research/articles/actions.ts` |
| H2 | **Critical** | Modal `ops_run` web endpoint runs `python -m fee_crawler <command> <args>` from POST body, no allowlist, no auth in handler | `fee_crawler/modal_app.py:905-915` |
| H3 | **High** | Admin layout renders children for logged-out users; ~13 data-bearing admin pages have no auth guard | `src/app/admin/layout.tsx:37-39` + pages listed in §3 |
| H4 | **High** | Watchlist IDOR — `addToWatchlist(userId, …)` trusts client-supplied `userId`, no `getCurrentUser()` | `src/app/pro/(hamilton)/monitor/actions.ts` |
| H5 | **High** | LLM cost breaker is **fail-open** (DB error → unlimited spend) and does **not** cover report generation ($5–10/run, triggerable by any logged-in user) or scout agents | `src/app/api/*/route.ts`, `src/lib/research/history.ts` |
| H6 | **High** | Main Python test workflow (`test.yml`) has been **red since ~2026-04-18** (38 fail / 12 error); TS test suite (40 files) **never runs in CI at all** | `.github/workflows/`, `.planning/todos/pending/` |
| H7 | **High** | Broken API-key rejection: `/api/v1/index` compares against an error string that's never returned, so invalid/revoked keys silently get **free-tier access**; `/api/v1/institutions` has no key check or rate limit | `src/app/api/v1/index/route.ts:12`, `.../institutions/route.ts` |
| H8 | Medium | `use_batch_api` flag is a no-op; the only Batch-API implementation is a dead, never-called worker → 50% cost discount unrealized and `daily_budget_usd` **not enforced on the live extraction path** | `fee_crawler/config.py:60`, `workers/llm_batch_worker.py` (0 callers) |
| H9 | Medium | Waitlist signups written to local filesystem (`data/waitlist.json`) — ephemeral/lost on Vercel & Docker redeploy | `src/app/waitlist/actions.ts:15` |
| H10 | Medium | Committed secrets/leaks: full `BFI_PREVIEW_TOKEN` in a doc; a known-leaked FRED API key still marked "rotate" and open | `docs/daily-summary-2026-03-15.md:245`, `docs/outstanding-tasks.md` |
| H11 | Medium | No failure alerting anywhere — Modal cron failures visible only via dashboard/admin page; no Slack/email/Sentry/PagerDuty | `fee_crawler/modal_app.py` |
| H12 | Medium | LISTEN/NOTIFY integration tests silently skip in **every** CI run — `DATABASE_URL_SESSION_TEST` set in no workflow, violating CLAUDE.md's own "MUST fail loudly" contract | `.github/workflows/*`, `test_session_pool.py`, `test_agent_messaging.py` |

---

## 3. Auth & security (Next.js)

**Mechanism (sound):** HMAC-SHA256-signed `fsh_session` cookie, 24h TTL, DB-backed sessions, timing-safe comparison (`src/lib/auth.ts`). Prod refuses to boot without `BFI_COOKIE_SECRET`. Stripe webhook is signature-verified, transactional, and idempotent (`ON CONFLICT` on a `stripe_events` table) — one of the better-built pieces. bcrypt passwords with a legacy-sha256 migration path.

**Holes:**
- **H1 — unauthenticated article mutations.** `saveArticle`/`updateArticleAction`/`deleteArticle` are `"use server"` actions (POST-invocable endpoints) with **no `getCurrentUser`/`requireAuth`**. Verified: the files import only `revalidatePath` and the DB layer. Present in **two byte-identical copies** (research + hamilton/research trees).
- **H3 — admin layout auth hole.** `admin/layout.tsx:37-39` returns `<>{children}</>` when `!user` (so `/admin/login` renders). Because there's **no `middleware.ts`**, protection depends on each page calling `requireAuth`. Pages that don't and still render data logged-out include: `admin/darwin`, `admin/coverage`, `admin/agents` (+ `replay`/`health`/`lineage`/`messages`), `admin/scout`, `admin/hamilton/reports`, `admin/review/categories/*`. (Note: `src/proxy.ts` does redirect `/admin/*` without a session cookie to login — so this is defense-in-depth failure, not necessarily live exposure; it becomes live the moment proxy routing changes or a page is reachable another way. Worth closing regardless.)
- **H4 — watchlist IDOR.** `addToWatchlist(userId, institutionId)` trusts the client's `userId`. Comment claims "no cross-user access possible"; the code contradicts it.
- `requireAuth("view")` is weak — `view` is granted to every role including `viewer` (`auth.ts:72-77`).
- API keys accepted via `?api_key=` query param (leak into logs/referrers).
- Dead, non-timing-safe `hashPassword`/`verifyPassword` still in `auth.ts:79-90` (unused; delete to prevent accidental reuse).
- **No zod env schema** despite CLAUDE.md claiming one — env access is ad-hoc `process.env` across ~20 files; missing vars fail at request time, not boot.
- Fully public unthrottled endpoints: `/api/leads` (DB write, spam + lead-overwrite vector), `/api/admin/job-health` (leaks internal job cadence despite the `admin` path), `(public)/api/locations` (DB query per keystroke, no limit).

**H2 — Modal command endpoint (Python).** `ops_run` (`modal_app.py:905`) is a `@modal.fastapi_endpoint(method="POST")` that spawns `ops_run_command(command, args, job_id)`, which runs `python3 -m fee_crawler <command> <args>` with `{**os.environ}` (full secret set). No command allowlist, no auth in the handler. `darwin_api.py`/`magellan_api.py` sidecars likewise state "No in-app auth." Modal `fastapi_endpoint`s are **public by default** unless `requires_proxy_auth=True` is set at deploy. **Action:** confirm proxy-auth is enabled on every Modal web endpoint; if not, this is unauthenticated RCE-adjacent surface. Also: the app's own outbound calls to Modal (`/api/extract`, `job-runner.ts`) carry **no auth header**, consistent with the endpoints being open.

---

## 4. Redundancies, duplicates & conflicts

### Code duplication
- **Cost/pricing tables copy-pasted 3×** (`DAILY_COST_LIMIT_CENTS`, per-token rates, `estimateCostCents`) across `api/research/hamilton`, `api/hamilton/chat`, `api/hamilton/simulate` — model price changes require three edits, and rates hardcode specific model IDs.
- **Three rate-limiter implementations**: DB-backed (`api-rate-limit.ts`, itself containing two near-identical functions), in-memory Map (`research/rate-limit.ts`), and a third inline copy in `api/institutions/route.ts`. The two in-memory ones **reset per cold start and are per-instance** → effectively unenforceable on Vercel.
- **Duplicated page trees**: `admin/research/*` vs `admin/hamilton/research/*`; two login implementations (`(auth)/login` vs `admin/login`).
- **Two parallel Python extraction stacks**, both live: `agents/extract_{pdf,html,js}.py` (state-agent path) vs `pipeline/extract_{pdf,html,llm}.py` (crawl-command path).
- **Duplicate circuit breakers**: `agents/darwin/circuit.py` (divergent, still imported by Darwin) vs `agents/_common/circuit.py` (the generalized successor Magellan uses).
- **Near copy-paste FastAPI sidecars**: `darwin_api.py` + `magellan_api.py` share ~130 lines (`_get_conn`, `_sse`, stream loop, `_reset_circuit`).
- `src/lib/admin-queries.ts` is a **1,949-line monolith** doing SQL work parallel to `crawler-db/`.

### Dead / unwired code
- `fee_crawler/workers/extraction_worker.py` — stub (`TODO: Implement in Phase 4`), 0 callers.
- `fee_crawler/workers/llm_batch_worker.py` — the **only** Batch-API + budget-enforcing implementation, **0 callers** (H8).
- `fee_crawler/workers/alert_sender.py` — Resend email digests, never scheduled/imported.
- `fee_crawler/pipeline/test_classify_document.py` — a test file misplaced in the production package.
- `fee_crawler/tests/e2e/` (10 files) — entirely `collect_ignore_glob`'d as "legacy SQLite-era."
- SQLite is dead (Phase 62a) but its **dialect lives on**: `db.py:61-111` regex-rewrites SQLite SQL to Postgres on **every query** because 37 CLI commands were never rewritten — including `INSERT OR REPLACE` → `ON CONFLICT DO NOTHING`, a **silent semantic change** (replace becomes ignore).

### Conflicting / dual sources of truth
1. **Fee taxonomy TS ↔ Python is hand-synced** (`src/lib/fee-taxonomy.ts` ↔ `fee_crawler/fee_analysis.py`), guarded only by hardcoded count tripwires (65/197) duplicated in both test suites — contents can drift undetected even when counts match.
2. **Four layered schema sources**: `scripts/migrate-schema.sql` + `fee_crawler/tests/hamilton_schema.sql` + `scripts/migrations/*.sql` (numeric scheme, gaps: 023/024/025/027/041/058) + `supabase/migrations/*.sql` (48 files, fictional date prefixes used as sequence numbers). A `20261231_reconcile_schema_drift.sql` exists specifically because the layers already diverged.
3. **Two migration application paths**: `scripts/apply-migration.mjs` (records into `schema_migrations`) vs 12 one-off `apply-*.mjs` scripts that hardcode file lists and **do not record** → tracking-table state and applied state diverge by design. `apply-drift.mjs` reads a hardcoded `/tmp/...sql` path and will fail on any fresh machine.
4. **"49 fee categories" is stale in live code** — actual is 65/197 — including the **public API surface** (`api/v1/openapi.json`, `proxy.ts:376`) and two skill files.
5. **Three product names**: "Bank Fee Index" (CLAUDE.md) / "FeeSchedule Hub" (PRD.md) / "fee-insight" (package.json); two domains (`feeinsight.com` / `bankfeeindex.com`).
6. **GSD commands don't exist.** CLAUDE.md mandates starting all work via `/gsd-quick`, `/gsd-debug`, `/gsd-execute-phase`, but `.claude/commands/` contains only `audit-fees.md`. The mandate is unenforceable for anyone but the owner.
7. **Skills overlap**: `audit-data` vs `data-quality-audit` do the same checks; only the latter is loaded by the app at runtime (`src/lib/research/skills.ts`), and `audit-data` references a nonexistent `scripts/audit-data.ts` and is SQLite-era stale.

---

## 5. Doc & repo sprawl

- **Five parallel planning systems**: `plans/` (63 files), `.planning/` (GSD tree, orphaned from its commands), `docs/superpowers/{plans,specs}/`, `docs/rebuild/` (whose `MASTER.md` claims "single source of truth", conflicting with `docs/database-schema.md`'s identical claim and with CLAUDE.md).
- **README.md is still the untouched create-next-app boilerplate** (flagged in the April audit; still not fixed).
- **`docs/outstanding-tasks.md` describes a stack that no longer exists** — Fly.io secrets, Litestream + SQLite backup — while reality is Vercel + Supabase.
- **83MB `Reports/`** committed: internal PDF iterations (`v4.2` and `v4.2.pdf` are **byte-identical**, 193,618 bytes each) plus two copyrighted third-party PDFs (52MB EXL study, 31MB Salesforce report) that arguably shouldn't be in git.
- **2.2MB `Hamilton-Design/`** design dumps, including `stub/` code that shadows real `src/` files and yet another SQL schema.
- **Committed stale code copies**: `.claude/worktrees/agent-a91a83db/` has 6 old `fee_crawler` files, of which `__main__.py`/`config.py`/`config.yaml` now **differ** from production. `.gitignore` covers `.worktrees/` but not `.claude/worktrees/`.
- **Committed cruft**: `_run_il_3x.log` (395KB nohup log), `.superpowers/.../state/server.{log,pid}`, personal session memory at `.claude/projects/-Users-jgmbp-Desktop-.../memory/`, root strays `_run_il_3x.py` / `_run_states.py` / `_run_states_original.py` (superseded by the `wave/` orchestrator), a misfiled `plans/instiution page/` directory (typo + space, no extension), `.impeccable.md` duplicating CLAUDE.md's Design Context.
- **`.gitignore` gaps**: no `*.log`, no `*.pid`, no `.superpowers/` state, no `.claude/worktrees/` — which is why the above got committed.
- Git pack is 87.8MB, dominated by `Reports/`.

---

## 6. CI / testing (weakest operational area)

- **TS tests never run in CI.** No `test` script in `package.json` (only `dev/build/start/lint`); no workflow invokes vitest, tsc, or eslint. **All 40 TS test files are dead weight in CI** — zero automated coverage of the Next.js layer, including the Hamilton citation gate and report engine the product's accuracy constraint depends on.
- **`test.yml` red since ~2026-04-18** (per open todo `2026-04-19-phase-62-test-suite-has-38-failures.md`): 38 fail / 12 error — asyncpg jsonb codec, unquoted SQL reserved word `window`, int/str ID drift, NOT NULL fixture gaps, FK/check-constraint mismatches. Partially addressed since, but no evidence the suite is green.
- **`test.yml` vs `unit-tests.yml` redundant**: both fire on every PR + main push. `unit-tests.yml` sets no `DATABASE_URL_TEST`, so its DB tests all skip — it's a mostly-skipping subset of `test.yml`. Two never-consolidated CI generations.
- **`e2e-tests.yml` tests nothing** — points at the `collect_ignore_glob`'d legacy e2e suite, so it collects zero tests (red) or errors on the removed `test_db` fixture.
- **H12** — LISTEN/NOTIFY tests silently skip everywhere (`DATABASE_URL_SESSION_TEST` unset in all workflows).
- **No Python lint/typecheck** (no ruff/mypy/flake8 config anywhere) and **no `tsc --noEmit`** in CI. Only static guards are the sqlite-kill grep and the pydantic→TS codegen drift check.
- **No Docker build in CI**; image only exercised by whatever deploys it (Vercel path doesn't use the Dockerfile).
- **Three open reliability todos** from the 2026-04-19 CI triage remain in `.planning/todos/pending/`: red test suite (above); daily-pipeline 06:00 window-miss with no catch-up (silently skipped 2026-04-19); Modal scrape crons leak `status='running'` rows on crash (18 orphaned rows accumulated), which makes `/admin/pipeline` freshness look healthy and **suppresses stale-job banners**.
- Reliability positives: `rls-blast-radius.md` documents RLS enabled on 55 tables with **zero policies** — ~15 SELECT policies needed before any public API exposure.

---

## 7. What's already been fixed since the April audit (credit where due)

- Modal subprocess failures now raise (`run_checked` / `SubprocessFailed` with stdout/stderr tails) — April P0 Finding 1 resolved.
- SQLite fully retired (Phase 62a), with a CI grep guard — April P0 Finding 2 addressed (though the SQL-dialect translation shim remains, §4).
- FFIEC scaling contract restored (`_apply_ffiec_scaling`, aligned with migration 023 + tests) — April P1 Finding 5 resolved.
- `workers_last_run` markers retrofitted into 4 previously-silent crons (commit `66e7f94`) — the `/admin/pipeline` "never completed" false-alarm fixed.
- Async connection pooling is careful and correct: transaction pool with `statement_cache_size=0` for Supavisor, separate session pool for LISTEN/NOTIFY with reconnect backoff.
- Gen-3 agents have real budget enforcement (`agent_tools/budget.py`, per-agent kill-switch env vars) and rate-limit retry (`Darwin.classify_names_with_retry`) — this is the model the legacy extraction path should copy.

**Still open from April:** report-jobs can stay `pending` forever when the Modal trigger fails (`api/reports/generate/route.ts` still only logs on trigger failure, never marks the job `failed`); CI vs Modal dependency drift partially fixed but root `requirements.txt` still diverges and `fee_crawler/requirements.txt` has duplicate conflicting pins (`asyncpg>=0.29` **and** `>=0.31`; `httpx>=0.27` twice); README still boilerplate; monthly-pulse env-var inconsistency.

---

## 8. Recommended remediation order

**Now (security — do before any wider launch):**
1. Add `getCurrentUser()` + admin-role check to both `articles/actions.ts` files (H1). Then de-duplicate the two trees.
2. Confirm Modal `requires_proxy_auth=True` on `ops_run` and all sidecar endpoints; add an app→Modal shared-secret header (H2).
3. Fix the watchlist IDOR — derive `userId` from the session, not the client (H4).
4. Add auth to the ~13 unguarded admin pages, or introduce a `middleware.ts` that guards `/admin/*` and `/api/admin/*` centrally (H3).
5. Fix `/api/v1/index` key comparison and add key check + rate limit to `/api/v1/institutions` (H7).
6. Make the LLM cost breaker fail-**closed**, and put report generation + scout agents behind it with a role check on `/api/reports/generate` (H5).
7. Rotate the FRED key; purge `BFI_PREVIEW_TOKEN` and Stripe test prefixes from `docs/`; `git rm` personal session-memory and `.claude/worktrees/` (H10).

**Next (reliability):**
8. Get `test.yml` green; add a `test` script + vitest + `tsc --noEmit` + eslint to CI; set `DATABASE_URL_SESSION_TEST` (H6, H12).
9. Wire the 3 open reliability todos (window-miss catch-up, running-row reaper, red suite).
10. Add failure alerting (Sentry already a dependency per CLAUDE.md — wire Modal cron failures + report-job failures to it) (H11).
11. Move waitlist to Postgres (H9). Mark failed report jobs `failed` on Modal trigger failure.

**Then (spend / hygiene):**
12. Either wire `llm_batch_worker` or delete it and stop advertising batch discounts; enforce `daily_budget_usd` on the live extraction path; add rate-limit retry to `pipeline/extract_llm.py` (H8).
13. Centralize the 3× cost tables and 3 rate-limiter implementations.
14. Collapse the four schema sources to one authority; make all migrations record into `schema_migrations`; delete the one-off `apply-*.mjs` scripts.
15. Fix "49 categories" everywhere (esp. public OpenAPI); add a taxonomy TS↔Python content-diff check, not just a count check.
16. Repo slimming: move `Reports/` and `Hamilton-Design/` out of git (or to LFS/external storage); delete root `_run_*` strays + `.log`; fix `.gitignore` (`*.log`, `*.pid`, `.claude/worktrees/`, `.superpowers/`); pick one product name; rewrite README; retire the stale Fly.io/SQLite docs.
17. Reconcile the GSD-command mandate in CLAUDE.md with the reality that the commands aren't in the repo.

---

## 9. Overall assessment

The **app and data model are substantially built** — Stripe billing, session auth, async pooling, agent budgets, and the Gen-3 agent platform are real, careful engineering. The problems are operational, and they cluster in three bands:

- **Security is the new top risk.** The April audit was a pipeline-reliability pass; since then the app surface grew faster than its auth. Unauthenticated mutation actions, an open command endpoint, and a fail-open spend breaker are launch-blockers, not cleanup items.
- **CI provides far less assurance than it appears to.** A red main suite, an entirely un-run TS suite, and a nightly e2e job that tests nothing mean "green-ish CI" is not evidence the system works.
- **The repo has accumulated three generations of everything** — planning systems, extraction stacks, migration appliers, schema authorities, agent frameworks — without retiring the old ones. Most "flaws" here are un-deleted history, and the single highest-leverage cleanup is choosing one authority per concern and deleting the rest.

None of this is unfixable; it needs a security-and-consolidation pass, sequenced as in §8, rather than generic cleanup.
