# Admin Function and Overlap Map

Date: 2026-08-09 (America/Los_Angeles)

Scope: `src/app/admin`, the API and server actions called by admin pages, the
`ops_jobs` execution path, and the scheduled Modal jobs that perform the same
work.

## Executive Summary

The admin application currently contains several partially overlapping control
planes:

1. `/admin` is an operational summary built from `crawl_targets`,
   `extracted_fees`, `crawl_runs`, and a review table name that does not exist.
2. `/admin/pipeline` is a read-only status page built from three different job
   models: `workers_last_run`, `crawl_runs`, and `ops_jobs`.
3. `/admin/ops` is a second read-only job-history page. A much larger interactive
   operations console exists in the repository but is not mounted.
4. `/admin/data-quality` is the only currently mounted page that exposes generic
   `ops_jobs` commands.
5. Institution URL, extraction, and fee-review operations are reimplemented in
   several route families with different permissions, side effects, and audit
   behavior.
6. Modal schedules, generic admin jobs, the two CLI pipeline orchestrators, and
   per-institution endpoints can all run overlapping stages without one shared
   locking or idempotency contract.

This is why the admin can simultaneously show a failed scheduled job, an old
`crawl_runs` row as still running, and no active `ops_jobs` work. Those displays
describe different systems.

## Visible Admin Navigation

| Navigation item | Route | Current function | Primary data or backend | Important overlap |
|---|---|---|---|---|
| Dashboard | `/admin` | Coverage, quality, review queue, crawl activity, leads, state coverage | `crawl_targets`, `extracted_fees`, `crawl_runs`, `review_log`, `leads` | Repeats Pipeline, Data Quality, Review, Leads, and state coverage; `review_log` does not exist in production |
| Market | `/admin/market` | Filterable fee benchmark | `extracted_fees` through market/index queries | An unfiltered Market view is another National Index; the same filters reappear in Peer and District views |
| National | `/admin/index` | National fee index by category | `extracted_fees` and taxonomy | Overlaps Market's unfiltered view and hidden `/admin/national`; the three pages use different scopes and labels |
| Peer | `/admin/peers` | Peer benchmark and saved peer sets | `extracted_fees`, `crawl_targets`, peer filters | Also acts as an institution entry point and exposes URL edit/crawl on `/admin/peers/[id]` |
| Categories | `/admin/fees/catalog` | Fee-category catalog and distribution | `extracted_fees` | Overlaps `/admin/fees`, Review by Category, Market, and National Index |
| Districts | `/admin/districts` | Fed district fee/economic portal | Fee index, financial, Fed, complaint, and call-report tables | District is also a Market/Peer filter; hidden `/admin/national` includes much of the same economic data |
| Hamilton | `/admin/hamilton` -> `/admin/hamilton/chat` | Research chat and report tabs | Hamilton chat tables, report APIs, Modal report worker | Legacy research routes still exist; reports have their own job model and a second false-cancel behavior |
| Leads | `/admin/leads` | Sales lead table | `leads` | Exact duplicate page also exists at `/admin/hamilton/leads` |
| Darwin | `/admin/darwin` | Classification agent console and manual reclassification | Darwin Modal sidecar and agent tables | Classification health also appears in Agents and Pipeline; manual reclassify overlaps automated Darwin drain |
| Magellan | `/admin/coverage` | URL rescue agent console | Magellan Modal sidecar and crawler tables | URL health also appears in Dashboard, Pipeline, State, Institution, and Peer pages |
| Agents | `/admin/agents` | Read-only agent health, lineage, messages, replay | Agent event/message/lineage tables | Repeats Darwin, Magellan, Knox, and Pipeline stage health at a different abstraction level |
| Knox Reviews | `/admin/agents/knox/reviews` | Human decision on Knox rejections | `agent_messages`, `knox_overrides`, `fees_verified`, `fees_published` | A second review system beside `/admin/review`, but it reviews a later data tier |
| Pipeline | `/admin/pipeline` | Scheduled-job freshness, coverage, crawl runs, ops job history | `workers_last_run`, `crawl_runs`, `ops_jobs` | Overlaps Dashboard, Ops, Data Quality, Agents, Darwin, and Magellan; existing control components are not mounted |
| Review | `/admin/review` | Canonical extracted-fee review queue | `extracted_fees`, `fee_reviews` | Overlaps institution-level fee actions and Review by Category; institution actions bypass this audit path |
| By Category | `/admin/review/categories` | Same extracted-fee review queue grouped by category | `extracted_fees` | Workflow variant of Review, but it is presented under Explore rather than Review |
| Explorer | `/admin/query` | Admin SQL/query console | Database | Can reproduce almost every read-only admin view without its domain rules |
| Data Quality | `/admin/data-quality` | Integrity checks and three repair buttons | `extracted_fees`, `crawl_targets`, `ops_jobs` | Categorize and Publish Index duplicate Pipeline/Ops/Modal stages; zombie reset changes status only |

## Important Routes Outside the Navigation

| Route family | Function | Overlap or disposition |
|---|---|---|
| `/admin/ops` | Generic job history | Duplicates the Pipeline recent-jobs table. The interactive `OpsClient` is orphaned and not rendered by either page. |
| `/admin/institutions` | Institution search/list | Overlaps state lists, peer explorer, and institution search in the command palette. |
| `/admin/institution/[id]` | Institution operations, fee editing, extraction | Overlaps `/admin/peers/[id]`, `/admin/states/[code]`, and canonical `/admin/review`; behavior differs materially. |
| `/admin/states/[code]` | State coverage, state agent history, URL correction | Overlaps Pipeline coverage and Institution operations. Its write actions require only `view`. |
| `/admin/national` | National economic/data portal | Competes with the visible `/admin/index` named "National" and with Market/Districts. |
| `/admin/verify` | Gold-standard verification | A third review-like workflow; writes `gold_standard_fees`, not the normal review state. |
| `/admin/fees` | Older fee-family catalog | Overlaps the visible `/admin/fees/catalog`. |
| `/admin/methodology` | Methodology content | Duplicated at `/admin/hamilton/methodology`. |
| `/admin/research/*` | Mixed legacy aliases and duplicate files | Hub and agent pages redirect, but articles and usage remain live duplicates. Internal links still point to the legacy prefix. |
| `/admin/scout` | Legacy alias | Redirects to Hamilton; `/admin/hamilton/scout` also exists. |
| `/admin/quality` | Legacy alias | Redirects to Pipeline even though the separate Data Quality page is live. |

## Execution Overlap Matrix

| Operation | Scheduled path | Manual admin paths | Other path | Risk |
|---|---|---|---|---|
| Discover fee URLs | Modal `run_discovery` at 02:00 UTC; Magellan rescue at 05:00 UTC | Pipeline `runDiscover`; orphaned Ops console `discover` | `run-pipeline`, atomic `pipeline`, state agents | Several implementations can select the same institutions without a shared run lock. Pipeline UI text says 200 max, but `runDiscover` supplies no limit. |
| Crawl/extract | Modal PDF at 03:00 UTC and browser at 04:00 UTC | Pipeline Crawl Gaps; Ops `crawl`; Peer detail Crawl; Institution Extract | `run-pipeline`, atomic `pipeline`, state agents | At least three extractor entry points use different selection and write paths. Duplicate cost and conflicting run status are possible. |
| Categorize | Modal daily post-processing at 06:00 UTC | Pipeline Categorize; Data Quality Re-run Categorization; Ops `categorize` | `run-pipeline`, atomic `pipeline` | Same global mutation can be started repeatedly. |
| Validate | No dedicated cron stage in the current daily command list | Pipeline Validate; Ops `validate` | Atomic `pipeline` | UI's "Full Pipeline" description implies validation, but its action invokes legacy `run-pipeline`, which only discovers, crawls, and categorizes. |
| Detect outliers | No dedicated current cron stage | Pipeline Detect Outliers; Ops `outlier-detect` | Atomic `pipeline` may include stage-dependent checks | Operators cannot tell which output belongs to which orchestrator. |
| Auto-review | Modal daily post-processing | Pipeline Auto-Review; Ops `auto-review` | Atomic `pipeline` | Mutates the same review population while humans may be reviewing it. |
| Publish fees/index | Modal daily `publish-fees`, snapshot, and `publish-index` | Data Quality Re-publish Index; Ops `publish-index` | Atomic `pipeline` | Index publication can occur while upstream stages are still running. |
| Federal/economic ingest | Modal `ingest_data` daily/weekly/quarterly | Pipeline Refresh Daily/Weekly; Ops individual ingestors and `refresh-data` | Direct CLI | The same source can run twice, including `ingest-call-reports` and NCUA on quarterly Mondays. |
| Generate reports | Modal report endpoint; manual-only `run_monthly_pulse` function | Hamilton Reports controls and retry | `/api/reports/generate` cron-auth path | Report jobs use `report_jobs`, not `ops_jobs`, and therefore do not appear in Pipeline/Ops health. |
| Agent classification/review | Darwin drain, Knox review, every-minute dispatcher | Darwin reclassify and Knox review UI | Agent APIs | Manual and scheduled work share agent tables but have separate status displays. |

## Critical Behavioral Conflicts

### P0: `ops_jobs` Runner and Admin Readers Use Different Schemas

The live `ops_jobs` table contains:

`started_at`, `completed_at`, `exit_code`, `stdout_tail`, `error_summary`, and
`result_summary`.

The current Modal generic runner updates:

`result_json`, `error`, and `updated_at`.

Those columns do not exist in the live table or in `scripts/migrate-schema.sql`.
The runner catches and logs its update error, so the subprocess can run while the
admin row remains `queued` or `running`. The most recent live row is job 42,
`categorize`, still `queued` since 2026-04-18.

Affected surfaces:

- `/admin/pipeline` job summaries and recent jobs
- `/admin/ops`
- `/admin/data-quality` action feedback
- the sidebar job status badge
- Hamilton's internal job-status research tool

### P0: Institution Review Actions Bypass the Canonical Review Contract

`src/lib/fee-actions.ts` is the canonical review path. It validates status
transitions, uses permission-specific authorization, writes `fee_reviews`, and
performs the mutation and audit insert in one transaction.

`src/app/admin/institution/[id]/actions.ts` separately approves, rejects, edits,
and bulk-approves `extracted_fees` with direct updates. These actions do not
write `fee_reviews`, do not enforce the canonical transition table, and can edit
already-reviewed fees. As a result, the same human decision has different audit
and validation behavior depending on which admin page was open.

### P0: State Pages Grant Write Operations to `view`

The state action module uses `requireAuth("view")` for URL edits, marking an
institution offline, and the Extract action. `view` is granted to non-admin
roles by the permission model. The admin layout normally redirects non-admins,
but server-action authorization must not rely on page layout behavior.

### P1: "Cancel" Does Not Cancel Modal Work

`cancelJob` changes an `ops_jobs` row to `cancelled`; it does not cancel the
Modal function call. `cancelReport` and `cancelAllPending` have the same semantic
problem for report generation. A worker can continue consuming resources and
writing data after the admin says it is cancelled. It can also later overwrite
the status if its completion update succeeds.

### P1: "Extract" Has Three Different Meanings

- Institution detail calls the single-item Modal extraction endpoint.
- Peer detail queues the generic CLI `crawl --target-id` job.
- State detail's `triggerExtract` does not start anything; it returns an
  instruction to use Scout.

The institution URL save also fire-and-forgets extraction and discards every
error with `.catch(() => {})`, so a failed automatic extraction is invisible.

### P1: Dashboard Review Activity Reads the Wrong Table

The canonical review actions write `fee_reviews`. The Dashboard and one fee
detail query read `review_log`. Production has `fee_reviews` (26,786 rows) and no
`review_log` table. These queries catch the error and return empty data, so real
review activity is hidden as if no reviews occurred.

### P1: Pipeline Status Combines Incompatible Lifecycles

`/admin/pipeline` combines:

- `workers_last_run`: current scheduled Modal completion markers
- `crawl_runs`: extraction-run records, including orphaned rows still marked
  `running` since April
- `ops_jobs`: manually triggered generic jobs, with no current successful writer

These are not one queue and cannot safely be aggregated as if they were.

### P1: Two "Full Pipeline" Commands Coexist

`run-pipeline` is the legacy three-stage discover/crawl/categorize command.
`pipeline` is the newer atomic, resumable orchestrator and is explicitly
documented in the CLI as replacing `run-pipeline`.

The Pipeline quick action still starts `run-pipeline`, while the orphaned Ops
console offers both. The quick-action explanatory text describes a
categorize/validate/outlier/auto-review sequence that the invoked command does
not perform.

### P2: Large Parts of the Intended Pipeline UI Are Orphaned

The repository contains Pipeline tabs, health, coverage, operation controls,
pipeline visualization, recent jobs, and an interactive Ops console. The current
`/admin/pipeline/page.tsx` imports none of them. The current `/admin/ops/page.tsx`
also does not render `OpsClient`.

This leaves duplicate server actions and command metadata in production code
without a visible owner, while the visible pages provide read-only fragments of
the intended control plane.

### P2: Metrics Reuse Labels but Not Definitions

Examples:

- Dashboard `with_fees` counts any institution present in `extracted_fees`,
  including rejected-only institutions.
- Data Quality excludes rejected fees.
- Index views usually include all non-rejected fees unless `approvedOnly` is
  explicitly requested.
- Agent Pipeline counts `fees_raw`, `fees_verified`, and `fees_published`, not
  `extracted_fees`.
- State coverage changes the denominator by excluding offline/no-website rows,
  while the headline Dashboard coverage uses all `crawl_targets`.

The word "coverage" therefore reports different populations across the admin.

## Live State Observed During This Review

Read-only production checks on 2026-08-09 PDT / 2026-08-10 UTC showed:

- `run_discovery`: failed at 02:00 UTC
- `run_pdf_extraction`: failed at 03:00 UTC
- `run_browser_extraction`: failed at 04:00 UTC
- `darwin_drain`, `knox_review`, and `magellan_rescue`: last marker was `ok`
- `ingest_data`: last marker was `ok` but approximately 90 hours old
- `crawl_runs`: several rows remain `running` from 2026-04-20 through
  2026-04-22
- `ops_jobs`: one row remains `queued` from 2026-04-18

The collection failures occurred before the latest Modal deployment completed.
The next scheduled cycle is still required to prove the replacement code in
normal cron execution.

## Recommended Ownership Model

### 1. One Operations Route

Make `/admin/pipeline` the only operational control plane and redirect
`/admin/ops`, `/admin/quality`, and generic job controls into it. Mount the useful
existing components after removing conflicting implementations.

### 2. One Job Contract

Use one job table or a normalized parent job table with typed child details. At
minimum, every job needs:

- job ID and job type
- trigger source: schedule, admin, API, or agent
- Modal call ID
- requested, started, heartbeat, and completed timestamps
- terminal status and structured error
- scope and idempotency key
- cancellation state that is propagated to Modal

`workers_last_run` should be a derived health view or a schedule marker, not a
second job system.

### 3. One Pipeline Orchestrator

Retire admin use of `run-pipeline`. Route full runs through atomic `pipeline`.
Keep individual stages available only as explicitly labeled repair operations.
Add a shared lock/idempotency key so scheduled and manual jobs cannot process the
same scope concurrently.

### 4. One Institution Command Service

All URL edits, offline decisions, and extraction requests should call one server
module. Route Institution, Peer, State, Pipeline, and bulk import UIs through it.
Use the same permission, URL validation, audit event, revalidation, and
extraction behavior everywhere.

### 5. One Extracted-Fee Review Service

Delete the direct review updates in the institution route and use
`src/lib/fee-actions.ts`. Keep Knox review and gold-standard verification as
separate named stages because they operate on different tables and answer
different questions.

### 6. Canonical Navigation Names

Recommended top-level information architecture:

- Overview
- Benchmarks: National, Market, Peer, Category, District
- Operations: Pipeline, Schedules, Runs, Data Quality
- Review: Extracted Fees, Knox Decisions, Gold Standard
- Agents: Overview, Darwin, Magellan, Lineage, Messages, Replay
- Hamilton: Chat, Reports, Research
- Sales: Leads

## Suggested Remediation Order

1. Repair the Modal `ops_jobs` update contract and store/cancel by Modal call ID.
2. Replace institution fee mutations with the canonical audited review actions.
3. Change state mutations from `view` to the correct edit/job permissions.
4. Change Dashboard review reads from `review_log` to `fee_reviews`.
5. Define one coverage metric contract and apply it to every summary page.
6. Replace `run-pipeline` admin triggers with atomic `pipeline` and add run locks.
7. Consolidate `/admin/pipeline`, `/admin/ops`, and `/admin/data-quality`.
8. Consolidate duplicate Institution/Peer/State mutation actions.
9. Remove or redirect duplicate National, Fees, Leads, Research, Scout,
   Methodology, and Quality routes.
10. Clean up orphaned `crawl_runs` and `ops_jobs` rows with an auditable
    reconciliation job, not a status-only UI reset.
