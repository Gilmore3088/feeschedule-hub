# Requirements: Bank Fee Index — E2E Pipeline Test

**Defined:** 2026-04-06
**Core Value:** Prove the pipeline works end-to-end from geography selection to verified fees with audit trail

## v1 Requirements

### Test Infrastructure

- [ ] **INFRA-01**: Pytest markers defined: `@pytest.mark.e2e`, `@pytest.mark.llm`, `@pytest.mark.slow` for selective test runs
- [ ] **INFRA-02**: Geography parametrization allows different states/counties/MSAs across test runs
- [ ] **INFRA-03**: Test database isolation via temp SQLite file (config override, lock file to tmp_path)
- [ ] **INFRA-04**: R2 document storage bypassed in tests (local tmp_path fallback)

### Pipeline Stage Tests

- [ ] **SEED-01**: Seed test populates crawl_targets with 3-5 institutions from a random geography with correct fields (name, charter_type, website_url, asset_size, fed_district)
- [ ] **SEED-02**: Seed test handles both FDIC (banks) and NCUA (credit unions) sources
- [ ] **DISC-01**: Discover test populates fee_schedule_url for at least 1 seeded institution
- [ ] **DISC-02**: Discover test records attempts in discovery_cache with method and result
- [ ] **EXTR-01**: Extract test creates extracted_fees rows with valid confidence scores (0.0-1.0)
- [ ] **EXTR-02**: Extract test handles both PDF and HTML document types
- [ ] **EXTR-03**: Extract test records crawl_results with status (success/failed/unchanged)
- [ ] **CATG-01**: Categorize test assigns fee_family and fee_category from the 49-category taxonomy
- [ ] **CATG-02**: Categorize test normalizes fee names via alias matching
- [ ] **VALD-01**: Validate test transitions review_status based on confidence thresholds (>=0.85 staged, 0.7-0.85 pending, <0.7 extracted)
- [ ] **VALD-02**: Validate test flags outliers (3+ std dev) in validation_flags

### Audit Trail Verification

- [ ] **AUDT-01**: FK integrity verified — no orphaned crawl_results (every crawl_result has a valid crawl_target_id)
- [ ] **AUDT-02**: FK integrity verified — no orphaned extracted_fees (every extracted_fee has a valid crawl_result_id)
- [ ] **AUDT-03**: Non-zero extraction — at least 1 institution has extracted fees after full pipeline run
- [ ] **AUDT-04**: Status transitions verified — review_status moves correctly through pipeline stages

### Idempotency & Timing

- [ ] **IDEM-01**: Running pipeline twice on same institutions produces no duplicate rows in extracted_fees
- [ ] **TIME-01**: Each pipeline stage completes within its time budget (configurable per stage)

### Full Pipeline Test

- [ ] **PIPE-01**: Single test runs seed -> discover -> extract -> categorize -> validate end-to-end for 3-5 institutions
- [ ] **PIPE-02**: Full pipeline test uses random geography selection (state/county/MSA)
- [ ] **PIPE-03**: Summary report output showing institutions processed, fees extracted, failures, and timing per stage

### CI & Deployment

- [ ] **CI-01**: GitHub Actions workflow runs e2e test suite on schedule (nightly or weekly)
- [ ] **CI-02**: CI test uses pytest markers to control which tests run (e2e only, skip llm in fast mode)
- [ ] **MODL-01**: Modal pre-flight validation confirms pipeline works in Modal environment before production cron
- [ ] **MODL-02**: Modal pre-flight uses isolated test database (not production Supabase)

## v2 Requirements

### Enhanced Coverage

- **COV-01**: VCR cassettes for FDIC/NCUA API record/replay (offline CI without live API calls)
- **COV-02**: Snapshot test — verify fee_snapshots table populated with change tracking after re-crawl
- **COV-03**: Multi-geography batch test (run 3 different states in parallel)

### Reporting

- **RPT-01**: HTML test report with extraction confidence distribution charts
- **RPT-02**: Slack/email notification on e2e test failure in CI

## Out of Scope

| Feature | Reason |
|---------|--------|
| Admin UI browser tests | Separate concern — Cypress/Playwright for UI, not pipeline |
| SerpAPI discovery testing | Never used, not part of active pipeline |
| Public API endpoint tests | Downstream of extraction, not pipeline core |
| Performance benchmarking | Correctness first, perf later |
| Load testing (100+ institutions) | Cost prohibitive for routine e2e, use staging for load |
| Exact fee amount assertions | LLM non-determinism makes exact values unreliable — use structural assertions |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| SEED-01 | Phase 2 | Pending |
| SEED-02 | Phase 2 | Pending |
| DISC-01 | Phase 3 | Pending |
| DISC-02 | Phase 3 | Pending |
| EXTR-01 | Phase 4 | Pending |
| EXTR-02 | Phase 4 | Pending |
| EXTR-03 | Phase 4 | Pending |
| CATG-01 | Phase 5 | Pending |
| CATG-02 | Phase 5 | Pending |
| VALD-01 | Phase 6 | Pending |
| VALD-02 | Phase 6 | Pending |
| AUDT-01 | Phase 7 | Pending |
| AUDT-02 | Phase 7 | Pending |
| AUDT-03 | Phase 7 | Pending |
| AUDT-04 | Phase 7 | Pending |
| IDEM-01 | Phase 8 | Pending |
| TIME-01 | Phase 8 | Pending |
| PIPE-01 | Phase 9 | Pending |
| PIPE-02 | Phase 9 | Pending |
| PIPE-03 | Phase 9 | Pending |
| CI-01 | Phase 10 | Pending |
| CI-02 | Phase 10 | Pending |
| MODL-01 | Phase 11 | Pending |
| MODL-02 | Phase 11 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 after initial definition*
