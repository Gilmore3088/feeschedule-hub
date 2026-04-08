# Roadmap: Bank Fee Index

## Milestones

- [x] **v1.0 E2E Pipeline Test Suite** - Phases 1-11 (shipped 2026-04-06)
- [x] **v2.0 Hamilton — Research & Content Engine** - Phases 12-18 (shipped 2026-04-07)
- [x] **v3.0 National Coverage Push** - Phases 19-22 (shipped 2026-04-08)
- [x] **v5.0 National Data Layer** - Phases 23-27 (shipped 2026-04-08)
- [ ] **v6.0 Two-Sided Experience** - Phases 28-32 (in progress)
- [ ] **v7.0 Hamilton Reasoning Engine** - Phases 33-37 (planned)

## Phases

<details>
<summary>v1.0 E2E Pipeline Test Suite (Phases 1-11) - SHIPPED 2026-04-06</summary>

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Test Infrastructure** - Isolated test DB, pytest markers, HTTP mock server, geography fixtures, institution factory
- [x] **Phase 2: Seed Stage Tests** - FDIC + NCUA institution seeding into isolated crawl_targets
- [x] **Phase 3: Discovery Stage Tests** - Fee schedule URL discovery recorded in discovery_cache
- [x] **Phase 4: Extraction Stage Tests** - LLM fee extraction with confidence scoring and crawl_results records
- [x] **Phase 5: Categorization Stage Tests** - Fee family and category assignment via 49-category taxonomy
- [x] **Phase 6: Validation Stage Tests** - Confidence-based review_status transitions and outlier flagging
- [x] **Phase 7: Audit Trail Verification** - FK integrity and status transition assertions across all tables
- [x] **Phase 8: Idempotency and Timing** - No duplicate rows on re-run, per-stage time budget enforcement
- [x] **Phase 9: Full Pipeline Test** - End-to-end run for 3-5 institutions with summary report
- [x] **Phase 10: CI Integration** - GitHub Actions workflow with marker-controlled e2e runs (completed 2026-04-06)
- [x] **Phase 11: Modal Pre-flight** - Modal environment validation against isolated test database (completed 2026-04-06)

### Phase 1: Test Infrastructure
**Goal**: A working, isolated test harness exists that all pipeline stage tests can build on
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. Running `pytest -m e2e` selects only e2e tests; `pytest -m "not llm"` excludes LLM-calling tests; `pytest -m slow` selects long-running tests
  2. A test that inserts rows into the test DB can verify that `data/crawler.db` modification time is unchanged after the test completes
  3. R2 document storage is bypassed in all tests — document writes go to a `tmp_path` directory and no Cloudflare API calls are made
  4. Geography parametrization can be overridden via `--geography state=VT` (or equivalent) without changing test code
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — pytest markers (pyproject.toml) + geography CLI option + knowledge file stubs
- [x] 01-02-PLAN.md — e2e conftest fixtures: DB isolation, lock file override, R2 bypass guard, smoke tests

### Phase 2: Seed Stage Tests
**Goal**: The seed stage correctly populates crawl_targets from both FDIC and NCUA sources in an isolated test DB
**Depends on**: Phase 1
**Requirements**: SEED-01, SEED-02
**Success Criteria** (what must be TRUE):
  1. After running the seed stage, the test DB contains 3-5 `crawl_targets` rows with all required fields populated (name, charter_type, website_url, asset_size, fed_district)
  2. At least one seeded institution has `charter_type` matching a bank (FDIC source) and at least one matches a credit union (NCUA source)
**Plans**: 1 plan

Plans:
- [x] 02-01-PLAN.md — seed tests: seeded_db fixture, FDIC test, NCUA test, combined charter-mix test

### Phase 3: Discovery Stage Tests
**Goal**: The discovery stage finds and records fee schedule URLs for seeded institutions
**Depends on**: Phase 2
**Requirements**: DISC-01, DISC-02
**Success Criteria** (what must be TRUE):
  1. After running discovery against seeded crawl_targets, at least 1 institution has a non-null `fee_schedule_url` populated in the test DB
  2. Every discovery attempt (successful or not) has a corresponding `discovery_cache` row with `method` and `result` fields populated
**Plans**: 1 plan

Plans:
- [x] 03-01-PLAN.md — discovery tests: discovered_db fixture (module-scoped, FDIC-only, 60s timeout), fee_schedule_url assertion, cache completeness assertions

### Phase 4: Extraction Stage Tests
**Goal**: The extraction stage produces confidence-scored fees with crawl records for all document types
**Depends on**: Phase 3
**Requirements**: EXTR-01, EXTR-02, EXTR-03
**Success Criteria** (what must be TRUE):
  1. At least 1 `extracted_fees` row exists with `extraction_confidence` in the range [0.0, 1.0] (no out-of-range values anywhere in the table)
  2. Extraction completes successfully for at least one PDF document and at least one HTML document (both `document_type` values represented in `crawl_results`)
  3. Every crawl attempt has a `crawl_results` row with `status` in `('success', 'failed', 'unchanged')` — no crawl attempt is unrecorded
**Plans**: 1 plan

Plans:
- [x] 04-01-PLAN.md — extraction tests: extracted_db fixture (module-scoped, builds on discovered_db), confidence range assertion, crawl_results completeness, document type coverage

### Phase 5: Categorization Stage Tests
**Goal**: The categorization stage assigns valid taxonomy labels and normalizes fee names via alias matching
**Depends on**: Phase 4
**Requirements**: CATG-01, CATG-02
**Success Criteria** (what must be TRUE):
  1. Every `extracted_fees` row has a non-null `fee_family` and `fee_category`, both matching values from the 49-category taxonomy
  2. At least 1 fee whose raw name matches a known alias is assigned the canonical `fee_category` (not left uncategorized)
**Plans**: 1 plan

Plans:
- [x] 05-01-PLAN.md — categorization tests: categorized_db fixture (function-scoped, synthetic rows), taxonomy membership assertions (CATG-01), alias normalization assertions (CATG-02)

### Phase 6: Validation Stage Tests
**Goal**: The validation stage transitions review_status correctly based on confidence and flags statistical outliers
**Depends on**: Phase 5
**Requirements**: VALD-01, VALD-02
**Success Criteria** (what must be TRUE):
  1. Every fee with `extraction_confidence >= 0.85` has `review_status = 'staged'`; fees in [0.7, 0.85) have `review_status = 'pending'`; fees below 0.7 have `review_status = 'extracted'`
  2. At least 1 fee that deviates 3+ standard deviations from the category median has a non-null entry in `validation_flags`; all `validation_flags` values parse as valid JSON
**Plans**: 1 plan

Plans:
- [x] 06-01-PLAN.md — validation tests: validated_db + outlier_db fixtures (function-scoped, synthetic rows), threshold boundary assertions (VALD-01), outlier flagging + JSON validity assertions (VALD-02)

### Phase 7: Audit Trail Verification
**Goal**: Every record in the pipeline has valid foreign keys and correct status history — no orphans, no missing transitions
**Depends on**: Phase 6
**Requirements**: AUDT-01, AUDT-02, AUDT-03, AUDT-04
**Success Criteria** (what must be TRUE):
  1. A LEFT JOIN between `crawl_results` and `crawl_targets` returns zero rows where `crawl_target_id` is null or unmatched
  2. A LEFT JOIN between `extracted_fees` and `crawl_results` returns zero rows where `crawl_result_id` is null or unmatched
  3. At least 1 institution has at least 1 extracted fee after a full pipeline run (non-zero extraction confirmed)
  4. For every fee that is currently `review_status = 'staged'`, there exists a `fee_reviews` row with `action = 'stage'` for that fee's ID
**Plans**: 1 plan

Plans:
- [x] 07-01-PLAN.md — audit trail tests: audit_db fixture (function-scoped, full FK chain), FK orphan detection (AUDT-01, AUDT-02) with positive + negative tests, non-zero extraction (AUDT-03), staged fee audit trail (AUDT-04)

### Phase 8: Idempotency and Timing
**Goal**: Running the pipeline twice produces no duplicate rows and each stage completes within its time budget
**Depends on**: Phase 7
**Requirements**: IDEM-01, TIME-01
**Success Criteria** (what must be TRUE):
  1. After running the full pipeline twice against the same 3-5 institutions, the count of `extracted_fees` rows is identical between run 1 and run 2 (no duplicate fee rows created)
  2. Each pipeline stage records its wall-clock duration and a test asserts that no stage exceeds its configured time budget (configurable per stage; test fails fast if a stage hangs)
**Plans**: 1 plan

Plans:
- [x] 08-01-PLAN.md — idempotency + timing tests: idem_db fixture (function-scoped, synthetic rows), double-run row count assertions (IDEM-01), time.monotonic() budget assertions (TIME-01)

### Phase 9: Full Pipeline Test
**Goal**: A single test runs all five stages end-to-end for 3-5 institutions from a random geography and produces a human-readable summary report
**Depends on**: Phase 8
**Requirements**: PIPE-01, PIPE-02, PIPE-03
**Success Criteria** (what must be TRUE):
  1. A single pytest invocation with `@pytest.mark.slow` runs seed -> discover -> extract -> categorize -> validate in sequence against 3-5 institutions in an isolated test DB, and the test passes without manual intervention
  2. The geography used is selected randomly at test time (state, county, or MSA) without requiring code changes between runs
  3. The test prints a summary report to stdout showing: institutions processed, fees extracted per institution, failures with stage and reason, and wall-clock time per stage
**Plans**: 1 plan

Plans:
- [x] 09-01-PLAN.md — pipeline_db module-scoped fixture (seed+discover+extract+categorize+validate) + test_full_pipeline_end_to_end + stdout/file summary report

### Phase 10: CI Integration
**Goal**: GitHub Actions runs the e2e suite on schedule and uses pytest markers to control which tests run in fast vs full mode
**Depends on**: Phase 9
**Requirements**: CI-01, CI-02
**Success Criteria** (what must be TRUE):
  1. A GitHub Actions workflow file exists that triggers on schedule (nightly or weekly) and runs the e2e test suite against the repository
  2. The CI workflow accepts a parameter (or uses separate jobs) to run either `e2e` marker only (fast mode, no LLM calls) or `e2e` + `llm` + `slow` (full mode with real Haiku calls)
**Plans**: 1 plan

Plans:
- [x] 10-01-PLAN.md — GitHub Actions workflow: nightly fast job (e2e and not llm and not slow) + weekly full job (e2e) + workflow_dispatch mode selector

### Phase 11: Modal Pre-flight
**Goal**: A Modal function validates that the pipeline works end-to-end in the Modal execution environment before any production cron job runs
**Depends on**: Phase 10
**Requirements**: MODL-01, MODL-02
**Success Criteria** (what must be TRUE):
  1. A Modal function exists that runs the full pipeline test and returns a pass/fail result — triggering it before a production cron confirms the Modal environment is healthy
  2. The Modal pre-flight uses an isolated test database (not production Supabase) — confirmed by asserting that no rows are written to the production `DATABASE_URL` during the pre-flight run
**Plans**: 1 plan

Plans:
- [x] 11-01-PLAN.md — preflight_e2e Modal function: isolated SQLite DB in /tmp, 5-stage pipeline, structured pass/fail JSON return

</details>

<details>
<summary>v2.0 Hamilton — Research & Content Engine (Phases 12-18) - SHIPPED 2026-04-07</summary>

- [x] **Phase 12: Hamilton Foundation** - Hamilton persona, generateSection() API, numeric validator, shared template system, methodology paper draft (completed 2026-04-06)
- [x] **Phase 13: Report Engine Core** - Modal render worker, R2 artifact storage, Supabase job queue, Next.js API routes, freshness gate, editor review step (completed 2026-04-06)
- [x] **Phase 14: Recurring Reports** - National quarterly report, state fee indexes, monthly pulse with cron (completed 2026-04-06)
- [x] **Phase 15: Premium Products** - On-demand competitive briefs with peer UI, pro portal with subscription gating (completed 2026-04-06)
- [x] **Phase 16: Public Catalog + Go-to-Market** - Methodology published, ISR-cached public report pages, SEO optimization (completed 2026-04-07)
- [x] **Phase 17: Hamilton Chat** - Unified conversational interface absorbing Research Hub, Scout, FeeScout under one Hamilton persona (completed 2026-04-07)
- [x] **Phase 18: Report Assembly Pipeline** - assembleAndRender() orchestrator wiring generate route to real PDF output (completed 2026-04-07)

### Phase 12: Hamilton Foundation
**Goal**: The Hamilton analyst persona, data-to-narrative API, and shared template system exist and produce verifiable, McKinsey-grade output
**Depends on**: Phase 11
**Requirements**: HAM-01, HAM-02, HAM-03, TMPL-01, TMPL-02, TMPL-03, METH-01
**Success Criteria** (what must be TRUE):
  1. Calling `hamilton.generateSection({ type, data })` returns a structured narrative that never contains a statistic not present in the input data object (numeric validator confirms zero invented numbers)
  2. Hamilton's output reads with a consistent voice — an analyst reviewing two sections from different reports can identify them as the same author without seeing metadata
  3. Rendering a report template with fixture data produces a complete HTML document with cover page, section headers, data tables, and footnotes — no missing layout regions
  4. The methodology paper draft exists as a reviewable document explaining data sources, crawl process, categorization logic, and confidence scoring
**Plans**: 5 plans

Plans:
- [x] 12-01-PLAN.md — Hamilton types.ts + voice.ts: locked persona, 7 style rules, type system (HAM-01)
- [x] 12-02-PLAN.md — generateSection() API + numeric validator with vitest tests (HAM-02, HAM-03)
- [x] 12-03-PLAN.md — Base layout components: PALETTE constants, REPORT_CSS, 8 component functions, wrapReport() (TMPL-01, TMPL-03)
- [x] 12-04-PLAN.md — Report templates: peer-competitive + national-overview pure functions + preview route (TMPL-02, TMPL-03)
- [x] 12-05-PLAN.md — Methodology paper: public /methodology page with 6 sections (METH-01)

### Phase 13: Report Engine Core
**Goal**: Any report type can be triggered, tracked through a job queue, rendered to PDF, stored in R2, and downloaded via presigned URL — with a two-pass editorial review before finalization
**Depends on**: Phase 12
**Requirements**: ENG-01, ENG-03, ENG-04, ENG-05, ENG-06
**Success Criteria** (what must be TRUE):
  1. Triggering a report generation via the Next.js API returns a job ID; polling that ID transitions through `pending -> assembling -> rendering -> complete` and a presigned download URL is available at completion
  2. Requesting a report when the median crawl age exceeds threshold (120 days national, 90 days state) returns a clear error — no stale report is published
  3. Every generated report artifact in R2 has a corresponding `report_jobs` row with a data manifest listing every source query and its result row count
  4. The editor review step runs a second Claude pass on Hamilton's draft; sections flagged as inconsistent or unsupported are held for human review before the job reaches `complete`
**Plans**: 3 plans

Plans:
- [x] 13-01-PLAN.md — Supabase migration (report_jobs + published_reports) + freshness gate module (ENG-04, ENG-06)
- [x] 13-02-PLAN.md — Modal generate_report function + editor review module (ENG-01, ENG-03)
- [x] 13-03-PLAN.md — Next.js API routes: generate, status, download + presign utility (ENG-05)

### Phase 14: Recurring Reports
**Goal**: National quarterly reports, per-state fee indexes, and monthly pulse reports are generated from live pipeline data and available for download
**Depends on**: Phase 13
**Requirements**: NQR-01, NQR-02, NQR-03, NQR-04, SFI-01, SFI-02, SFI-03, PULSE-01, PULSE-02, PULSE-03
**Success Criteria** (what must be TRUE):
  1. A national quarterly report covers all 49 fee categories with medians, P25/P75, institution counts, Hamilton narrative per section, and is sliceable by charter type and asset tier
  2. A state fee index report for any covered state shows delta-to-national analysis per fee category with Fed district economic indicators woven into Hamilton's narrative
  3. A monthly pulse report is generated and published on cron schedule, containing movement summary and trend lines with 1-2 paragraphs of Hamilton narrative — no manual trigger required
  4. All three report types pass the freshness gate and numeric validator before reaching `complete` status
**Plans**: 3 plans

Plans:
- [x] 14-01-PLAN.md — NQR assembler + national-quarterly template (NQR-01 to NQR-04)
- [x] 14-02-PLAN.md — SFI assembler + state-fee-index template with DeltaPill (SFI-01 to SFI-03)
- [x] 14-03-PLAN.md — Monthly pulse assembler + template + Modal cron (PULSE-01 to PULSE-03)
**UI hint**: yes

### Phase 15: Premium Products
**Goal**: Subscribers can trigger on-demand competitive briefs and access their full report library through an authenticated pro portal
**Depends on**: Phase 14
**Requirements**: BRIEF-01, BRIEF-02, BRIEF-03, BRIEF-04, PRO-01, PRO-02, PRO-03
**Success Criteria** (what must be TRUE):
  1. A subscriber can define a peer group (asset tier, charter, geography), confirm it in a UI before generation triggers, and receive a competitive brief with 3-6 Hamilton sections analyzing their institution vs peers
  2. Where fee change event data exists, the competitive brief includes a "who moved first" timeline — the subscriber can see which peers changed fees and when
  3. A subscriber can browse their report library, filter by type and date, and download any past report via a presigned URL — access is blocked for non-subscribers at the RLS layer
  4. On-demand brief generation shows live polling status from `pending` to `complete` without a page refresh
**Plans**: 3 plans

Plans:
- [x] 15-01-PLAN.md — peer group confirmation UI + live brief status polling (BRIEF-02, PRO-02)
- [x] 15-02-PLAN.md — peer-competitive assembler + Hamilton sections + fee change events (BRIEF-01, BRIEF-03, BRIEF-04)
- [x] 15-03-PLAN.md — report library page + Supabase RLS migration (PRO-01, PRO-03)
**UI hint**: yes

### Phase 16: Public Catalog + Go-to-Market
**Goal**: The methodology is published, report landing pages are live with SEO optimization, and the public catalog converts visitors to subscribers
**Depends on**: Phase 15
**Requirements**: METH-02, PUB-01, PUB-02, PUB-03
**Success Criteria** (what must be TRUE):
  1. The methodology paper is live at a public URL and is linked from sales outreach materials — a prospect can read exactly how the index works before buying
  2. Each published report has an ISR-cached landing page showing executive summary and 2 charts publicly, with a CTA/signup gate before the full PDF download
  3. Report landing pages have correct OG metadata — sharing a report URL on LinkedIn renders a preview with title, description, and image
  4. The public catalog lists all published reports with filtering, and search engines can index catalog and report landing pages
**Plans**: 3 plans

Plans:
- [x] 16-01-PLAN.md — Methodology SEO: OG metadata + JSON-LD Article schema + sitemap entry (METH-02)
- [x] 16-02-PLAN.md — Public catalog (/reports) + ISR landing pages (/reports/[slug]) + email gate + sitemap (PUB-01, PUB-02, PUB-03)
- [x] 16-03-PLAN.md — Admin report management (/admin/reports): generation buttons, inline polling, publish + retry actions (D-12 to D-17)
**UI hint**: yes

### Phase 17: Hamilton Chat — Unified Research Interface
**Goal**: Hamilton is a single conversational interface at /admin/hamilton where the user talks to their senior research analyst and gets streaming answers or structured mini-reports — replacing Research Hub, Scout, and FeeScout as separate destinations
**Requirements**: D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14, D-15, D-16, D-17
**Depends on**: Phase 16
**Plans**: 3 plans

Plans:
- [x] 17-01-PLAN.md — Hamilton chat API route + tool registry + Supabase persistent memory (D-01, D-03 to D-10, D-13, D-15)
- [x] 17-02-PLAN.md — Chat tab UI: streaming + mini-report rendering + history sidebar + export actions (D-01, D-02, D-16, D-17)
- [x] 17-03-PLAN.md — Two-tab layout + Reports sub-route + nav consolidation + Research/Scout redirects (D-02, D-11 to D-14)

### Phase 18: Report Assembly Pipeline — Wire data + Hamilton + templates to PDF output
**Goal**: Wire the generate route so clicking "Generate State Index -> Wyoming" produces a real PDF — assembleAndRender() orchestrates assembler + Hamilton narratives + template rendering + Modal trigger
**Requirements**: WIRE-01, WIRE-02, WIRE-03
**Depends on**: Phase 17
**Plans**: 1 plan

Plans:
- [x] 18-01-PLAN.md — assembleAndRender() orchestrator + generate route update: all 4 report types, Hamilton narrative generation, graceful degradation, pending -> assembling -> rendering status progression

</details>

## v3.0 National Coverage Push

**Milestone Goal:** Systematic state-by-state crawl campaign to maximize fee database coverage across all 50 states, running waves of 5-10 states with 3-5 iterations each, largest states first.

- [ ] **Phase 19: Wave Orchestrator** - Batch launch, auto-prioritization by institution count, CLI/Modal triggers, resume-from-failure
- [x] **Phase 20: Iterative Deepening** - Multi-pass per-state logic with strategy escalation and per-pass progress logging (completed 2026-04-08)
- [x] **Phase 21: Knowledge Automation** - Auto-logging learnings to state files, cross-state promotion to national.md, pruning at 50-state scale (completed 2026-04-08)
- [x] **Phase 22: Wave Reporting** - Post-wave summary report: states improved, coverage delta, top discoveries (completed 2026-04-08)

### Phase 19: Wave Orchestrator
**Goal**: The operator can define a wave of states, launch all agents in batch, and resume a partial wave without re-running completed states
**Depends on**: Phase 18
**Requirements**: WAVE-01, WAVE-02, WAVE-03, WAVE-04
**Success Criteria** (what must be TRUE):
  1. Running `python -m fee_crawler wave run --states WY,MT,TX,CA` (or Modal HTTP trigger) launches state agents for each listed state concurrently and writes a wave manifest to the DB
  2. Running `python -m fee_crawler wave recommend` prints a ranked list of states ordered by institution count with current coverage %, so the operator can choose the highest-impact targets
  3. A wave interrupted after 3 of 8 states complete can be resumed via `wave resume <wave_id>` — the 3 completed states are skipped and the remaining 5 run from where they left off
  4. Wave execution respects Modal's existing cron slot budget — concurrent state agents do not exceed the configured parallelism limit
**Plans**: 2 plans

Plans:
- [x] 19-01-PLAN.md — Wave data layer: DB tables, coverage computation, state prioritization
- [ ] 19-02-PLAN.md — Wave orchestrator engine, CLI commands (run/recommend/resume)

### Phase 20: Iterative Deepening
**Goal**: Each state is crawled 3-5 times automatically, with each pass escalating to harder discovery strategies and injecting learnings from prior passes
**Depends on**: Phase 19
**Requirements**: ITER-01, ITER-02, ITER-03
**Success Criteria** (what must be TRUE):
  1. After a wave run, each state in the wave has at least 3 agent_run entries in the DB — one per iteration — without manual re-triggering between passes
  2. Pass 1 uses easy URL discovery (sitemap, common paths); pass 2 activates Playwright for JS-rendered pages; pass 3+ adds PDF search and fee schedule keyword queries — the escalation is visible in each run's strategy field
  3. After each pass completes, a per-pass log entry exists showing: fees discovered this pass, cumulative coverage %, and any new URL patterns or extraction patterns found
**Plans**: 2 plans

Plans:
- [ ] 20-01-PLAN.md — Strategy tiers, DB schema, parameterized state agent and discover_url
- [x] 20-02-PLAN.md — Orchestrator inner pass loop, early stop, resume, CLI --max-passes

### Phase 21: Knowledge Automation
**Goal**: Learnings from every iteration are automatically persisted to the knowledge system without manual editing, and the knowledge base remains prompt-quality at 50-state scale
**Depends on**: Phase 20
**Requirements**: KNOW-01, KNOW-02
**Success Criteria** (what must be TRUE):
  1. After any iteration completes, the state's knowledge file in `fee_crawler/knowledge/states/` is updated with new URL patterns, fee schedule locations, and extraction notes discovered in that pass — no manual step required
  2. Patterns that appear in 3+ states are automatically promoted to `fee_crawler/knowledge/national.md` so future state agents start with cross-state intelligence
  3. Running `python -m fee_crawler knowledge prune` reduces each state knowledge file to under the configured token budget while retaining the highest-signal entries — prompt quality does not degrade as coverage scales to 50 states
**Plans**: 2 plans

Plans:
- [x] 21-01-PLAN.md — Coverage delta in pass learnings + cross-state pattern promotion
- [x] 21-02-PLAN.md — knowledge CLI subcommand + configurable token budget

### Phase 22: Wave Reporting
**Goal**: After each wave completes, an operator-readable summary report is generated showing what improved, by how much, and what was found
**Depends on**: Phase 21
**Requirements**: COV-01
**Success Criteria** (what must be TRUE):
  1. After a wave finishes, a wave summary report is automatically written (stdout + optional file) showing: each state's before/after coverage %, national coverage delta, total fees added, and the top 3-5 new URL patterns or institutional discoveries from the wave
  2. The report is readable without opening a database — a plain-text or Markdown format that can be scanned in 60 seconds
**Plans**: 2 plans

Plans:
- [ ] 22-01-PLAN.md — Wave reporter module (queries + Markdown renderer) + orchestrator hook
- [x] 22-02-PLAN.md — CLI 'wave report' subcommand + unit tests

---

## v5.0 National Data Layer

**Milestone Goal:** Build the data foundation that Hamilton needs to produce credible national analysis. Fix data queries, create summary views, and build admin portal pages for national data -- the raw work that feeds reports later.

- [x] **Phase 23: Call Report & FRED Foundation** - Fix revenue scaling, build economic summaries, establish the data layer everything else depends on (completed 2026-04-08)
- [x] **Phase 24: Industry Health & Beige Book** - Compute health metrics from institution financials, condense Beige Book narratives into usable summaries
- [x] **Phase 25: Derived Analytics & Hamilton Tools** - Cross-source analytics (concentration, dependency, per-institution) and wire all summaries into Hamilton's tool layer
- [x] **Phase 26: National Data Admin Portal** - Build `/admin/national` pages so all data sources are visible and verifiable before they hit reports
- [x] **Phase 27: External Intelligence System** - Ingest, store, and query external research/surveys alongside internal data (completed 2026-04-08)

### Phase 23: Call Report & FRED Foundation
**Goal**: All Call Report revenue queries return correct dollar amounts with trend, segmentation, and charter splits; FRED economic data is complete and queryable; CFPB complaints ingested; institution pages show financial context with peer comparison
**Depends on**: Nothing (data foundation -- independent of v3.0 progress)
**Requirements**: CALL-01, CALL-02, CALL-03, CALL-04, CALL-05, CALL-06, FRED-01, FRED-02, FRED-03, FRED-04
**Success Criteria** (what must be TRUE):
  1. Querying service charge income for any institution returns dollar amounts (not thousands) that match Call Report filings
  2. A YoY revenue trend query returns 8 quarters of data with computed growth rates
  3. Revenue can be split by bank vs credit union and by asset tier, with correct totals that reconcile to national aggregate
  4. A national economic summary query returns fed funds rate, unemployment rate, CPI YoY change (not raw index), and consumer sentiment -- all with current values
  5. District-level economic indicators are queryable (at minimum unemployment per district)
  6. CFPB complaint data ingested via Postgres with district-level and institution-level queries
  7. Institution slug pages show Call Report financial context (SC income, fee dependency, peer ranking)
**Plans**: 5 plans

Plans:
- [x] 23-01-PLAN.md -- Fix FFIEC scaling bug + backfill migration + pytest scaling test (CALL-01 to CALL-05)
- [x] 23-02-PLAN.md -- FRED gap closure: UMCSENT + housing permits + district nonfarm payrolls + district fee revenue (FRED-01 to FRED-04, D-05, D-06)
- [x] 23-03-PLAN.md -- FDIC standard 5-tier system replacement + getRevenueByTier + crawl_targets migration (CALL-06)
- [x] 23-04-PLAN.md -- CFPB complaint ingestion Postgres migration + district/institution complaint queries (D-07)
- [x] 23-05-PLAN.md -- Institution financial context + peer comparison on slug pages (D-08, D-09, D-10)

### Phase 24: Industry Health & Beige Book
**Goal**: Industry health metrics (ROA, efficiency, deposits, loans) are computed from institution financials; Beige Book reports are condensed into district-level and national summaries with extracted themes
**Depends on**: Phase 23 (uses corrected financial data patterns)
**Requirements**: HEALTH-01, HEALTH-02, HEALTH-03, HEALTH-04, BEIGE-01, BEIGE-02, BEIGE-03
**Success Criteria** (what must be TRUE):
  1. Industry-wide ROA, ROE, and efficiency ratio averages are queryable, segmented by bank vs credit union
  2. Deposit and loan growth YoY trends are computed from institution_financials with correct period comparisons
  3. Institution count trends (total active banks, total active CUs) are available with period-over-period changes
  4. Each of the 12 Fed districts has a 2-3 sentence economic narrative summary derived from Beige Book content
  5. A national economic summary and key theme extraction (growth, employment, prices, lending) are derived from all 12 district reports
**Plans**: 2 plans

Plans:
- [x] 24-01-PLAN.md — Audit health queries, add tests, implement institution count trends (HEALTH-01 to HEALTH-04)
- [ ] 24-02-PLAN.md — Beige Book LLM theme extraction, migration, query layer (BEIGE-01 to BEIGE-03)

### Phase 25: Derived Analytics & Hamilton Tools
**Goal**: Cross-source derived metrics are computed and Hamilton can access all summary data (Call Reports, FRED, Beige Book, health, derived) through its existing tool/query layer
**Depends on**: Phase 23, Phase 24 (needs corrected revenue data and health metrics)
**Requirements**: DERIVE-01, DERIVE-02, DERIVE-03, ADMIN-05
**Success Criteria** (what must be TRUE):
  1. Revenue concentration analysis shows what percentage of total service charge income comes from the top N fee categories
  2. Fee dependency ratio (SC income / total revenue) is queryable by charter type and asset tier
  3. Revenue-per-institution averages are computed by asset tier and charter, enabling peer comparison
  4. Hamilton can call tools that return all national summary data (Call Report trends, FRED summary, Beige Book summaries, health metrics, derived analytics) and incorporate them into analysis
**Plans**: 2 plans

Plans:
- [x] 25-01-PLAN.md — Derived analytics queries: revenue concentration, fee dependency trend, revenue-per-institution trend (DERIVE-01, DERIVE-02, DERIVE-03)
- [x] 25-02-PLAN.md — Unified queryNationalData Hamilton tool wiring all data sources (ADMIN-05)

### Phase 26: National Data Admin Portal
**Goal**: Admin users can view, verify, and explore all national data sources through dedicated portal pages before data flows into reports
**Depends on**: Phase 23, Phase 24, Phase 25 (needs all data queries and summaries built)
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04
**Success Criteria** (what must be TRUE):
  1. `/admin/national` shows a summary page with cards/sections for each data source (Call Reports, FRED, Beige Book, Industry Health) with current status and key numbers
  2. Call Report revenue dashboard displays trends over 8 quarters, top institutions by service charge income, and bank vs CU charter split
  3. Economic conditions panel shows FRED indicators (rates, unemployment, CPI YoY, sentiment) alongside Beige Book district summaries on a single view
  4. Industry health panel displays ROA, efficiency ratio, deposit/loan growth with charter segmentation
**Plans**: 2 plans

Plans:
- [x] 26-01-PLAN.md — Audit and verify overview panel data flows, call-reports panel enhancement, verify all panels post-Phase-23 scaling (ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04)
- [x] 26-02-PLAN.md — Add CFPB complaints to economic panel, derived analytics to overview, revenue concentration chart (ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04)
**UI hint**: yes

### Phase 27: External Intelligence System
**Goal**: Admin users can ingest external research, surveys, and reports into the platform; Hamilton can search and cite external sources alongside internal data
**Depends on**: Phase 25 (Hamilton tools layer must exist to extend)
**Requirements**: INTEL-01, INTEL-02, INTEL-03, INTEL-04
**Success Criteria** (what must be TRUE):
  1. Admin can upload or paste external reports/surveys with source attribution (source name, date, category, relevance tags)
  2. External intelligence is stored with structured metadata and is searchable by category and tags
  3. Hamilton can search external intelligence alongside internal data and cite external sources with proper attribution in analysis output
**Plans**: 2 plans

Plans:
- [ ] 27-01-PLAN.md — External intelligence DB schema and ingest UI (INTEL-01, INTEL-03)
- [ ] 27-02-PLAN.md — Hamilton tool integration for search and citation (INTEL-02, INTEL-04)

---

## v6.0 Two-Sided Experience

**Milestone Goal:** Create distinct, cohesive user experiences for consumers and B2B subscribers -- so each audience gets a tailored front door, clear value proposition, and purpose-built tools.

- [ ] **Phase 28: Audience Shell Separation** - Distinct nav components per audience, centralized pro auth guard, personalization service
- [x] **Phase 29: Consumer Landing Page** - Value-prop-first landing page replacing split-panel gateway, embedded Fee Scout, trust signals, consumer guide teasers, B2B door (completed 2026-04-08)
- [ ] **Phase 30: Institution Educational Pages** - "Why does this matter?" callouts, peer percentile indicators, fee distribution charts, B2B report links per institution
- [ ] **Phase 31: B2B Launchpad Dashboard** - Four-door pro dashboard (Hamilton, Peer Builder, Reports, Federal Data), peer snapshot, recent activity, Beige Book digest
- [ ] **Phase 32: Scoped Report Generation and PDF Export** - Structured report type selector, PDF download, report history, per-user daily limits

### Phase 28: Audience Shell Separation
**Goal**: Consumer and pro experiences have stable, independent layout shells -- distinct nav components, centralized auth guard, and a personalization service -- that all subsequent phases build on
**Depends on**: Phase 27
**Requirements**: SHELL-01, SHELL-02, SHELL-03
**Success Criteria** (what must be TRUE):
  1. A consumer visitor landing on any `(public)/` route sees `ConsumerNav`; a pro subscriber on any `/pro/*` route sees `ProNav` -- no conditional branching between the two components
  2. Accessing any `/pro/*` route without a valid premium session redirects to login -- the auth check lives only in `pro/layout.tsx`, not in individual page components
  3. `derivePersonalizationContext(user)` returns the user's institution name, Fed district label, asset tier, and peer group label from their account profile without a DB call
**Plans**: 2 plans
Plans:
- [ ] 28-01-PLAN.md -- ConsumerNav + personalization service
- [ ] 28-02-PLAN.md -- ProNav + auth guard + visual verification
**UI hint**: yes

### Phase 29: Consumer Landing Page
**Goal**: The root `/` is a search-engine-indexable, value-prop-first consumer landing page that lets anyone search without authentication and directs B2B prospects to an upgrade path without gating them
**Depends on**: Phase 28
**Requirements**: CLND-01, CLND-02, CLND-03, CLND-04, CLND-05, CLND-06, CLND-07, CLND-08
**Success Criteria** (what must be TRUE):
  1. A first-time visitor arriving at `/` can type any bank or credit union name into Fee Scout and view results -- no login prompt appears at any point during search
  2. The page renders full server-side HTML so search engines can index its content; `generateMetadata()` produces correct title, description, and OG image for the root URL
  3. Trust signals are visible above the fold: institution count covered, data freshness date, and data source provenance (FDIC/NCUA)
  4. A "how it works" section explains the three-step consumer journey (Search, Compare, Act) and at least two consumer guide teasers appear linking to full guide content
  5. A "For Financial Institutions" section with a clear upgrade CTA is present without acting as a barrier to consumer use; the page design meets a consulting-grade visual quality bar (editorial typography, generous whitespace)
**Plans**: 2 plans
Plans:
- [x] 29-01-PLAN.md -- Landing page hero with Fee Scout search, value prop cards, trust stats
- [x] 29-02-PLAN.md -- Gateway cleanup and visual quality verification
**UI hint**: yes

### Phase 30: Institution Educational Pages
**Goal**: Institution detail pages are interpretive consumer experiences -- every fee category has a contextual callout explaining its significance, a peer percentile position, and a distribution chart showing where the institution sits nationally
**Depends on**: Phase 29
**Requirements**: INST-01, INST-02, INST-03, INST-04
**Success Criteria** (what must be TRUE):
  1. Each fee category row on an institution page shows a "why does this matter?" callout explaining the real-world consumer impact of that fee in plain language (not a data label)
  2. Each fee row shows a peer percentile indicator ("higher than 72% of similar banks") computed against institutions of the same charter type and asset tier
  3. A Recharts histogram chart shows where the institution's fee amount sits relative to the national distribution for that category, with the institution's position visually distinguished
  4. Authenticated pro users see relevant B2B report links on the institution page surfacing competitive or peer reports applicable to that institution's peer group
**Plans**: 2 plans
Plans:
- [ ] 28-01-PLAN.md -- ConsumerNav + personalization service
- [ ] 28-02-PLAN.md -- ProNav + auth guard + visual verification
**UI hint**: yes

### Phase 31: B2B Launchpad Dashboard
**Goal**: Pro subscribers land on a coherent starting point -- a four-door launchpad surfacing their most relevant tools, a peer snapshot against the national median, recent activity, and a personalized Beige Book digest for their district
**Depends on**: Phase 28 (auth guard and personalization service must exist before B2B dashboard can use them)
**Requirements**: B2B-01, B2B-02, B2B-03, B2B-04, B2B-05
**Success Criteria** (what must be TRUE):
  1. A pro subscriber landing on `/pro` sees four prominent action doors: Hamilton, Peer Builder, Reports, and Federal Data -- each links to its destination with a one-line description of what it does
  2. A peer snapshot panel shows the subscriber's peer group median vs national median for at least the top 3 fee categories with delta indicators
  3. Recent activity shows the subscriber's last 3 Hamilton conversations and last 3 generated reports with direct resume or download links
  4. A Beige Book digest section shows a 2-3 sentence economic summary for the subscriber's Fed district sourced from the most recent Beige Book ingestion
**Plans**: 2 plans
Plans:
- [ ] 28-01-PLAN.md -- ConsumerNav + personalization service
- [ ] 28-02-PLAN.md -- ProNav + auth guard + visual verification
**UI hint**: yes

### Phase 32: Scoped Report Generation and PDF Export
**Goal**: Pro subscribers can select a structured report type, generate a scoped 3-5 page report with pre-filled peer context, download it as PDF, retrieve past reports from history, and are prevented from exceeding per-user daily generation limits
**Depends on**: Phase 31 (report center lives in the B2B launchpad; Phase 28 `canAccessReportType()` gates access by subscription tier)
**Requirements**: RPT-01, RPT-02, RPT-03, RPT-04
**Success Criteria** (what must be TRUE):
  1. A pro subscriber can choose from at least three report types (peer brief, competitive snapshot, district outlook) via a structured scope form with peer group pre-filled from their profile, and trigger generation without writing a free-form prompt
  2. A generated report can be downloaded as a PDF file that opens correctly in a standard PDF viewer
  3. All previously generated reports appear in a report history view with type, date, and status; any completed report can be re-downloaded without re-generating
  4. A subscriber who hits the daily report limit (configurable, default 5/day for pro) sees a clear "daily limit reached" message and cannot trigger additional generations until the following day
**Plans**: 2 plans
Plans:
- [ ] 28-01-PLAN.md -- ConsumerNav + personalization service
- [ ] 28-02-PLAN.md -- ProNav + auth guard + visual verification
**UI hint**: yes

---

## v7.0 Hamilton Reasoning Engine

**Milestone Goal:** Upgrade Hamilton from a section-based report writer to a unified intelligence engine with global thesis generation, cross-source reasoning, and role-based delivery for admin, B2B, and consumers.

- [x] **Phase 33: Global Thesis Engine** - Hamilton generates a quarterly thesis from full data payload; every section references it; think-then-compress reasoning and tension model replace descriptive observations (completed 2026-04-08)
- [x] **Phase 34: Voice v3 and Section Generator v2** - Voice system prompt upgraded with revenue prioritization and tension model; sections receive global thesis + cross-source context; word budget raised to 150-200 words (completed 2026-04-08)
- [ ] **Phase 35: Unified Chat Persona** - Four chat agents consolidated into one role-based Hamilton that adjusts depth and language by audience (consumer, pro, admin) on a shared reasoning layer
- [ ] **Phase 36: Tool and Regulation Intelligence** - All 16 tool descriptions upgraded with strategic cross-reference guidance; all 13 ingestion sources verified; CFPB/OCC/Fed regulatory signals connected to internal fee data
- [ ] **Phase 37: Editor v2 and Integration Testing** - Editor validates thesis alignment, revenue prioritization order, and "so what?" presence across all sections; full integration test confirms V2 quality bar

### Phase 33: Global Thesis Engine
**Goal**: Hamilton analyzes the full quarterly data payload and produces a structured global thesis — core argument, key tensions, and revenue model — that every report section subsequently receives and argues from
**Depends on**: Phase 32
**Requirements**: THESIS-01, THESIS-02, THESIS-03, THESIS-04, THESIS-05
**Success Criteria** (what must be TRUE):
  1. Calling the thesis generator with a quarterly data payload returns a structured object containing: core thesis statement, 2-3 key tensions framed as competing forces, identified revenue model, and competitive dynamics summary
  2. Generating any report section after thesis generation produces output that explicitly references the global thesis — a reader can identify the section as part of a single argument, not an isolated observation
  3. Hamilton's internal reasoning trace (if surfaced) contains 5-8 sentences; the final section output contains 2-3 sentences drawn from that reasoning — the compression is observable when verbose mode is enabled
  4. At least one insight in every generated section uses tension framing ("X while Y") rather than observation framing ("X is at level Z")
  5. When revenue data exists for the subject of a section, the section's first substantive statement concerns revenue implications, not pricing observations
**Plans**: 3 plans
Plans:
- [x] 33-01-PLAN.md -- Foundation: thesis types (ThesisInput/ThesisOutput/ThesisSummaryPayload) + Hamilton voice v3 with revenue-first and tension model rules
- [x] 33-02-PLAN.md -- Generator: buildThesisSummary() condensation + generateGlobalThesis() Claude call + MAX_TOKENS 1500 + remove 75-word limit
- [x] 33-03-PLAN.md -- Wiring: inject thesis into national_index orchestrator; narrative_summary passed to all 6 sections

### Phase 34: Voice v3 and Section Generator v2
**Goal**: The Hamilton voice system prompt encodes revenue prioritization, tension model, and think-then-compress; every section receives the global thesis plus cross-source context (fees + revenue + economic + regulatory + complaints); section output reaches 150-200 words
**Depends on**: Phase 33
**Requirements**: VOICE-01, SECTION-01, SECTION-02, SECTION-03
**Success Criteria** (what must be TRUE):
  1. The voice system prompt file contains explicit instructions for: revenue-before-pricing ordering, tension framing, and a think-then-compress directive — all three are present and expressed as rules, not guidelines
  2. A section generated for a fee category that has Call Report revenue data includes at least one revenue figure alongside its fee data — the two sources appear in the same analytical paragraph
  3. A section generated for a Fed district topic references at least one FRED indicator and one Beige Book theme from that district's most recent report
  4. The word count of any generated section falls between 150 and 200 words — verified by automated character/word count assertion in the test suite
**Plans**: 1 plan

Plans:
- [ ] 34-01-PLAN.md -- Fix voice Rule 6 conflict + enrich section data payloads (FRED/Beige Book) + cross-source context instructions + word-count range tests

### Phase 35: Unified Chat Persona
**Goal**: The four existing chat agents (Ask/Analyst/ContentWriter/CustomQuery) are replaced by a single Hamilton that routes depth and language by user role — consumer, pro, or admin — while sharing one reasoning layer
**Depends on**: Phase 33 (unified persona inherits the voice and reasoning layer established by thesis engine)
**Requirements**: UNIFY-01, UNIFY-02, UNIFY-03, UNIFY-04, UNIFY-05
**Success Criteria** (what must be TRUE):
  1. A single API route handles all chat requests; the agent behavior differs by role parameter (consumer/pro/admin) — no separate agent files or routes exist for the old four agents
  2. Two responses to the same question, one as consumer role and one as admin role, are observably different in vocabulary and depth — consumer response avoids jargon; admin response includes operational flags or data quality signals
  3. A consumer-role response to "explain my bank's overdraft fee" reads as plain language a non-banker can understand — no industry acronyms without explanation, no data dumps
  4. A pro-role response to a competitive question includes peer context and revenue comparison — not just the queried institution's data in isolation
  5. An admin-role response to a fee anomaly question includes a data quality signal or operational flag alongside the substantive analysis
**Plans**: TBD

### Phase 36: Tool and Regulation Intelligence
**Goal**: All 16 tool descriptions carry strategic cross-reference guidance; all 13 data sources are confirmed accessible via queryNationalData; CFPB, OCC, and Fed regulatory signals are connected to internal fee data with institution-level impact counts
**Depends on**: Phase 33 (tool guidance should reference thesis-driven reasoning patterns)
**Requirements**: TOOLS-01, TOOLS-02, TOOLS-03, REG-01, REG-02, REG-03
**Success Criteria** (what must be TRUE):
  1. Every tool description contains a "when to use" section specifying the question type that warrants pulling that tool's data — not just what the tool returns
  2. Querying `queryNationalData` with a district-focused question triggers calls to at least three distinct sources (e.g., Beige Book + FRED + CFPB) — confirmed by tool call trace in verbose mode
  3. Hamilton can answer "how many institutions in our database have fee structures similar to those targeted by this CFPB enforcement action?" — the response cites both the regulatory source and an institution count from internal data
  4. A compliance risk query returns institutions with above-median fees AND above-average complaint rates for at least one fee category — both signals appear in the same response
  5. Hamilton can reference industry ROA, efficiency ratio, or deposit growth in an answer that starts from a fee question — the financial context enrichment is automatic, not prompt-dependent
**Plans**: TBD

### Phase 37: Editor v2 and Integration Testing
**Goal**: The editor validates thesis alignment, revenue prioritization, and implication presence across all sections; a full integration run through a quarterly report confirms the V2 quality bar is met end-to-end
**Depends on**: Phase 34, Phase 35, Phase 36 (editor validates output from all upgraded components)
**Requirements**: VOICE-02, VOICE-03, VOICE-04
**Success Criteria** (what must be TRUE):
  1. Running the editor against a multi-section report draft flags any section whose argument contradicts the global thesis — the flag includes the specific contradiction, not a generic warning
  2. Running the editor against a section that describes pricing data without mentioning revenue (when revenue data exists) flags that section with a "revenue prioritization" warning — the editor does not pass it silently
  3. Running the editor against a section that ends with data description and no implication ("fees averaged $X") flags it with a "missing implication" warning — the editor enforces "so what?" presence
**Plans**: TBD

---

## Backlog

### Phase 999.1: Make all admin tables sortable (BACKLOG)

**Goal:** Every table on /admin pages should have clickable column headers with sort state (asc/desc/none). Currently most tables are static. Priority pages: /admin/districts, /admin/national, /admin/index, /admin/fees, /admin/market.
**Requirements:** TBD
**Plans:** 0/1 plans complete

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.2: Wire Phase 23-24 data into districts pages (BACKLOG)

**Goal:** /admin/districts and /admin/districts/[id] pages should consume new Phase 23-24 query functions: getDistrictEconomicSummary(), getDistrictFeeRevenue(), getDistrictComplaintSummary(), getBeigeBookThemes(). Currently district pages may show stale or incomplete data.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> ... -> 32 -> 33 -> 34 -> 35 -> 36 -> 37

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Test Infrastructure | v1.0 | 2/2 | Complete | 2026-04-06 |
| 2. Seed Stage Tests | v1.0 | 1/1 | Complete | 2026-04-06 |
| 3. Discovery Stage Tests | v1.0 | 1/1 | Complete | 2026-04-06 |
| 4. Extraction Stage Tests | v1.0 | 1/1 | Complete | 2026-04-06 |
| 5. Categorization Stage Tests | v1.0 | 1/1 | Complete | 2026-04-06 |
| 6. Validation Stage Tests | v1.0 | 1/1 | Complete | 2026-04-06 |
| 7. Audit Trail Verification | v1.0 | 1/1 | Complete | 2026-04-06 |
| 8. Idempotency and Timing | v1.0 | 1/1 | Complete | 2026-04-06 |
| 9. Full Pipeline Test | v1.0 | 1/1 | Complete | 2026-04-06 |
| 10. CI Integration | v1.0 | 1/1 | Complete | 2026-04-06 |
| 11. Modal Pre-flight | v1.0 | 1/1 | Complete | 2026-04-06 |
| 12. Hamilton Foundation | v2.0 | 5/5 | Complete | 2026-04-06 |
| 13. Report Engine Core | v2.0 | 3/3 | Complete | 2026-04-06 |
| 14. Recurring Reports | v2.0 | 3/3 | Complete | 2026-04-06 |
| 15. Premium Products | v2.0 | 3/3 | Complete | 2026-04-06 |
| 16. Public Catalog + Go-to-Market | v2.0 | 3/3 | Complete | 2026-04-07 |
| 17. Hamilton Chat | v2.0 | 3/3 | Complete | 2026-04-07 |
| 18. Report Assembly Pipeline | v2.0 | 1/1 | Complete | 2026-04-07 |
| 19. Wave Orchestrator | v3.0 | 2/2 | Complete | - |
| 20. Iterative Deepening | v3.0 | 1/2 | Complete | 2026-04-08 |
| 21. Knowledge Automation | v3.0 | 2/2 | Complete | 2026-04-08 |
| 22. Wave Reporting | v3.0 | 2/2 | Complete | 2026-04-08 |
| 23. Call Report & FRED Foundation | v5.0 | 5/5 | Complete | 2026-04-08 |
| 24. Industry Health & Beige Book | v5.0 | 1/2 | Complete | 2026-04-08 |
| 25. Derived Analytics & Hamilton Tools | v5.0 | 2/2 | Complete | 2026-04-08 |
| 26. National Data Admin Portal | v5.0 | 2/2 | Complete | 2026-04-08 |
| 27. External Intelligence System | v5.0 | 2/0 | Complete | 2026-04-08 |
| 28. Audience Shell Separation | v6.0 | 0/TBD | Not started | - |
| 29. Consumer Landing Page | v6.0 | 2/2 | Complete   | 2026-04-08 |
| 30. Institution Educational Pages | v6.0 | 0/TBD | Not started | - |
| 31. B2B Launchpad Dashboard | v6.0 | 0/TBD | Not started | - |
| 32. Scoped Report Generation and PDF Export | v6.0 | 0/TBD | Not started | - |
| 33. Global Thesis Engine | v7.0 | 3/3 | Complete    | 2026-04-08 |
| 34. Voice v3 and Section Generator v2 | v7.0 | 0/1 | Complete    | 2026-04-08 |
| 35. Unified Chat Persona | v7.0 | 0/TBD | Not started | - |
| 36. Tool and Regulation Intelligence | v7.0 | 0/TBD | Not started | - |
| 37. Editor v2 and Integration Testing | v7.0 | 0/TBD | Not started | - |
