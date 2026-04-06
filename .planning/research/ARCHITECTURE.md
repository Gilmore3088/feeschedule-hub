# Architecture Patterns: E2E Tests for Multi-Stage Data Pipelines

**Domain:** End-to-end testing of a Python crawl/extract pipeline
**Researched:** 2026-04-06
**Overall confidence:** HIGH

---

## Recommended Architecture

E2E tests for multi-stage pipelines are organized into four distinct layers that form a dependency hierarchy. Each layer must exist before the next can be built. The layers are: Infrastructure, Fixtures, Helpers/Factories, and Test Cases.

```
┌─────────────────────────────────────┐
│  Layer 4: Test Cases                │  test_e2e_*.py
│  (assertions against DB state)      │
├─────────────────────────────────────┤
│  Layer 3: Helpers & Factories       │  helpers/, factories/
│  (data builders, assertion utils)   │
├─────────────────────────────────────┤
│  Layer 2: Fixtures                  │  conftest.py (session + function scope)
│  (DB, mocks, config, temp dirs)     │
├─────────────────────────────────────┤
│  Layer 1: Infrastructure            │  pytest.ini, conftest.py (root), env
│  (test config, markers, env vars)   │
└─────────────────────────────────────┘
```

This maps directly to a directory layout inside `fee_crawler/tests/e2e/`:

```
fee_crawler/tests/
├── conftest.py                  # Existing unit test fixtures (unchanged)
├── test_executor.py             # Existing unit tests
├── test_review_status.py
├── test_transition_fee_status.py
│
└── e2e/
    ├── conftest.py              # E2E-specific session fixtures
    ├── helpers/
    │   ├── __init__.py
    │   ├── db_assertions.py     # Assert DB state after pipeline runs
    │   └── report.py           # Summary report builder
    ├── factories/
    │   ├── __init__.py
    │   └── institution.py      # Build synthetic crawl_target rows
    ├── fixtures/
    │   ├── fdic_response.json   # Canned FDIC API response (3-5 banks)
    │   ├── ncua_response.json   # Canned NCUA API response
    │   ├── fee_schedule.html    # Static fee schedule HTML page
    │   └── fee_schedule.pdf     # Static fee schedule PDF
    ├── test_pipeline_seed.py    # Stage 1: institution seeding
    ├── test_pipeline_discover.py # Stage 2: URL discovery
    ├── test_pipeline_crawl.py   # Stage 3: crawl + extract
    ├── test_pipeline_validate.py # Stage 4: categorize + validate
    └── test_pipeline_full.py    # Full pipeline, end-to-end
```

---

## Component Boundaries

### Layer 1: Infrastructure (pytest.ini + root conftest)

Responsibility: Establish conventions, register markers, suppress noise.

What lives here:
- `pytest.ini` with `[pytest]` section — markers declaration (`e2e`, `slow`, `llm`), log level, test paths
- Root `conftest.py` — nothing yet; do not import `e2e/` fixtures here
- Environment variable contract — `TEST_DB_PATH`, `TEST_ANTHROPIC_API_KEY`, `MOCK_HTTP=1`

Does NOT contain: fixtures, test data, mock responses.

Communicates with: All other layers (consumed implicitly by pytest).

### Layer 2: Fixtures (e2e/conftest.py)

Responsibility: Provide lifecycle-managed resources to every test in `e2e/`.

Three fixture scopes are needed:

**Session-scoped (one per `pytest` invocation):**
- `test_db_path` — creates a temp SQLite file via `tmp_path_factory`, runs all schema migrations, yields the path, deletes on teardown
- `test_config` — returns a `Config` object with `database.path` pointing at `test_db_path`, crawl delays zeroed out, LLM model set to Haiku
- `http_mock` — activates `responses` library activation (or `requests_mock`) for the entire session; intercepting FDIC, NCUA, and HTTP crawl requests

**Function-scoped (one per test):**
- `clean_db` — truncates all pipeline tables between tests that need isolation; does not recreate schema
- `seeded_institutions` — uses `InstitutionFactory` to insert 3-5 synthetic `crawl_targets` rows directly, skipping the FDIC API

**Scope rules:**
- Session scope = expensive setup that is safe to share (schema creation, mock server activation)
- Function scope = anything that writes data rows (prevents cross-test contamination)
- Never use `autouse=True` for data-writing fixtures; always request them explicitly

### Layer 3: Helpers and Factories

Responsibility: Reusable logic that is not test assertions and not infrastructure.

**factories/institution.py**
Builds synthetic `crawl_target` rows from a small, deterministic set of real-looking bank records. These rows have:
- A `website_url` pointing to a mock HTTP server address (e.g., `http://mock.bank.test/`)
- A `fee_schedule_url` pointing to a fixture file path or mock URL
- Realistic `asset_size`, `charter_type`, `state_code` values

Factory output is a `dict` that can be passed directly to `db.execute("INSERT INTO crawl_targets ...")`.

**helpers/db_assertions.py**
Houses assertions about final DB state:
- `assert_crawl_result_exists(db, target_id)` — verifies a `crawl_results` row with `status='success'`
- `assert_fees_extracted(db, target_id, min_count=1)` — verifies `extracted_fees` rows exist
- `assert_audit_trail_complete(db, target_id)` — verifies `crawl_results` + `extracted_fees` + `fee_reviews` all have rows for the same `crawl_target_id`
- `assert_fees_categorized(db, target_id)` — verifies `fee_category IS NOT NULL` for extracted fees

**helpers/report.py**
Generates the post-run summary report (institutions processed, fees extracted, stages that errored, elapsed time). Reads from DB, returns a structured dict. Called from `test_pipeline_full.py` at the end of the full run.

Does NOT contain: DB setup/teardown, fixture lifecycle, test assertions (those go in test files).

### Layer 4: Test Cases (test_pipeline_*.py)

Responsibility: Assert that each pipeline stage produces correct DB state given controlled inputs.

Each file tests one stage in isolation using the fixtures and helpers from layers 1-3. File-level stage isolation is intentional: when stage 3 breaks, the test for stage 3 fails — not the full pipeline test.

`test_pipeline_full.py` is the only file that runs the full linear chain. Its assertions are intentionally flexible:
- "At least 1 institution has fees" (not exact counts)
- "All crawl_results have status in {success, failed, unchanged}" (no unknown statuses)
- "Audit trail is complete for every successful crawl" (relational consistency)

---

## Data Flow Through the Test System

Test data moves through the system in one direction, through five transformations:

```
1. Factory → DB rows
   InstitutionFactory builds synthetic crawl_targets.
   Inserted by the `seeded_institutions` fixture before the test runs.

2. DB rows → Discovery stage
   discover_urls.run() reads crawl_targets where fee_schedule_url IS NULL.
   HTTP requests to FDIC/sitemap endpoints are intercepted by http_mock.
   Mock returns canned fixture JSON. Stage writes fee_schedule_url back to DB.

3. DB rows (with URLs) → Crawl stage
   crawl.run() reads crawl_targets where fee_schedule_url IS NOT NULL.
   HTTP requests to bank websites are intercepted by http_mock.
   Mock returns fixture HTML/PDF bytes. Stage writes crawl_results + extracted_fees.

4. extracted_fees → Validation / Categorize
   categorize_fees.run() + validate_and_classify_fees() consume extracted_fees.
   No HTTP calls. Purely local computation. Updates fee_category + review_status.

5. DB state → Assertions
   db_assertions helpers read final DB state and assert correctness.
   report.py reads DB and builds the summary.
```

Key constraint: **data always flows forward**. No test stage modifies upstream tables. This makes individual stage tests composable — a test for stage 3 can call the stage 1 and 2 fixtures as prerequisites without needing to re-run those pipelines.

---

## Patterns to Follow

### Pattern 1: Layered conftest.py

Keep `e2e/conftest.py` separate from the unit test `conftest.py`. The unit test fixtures (MockConfig, in-memory DB) use different conventions than the e2e fixtures (file-backed SQLite, HTTP mocking). Mixing them causes scope conflicts and makes the unit test suite slower.

```python
# fee_crawler/tests/e2e/conftest.py
import pytest
from pathlib import Path

@pytest.fixture(scope="session")
def test_db_path(tmp_path_factory) -> Path:
    db_path = tmp_path_factory.mktemp("db") / "test_pipeline.db"
    db = Database(str(db_path))
    db.initialize()
    yield db_path
    # tmp_path_factory handles cleanup

@pytest.fixture(scope="session")
def test_config(test_db_path) -> Config:
    cfg = Config.defaults()
    cfg.database.path = str(test_db_path)
    cfg.crawl.delay_seconds = 0.0
    cfg.extraction.model = "claude-haiku-4-5-20251001"
    return cfg
```

### Pattern 2: responses Library for HTTP Mocking

The pipeline uses `requests` (not `httpx`) for FDIC/NCUA seeding and the main document download. The `responses` library intercepts `requests` calls without patching — it works at the transport layer and requires no changes to production code.

```python
# e2e/conftest.py
import responses as responses_lib

@pytest.fixture(scope="session", autouse=True)
def mock_external_http():
    with responses_lib.RequestsMock(assert_all_requests_are_fired=False) as rsps:
        # FDIC API
        rsps.add(
            responses_lib.GET,
            "https://api.fdic.gov/banks/institutions",
            json=load_fixture("fdic_response.json"),
        )
        # Fee schedule pages — keyed by institution
        rsps.add(
            responses_lib.GET,
            "http://mock.bank.test/fees",
            body=load_fixture_bytes("fee_schedule.html"),
            content_type="text/html",
        )
        yield rsps
```

For `httpx`-based calls (document download has an httpx path), use `respx` with the same pattern.

For Playwright (browser-rendered crawl): mock at the network level using `page.route()` inside a session-scoped async fixture, or use a lightweight local HTTP server (`http.server.HTTPServer` in a thread) that serves fixture files. The local server approach is simpler and does not require Playwright API knowledge in test code.

### Pattern 3: Flexible Assertions for Non-Deterministic Output

LLM output varies. Assertions must avoid brittle exact-value checks. Use range checks and structural checks:

```python
# Good
fees = db.fetchall("SELECT * FROM extracted_fees WHERE crawl_target_id = ?", (target_id,))
assert len(fees) >= 1, "Expected at least one fee extracted"
assert all(f["fee_name"] for f in fees), "All fees must have a name"

# Bad
assert fees[0]["amount"] == 12.0  # LLM may round differently
assert len(fees) == 7             # Exact count is fragile
```

### Pattern 4: Stage-Isolation via Skip Flags

Each pipeline stage command accepts `skip_*` flags. Use them to test stages independently without re-running the full chain:

```python
def test_crawl_stage_only(test_config, seeded_institutions_with_urls, test_db_path):
    db = Database(str(test_db_path))
    results = run_pipeline(db, test_config, skip_discover=True, skip_categorize=True)
    assert results["stages"]["crawl"]["status"] == "success"
```

### Pattern 5: LLM Call Control

Real LLM calls cost money. Gate them with a pytest marker:

```python
# pytest.ini
markers =
    llm: marks tests that make real Anthropic API calls (deselect with -m "not llm")
    e2e: marks full pipeline tests
    slow: marks tests taking > 30s
```

Local runs default to `pytest -m "e2e and not llm"`. CI runs with real Haiku calls use `pytest -m "e2e"` when `ANTHROPIC_API_KEY` is present.

For the no-LLM path: pre-populate `extracted_fees` rows directly in the fixture, bypassing the crawl stage. This lets stages 3-5 (categorize, validate, audit trail) be tested without any API cost.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Shared Mutable State Between Tests

**What goes wrong:** A test that inserts 5 institutions leaves them in the DB. The next test sees 10.
**Why it happens:** Session-scoped DB fixture + no cleanup.
**Instead:** Function-scoped `clean_db` fixture truncates pipeline tables. Session-scoped fixture only creates the schema.

### Anti-Pattern 2: Testing the Full Chain in Every Test File

**What goes wrong:** A bug in the discovery stage causes every test to fail, including tests that are only checking fee categorization.
**Why it happens:** Every test file calls the full pipeline.
**Instead:** Each stage file runs only that stage. `test_pipeline_full.py` is the only full-chain test. Stage tests use direct DB inserts to set up the inputs that upstream stages would have produced.

### Anti-Pattern 3: Exact-Value Assertions on LLM Output

**What goes wrong:** Test flakiness when Haiku rephrases a fee name slightly.
**Why it happens:** `assert fee["fee_name"] == "Monthly Maintenance Fee"`.
**Instead:** Assert structural properties: `assert fee["fee_name"]` (non-empty), `assert 0 <= fee["amount"] <= 1000`, `assert fee["fee_category"] in VALID_CATEGORIES`.

### Anti-Pattern 4: Using requests-mock for Playwright Fetches

**What goes wrong:** `requests-mock` and `responses` do not intercept Playwright's Chromium network stack. Browser fetches go to the real internet.
**Why it happens:** Playwright uses its own HTTP stack, not Python's `requests`.
**Instead:** Use a local HTTP server (threading + `http.server`) or Playwright's `page.route()` intercept API to mock browser-rendered pages.

### Anti-Pattern 5: Importing Production `get_db()` Singleton in Tests

**What goes wrong:** The production singleton caches the DB path. Tests that point to a temp path still connect to the production DB.
**Why it happens:** Module-level singleton is initialized at import time.
**Instead:** Pass the `Database` instance explicitly into each stage's `run()` function. All existing pipeline commands already accept `db: Database` as a parameter — this pattern is already established.

---

## Scalability Considerations

| Concern | At 3-5 institutions (current) | At 50 institutions | At 500 institutions |
|---------|-------------------------------|---------------------|----------------------|
| Test DB size | In-memory or small file, fast | File-based SQLite, < 1s setup | Consider PostgreSQL for tests |
| LLM costs | < $0.10/run with Haiku | $0.50-$1.00/run | Gate behind feature flag |
| Test duration | 5-10 min acceptable | Start batching crawl stage | Parallelize with pytest-xdist |
| Mock complexity | Single canned HTML/PDF fixture | Per-institution fixture files | Fixture registry pattern |
| CI environment | Local only | Add GitHub Actions job | Separate e2e job with schedule |

---

## Build Order

This is the dependency sequence for implementing the test infrastructure. Each item depends on the ones before it.

**Step 1 — Configure infrastructure (no code yet)**
- Add `[pytest]` section to `pytest.ini` at project root (or `pyproject.toml`)
- Register markers: `e2e`, `slow`, `llm`
- Set `testpaths = fee_crawler/tests`
- Add `pytest-responses` or `responses` + `respx` to `fee_crawler/requirements.txt`

**Step 2 — Build fixture data files**
- Create `fee_crawler/tests/e2e/fixtures/` directory
- Add `fdic_response.json` — 5 banks with realistic names, websites, asset sizes
- Add `fee_schedule.html` — a minimal HTML fee schedule with 3-5 parseable fees
- Add `fee_schedule.pdf` — optional; a minimal PDF (can use a 1-page text PDF)
- These files are the ground truth for all assertions downstream

**Step 3 — Build factories**
- `factories/institution.py` — `build_institution()` function returning a dict, `insert_institution(db, overrides)` function
- Keep factories dependency-free (no imports from pipeline)

**Step 4 — Build the session/function fixtures in e2e/conftest.py**
Depends on: Step 1 (pytest config), Step 2 (fixture files), Step 3 (factories)
- `test_db_path` (session) — temp SQLite, migrated schema
- `test_config` (session) — Config pointing at test DB
- `mock_external_http` (session, autouse) — registers all fixture responses
- `clean_db` (function) — truncates pipeline tables
- `seeded_institutions` (function) — inserts 3-5 rows via factory

**Step 5 — Build db_assertions helpers**
Depends on: Step 4 (know the DB schema via the fixture)
- `assert_crawl_result_exists`, `assert_fees_extracted`, `assert_audit_trail_complete`, `assert_fees_categorized`

**Step 6 — Write stage-isolated test files**
Depends on: Steps 4 and 5
Order within this step:
1. `test_pipeline_seed.py` — simplest, no HTTP mocking needed, tests DB row counts
2. `test_pipeline_discover.py` — requires HTTP mock for FDIC/sitemap
3. `test_pipeline_crawl.py` — requires HTTP mock + seeded URLs in DB
4. `test_pipeline_validate.py` — requires seeded `extracted_fees` rows, no HTTP

**Step 7 — Write full pipeline test**
Depends on: All previous steps
- `test_pipeline_full.py` — runs full chain, uses report helper, marked `@pytest.mark.slow`

**Step 8 — Wire up local server for Playwright**
Depends on: Step 6 (know which tests need browser crawl)
- Only needed if any seeded institutions have Playwright-only fee schedule URLs
- Thread-based `http.server.HTTPServer` serving `fixtures/fee_schedule.html` on localhost

---

## Sources

- [Integration Testing for Python Data Pipelines — Start Data Engineering](https://www.startdataengineering.com/post/python-datapipeline-integration-test/) — MEDIUM confidence (WebSearch verified)
- [Setting Up E2E Tests for Cloud Data Pipelines — Start Data Engineering](https://www.startdataengineering.com/post/setting-up-e2e-tests/) — MEDIUM confidence (WebFetch verified)
- [josephmachado/e2e_datapipeline_test — GitHub](https://github.com/josephmachado/e2e_datapipeline_test) — MEDIUM confidence (WebFetch verified)
- [Designing E2E Test Infrastructure with Pytest — Medium](https://medium.com/@noopurtiwari01/my-journey-designing-end-to-end-test-infrastructure-with-pytest-8dabdf60e766) — MEDIUM confidence (WebFetch verified)
- [responses library — requests-mock pytest docs](https://requests-mock.readthedocs.io/en/latest/pytest.html) — HIGH confidence (official docs)
- [respx — HTTPX mocking](https://lundberg.github.io/respx/) — HIGH confidence (official docs)
- [pytest fixtures documentation](https://docs.pytest.org/en/stable/how-to/fixtures.html) — HIGH confidence (official docs)
- [tmp_path and tmp_path_factory — pytest built-in fixtures](https://python-basics-tutorial.readthedocs.io/en/latest/test/pytest/builtin-fixtures.html) — HIGH confidence (official docs)
