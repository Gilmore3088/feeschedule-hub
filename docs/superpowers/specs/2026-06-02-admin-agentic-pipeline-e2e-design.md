# Admin Agentic-Pipeline E2E Smoke Test — Design

**Date:** 2026-06-02
**Status:** Approved (design); pending spec review
**Author:** pairing session

## Purpose

Verify, end to end, that an operator can drive the **agentic data-acquisition
pipeline** from the admin UI of the live deployment and that the run is
accepted and actually executes. This replaces the deleted SQLite-era
`fee_crawler/tests/e2e/` suite with a Playwright test against the real stack.

This is a **real, on-demand smoke test** (explicit user choice): it runs against
the deployed app + real Modal + real Supabase, costs Modal/Anthropic time, and
writes to the live DB. It is **not** wired into CI.

## Scope

**In scope**
- One Playwright spec: log in as admin → Command Center → trigger the agentic
  orchestrator ("Run Atlas for one state") → assert the run is accepted and
  reports execution.
- Minimal Playwright harness (config, auth fixture, one npm script).

**Out of scope**
- The legacy `crawl`/`discover` CLI ops path (different from the agentic pipeline).
- The review→approve→publish flow and the per-agent consoles (Darwin/Magellan)
  as their own tests.
- CI integration, cross-browser, visual regression.
- Fixing the pre-existing prod risks this test may surface (tracked separately).

## Chosen approach

**Approach A — drive the full agentic orchestrator via the Command Center.**

The deployed Command Center (`/admin/command`) exposes "Run Atlas for one state"
(`controls.tsx`), which calls the `triggerAtlasForState(state, size)` server
action → `callModalEndpoint("atlas_dispatch", …)`. `atlas_dispatch` runs the
agent fleet (discover → extract → classify) for the chosen state. This is the
truest "admin gets data the agentic way" and exercises the auth + Modal-wiring
path.

(The `local()` python-subprocess triggers — stats / run-cron — only work in a
dev server with repo + Python on disk, never on Vercel, so they are not usable
for a deployed smoke test.)

### Assertion strategy

A *real* agentic run can legitimately produce **zero new fees** (targets already
crawled, no new URLs). So a fee-count delta is **not** a reliable pass/fail.

- **Hard assertion (the gate):** the trigger is accepted and reports execution —
  the Command Center result panel for the Atlas action resolves to `ok`, NOT an
  auth error or a "BFI_MODAL_WORKERS_BASE_URL not set" config error; and within
  the timeout a fresh agentic-activity signal appears in the admin UI (a new
  `agent_events` success row / updated activity for this run).
- **Soft signal (logged, not gating):** any increase in `fees_raw` / `fees_verified`
  tile counts (or `/api/v1/index` counts) is captured in the test output as
  supporting evidence, but does not fail the test if zero.

## Architecture / components

Each piece has one job and a clear interface.

### 1. Playwright harness
- Add dev deps: `@playwright/test` + chromium browser.
- `playwright.config.ts`:
  - `use.baseURL` = `process.env.BFI_E2E_URL ?? "https://bankfeeindex.com"`.
  - one `chromium` project; `testDir: "tests/e2e"`.
  - long timeouts: `timeout` ~10 min, `expect.timeout` generous; `retries: 0`.
  - **no** `webServer` block (targets the remote deploy).
- `package.json` script: `"test:e2e": "playwright test"`.

### 2. Auth fixture (`tests/e2e/fixtures/auth.ts` + a setup project)
- A setup spec logs in **once** via the real admin login page
  (`/admin/login`) using `BFI_ADMIN_PASSWORD` from env (never hardcoded; the test
  fails fast with a clear message if the env var is missing).
- Saves `storageState` (the signed session cookie) to a gitignored path; the
  main spec consumes it. This also smoke-tests login itself.

### 3. The spec (`tests/e2e/admin-agentic-pipeline.spec.ts`)
1. **Baseline:** load `/admin/command`; capture the tier-tile counts
   (`fees_raw`, `fees_verified`) and the most-recent `agent_events` timestamp
   shown on the page.
2. **Trigger:** in "Run Atlas for one state", set a **small** `size` (e.g. 1–5)
   and a chosen state code, click the Run Atlas button.
3. **Hard assert:** the Atlas result panel resolves to `ok`. If it shows an auth
   denial or the Modal-config error, fail with that exact text (this is the test
   doing its job — surfacing a broken flow).
4. **Poll** (reload `/admin/command` up to the timeout) for a fresh agentic
   success signal (new `agent_events` success row / activity for this run).
5. **Soft signal:** compute and **log** any tile-count delta vs baseline.

### 4. Safety / bounding
- Smallest scope: one state, minimal `size`, to bound Modal/Anthropic cost and
  live-DB mutation (accepted).
- On-demand only; requires `BFI_ADMIN_PASSWORD` and (optionally) `BFI_E2E_URL`
  in env. Documented in a short `tests/e2e/README.md`.
- No secrets in the repo; `storageState` artifact gitignored.

## Risks this test will surface (report cleanly, never hang)

These are pre-existing production risks the smoke test is *designed* to catch; if
present, the test fails with a clear message rather than hanging:

1. **`requireAuth("admin")`** — `"admin"` is a *role*, not a `Permission` in the
   union, so `hasPermission` likely returns `false` and denies the Command
   Center actions for everyone. If live, the trigger returns an auth error.
2. **`BFI_MODAL_WORKERS_BASE_URL` unset** on the deploy → `callModalEndpoint`
   returns a config error instead of dispatching.
3. **120s server-action timeout** in `callModalEndpoint` may be shorter than the
   real Modal run; hence the test observes success via UI polling, not the
   synchronous response.

## File layout

```
playwright.config.ts
tests/e2e/
  README.md
  fixtures/auth.ts
  auth.setup.ts            # logs in, saves storageState
  admin-agentic-pipeline.spec.ts
package.json               # + @playwright/test, test:e2e script
.gitignore                 # + storageState artifact
```

## Success criteria

- `npm run test:e2e` (with env set) logs in, triggers Run Atlas against the
  deploy, and **passes** when the run is accepted + executes; **fails with a
  precise message** when blocked by the auth/Modal risks above.
- No secrets committed; test is clearly on-demand, not in CI.
