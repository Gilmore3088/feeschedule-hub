# Roadmap: Bank Fee Index

## Milestones

- [x] **v1.0 E2E Pipeline Test Suite** - Phases 1-11 (shipped 2026-04-06)
- [ ] **v2.0 Hamilton — Research & Content Engine** - Phases 12-16 (in progress)

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
  1. A single pytest invocation with `@pytest.mark.slow` runs seed → discover → extract → categorize → validate in sequence against 3-5 institutions in an isolated test DB, and the test passes without manual intervention
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

### Phase 17: Hamilton Chat — Unified Research Interface

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 16
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 17 to break down)

---

## v2.0 Hamilton — Research & Content Engine

**Milestone Goal:** Build the report engine and content library that establishes Bank Fee Index as the national authority on bank fees, powered by Hamilton, the AI research analyst.

- [x] **Phase 12: Hamilton Foundation** - Hamilton persona, generateSection() API, numeric validator, shared template system, methodology paper draft (completed 2026-04-06)
- [x] **Phase 13: Report Engine Core** - Modal render worker, R2 artifact storage, Supabase job queue, Next.js API routes, freshness gate, editor review step (completed 2026-04-06)
- [x] **Phase 14: Recurring Reports** - National quarterly report, state fee indexes, monthly pulse with cron (completed 2026-04-06)
- [x] **Phase 15: Premium Products** - On-demand competitive briefs with peer UI, pro portal with subscription gating (completed 2026-04-06)
- [x] **Phase 16: Public Catalog + Go-to-Market** - Methodology published, ISR-cached public report pages, SEO optimization (completed 2026-04-07)

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
  1. Triggering a report generation via the Next.js API returns a job ID; polling that ID transitions through `pending → assembling → rendering → complete` and a presigned download URL is available at completion
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
- [ ] 15-03-PLAN.md — report library page + Supabase RLS migration (PRO-01, PRO-03)
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

## Progress

**Execution Order:**
Phases execute in numeric order: 12 → 13 → 14 → 15 → 16

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
| 12. Hamilton Foundation | v2.0 | 5/5 | Complete    | 2026-04-06 |
| 13. Report Engine Core | v2.0 | 3/3 | Complete    | 2026-04-06 |
| 14. Recurring Reports | v2.0 | 3/3 | Complete    | 2026-04-06 |
| 15. Premium Products | v2.0 | 2/3 | Complete    | 2026-04-06 |
| 16. Public Catalog + Go-to-Market | v2.0 | 3/3 | Complete    | 2026-04-07 |
