# Project Research Summary

**Project:** Bank Fee Index — E2E Pipeline Test Suite
**Domain:** End-to-end testing of a Python web crawl + LLM extraction + DB verification pipeline
**Researched:** 2026-04-06
**Confidence:** HIGH

## Executive Summary

This project adds end-to-end test coverage to an existing Python data pipeline that seeds bank institutions from FDIC/NCUA, discovers fee schedule URLs, crawls documents (HTML + PDF via Playwright), extracts fees via Claude Haiku, categorizes them against a 49-category taxonomy, and validates results into a SQLite database. The established pattern for this domain is a four-layer test architecture: Infrastructure (pytest config + markers), Fixtures (DB setup, HTTP mocking, config injection), Helpers and Factories (assertion utilities, synthetic data builders), and Test Cases (one file per pipeline stage plus a full-chain test). The critical design constraint is that each pipeline stage must be testable in isolation, with the full-chain test being the only test that runs all stages end-to-end.

The recommended stack is pytest 8.x with pytest-asyncio (auto mode), pytest-httpserver for crawl-layer HTTP mocking, and `unittest.mock` / pytest-mock for LLM call interception. The FEATURES.md research and the existing codebase agree on a key design split: unit tests mock the LLM to test extraction logic deterministically, while the e2e test makes real Claude Haiku calls against real institutions to validate the live pipeline. Both modes are needed — they test different things. The test DB must use an isolated SQLite file (or `:memory:`) injected via `Config`, never the production `data/crawler.db`.

The dominant risk category is environment isolation: five of the fourteen identified pitfalls involve some form of state contamination — dev DB pollution, session fixture leakage, stale lock files, Modal path divergence, and SQLite/PostgreSQL behavioral differences. These must all be addressed in Phase 1 (test infrastructure) before any crawling or extraction tests are written. A secondary risk is cost control: real LLM calls during e2e runs must be gated behind a pytest marker (`llm`) and limited to 3-5 institutions per run to keep per-run costs under $0.10.

## Key Findings

### Recommended Stack

The existing codebase already uses pytest with 60 passing unit tests, SQLite `:memory:` isolation (in `test_transition_fee_status.py`), and the `Config` injection pattern throughout pipeline commands. The e2e test infrastructure extends this rather than replacing it. All recommended libraries are either already in use or are incremental additions that do not change production code.

The HTTP mocking strategy requires two tools because the pipeline uses three HTTP clients: `pytest-httpserver` handles the crawl layer (works with `requests`, `httpx`, and Playwright via real TCP), and `vcrpy` + `pytest-recording` handles FDIC/NCUA API calls via record-and-replay cassettes. LLM mocking uses `unittest.mock.patch` on `anthropic.Anthropic.messages.create` — no third-party LLM testing library is needed and none should be used (they test output quality, not pipeline regression).

**Core technologies:**
- `pytest >= 8.0`: Test runner — already in use; plugin ecosystem unmatched for Python
- `pytest-asyncio >= 1.0` with `asyncio_mode = "auto"`: Async test support — required for httpx/asyncpg/Playwright; must use auto mode to prevent silent test skipping on Python 3.12+
- `pytest-httpserver >= 1.1.5`: Crawl HTTP mocking — only tool that intercepts all three HTTP clients at TCP level
- `vcrpy >= 8.1.1` + `pytest-recording >= 0.13`: FDIC/NCUA API replay — commit cassettes for CI reproducibility; use `filter_headers=['Authorization']` before committing
- `pytest-mock >= 3.14`: LLM mock interface — cleaner than raw `@patch` decorators, works with async
- `freezegun >= 1.5` + `pytest-freezer >= 0.4`: Timestamp control — required for deterministic `crawled_at` / `created_at` assertions
- `Faker >= 30.0`: Synthetic institution data — avoids hardcoded fixture banks that go stale
- `pytest-timeout >= 2.3`: CI safety — prevent hangs on network I/O; global 600s ceiling
- SQLite `:memory:` (stdlib): Test DB isolation — already validated in this codebase

**Do not use:** `responses` (only intercepts `requests`, not httpx/Playwright), `httpretty` (breaks asyncio), `pytest-vcr` (conflicts with pytest-recording), `testcontainers` (Docker adds 30-60s startup), `DeepEval`/`LangSmith` (LLM quality tools, not regression fixtures), `pytest-playwright` fixtures (designed for UI testing, not scraping).

### Expected Features

**Must have (table stakes):**
- Isolated test database — override `Config.database.path` to `tmp_path` before any DB construction; never touch `data/crawler.db`
- Geography-scoped institution seeding — `state='VT'` (small, fast) as deterministic default; fixture JSON for FDIC API fallback
- Stage-by-stage pipeline execution with captured `run_id` — test wraps `run_pipeline()` and references the run for post-run assertions
- Non-zero fee extraction assertion — at least 1 fee extracted across all seeded institutions (not per institution)
- URL discovery assertion — at least 1 `crawl_targets` row gets a `fee_schedule_url` populated
- Crawl result record verification — every attempted crawl has a `crawl_results` row with `status IN ('success', 'failed', 'unchanged')`
- FK integrity check — no orphaned `extracted_fees` rows (LEFT JOIN assertion)
- Fee categorization coverage — at least 1 fee has a non-null `fee_category`
- Confidence scoring populated — at least 1 fee with `extraction_confidence > 0`
- Auto-staging assertion — at least 1 fee with `confidence >= 0.85` has `review_status = 'staged'`
- Human-readable summary report — per-institution funnel trace + aggregate counts to stdout
- Teardown and cleanup — `tmp_path` handles DB; explicit cleanup for any downloaded documents

**Should have (differentiators):**
- Per-institution funnel trace — structured dict showing exactly where each institution's pipeline broke
- Audit trail completeness check — every staged fee must have a `fee_reviews` row with `action = 'stage'`; relational JOIN assertions, not row counts
- Confidence distribution sanity check — no fee outside `[0.0, 1.0]`; median above 0.6
- Validation flags format check — `validation_flags` parses as valid JSON for all non-null rows
- Stage timing capture — wall-clock time per stage in the summary report (emit, do not assert)
- Parametric geography fixture — `--geography state=XX` CLI option with 'VT' default

**Defer to later:**
- Idempotency test — run pipeline twice, assert no duplicate rows; valuable but doubles run time; add as `@pytest.mark.slow`
- Browser-based admin UI assertions — out of scope per PROJECT.md
- SerpAPI discovery fallback — explicitly excluded per PROJECT.md
- DB migration script tests — belongs in schema tests, not e2e tests

### Architecture Approach

The test suite uses a four-layer architecture inside `fee_crawler/tests/e2e/`: Infrastructure (pytest.ini markers + env var contract), Fixtures (session-scoped DB + config + HTTP mock; function-scoped data inserts), Helpers and Factories (db_assertions.py for relational assertions, report.py for summary output, institution.py factory for synthetic crawl_target rows), and Test Cases (one file per pipeline stage: seed, discover, crawl, validate, plus `test_pipeline_full.py`). The directory structure is additive — it does not touch the existing `fee_crawler/tests/` unit tests. Data always flows forward through the test: factory inserts rows, stages transform them, assertions read final state. No test stage modifies upstream tables.

**Major components:**
1. `e2e/conftest.py` — Session fixtures: `test_db_path` (schema creation), `test_config` (Config pointing at test DB, delays zeroed), `mock_external_http` (autouse, intercepts FDIC/NCUA + crawl URLs)
2. `factories/institution.py` — Builds synthetic `crawl_target` dicts with `website_url` pointing to mock server; inserts via direct DB call
3. `helpers/db_assertions.py` — Relational assertions: `assert_crawl_result_exists`, `assert_fees_extracted`, `assert_audit_trail_complete`, `assert_fees_categorized`
4. `helpers/report.py` — Post-run summary builder; reads DB, returns structured dict, called from `test_pipeline_full.py`
5. `test_pipeline_full.py` — Only file that runs the full linear chain; marked `@pytest.mark.slow`; uses flexible assertions

### Critical Pitfalls

1. **Test database contamination** — Override `Config.database.path` to `tmp_path_factory` temp file before any DB construction; assert at teardown that production DB `mtime` was not changed. Address in Phase 1.
2. **Session fixture state leakage** — Use `scope="session"` only for schema creation and mock server activation; use `scope="function"` for any fixture that writes data rows; never `autouse=True` on data-writing fixtures. Address in Phase 1.
3. **Stale pipeline lock file** — Override `LOCK_FILE` config to point inside `tmp_path`; wrap all pipeline invocations in `try/finally` calling `release_lock()`. Address in Phase 1.
4. **Asserting exact values on LLM output** — Assert structural properties only: `len >= 1`, `amount > 0`, `category IN VALID_CATEGORIES`, `0.0 <= confidence <= 1.0`. Never assert specific amounts, fee names, or exact row counts. Address in Phase 1 (design time).
5. **FDIC API downtime breaking seed stage** — Ship pre-fetched `fdic_seed_vt.json` fixture file; use it as default; add `--live-seed` flag for scheduled CI only. Address in Phase 1.
6. **LLM cost runaway** — Gate real Haiku calls behind `@pytest.mark.llm`; cache crawled documents to a fixture dir on first run; set `daily_budget_usd = 2.0` in test config; run e2e at most once per day in CI. Address in Phase 2.
7. **Missing relational integrity assertions** — Do not rely on row counts alone; use explicit LEFT JOIN orphan checks for `extracted_fees → crawl_results` and `fee_reviews → extracted_fees`. Address in Phase 3.

## Implications for Roadmap

Based on combined research, the build has three natural phases driven by dependency order and risk mitigation priorities.

### Phase 1: Test Infrastructure and Isolation

**Rationale:** Five of the fourteen pitfalls are in this phase. Environment contamination is the highest-consequence failure mode — if the test DB isolation is wrong, every subsequent test produces unreliable data. This must be built and verified before any real crawling happens. It is also fast to build (pure configuration and fixture code, no actual pipeline invocations).

**Delivers:** A working pytest configuration, isolated temp DB, HTTP mock server activation, FDIC fixture JSON, institution factory, and function-scoped clean_db fixture. A minimal smoke test that seeds 3 institutions into the test DB and asserts the row count is the acceptance criterion.

**Addresses:** Table stakes — isolated test DB, geography-scoped seeding, teardown/cleanup.

**Avoids:**
- Pitfall 1 (DB contamination) — Config path override + teardown assertion
- Pitfall 4 (fixture leakage) — Function-scoped data fixtures
- Pitfall 5 (stale lock file) — LOCK_FILE override in fixture
- Pitfall 8 (FDIC API downtime) — Committed fixture JSON
- Pitfall 3 (exact-value LLM assertions) — Assertion guidelines established before any test is written

**Stack used:** pytest 8.0, pytest-asyncio, pytest-httpserver, vcrpy + pytest-recording, Faker, tmp_path_factory

### Phase 2: Stage-Isolated Pipeline Tests with Real I/O

**Rationale:** With isolation proven, each pipeline stage can be tested independently using controlled inputs. The key insight from ARCHITECTURE.md is that stage tests should use direct DB inserts to set up inputs that upstream stages would have produced — this allows testing stage 3 (crawl) without re-running stages 1 and 2. LLM cost controls must be established here before any real Haiku calls are made.

**Delivers:** Four stage-isolated test files (`test_pipeline_seed.py`, `test_pipeline_discover.py`, `test_pipeline_crawl.py`, `test_pipeline_validate.py`), db_assertions helpers, LLM marker (`@pytest.mark.llm`) with cost guard, and stage timing capture in the report helper.

**Addresses:** Core assertions (URL discovery, crawl results, extracted fees, FK integrity, categorization, confidence, auto-staging); differentiators (per-institution funnel trace, confidence distribution sanity check, validation flags format check).

**Avoids:**
- Pitfall 3 (exact-value assertions) — Structural checks enforced via db_assertions helper contract
- Pitfall 6 (website downtime) — Aggregate assertions with `MIN_SUCCESSFUL_EXTRACTIONS = 2`
- Pitfall 7 (LLM cost runaway) — Document cache + budget cap in test config
- Pitfall 9 (discovery timeout) — Shortened COMMON_PATHS list + 10s per-domain timeout in test config
- Pitfall 13 (robots.txt silent failure) — Log blocks separately, exclude from assertion denominator
- Pitfall 14 (PDF/OCR silent failure) — Pre-flight Tesseract check; assert error_message present on zero-fee PDF

**Stack used:** pytest-mock (LLM mock fixture), freezegun + pytest-freezer (timestamp assertions), pytest-httpserver (Playwright-compatible crawl mocking), helpers/report.py

### Phase 3: Full Pipeline Test, Audit Trail Verification, and CI Integration

**Rationale:** Only after all stages pass in isolation does it make sense to run the full chain. The full-chain test is slow and expensive — it should be marked `@pytest.mark.slow` and excluded from default CI runs. Audit trail relational integrity requires the full pipeline to have run, so it belongs here. Modal environment validation also belongs here since it requires a working full pipeline to validate.

**Delivers:** `test_pipeline_full.py` (full chain, `@pytest.mark.slow`), audit trail relational integrity assertions, structured JSON run report (`data/e2e_report.json`), GitHub Actions job configuration for scheduled daily e2e runs, Modal environment pre-flight validation.

**Addresses:** Differentiators — audit trail completeness check, parametric geography fixture; table stakes — human-readable summary report.

**Avoids:**
- Pitfall 10 (missing relational integrity) — Explicit LEFT JOIN orphan assertions for fee_reviews chain
- Pitfall 11 (Modal environment divergence) — Config-driven paths, API key pre-flight check, DATABASE_URL pointing at Supabase test schema
- Pitfall 12 (unreadable CI output) — Structured JSON report written alongside pytest output
- Pitfall 2 (SQLite/Postgres divergence) — Smoke-test CI run against Supabase test schema to surface Postgres-specific failures

### Phase Ordering Rationale

- Phase 1 must come first because all subsequent tests depend on correct DB isolation. Building tests before isolation is proven will produce unreliable results that waste debugging time.
- Phase 2 stage isolation comes before the full-chain test because when a stage breaks, you need a clear signal from the stage-specific test, not a full-pipeline failure that could be caused by anything upstream.
- Phase 3 is last because the full-chain test and audit trail assertions require all stages to be working correctly. Modal validation requires a working full pipeline.
- The overall order follows the data flow: Infrastructure → Stage isolation → Integration.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3:** Modal environment configuration for e2e runs — the interaction between ephemeral containers, SQLite vs Supabase test schemas, and Modal secrets injection is complex enough to warrant a focused research spike before implementation.
- **Phase 2 (Playwright + pytest-httpserver integration):** The combined pattern of `pytest-httpserver` serving fixture HTML to Playwright browser contexts via pipeline code (not pytest-playwright fixtures) is verified but has limited documented examples. A prototype in Phase 1 to validate the integration is recommended before committing to it.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Pure pytest fixture configuration — well-documented, established patterns, existing examples in this codebase.
- **Phase 2 (non-Playwright):** pytest-mock + vcrpy + db_assertions patterns are all well-documented with official docs verified.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core tools (pytest, pytest-asyncio, pytest-mock) verified via official docs and PyPI. pytest-httpserver 1.1.5 verified. vcrpy 8.1.1 confirmed on PyPI/GitHub (released Jan 2026). One uncertainty: combined pytest-httpserver + Playwright pipeline pattern inferred from community examples, not official documentation. |
| Features | HIGH | Derived directly from pipeline schema (`executor.py`, `db.py`) and PROJECT.md constraints. Feature dependency graph verified against actual pipeline stage order. Anti-features (exact LLM value assertions, mocking HTTP for e2e) are well-supported by LLM testing literature. |
| Architecture | HIGH | Four-layer pattern verified against multiple data engineering testing references. In-memory SQLite isolation already proven in this codebase. One discrepancy between STACK.md and ARCHITECTURE.md: STACK.md recommends `pytest-httpserver` while ARCHITECTURE.md references the `responses` library — STACK.md is correct for this pipeline because `responses` only intercepts `requests`, not httpx or Playwright. |
| Pitfalls | HIGH | Most pitfalls derived from direct codebase analysis (lock file path, UNIQUE constraints, Config default path, singleton pattern). SQLite/Postgres divergence risk documented by Neon official docs. Session fixture leakage pattern from official pytest fixture documentation. |

**Overall confidence:** HIGH

### Gaps to Address

- **STACK.md / ARCHITECTURE.md discrepancy on HTTP mocking library:** ARCHITECTURE.md Pattern 2 references the `responses` library for session-scoped HTTP mocking, but STACK.md correctly identifies that `responses` only intercepts `requests` (not httpx or Playwright). During implementation, use `pytest-httpserver` as specified in STACK.md. The `responses` library reference in ARCHITECTURE.md should be treated as illustrative of the fixture pattern, not a library choice.
- **Playwright + pytest-httpserver integration prototype:** The pattern of `pytest-httpserver` serving files to a Playwright browser context driven by pipeline code (not pytest-playwright) has limited documented examples. Prototype this early in Phase 1 to de-risk Phase 2.
- **Modal e2e scope decision:** Research flags Modal as requiring a Supabase test schema (not SQLite). This requires a decision on whether to create a dedicated Supabase test schema or to run Modal e2e against a staging database. This decision should be made before Phase 3 planning begins.
- **vcrpy cassette strategy for CI:** The research recommends committing FDIC/NCUA cassettes since they are public data. Confirm this does not violate any rate-limiting terms of service for these government APIs before committing cassettes.

## Sources

### Primary (HIGH confidence)
- pytest-asyncio 1.0 migration docs (pytest-asyncio.readthedocs.io) — asyncio_mode auto requirement
- pytest-httpserver 1.1.5 docs (pytest-httpserver.readthedocs.io) — TCP-level HTTP mocking
- Official pytest fixture docs (docs.pytest.org) — scope rules, tmp_path_factory, fixture lifecycle
- Official Playwright Python docs (playwright.dev/python/docs/mock) — route interception
- requests-mock / respx official docs — HTTP transport mocking patterns
- Neon official docs (neon.com/blog) — SQLite vs PostgreSQL behavioral divergence
- Existing codebase: `fee_crawler/tests/test_transition_fee_status.py` — in-memory SQLite pattern already in use
- Existing codebase: `fee_crawler/pipeline/executor.py` — `run_pipeline()` interface, skip flags, `run_id` return

### Secondary (MEDIUM confidence)
- Start Data Engineering: E2E + integration test articles — pipeline stage isolation patterns
- josephmachado/e2e_datapipeline_test (GitHub) — reference implementation for data pipeline e2e tests
- vcrpy 8.1.1 changelog (vcrpy.readthedocs.io) — confirmed on PyPI/GitHub, released January 2026
- Medium: Designing E2E Test Infrastructure with Pytest — four-layer architecture pattern
- SitePoint: Testing AI Agents Non-Deterministic Behavior — assertion strategy for LLM output

### Tertiary (LOW confidence)
- Community examples for combined pytest-httpserver + Playwright pipeline testing — the specific pattern of using pytest-httpserver as a backend for pipeline-driven Playwright is inferred from multiple 2025 examples, not a single authoritative source

---
*Research completed: 2026-04-06*
*Ready for roadmap: yes*
