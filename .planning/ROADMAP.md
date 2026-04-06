# Roadmap: Bank Fee Index — E2E Pipeline Test Suite

## Overview

Starting from zero test coverage for the live pipeline, this roadmap builds a fine-grained, stage-isolated end-to-end test suite that proves the crawl-to-extract loop works correctly. Phase 1 establishes isolation foundations that every subsequent phase depends on. Phases 2-6 test each pipeline stage independently, so a breakage in discovery cannot mask a breakage in extraction. Phases 7-8 verify the audit trail and idempotency guarantees that make the pipeline trustworthy. Phase 9 runs the full chain end-to-end. Phases 10-11 wire everything into CI and Modal pre-flight validation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Test Infrastructure** - Isolated test DB, pytest markers, HTTP mock server, geography fixtures, institution factory
- [ ] **Phase 2: Seed Stage Tests** - FDIC + NCUA institution seeding into isolated crawl_targets
- [ ] **Phase 3: Discovery Stage Tests** - Fee schedule URL discovery recorded in discovery_cache
- [ ] **Phase 4: Extraction Stage Tests** - LLM fee extraction with confidence scoring and crawl_results records
- [ ] **Phase 5: Categorization Stage Tests** - Fee family and category assignment via 49-category taxonomy
- [ ] **Phase 6: Validation Stage Tests** - Confidence-based review_status transitions and outlier flagging
- [ ] **Phase 7: Audit Trail Verification** - FK integrity and status transition assertions across all tables
- [ ] **Phase 8: Idempotency and Timing** - No duplicate rows on re-run, per-stage time budget enforcement
- [ ] **Phase 9: Full Pipeline Test** - End-to-end run for 3-5 institutions with summary report
- [ ] **Phase 10: CI Integration** - GitHub Actions workflow with marker-controlled e2e runs
- [ ] **Phase 11: Modal Pre-flight** - Modal environment validation against isolated test database

## Phase Details

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
**Plans**: TBD

### Phase 3: Discovery Stage Tests
**Goal**: The discovery stage finds and records fee schedule URLs for seeded institutions
**Depends on**: Phase 2
**Requirements**: DISC-01, DISC-02
**Success Criteria** (what must be TRUE):
  1. After running discovery against seeded crawl_targets, at least 1 institution has a non-null `fee_schedule_url` populated in the test DB
  2. Every discovery attempt (successful or not) has a corresponding `discovery_cache` row with `method` and `result` fields populated
**Plans**: TBD

### Phase 4: Extraction Stage Tests
**Goal**: The extraction stage produces confidence-scored fees with crawl records for all document types
**Depends on**: Phase 3
**Requirements**: EXTR-01, EXTR-02, EXTR-03
**Success Criteria** (what must be TRUE):
  1. At least 1 `extracted_fees` row exists with `extraction_confidence` in the range [0.0, 1.0] (no out-of-range values anywhere in the table)
  2. Extraction completes successfully for at least one PDF document and at least one HTML document (both `document_type` values represented in `crawl_results`)
  3. Every crawl attempt has a `crawl_results` row with `status` in `('success', 'failed', 'unchanged')` — no crawl attempt is unrecorded
**Plans**: TBD

### Phase 5: Categorization Stage Tests
**Goal**: The categorization stage assigns valid taxonomy labels and normalizes fee names via alias matching
**Depends on**: Phase 4
**Requirements**: CATG-01, CATG-02
**Success Criteria** (what must be TRUE):
  1. Every `extracted_fees` row has a non-null `fee_family` and `fee_category`, both matching values from the 49-category taxonomy
  2. At least 1 fee whose raw name matches a known alias is assigned the canonical `fee_category` (not left uncategorized)
**Plans**: TBD

### Phase 6: Validation Stage Tests
**Goal**: The validation stage transitions review_status correctly based on confidence and flags statistical outliers
**Depends on**: Phase 5
**Requirements**: VALD-01, VALD-02
**Success Criteria** (what must be TRUE):
  1. Every fee with `extraction_confidence >= 0.85` has `review_status = 'staged'`; fees in [0.7, 0.85) have `review_status = 'pending'`; fees below 0.7 have `review_status = 'extracted'`
  2. At least 1 fee that deviates 3+ standard deviations from the category median has a non-null entry in `validation_flags`; all `validation_flags` values parse as valid JSON
**Plans**: TBD

### Phase 7: Audit Trail Verification
**Goal**: Every record in the pipeline has valid foreign keys and correct status history — no orphans, no missing transitions
**Depends on**: Phase 6
**Requirements**: AUDT-01, AUDT-02, AUDT-03, AUDT-04
**Success Criteria** (what must be TRUE):
  1. A LEFT JOIN between `crawl_results` and `crawl_targets` returns zero rows where `crawl_target_id` is null or unmatched
  2. A LEFT JOIN between `extracted_fees` and `crawl_results` returns zero rows where `crawl_result_id` is null or unmatched
  3. At least 1 institution has at least 1 extracted fee after a full pipeline run (non-zero extraction confirmed)
  4. For every fee that is currently `review_status = 'staged'`, there exists a `fee_reviews` row with `action = 'stage'` for that fee's ID
**Plans**: TBD

### Phase 8: Idempotency and Timing
**Goal**: Running the pipeline twice produces no duplicate rows and each stage completes within its time budget
**Depends on**: Phase 7
**Requirements**: IDEM-01, TIME-01
**Success Criteria** (what must be TRUE):
  1. After running the full pipeline twice against the same 3-5 institutions, the count of `extracted_fees` rows is identical between run 1 and run 2 (no duplicate fee rows created)
  2. Each pipeline stage records its wall-clock duration and a test asserts that no stage exceeds its configured time budget (configurable per stage; test fails fast if a stage hangs)
**Plans**: TBD

### Phase 9: Full Pipeline Test
**Goal**: A single test runs all five stages end-to-end for 3-5 institutions from a random geography and produces a human-readable summary report
**Depends on**: Phase 8
**Requirements**: PIPE-01, PIPE-02, PIPE-03
**Success Criteria** (what must be TRUE):
  1. A single pytest invocation with `@pytest.mark.slow` runs seed → discover → extract → categorize → validate in sequence against 3-5 institutions in an isolated test DB, and the test passes without manual intervention
  2. The geography used is selected randomly at test time (state, county, or MSA) without requiring code changes between runs
  3. The test prints a summary report to stdout showing: institutions processed, fees extracted per institution, failures with stage and reason, and wall-clock time per stage
**Plans**: TBD

### Phase 10: CI Integration
**Goal**: GitHub Actions runs the e2e suite on schedule and uses pytest markers to control which tests run in fast vs full mode
**Depends on**: Phase 9
**Requirements**: CI-01, CI-02
**Success Criteria** (what must be TRUE):
  1. A GitHub Actions workflow file exists that triggers on schedule (nightly or weekly) and runs the e2e test suite against the repository
  2. The CI workflow accepts a parameter (or uses separate jobs) to run either `e2e` marker only (fast mode, no LLM calls) or `e2e` + `llm` + `slow` (full mode with real Haiku calls)
**Plans**: TBD

### Phase 11: Modal Pre-flight
**Goal**: A Modal function validates that the pipeline works end-to-end in the Modal execution environment before any production cron job runs
**Depends on**: Phase 10
**Requirements**: MODL-01, MODL-02
**Success Criteria** (what must be TRUE):
  1. A Modal function exists that runs the full pipeline test and returns a pass/fail result — triggering it before a production cron confirms the Modal environment is healthy
  2. The Modal pre-flight uses an isolated test database (not production Supabase) — confirmed by asserting that no rows are written to the production `DATABASE_URL` during the pre-flight run
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Test Infrastructure | 0/2 | Not started | - |
| 2. Seed Stage Tests | TBD | Not started | - |
| 3. Discovery Stage Tests | TBD | Not started | - |
| 4. Extraction Stage Tests | TBD | Not started | - |
| 5. Categorization Stage Tests | TBD | Not started | - |
| 6. Validation Stage Tests | TBD | Not started | - |
| 7. Audit Trail Verification | TBD | Not started | - |
| 8. Idempotency and Timing | TBD | Not started | - |
| 9. Full Pipeline Test | TBD | Not started | - |
| 10. CI Integration | TBD | Not started | - |
| 11. Modal Pre-flight | TBD | Not started | - |
