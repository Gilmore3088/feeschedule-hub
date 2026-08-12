# FeeSchedule Hub Repo Audit

Date: 2026-04-15  
Prepared for: Engineering handoff / developer review  
Repository: `feeschedule-hub`

## Scope

This document summarizes a full repo audit focused on:

- Current project shape and architecture
- Expected operational behavior
- Inefficiencies and drift
- Reproduced failures
- Severity-ranked code review findings
- Recommended remediation order

This was an audit pass only. No production fixes were applied in this review.

## Executive Summary

The repository is a large mixed-system codebase:

- A Next.js 16 / React 19 application with public, admin, and report-generation surfaces
- A Python crawler and extraction pipeline
- Modal-based scheduled workers and HTTP endpoints
- Supabase / Postgres production data paths
- SQLite bootstrap and local/preflight paths

The frontend and TypeScript unit-test surface are in materially better shape than the Python automation surface. The highest-risk issues are not cosmetic. They are operational:

1. Modal scheduled jobs can fail silently while still appearing successful.
2. Local SQLite bootstrap no longer matches the runtime schema expected by active crawler code.
3. Report jobs can remain stuck in `pending` forever if the Modal trigger fails.
4. CI validates a different Python environment than the one deployed to Modal.
5. The call-report revenue scaling contract is contradictory and may corrupt financial metrics by 1000x.
6. One report automation (`monthly_pulse`) is documented like a scheduled job but is currently manual-only and uses a different app URL environment variable than the rest of the report stack.

## What I Expected

For this system to be reliable, I would expect:

- One authoritative schema contract for crawler tables and pipeline tables
- One Python dependency manifest shared by CI and Modal
- Modal cron jobs to fail loudly on subprocess errors
- Local and preflight environments to exercise the same schema assumptions as production
- Report jobs to transition to `failed` when downstream worker triggering fails
- Scheduled report jobs to have a clearly defined schedule and consistent environment variable conventions

## What I Saw

The repo currently shows a split between a relatively healthy app layer and a drifting operations layer:

- The app and TS unit tests are mostly coherent.
- The Python pipeline has multiple sources of truth for schema and runtime behavior.
- Modal jobs are optimized to continue and summarize rather than fail loudly.
- Some tests are now stale relative to implementation changes.
- Lint debt has accumulated enough that it obscures signal from truly important issues.

## Repo Shape

High-level components identified during the audit:

- `src/app/`: Next.js routes, APIs, admin, public pages, report endpoints
- `src/lib/`: data access, report engine, Hamilton/report assembly, crawler DB TS layer
- `fee_crawler/`: Python crawler, workers, commands, pipeline, Modal app, tests
- `supabase/migrations/`: Postgres migrations
- `scripts/`: SQL migrations, utility scripts, data migration scripts
- `.github/workflows/`: CI / scheduled E2E workflow

## Validation Summary

The following checks were run during the audit:

| Command | Result | Notes |
|---|---|---|
| `npx vitest run` | Passed | `387 passed, 1 skipped` |
| `pytest -m "not e2e and not llm and not slow" -q --continue-on-collection-errors` | Failed | `233 passed, 2 failed, 1 error, 30 deselected` |
| `npm run lint` | Failed | `84 errors, 107 warnings` |
| `npm run build` | Failed in this sandbox | Build depends on fetching Google Fonts at build time |
| Local SQLite schema probe | Failed contract check | `jobs`, `platform_registry`, and multiple expected columns are missing |

## Reproduced Issues

### 1. Python test suite is currently red

Observed failures:

- `fee_crawler/tests/test_call_report_scaling.py` fails during collection because `_apply_ffiec_scaling` no longer exists.
- `fee_crawler/tests/test_stealth_fetcher.py` fails because it patches `fee_crawler.pipeline.playwright_fetcher.Stealth`, but `Stealth` is imported inside the function rather than existing as a module-level symbol.

Interpretation:

- The stealth fetcher failures look like test drift.
- The call-report scaling failure looks more serious because the test, migration SQL, and ingest logic currently disagree on units.

### 2. ESLint backlog is large and includes real behavior risks

The lint output is not limited to style issues. It includes:

- React hook / compiler violations
- component definitions inside render
- synchronous state changes inside effects
- stale or unused variables across multiple app surfaces
- `any` usage in data-handling paths

Interpretation:

- Some lint errors are hygiene.
- Some are real maintainability and behavior risks, especially around React compiler compatibility and render-time component creation.

### 3. Build is non-hermetic

`npm run build` failed here because `next/font/google` attempted to fetch:

- `JetBrains Mono`
- `Newsreader`

This may not fail in production if outbound network exists there, but it does confirm the build is not hermetic and can fail when Google Fonts are unreachable.

## Severity-Ranked Findings

### Finding 1

Severity: `P0`  
Location: `fee_crawler/modal_app.py:123-125`

#### Summary

Modal cron jobs mask subprocess failures.

#### Evidence

The scheduled worker functions call `subprocess.run(...)` and then return strings summarizing status instead of raising on nonzero exit codes.

Relevant areas:

- `fee_crawler/modal_app.py:69-81`
- `fee_crawler/modal_app.py:91-102`
- `fee_crawler/modal_app.py:123-125`
- `fee_crawler/modal_app.py:153-177`

#### Impact

- Broken scheduled jobs can appear successful at the Modal level.
- Alerts, retries, and operator response become unreliable.
- The most likely operational symptom is exactly what prompted this audit: “automated jobs are not working,” but infrastructure appears green.

#### Recommendation

- Introduce a shared helper that wraps `subprocess.run(..., check=True)` or manually raises on `returncode != 0`.
- Include stdout/stderr tails in raised exceptions.
- Make scheduled jobs fail hard unless a step is explicitly allowed to degrade.

### Finding 2

Severity: `P0`  
Location: `fee_crawler/db.py:18-40`

#### Summary

SQLite bootstrap no longer matches the active pipeline schema.

#### Evidence

The local `Database` bootstrap creates older table definitions and does not create or migrate:

- `jobs`
- `platform_registry`
- `cms_confidence`
- `document_r2_key`
- `document_type_detected`
- `doc_classification_confidence`

Active runtime code references these structures:

- `fee_crawler/workers/discovery_worker.py`
- `fee_crawler/commands/crawl.py`
- `fee_crawler/workers/data_integrity.py`
- `fee_crawler/workers/daily_report.py`

Local probe result during audit:

- `HAS_jobs False`
- `HAS_platform_registry False`
- `MISSING_cols ['cms_confidence', 'doc_classification_confidence', 'document_r2_key', 'document_type_detected']`

#### Impact

- Local/dev crawler runs can diverge from production behavior.
- `modal_preflight.py` cannot be trusted as a true isolated preflight because it runs against the stale SQLite schema path.
- Runtime schema errors are likely in local or preflight execution even when production Postgres paths work.

#### Recommendation

- Establish one schema authority for pipeline tables.
- Either:
  - bring SQLite bootstrap up to parity, or
  - explicitly retire SQLite execution for codepaths that now require Postgres-only tables.
- Ensure preflight uses the same structural assumptions as production.

### Finding 3

Severity: `P1`  
Location: `src/app/api/reports/generate/route.ts:109-158`

#### Summary

Report jobs can stay pending forever when Modal trigger fails.

#### Evidence

This route:

1. inserts a `report_jobs` row in `pending`
2. triggers Modal in `after(...)`
3. logs Modal trigger failures
4. never marks the job failed if trigger launch fails

#### Impact

- User-facing jobs can become permanently stuck.
- Operationally, this creates a “ghost queue” of jobs that never ran but never failed.

#### Recommendation

- When Modal triggering fails or returns a non-OK response, update the job row to `failed`.
- Treat missing `MODAL_REPORT_URL` as a terminal error for that job instead of only logging it.

### Finding 4

Severity: `P1`  
Location: `.github/workflows/e2e-tests.yml:45-46`

#### Summary

CI installs a different Python environment than Modal.

#### Evidence

GitHub Actions installs:

- `requirements.txt`

Modal images install:

- `fee_crawler/requirements.txt`

The manifests differ materially. The Modal manifest includes packages such as:

- `psycopg2-binary`
- `asyncpg`
- `httpx`
- `anthropic`
- `playwright`
- `playwright-stealth`
- `boto3`

The root manifest does not.

#### Impact

- CI is not validating the actual deployed crawler environment.
- “Green CI, broken Modal” becomes much more likely.

#### Recommendation

- Consolidate to a single Python requirements source for crawler/runtime validation.
- Make CI install the same dependency set as Modal.

### Finding 5

Severity: `P1`  
Location: `fee_crawler/commands/ingest_call_reports.py:296-299`

#### Summary

FFIEC revenue scaling contract is contradictory.

#### Evidence

Current ingest code:

- divides `SC` by `1000`

But:

- `scripts/migrations/023-fix-ffiec-scaling.sql` says FFIEC values are in thousands and should be multiplied up to dollars
- `fee_crawler/tests/test_call_report_scaling.py` expects multiplication behavior
- the `_apply_ffiec_scaling` helper expected by tests has been removed

#### Impact

- `service_charge_income` may be off by 1000x
- downstream `fee_income_ratio` may also be wrong
- financial and report-level conclusions become untrustworthy

#### Recommendation

- Decide the unit contract explicitly.
- Restore a shared scaling helper or equivalent single source of truth.
- Align ingest code, tests, comments, and migration strategy.
- Validate and backfill stored values only after confirming the correct direction.

### Finding 6

Severity: `P2`  
Location: `fee_crawler/modal_app.py:385-404`

#### Summary

Monthly pulse is manual-only and uses a different app URL environment variable.

#### Evidence

- The function docstring reads like a scheduled automation.
- The decorator has no `schedule=...`.
- It reads `NEXT_PUBLIC_APP_URL`.
- The rest of the report pipeline uses `BFI_APP_URL`.

#### Impact

- The feature may be assumed to be automated when it is not.
- It can fail configuration checks even when the rest of the report pipeline is set correctly.

#### Recommendation

- Decide whether `run_monthly_pulse` is intended to be manual or scheduled.
- Use one app URL environment variable across the report stack.
- Update the docstring to match the real behavior.

## Additional Observations

### README is outdated

The top-level `README.md` is still the stock Next.js scaffold and does not describe:

- the crawler
- Modal
- Supabase
- report generation
- operational commands

This is a team-efficiency issue because the repo’s actual operating model is substantially more complex than the onboarding docs suggest.

### Lint signal-to-noise is poor

The lint backlog is large enough that important warnings are buried among generic cleanup items.

Examples of more meaningful lint findings observed:

- render-time component declarations
- direct state changes inside effects
- React ref access during render
- React compiler memoization conflicts

## Key Inefficiencies

The main inefficiencies are architectural rather than algorithmic:

1. Multiple sources of truth for schema  
   `fee_crawler/db.py`, `scripts/migrate-schema.sql`, and `supabase/migrations/` all define parts of the contract.

2. Multiple sources of truth for Python runtime dependencies  
   CI and Modal do not install the same environment.

3. Failure handling is inconsistent  
   Several important job paths log-and-return instead of fail-and-signal.

4. Local/preflight confidence is overstated  
   The existence of local/preflight paths suggests reproducibility, but the schema mismatch means those paths are no longer representative.

5. Lint debt obscures operational priorities  
   Important issues are mixed with low-risk cleanup noise.

6. Build depends on external font fetches  
   This makes builds less deterministic and harder to reproduce in restricted environments.

## Recommended Fix Order

Recommended order of operations for the engineering team:

1. Make Modal scheduled jobs fail loudly on subprocess failure.
2. Unify the crawler schema contract and bring SQLite/preflight into alignment or formally retire unsupported paths.
3. Fix report-job stuck-pending behavior when Modal triggering fails.
4. Unify Python dependency installation between CI and Modal.
5. Resolve the FFIEC scaling contract before relying on related metrics or reports.
6. Decide whether monthly pulse is manual or automated, then align schedule, docs, and env vars.
7. Reduce lint debt by prioritizing real React/compiler violations before generic cleanup.

## Recommended Deliverables for the Next Engineering Pass

- A patch that centralizes subprocess execution and error propagation for Modal jobs
- A single documented schema authority for pipeline tables
- A CI update that installs the real crawler dependency set
- A repaired call-report scaling helper plus aligned tests
- A report job status patch for failed trigger launches
- A short operational README covering app, crawler, Modal, and report flows

## Appendix: Commands Run

Commands executed during this audit included:

```bash
rg --files
git status --short
sed -n '1,260p' fee_crawler/modal_app.py
sed -n '1,260p' fee_crawler/modal_preflight.py
sed -n '1,320p' fee_crawler/commands/crawl.py
sed -n '1,320p' fee_crawler/commands/ingest_call_reports.py
npm run lint
npx vitest run
pytest -m "not e2e and not llm and not slow" -q --continue-on-collection-errors
npm run build
```

## Closing Assessment

The repo is not uniformly unhealthy. The app layer and TS test layer show solid progress. The main problem is that the automation and data pipeline layer has drifted faster than the shared operational contract. The result is a system where some of the most important jobs can either fail silently or run in environments that no longer match each other.

That is fixable, but it needs to be treated as an operational reliability pass, not as a generic cleanup pass.
