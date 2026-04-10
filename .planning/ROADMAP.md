# Roadmap: Bank Fee Index

## Milestones

- [x] **v1.0 E2E Pipeline Test Suite** - Phases 1-11 (shipped 2026-04-06)
- [x] **v2.0 Hamilton — Research & Content Engine** - Phases 12-18 (shipped 2026-04-07)
- [x] **v3.0 National Coverage Push** - Phases 19-22 (shipped 2026-04-08)
- [x] **v5.0 National Data Layer** - Phases 23-27 (shipped 2026-04-08)
- [ ] **v6.0 Two-Sided Experience** - Phases 28-32 (in progress)
- [x] **v7.0 Hamilton Reasoning Engine** - Phases 33-37 (shipped 2026-04-08)
- [x] **v8.0 Hamilton Pro Platform** - Phases 38-46 (shipped 2026-04-09)
- [ ] **v8.1 Hamilton Pro Live Data Wiring** - Phases 47-54 (in progress)

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
- [x] 27-01-PLAN.md — External intelligence DB schema and ingest UI (INTEL-01, INTEL-03)
- [ ] 27-02-PLAN.md — Hamilton tool integration for search and citation (INTEL-02, INTEL-04)

---

## v6.0 Two-Sided Experience

**Milestone Goal:** Create distinct, cohesive user experiences for consumers and B2B subscribers -- so each audience gets a tailored front door, clear value proposition, and purpose-built tools.

- [x] **Phase 28: Audience Shell Separation** - Distinct nav components per audience, centralized pro auth guard, personalization service (completed 2026-04-08)
- [x] **Phase 29: Consumer Landing Page** - Value-prop-first landing page replacing split-panel gateway, embedded Fee Scout, trust signals, consumer guide teasers, B2B door (completed 2026-04-08)
- [x] **Phase 30: Institution Educational Pages** - "Why does this matter?" callouts, peer percentile indicators, fee distribution charts, B2B report links per institution (completed 2026-04-08)
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
- [x] 28-01-PLAN.md -- ConsumerNav + personalization service
- [x] 28-02-PLAN.md -- ProNav + auth guard + visual verification
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
- [x] 30-01-PLAN.md -- Fee callout explainers + PercentileBadge in PositionBar
- [x] 30-02-PLAN.md -- Fee Distribution histograms + Intelligence section with B2B CTAs
**UI hint**: yes

### Phase 30.1: Institution Page V2 -- Consumer Decision Page (INSERTED)
**Goal**: Transform the institution page from a static fee table into a consumer decision page with summary card, interpretation block, visual comparisons, fee count context, strengths/watch section, enhanced table indicators, comparison hooks, and clear pro CTAs
**Depends on**: Phase 30
**Requirements**: INST-01, INST-02, INST-03, INST-04
**Success Criteria** (what must be TRUE):
  1. A consumer can answer "Is this institution expensive or not?" within 5 seconds of landing on the page (summary card with green/yellow/red rating visible above the fold)
  2. Visual comparison bars show the institution's key fees (overdraft, maintenance, wire, NSF) against national medians with normalized bar lengths
  3. Fee table replaces "-" indicators with directional arrows (above/below/equal) with color coding
  4. A single mid-page CTA and footer CTA provide clear upgrade paths without interrupting the consumer flow
  5. "Strengths" and "Watch" bullets are derived from fee-vs-median comparisons, max 2 each
**Plans**: 2 plans
Plans:
- [x] 30.1-01-PLAN.md -- Rating engine + V2 consumer components (FeeSummaryCard, InterpretationBlock, FeeComparisonBars, FeeCountCard, ProsConsBlock)
- [x] 30.1-02-PLAN.md -- Page restructure, table indicators, MidPageCTA, CompareSection, footer CTA
**UI hint**: yes
**Spec**: `.planning/phases/30-institution-educational-pages/institution-v2-spec.md`

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
- [ ] 31-01-PLAN.md -- Four-door launchpad grid + peer snapshot sidebar
- [ ] 31-02-PLAN.md -- Recent activity panel + Beige Book digest + visual checkpoint
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
- [x] 32-01-PLAN.md -- Report type selector, scope forms, daily limits, generation flow
- [ ] 32-02-PLAN.md -- Report history page + visual verification
**UI hint**: yes

---

<details>
<summary>v7.0 Hamilton Reasoning Engine (Phases 33-37) - SHIPPED 2026-04-08</summary>

- [x] Phase 33: Global Thesis Engine (3/3 plans) -- completed 2026-04-08
- [x] Phase 34: Voice v3 and Section Generator v2 (1/1 plan) -- completed 2026-04-08
- [x] Phase 35: Unified Chat Persona (2/2 plans) -- completed 2026-04-08
- [x] Phase 36: Tool and Regulation Intelligence (2/2 plans) -- completed 2026-04-08
- [x] Phase 37: Editor v2 and Integration Testing (1/1 plan) -- completed 2026-04-08

See: `.planning/milestones/v7.0-ROADMAP.md` for full details.

</details>

---

---

## v8.0 Hamilton Pro Platform

**Milestone Goal:** Transform Hamilton from a chat-based research agent into a 5-screen decision system for fee pricing, peer positioning, and regulatory-risk evaluation -- the paid Pro experience ($500/mo or $5,000/yr).

- [x] **Phase 38: Architecture Foundation** - CSS isolation boundary, TypeScript DTOs, mode enum, navigation source, and screen ownership rules (completed 2026-04-09)
- [x] **Phase 39: Data Layer** - 6 new PostgreSQL tables, ensureHamiltonProTables(), confidence tier field, soft-delete columns (completed 2026-04-09)
- [x] **Phase 40: Hamilton Shell** - Route group layout, top nav, context bar, left rail workspace memory, institutional context flow (completed 2026-04-09)
- [x] **Phase 41: Settings** - Institution profile, peer set configuration, feature access, billing status, intelligence snapshot panel (completed 2026-04-09)
- [x] **Phase 42: Home / Executive Briefing** - Thesis card, What Changed, Priority Alerts, Recommended Action CTA, Positioning Evidence, Monitor Feed preview (completed 2026-04-09)
- [x] **Phase 43: Analyze Workspace** - Analysis workspace with tabs, Explore Further prompts, saved analyses, CTA hierarchy, screen boundary enforcement (completed 2026-04-09)
- [x] **Phase 44: Simulate** - Fee slider, Current vs Proposed comparison, strategy interpretation, tradeoffs panel, Recommended Position, scenario archive, board summary CTA (completed 2026-04-09)
- [x] **Phase 45: Report Builder** - Template gallery, configuration sidebar, executive summary generation, read-only enforcement, PDF export, scenario-linked reports, implementation notes (completed 2026-04-09)
- [x] **Phase 46: Monitor** - Status strip, Priority Alert card, Signal Feed timeline, Watchlist panel, floating chat overlay, Fee Movements panel (completed 2026-04-09)

### Phase 38: Architecture Foundation
**Goal**: The type system, CSS isolation, mode behavior config, and navigation contract are in place so all Hamilton screens build on a shared, non-conflicting foundation
**Depends on**: Phase 37
**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05
**Success Criteria** (what must be TRUE):
  1. Styles applied inside `.hamilton-shell` do not bleed into or inherit from admin portal styles -- a developer can verify by inspecting both in the same browser session
  2. The TypeScript compiler rejects any API response that does not conform to its declared DTO (AnalyzeResponse, SimulationResponse, ReportSummaryResponse, MonitorResponse)
  3. MODE_BEHAVIOR config correctly gates capabilities per screen: attempting to call `canRecommend` from Analyze returns false; calling it from Simulate returns true
  4. Navigation source file is the single source of truth -- removing an entry from the nav source removes it from the rendered top nav without additional code changes
  5. The TypeScript compiler rejects an attempt to invoke a recommendation from the Analyze screen (screen ownership enforced at type level)
**Plans**: 2 plans
**UI hint**: yes

Plans:
- [x] 38-01-PLAN.md -- CSS isolation boundary (.hamilton-shell scoping, design tokens, dark mode)
- [x] 38-02-PLAN.md -- TypeScript contracts (screen DTOs, modes, navigation source of truth)

### Phase 39: Data Layer
**Goal**: All 6 Hamilton Pro tables exist in PostgreSQL, can be created idempotently on first access, and carry the fields needed for confidence tracking, archiving, and scenario management
**Depends on**: Phase 38
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):
  1. Calling `ensureHamiltonProTables()` on a fresh database creates all 6 tables with correct schema -- calling it again on an existing database is a no-op with no errors
  2. A scenario row can be saved with a confidence tier of "strong", "provisional", or "insufficient" -- any other value is rejected by a DB constraint or application-level validation
  3. An analysis and a scenario can each be soft-deleted (archived) -- a soft-deleted row does not appear in default list queries but remains in the database and is recoverable
**Plans**: 2 plans

Plans:
- [x] 39-01-PLAN.md -- ensureHamiltonProTables() with 6 tables, indexes, constraints + confidence tier module
- [x] 39-02-PLAN.md -- Unit tests for confidence tiers and pro-tables structural validation

### Phase 40: Hamilton Shell
**Goal**: All Hamilton screens share a single server-rendered layout shell with top nav, context bar, and left rail -- institutional context set in Settings flows to every screen without per-screen selection
**Depends on**: Phase 39
**Requirements**: SHELL-01, SHELL-02, SHELL-03, SHELL-04, SHELL-05
**Success Criteria** (what must be TRUE):
  1. Navigating between any two Hamilton screens preserves the active institution and horizon displayed in the context bar -- no re-selection prompt appears between screens
  2. The top nav renders correct active state highlighting for the current screen without client-side JavaScript; the active link is visually distinct at page load
  3. The left rail shows saved analyses, recent work, and pinned institutions from the Hamilton workspace memory -- items are clickable and navigate to the correct saved state
  4. Accessing any Hamilton screen without a valid Pro subscription redirects to an upgrade page -- the auth check lives in the shell layout, not in individual screen components
**Plans**: 2 plans

Plans:
- [x] 40-01-PLAN.md -- Fix HAMILTON_NAV href discrepancy + create (hamilton) route group with layout and 5 stub pages
- [x] 40-02-PLAN.md -- Build HamiltonShell, HamiltonTopNav, HamiltonContextBar, HamiltonLeftRail, HamiltonUpgradeGate and wire into layout
**UI hint**: yes

### Phase 41: Settings
**Goal**: A Pro subscriber can configure their institution profile and peer sets in one place, and those settings propagate to all Hamilton screens as the persistent institutional context
**Depends on**: Phase 40
**Requirements**: SET-01, SET-02, SET-03, SET-04, SET-05
**Success Criteria** (what must be TRUE):
  1. A user can save an institution name, type, asset tier, and Fed district -- after saving, these values appear in the Hamilton context bar on the next page load
  2. A user can create a named peer set by selecting charter, asset tiers, and districts -- the peer set is saved and available for selection in Simulate and Report screens
  3. The intelligence snapshot panel shows the user's account tier, feature access toggles, and a usage stat (e.g., reports generated this month)
  4. The billing panel displays the current subscription plan, renewal date, and a link to manage billing -- no billing logic is handled on this page (Stripe redirect)
**Plans:** 2/2 plans complete
Plans:
- [x] 41-01-PLAN.md -- Server actions, avatar dropdown, institution profile form with Strategy Settings design
- [x] 41-02-PLAN.md -- Peer set management, intelligence snapshot, feature access, billing, quick actions
**UI hint**: yes

### Phase 42: Home / Executive Briefing
**Goal**: A Pro subscriber landing on the Hamilton Home screen gets a 30-second executive orientation -- one dominant thesis, recent movements, top 3 alerts, one recommended action, current fee positioning, and a Monitor feed preview
**Depends on**: Phase 41
**Requirements**: HOME-01, HOME-02, HOME-03, HOME-04, HOME-05, HOME-06
**Success Criteria** (what must be TRUE):
  1. The Hamilton's View card displays a single thesis statement with a confidence indicator -- the thesis is generated from live index data, not a placeholder
  2. The What Changed section shows at least one recent fee movement or regulatory signal with a timestamp -- it is not empty on first load for an institution with index coverage
  3. Priority Alerts shows exactly 3 alerts ranked by severity -- each alert has a severity label, one-sentence impact description, and a suggested next move
  4. The Recommended Action card contains a single CTA that navigates directly to the Simulate screen pre-loaded with the recommended fee and proposed change
  5. Positioning Evidence shows the institution's current fee amount, national percentile, and peer median for at least one spotlight fee category
**Plans**: 2 plans

Plans:
- [x] 42-01-PLAN.md -- Data layer + Hamilton's View card + Positioning Evidence (thesis, index queries, ISR caching)
- [x] 42-02-PLAN.md -- What Changed, Priority Alerts, Recommended Action CTA, Monitor Feed preview, full page wiring
**UI hint**: yes

### Phase 43: Analyze Workspace
**Goal**: A Pro subscriber can conduct deep fee analysis by focus area, explore follow-up angles, and save analyses to their workspace -- without the screen overstepping into recommendations (which belong to Simulate)
**Depends on**: Phase 42
**Requirements**: ANLZ-01, ANLZ-02, ANLZ-03, ANLZ-04, ANLZ-05, ANLZ-06
**Success Criteria** (what must be TRUE):
  1. The analysis workspace displays Hamilton's View, What This Means, Why It Matters, and an Evidence panel -- all four sections render for any supported analysis focus
  2. Switching between Analysis Focus tabs (Pricing, Risk, Peer Position, Trend) changes the analysis lens and updates Hamilton's content without a full page reload
  3. The Explore Further section shows at least 3 context-relevant follow-up prompts -- clicking one triggers a new analysis scoped to that prompt
  4. A user can save a completed analysis and retrieve it from the left rail workspace memory in a subsequent session
  5. The Analyze screen contains no recommendation language and no "recommended position" card -- this boundary is visible in the rendered UI (no such element exists)
**Plans**: 1 plan
Plans:
- [x] 47-01-PLAN.md — Run migration 041 and restore fed_district in auth queries
**UI hint**: yes

### Phase 44: Simulate
**Goal**: A Pro subscriber can model a proposed fee change, see the strategic tradeoffs with a confidence-tiered recommendation, save the scenario, and generate a board-ready summary with one click
**Depends on**: Phase 43
**Requirements**: SIM-01, SIM-02, SIM-03, SIM-04, SIM-05, SIM-06, SIM-07
**Success Criteria** (what must be TRUE):
  1. Dragging the fee slider updates the percentile indicator and peer gap in real time -- no page reload or explicit submit is required to see the updated position
  2. The Current vs Proposed comparison shows side-by-side: current percentile, proposed percentile, distance from peer median, and risk profile label for each state
  3. The Recommended Position card displays a confidence tier badge ("strong", "provisional", or "insufficient") derived from the data maturity of the underlying fee index
  4. A user can save a scenario and retrieve it from the scenario archive -- soft-deleted scenarios do not appear in the default archive view
  5. Clicking "Generate Board Scenario Summary" produces a report-ready output that can be opened in the Report Builder screen
**Plans**: 1 plan
Plans:
- [x] 47-01-PLAN.md — Run migration 041 and restore fed_district in auth queries
**UI hint**: yes

### Phase 45: Report Builder
**Goal**: A Pro subscriber can select a report template, configure scope, generate an executive summary from Hamilton, download a McKinsey-grade PDF, and link a scenario directly into a report -- with reports enforced as read-only
**Depends on**: Phase 44
**Requirements**: RPT-01, RPT-02, RPT-03, RPT-04, RPT-05, RPT-06, RPT-07
**Success Criteria** (what must be TRUE):
  1. The template gallery shows at least 4 report types (Quarterly Strategy, Peer Brief, Monthly Pulse, State Index) -- each template has a distinct name, description, and preview
  2. A generated report contains an executive summary written by Hamilton based on the configured peer set and date range -- the summary references at least one data point from the index
  3. A user can download the generated report as a PDF file that opens in a standard viewer with correct formatting and no broken layout
  4. A scenario saved in Simulate can be selected in the Report Builder and its data auto-populates the report -- no manual re-entry of scenario parameters
  5. The generated report contains no interactive elements -- there are no sliders, input fields, or exploratory prompts visible in the rendered report
**Plans**: 1 plan
Plans:
- [ ] 45-01-PLAN.md — TBD
**UI hint**: yes

### Phase 46: Monitor
**Goal**: A Pro subscriber can continuously surveil their fee landscape through a signal feed, watchlist, and priority alert -- and ask Hamilton questions about what they're seeing without leaving the screen
**Depends on**: Phase 45
**Requirements**: MON-01, MON-02, MON-03, MON-04, MON-05, MON-06
**Success Criteria** (what must be TRUE):
  1. The status strip displays the current system state (stable/watch/worsening) and a signal count -- these values reflect seeded signal data, not hardcoded placeholders
  2. The Priority Alert card shows the top alert with severity, a one-sentence impact description, and a "Recommended next move" action link
  3. The Signal Feed timeline shows signals in reverse-chronological order -- each signal has a timestamp, institution or category label, and deviation description
  4. The Watchlist panel shows at least one tracked institution with a renewal or review status indicator -- the institution can be added and removed from the watchlist
  5. The floating chat overlay opens without navigating away from Monitor and accepts a question -- Hamilton's response appears in the overlay without disrupting the underlying signal feed
**Plans**: 1 plan
Plans:
- [ ] 46-01-PLAN.md — TBD
**UI hint**: yes

## Backlog

### Phase 999.1: Make all admin tables sortable (BACKLOG)

**Goal:** Every table on /admin pages should have clickable column headers with sort state (asc/desc/none). Currently most tables are static. Priority pages: /admin/districts, /admin/national, /admin/index, /admin/fees, /admin/market.
**Requirements:** TBD
**Plans:** 0/4 plans complete

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.2: Wire Phase 23-24 data into districts pages (BACKLOG)

**Goal:** /admin/districts and /admin/districts/[id] pages should consume new Phase 23-24 query functions: getDistrictEconomicSummary(), getDistrictFeeRevenue(), getDistrictComplaintSummary(), getBeigeBookThemes(). Currently district pages may show stale or incomplete data.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.3: FFIEC CDR production ingestion via Modal pooler (BACKLOG)

**Goal:** The FFIEC CDR overdraft revenue ingestion (RIADH032) needs the Supabase transaction pooler URL to run on Modal's browser_image containers. Add `SUPABASE_POOLER_URL` to Modal secrets and update `ingest_ffiec_cdr()` to use it. Then run `--backfill` to populate all 8 quarters.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.4: NCUA 5300 overdraft revenue for credit unions (BACKLOG)

**Goal:** RIADH032 only covers banks filing FFIEC 031/041 ($1B+ assets). Credit union overdraft data requires a separate NCUA 5300 Call Report ingestion path. Would extend overdraft coverage from 757 banks to include credit unions.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.5: Premium role access audit (BACKLOG)

**Goal:** Verify that `premium` role users cannot access `/admin` routes. Currently David Bressler (premium role) may be seeing admin content. Audit all admin layout guards and ensure role-based access is enforced correctly across consumer/pro/admin shells.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.6: Phase 28 visual verification and completion (BACKLOG)

**Goal:** Phase 28 (Audience Shell Separation) Plan 28-02 is paused at a visual verification checkpoint. ProNav + auth guard are built but need visual confirmation that consumer and pro shells render correctly. Complete the checkpoint, run cleanup task, close Phase 28.
**Requirements:** SHELL-01, SHELL-02, SHELL-03
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.7: Bcrypt migration for all legacy SHA-256 password hashes (BACKLOG)

**Goal:** The `verifyPassword` function supports both bcrypt and legacy SHA-256 hashes, but legacy hashes cause hangs on Vercel serverless. Migrate all existing SHA-256 hashed passwords to bcrypt. Add a post-login rehash step that auto-upgrades on successful login.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

---

---

## v8.1 Hamilton Pro Live Data Wiring

**Milestone Goal:** Wire every Hamilton Pro screen to real data, strip all hardcoded/demo content, and deliver a production-ready paid experience. Every screen must trace to pipeline-verified sources — no hallucinated data.

- [x] **Phase 47: Settings DB Migration** - Run migration 041, add fed_district column to users table in production (completed 2026-04-09)
- [x] **Phase 48: Pro Navigation + Full Canvas Width** - Wire existing Pro nav tabs to real fee data; enforce full canvas width on all Hamilton screens (completed 2026-04-09)
- [x] **Phase 49: Monitor Live Data** - Strip demo signals, wire real hamilton_signals queries, CRUD watchlist, real Hamilton chat streaming (completed 2026-04-09)
- [x] **Phase 50: Home / Briefing Live Data** - Wire real thesis generation, real index positioning, real alerts — no placeholder content (completed 2026-04-09)
- [x] **Phase 51: Analyze Live Data** - Verify streaming with real Hamilton API, wire focus tab context, save/load analyses, PDF export (completed 2026-04-09)
- [x] **Phase 52: Simulate Live Data** - All 49 categories, real distribution data, confidence gating, Hamilton interpretation with real API (completed 2026-04-09)
- [x] **Phase 53: Reports Library + Generation** - Curated report library, real generateSection() pipeline, PDF export end-to-end, scenario-linked reports (completed 2026-04-10)
- [ ] **Phase 54: Integration Pass** - Screen-to-screen flows, Simulate to Report context, Analyze to PDF, cross-screen data consistency

### Phase 47: Settings DB Migration
**Goal**: The production database has the fed_district column on the users table so institutional context flows correctly to all Hamilton screens
**Depends on**: Phase 46
**Requirements**: SET-01
**Success Criteria** (what must be TRUE):
  1. Running migration 041 on a fresh database adds fed_district to the users table without error
  2. Running migration 041 on a database that already has fed_district is a no-op — no duplicate column error
  3. A user who saves their Fed district in Settings sees that value persisted and visible in the Hamilton context bar on next page load
**Plans**: 1 plan
Plans:
- [ ] 47-01-PLAN.md — Run migration 041 and restore fed_district in auth queries

### Phase 48: Pro Navigation + Full Canvas Width
**Goal**: All existing Pro nav tabs show real fee data for the authenticated institution, and every Hamilton screen renders edge-to-edge with no wasted horizontal margins
**Depends on**: Phase 47
**Requirements**: NAV-01, NAV-02, MON-04
**Success Criteria** (what must be TRUE):
  1. The Pricing tab in Pro navigation shows the authenticated institution's current fee amounts from the live fee index — no placeholder or hardcoded values
  2. The Peer tab shows real peer comparison data for the institution's configured peer group
  3. Every Hamilton screen (Home, Analyze, Simulate, Reports, Monitor, Settings) uses the full browser canvas width — a developer inspecting the layout finds no centered max-width container wasting horizontal space
  4. Full canvas width applies consistently across all screens without introducing horizontal scroll
**Plans**: 2 plans
Plans:
- [x] 48-01-PLAN.md — Delete old Pro tab routes, add permanent redirects in next.config.ts
- [x] 48-02-PLAN.md — Remove maxWidth constraints from Monitor, Settings, Home pages
**UI hint**: yes
### Phase 49: Monitor Live Data
**Goal**: The Monitor screen shows a live signal feed from real DB data, supports watchlist add/remove against the real hamilton_watchlists table, and streams real Hamilton responses from the floating chat overlay
**Depends on**: Phase 48
**Requirements**: MON-01, MON-02, MON-03
**Success Criteria** (what must be TRUE):
  1. The signal feed renders rows from the real hamilton_signals table; when the table is empty, a designed empty state appears rather than a broken layout or placeholder text
  2. A user can add an institution or Fed agency to their watchlist and see it appear immediately; removing it from the UI deletes the corresponding row from hamilton_watchlists
  3. Opening the floating chat overlay and submitting a question returns a streaming Hamilton response — text appears token-by-token without a page reload
  4. No demo or hardcoded signal data appears anywhere on the Monitor screen
**Plans**: 2 plans
Plans:
- [x] 49-01-PLAN.md — Strip demo data, design empty state, clean WatchlistPanel
- [x] 49-02-PLAN.md — Fix FloatingChatOverlay streaming, wire left rail to real data
**UI hint**: yes




### Phase 50: Home / Briefing Live Data
**Goal**: Every card on the Home screen is wired to pipeline-verified data — real thesis, real index positioning, real alerts — with zero hallucinated or hardcoded content
**Depends on**: Phase 49
**Requirements**: HOME-01, HOME-02, HOME-03, HOME-04, HOME-05
**Success Criteria** (what must be TRUE):
  1. The Hamilton's View card displays a thesis generated by calling real generateGlobalThesis() with the user's peer context — the thesis changes when peer context changes
  2. The Positioning Evidence panel shows the institution's actual fee amounts and national percentile from getNationalIndex() for at least one spotlight fee category
  3. The What Changed and Priority Alerts cards pull from real signal and alert DB tables; when both tables are empty, designed empty states appear
  4. The Recommended Action card derives its suggested fee category from the thesis output and its link navigates to Simulate pre-loaded with that category
  5. A developer auditing the Home screen finds zero hardcoded fee amounts, placeholder thesis text, or fabricated recommendations
**Plans**: 2 plans
Plans:
- [x] 50-01-PLAN.md — Strip hardcoded defaults from WhatChangedCard, PriorityAlertsCard, MonitorFeedPreview, PositioningEvidence
- [x] 50-02-PLAN.md — Fix HamiltonViewCard thesis-null handling, rewire page.tsx, add RecommendedActionCard, thesis error logging
**UI hint**: yes

### Phase 51: Analyze Live Data
**Goal**: The Analyze workspace streams real Hamilton analysis, injects correct focus-tab context into the system prompt, supports saving and loading analyses, has all demo content stripped, and can export any analysis as a branded PDF
**Depends on**: Phase 50
**Requirements**: ANL-01, ANL-02, ANL-03, ANL-04, ANL-05
**Success Criteria** (what must be TRUE):
  1. Submitting a query in the Analyze workspace returns a streaming Hamilton response via the real Hamilton API with mode set to analyze — text appears token-by-token
  2. Switching between focus tabs (Pricing, Risk, Peer, Trend) changes the context injected into the Hamilton system prompt — a developer can verify different context by inspecting the API request payload
  3. A user can save a completed analysis and retrieve it from the left rail in a later session without re-running the query
  4. No hardcoded or demo analysis content is visible anywhere on the Analyze screen — all displayed content comes from real API responses or empty states
  5. A user can export the current analysis as a PDF — the downloaded file opens in a standard viewer with BFI branding and the full analysis content
**Plans**: 2 plans
Plans:
- [x] 51-01-PLAN.md — Streaming verification, focus tab validation, save/load analyses, demo content audit
- [x] 51-02-PLAN.md — AnalysisPdfDocument component, PDF route dispatch, Export PDF button


**UI hint**: yes

### Phase 52: Simulate Live Data
**Goal**: The Simulate screen works for all 49 fee categories, shows real distribution data, gates categories with insufficient data, and streams real Hamilton interpretation focused on contextual intelligence rather than concrete dollar predictions
**Depends on**: Phase 51
**Requirements**: SIM-01, SIM-02, SIM-03, SIM-04
**Success Criteria** (what must be TRUE):
  1. The category selector lists all 49 fee categories organized by family — selecting any category updates the simulation context without error
  2. After selecting a category, the distribution panel shows real median, P25, P75, and institution count from getNationalIndex() for that category
  3. Selecting a category with fewer than the minimum required observations shows an "Insufficient data" state and simulation controls are disabled with a clear explanation
  4. After adjusting the proposed fee, Hamilton's interpretation streams a real API response surfacing peer complaint patterns, peer behavior signals, and revenue subcategory context — no concrete dollar predictions appear in the output
**Plans**: 1 plan
Plans:
- [x] 52-01-PLAN.md — Family-grouped category selector, system prompt rewrite, URL param wiring
**UI hint**: yes

### Phase 53: Reports Library + Generation
**Goal**: The Reports screen is a curated library of published Hamilton publications that users can browse and download; report generation calls the real pipeline with client-specific context; PDF export works end-to-end; Simulate scenarios auto-populate linked reports
**Depends on**: Phase 52
**Requirements**: RPT-01, RPT-02, RPT-03, RPT-04, RPT-05
**Success Criteria** (what must be TRUE):
  1. The Reports screen displays a curated library of Hamilton publications (annual, quarterly, Fed district, monthly pulse) with title, date, and report type visible for each
  2. A user can click any published report to read its content and download it — no generation step is required for already-published reports
  3. Triggering report generation calls the real generateSection() pipeline with the user's institution and peer context — the generated content references real index data points
  4. A user can download a generated report as a PDF that opens correctly in a standard viewer with BFI branding applied
  5. When a user arrives at Reports from Simulate after saving a scenario, the scenario parameters auto-populate the report configuration — no manual re-entry required
**Plans**: 2 plans
Plans:
- [ ] 53-01-PLAN.md — Data layer (status column, queries, seed) + Reports page restructure with library
- [ ] 53-02-PLAN.md — Client-oriented template reframing + scenario-linked arrival**UI hint**: yes

### Phase 54: Integration Pass
**Goal**: All cross-screen flows work correctly end-to-end — CTAs navigate to the right screens with the right pre-loaded context, scenario handoffs are lossless, and institutional context is consistent across every screen
**Depends on**: Phase 53
**Requirements**: INT-01, INT-02, INT-03, INT-04
**Success Criteria** (what must be TRUE):
  1. Every Home screen CTA navigates to the correct target screen with the correct pre-loaded context — the Recommended Action CTA opens Simulate pre-loaded with the suggested fee category
  2. Saving a scenario in Simulate and navigating to Reports shows the scenario available for selection; a report generated from it contains the scenario parameters without manual re-entry
  3. Completing an analysis in Analyze and clicking export produces a downloadable branded PDF containing the analysis content — the end-to-end flow completes without error
  4. The institution name, asset tier, Fed district, and peer group are identical on every Hamilton screen — changing them in Settings propagates to all screens within one page load
**Plans**: 1 plan
Plans:
- [ ] 54-01-PLAN.md — TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> ... -> 46 -> 47 -> 48 -> 49 -> 50 -> 51 -> 52 -> 53 -> 54

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
| 27. External Intelligence System | v5.0 | 1/2 | In Progress|  |
| 28. Audience Shell Separation | v6.0 | 2/2 | Complete   | 2026-04-08 |
| 29. Consumer Landing Page | v6.0 | 2/2 | Complete   | 2026-04-08 |
| 30. Institution Educational Pages | v6.0 | 2/2 | Complete   | 2026-04-08 |
| 31. B2B Launchpad Dashboard | v6.0 | 0/TBD | Not started | - |
| 32. Scoped Report Generation and PDF Export | v6.0 | 1/2 | In Progress|  |
| 33. Global Thesis Engine | v7.0 | 3/3 | Complete    | 2026-04-08 |
| 34. Voice v3 and Section Generator v2 | v7.0 | 1/1 | Complete    | 2026-04-08 |
| 35. Unified Chat Persona | v7.0 | 2/2 | Complete    | 2026-04-08 |
| 36. Tool and Regulation Intelligence | v7.0 | 2/2 | Complete    | 2026-04-08 |
| 37. Editor v2 and Integration Testing | v7.0 | 1/1 | Complete    | 2026-04-08 |
| 38. Architecture Foundation | v8.0 | 2/2 | Complete    | 2026-04-09 |
| 39. Data Layer | v8.0 | 2/2 | Complete    | 2026-04-09 |
| 40. Hamilton Shell | v8.0 | 2/2 | Complete    | 2026-04-09 |
| 41. Settings | v8.0 | 2/2 | Complete    | 2026-04-09 |
| 42. Home / Executive Briefing | v8.0 | 2/2 | Complete    | 2026-04-09 |
| 43. Analyze Workspace | v8.0 | 1/1 | Complete    | 2026-04-09 |
| 44. Simulate | v8.0 | 1/1 | Complete    | 2026-04-09 |
| 45. Report Builder | v8.0 | 0/4 | Complete    | 2026-04-09 |
| 46. Monitor | v8.0 | 1/1 | Complete    | 2026-04-09 |
| 47. Settings DB Migration | v8.1 | 1/1 | Complete    | 2026-04-09 |
| 48. Pro Navigation + Full Canvas Width | v8.1 | 2/2 | Complete    | 2026-04-09 |
| 49. Monitor Live Data | v8.1 | 2/2 | Complete    | 2026-04-09 |
| 50. Home / Briefing Live Data | v8.1 | 2/2 | Complete    | 2026-04-09 |
| 51. Analyze Live Data | v8.1 | 2/2 | Complete    | 2026-04-09 |
| 52. Simulate Live Data | v8.1 | 1/1 | Complete    | 2026-04-09 |
| 53. Reports Library + Generation | v8.1 | 0/2 | Complete    | 2026-04-10 |
| 54. Integration Pass | v8.1 | 0/TBD | Not started | - |

## Backlog

### Phase 999.8: Screen-Aware Left Rail with Config Sidebar Integration (BACKLOG)

**Goal:** Make HamiltonLeftRail screen-aware so it shows different content per screen. On Reports, the left rail replaces the right-column ConfigSidebar with inline configuration (institution, peer set, focus area, narrative tone, generate button). On Monitor, it could show watchlist controls. On Analyze, workspace context.

**Context:** Config sidebar was attempted as a left column in the content area but the user wants it in the expandable left rail. This requires the left rail to accept screen-specific content slots or conditional rendering based on the current route.

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.9: FFIEC Call Report Data Pipeline (BACKLOG)

**Goal:** Download and ingest FFIEC CDR (banks) and NCUA 5300 (credit unions) quarterly financial data since 2001. Powers the v8.2 Home institution profile, Hamilton's financial analysis, and competitive intelligence against bankregdata.com.

**Context:**
- FFIEC CDR has quarterly Call Report data for all FDIC-insured banks
- NCUA 5300 has equivalent quarterly data for credit unions
- Data goes back to 2001+ in bulk download format (CSV/SDF)
- Hundreds of financial fields per institution per quarter (~10K institutions x 100 quarters)
- This is exactly what bankregdata.com sells access to (1,200+ customers at ~$2,500/yr)
- BFI unique angle: connect Service Charges line item to WHICH fees drive that revenue (we have fee schedules)

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.10: Home Screen Buttons Not Functional (BACKLOG)

**Goal:** Wire the "Export PDF", "Full Dashboard", "Simulate Change", "Generate Board Brief", and "Ask Hamilton" buttons on the Home / Executive Briefing screen to their correct destinations. Currently these are static buttons with no onClick handlers.

**Context:** Screenshot shows Home screen with "Export PDF" and "Full Dashboard" buttons in header, plus "Simulate Change", "Generate Board Brief", and "Ask Hamilton" CTAs at the bottom of HamiltonViewCard. None of these navigate or trigger actions. They need to link to: Export PDF -> analysis PDF export, Full Dashboard -> TBD, Simulate Change -> /pro/simulate, Generate Board Brief -> /pro/reports, Ask Hamilton -> open FloatingChatOverlay or /pro/analyze.

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.11: Left Rail as Cross-Screen Context Hub (BACKLOG)

**Goal:** The expandable left rail becomes a persistent context hub where peer sets, pinned institutions, and saved work travel across screens. Peer sets configured in the left rail feed into Monitor (filter signal feed by peer group), Analyze (1-click peer analysis), Simulate (pre-loaded peer context), and Reports (config auto-populated). The left rail is screen-aware: shows relevant controls per screen but shares the same institutional/peer context across all of them.

**User insight:** "Those peer sets travel across pages. The feed would show them in the monitor, and the analyze could be 1-click analysis." The left rail isn't just navigation — it's the persistent context layer that makes Hamilton feel like one coherent workspace instead of 5 separate screens.

**Key behaviors:**
- Peer sets selected in left rail filter Monitor signal feed to show only peer institutions
- Clicking a pinned institution in left rail on Analyze triggers immediate analysis
- Reports screen config (institution, peer set, focus, tone) lives in the left rail
- Context persists across screen navigation — switching from Monitor to Analyze keeps the same peer/institution selection

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.12: Analyze Delivers All Lenses by Default (BACKLOG)

**Goal:** When a user asks Hamilton a question on Analyze, the response should include analysis through ALL four lenses (Pricing, Risk, Peer Position, Trend) automatically — not force the user to pick one lens first. Provide the full value upfront. The user can then drill into a specific lens if they want depth, but the default is comprehensive.

**User insight:** "The lenses we had should always be in the report. The user should select which lens. We should give them the analysis through all. Provide value, don't make them chase it."

**Current behavior:** User must select a lens tab (Pricing/Risk/Peer Position/Trend) before querying. Each query only gets one lens perspective. This makes users work harder for less value.

**Target behavior:** Every analysis response is structured into 4 sections (Pricing | Risk | Peer Position | Trend). Each section has Hamilton's perspective through that lens. User gets the complete picture in one query. Lens tabs become section navigation within the response, not pre-query filters.

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.13: /pro/settings Not Working/Loading (BACKLOG)

**Goal:** Investigate and fix /pro/settings page not loading. May be a server component error, missing DB column, or auth issue. Needs debugging.

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.14: Normalize Hamilton Design Tokens (BACKLOG)

**Goal:** Replace 42+ hardcoded color values across Hamilton components with semantic CSS custom properties. Add missing tokens to .hamilton-shell block in globals.css, then replace all inline hex/rgb values.

**Scope:**
- 12 instances of rgba(216,194,184,...) border color -> --hamilton-border-subtle
- 10 instances of rgb(120 113 108) -> --hamilton-text-secondary (already exists)
- 20 instances of status colors (#b45309 amber, #b91c1c red, #16a34a green) -> --hamilton-status-warning, --hamilton-status-error, --hamilton-status-success

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)
