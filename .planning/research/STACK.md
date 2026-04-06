# Technology Stack: E2E Pipeline Test Suite

**Project:** Bank Fee Index — E2E Pipeline Tests
**Domain:** Python data pipeline testing (web crawl + LLM extraction + DB verification)
**Researched:** 2026-04-06

---

## Recommended Stack

### Test Runner and Core Infrastructure

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| pytest | >=8.0 | Test runner, fixture system, markers | Standard for Python; already in use in this codebase (60 existing tests). Plugin ecosystem is unmatched. |
| pytest-asyncio | >=1.0 | Async test support | Required because the pipeline uses httpx, asyncpg, and Playwright, which are all async. v1.0 dropped the old `event_loop` fixture — use `asyncio_mode = "auto"` in `pyproject.toml` to avoid per-test decorator noise. |
| pytest-timeout | >=2.3 | Per-test timeout guards | E2E runs can hang on network I/O or Playwright. Prevents CI from stalling. Set a global 600s ceiling and override per-test with `@pytest.mark.timeout(60)`. |
| pytest-cov | >=6.0 | Coverage reporting | Measures whether the e2e path actually exercises extraction and categorization branches. Use `--cov=fee_crawler` with `--cov-report=term-missing`. |

**Confidence:** HIGH — pytest 8.x and its plugin ecosystem verified via PyPI and official docs.

---

### HTTP Mocking (Web Crawl Layer)

The pipeline makes three distinct classes of HTTP calls that each need their own mocking strategy:

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| pytest-httpserver | >=1.1.5 | Local HTTP server for HTML/PDF fixture serving | Best choice for crawl simulation. Spins up a real localhost server; the crawler code touches it with real TCP connections, so no monkey-patching needed. Configures response headers, status codes, and body content per URL path. Supports `requests`, `httpx`, and Playwright — all three HTTP clients the pipeline uses. |
| vcrpy (via pytest-recording) | vcrpy >=8.1.1, pytest-recording >=0.13 | Record-and-replay for FDIC/NCUA API calls | Record real FDIC/NCUA API responses once, commit cassettes, replay offline. Eliminates network dependency for institution seeding tests. Use `filter_headers=['Authorization']` in `vcr_config` fixture to scrub any keys from cassettes before committing. Do NOT use pytest-vcr — it conflicts with pytest-recording. |

**Why not `responses` or `httpretty`?** Both only mock `requests`. The pipeline uses `httpx` for async calls and Playwright for browser extraction — neither is intercepted by those libraries. pytest-httpserver works at TCP level; vcrpy intercepts at the urllib/httpx transport level.

**Confidence:** HIGH for pytest-httpserver (verified against 1.1.5 docs). MEDIUM for vcrpy 8.1.1 (confirmed on PyPI/GitHub, released January 2026).

---

### LLM Mocking (Anthropic Claude Haiku)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `unittest.mock` (stdlib) | n/a | Mock Anthropic client responses | The Anthropic Python SDK (`anthropic>=0.40`, already a dependency) is a standard Python class — `unittest.mock.patch` handles it cleanly without extra libraries. Mock `anthropic.Anthropic.messages.create` to return a pre-built `ToolUseBlock` response with known fee values. |
| pytest-mock | >=3.14 | Cleaner mock fixture interface | Wraps `unittest.mock` behind a `mocker` fixture; reduces boilerplate compared to `@patch` decorators. Works with any sync or async code. |

**Why not a dedicated LLM testing library (DeepEval, LangSmith)?** Those tools evaluate LLM output quality — they are not for pipeline regression testing. This test suite needs deterministic, cost-free runs. Mock the SDK call entirely; use a canned response that exercises the fee extraction schema without hitting the API.

**Pattern for LLM mocking:**

```python
@pytest.fixture
def mock_claude(mocker):
    """Return a fixed extraction result for any Haiku call."""
    fake_tool_use = {
        "type": "tool_use",
        "id": "toolu_test",
        "name": "extract_fees",
        "input": {
            "fees": [
                {"fee_name": "Monthly Maintenance Fee", "amount": 12.00,
                 "category": "monthly_maintenance", "confidence": 0.95}
            ]
        }
    }
    return mocker.patch(
        "fee_crawler.workers.extraction_worker.anthropic.Anthropic.messages.create",
        return_value=fake_tool_use,
    )
```

**Confidence:** HIGH — `unittest.mock` is stdlib; pytest-mock 3.14 verified on PyPI.

---

### Database Isolation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SQLite `:memory:` (stdlib) | n/a | Isolated test database per session | The pipeline's `db.py` already supports SQLite via the same `DATABASE_URL` env var path. An in-memory SQLite DB created via `sqlite3.connect(":memory:")` is already the pattern in `test_transition_fee_status.py`. Apply it at session scope for e2e tests (one DB per run, not per test — the pipeline stages must chain across tables). |
| `tmp_path` fixture (pytest stdlib) | n/a | Ephemeral file paths for document storage | Use pytest's built-in `tmp_path` for local R2 fallback (`data/documents/` equivalent). Set `DATA_DIR` env var to `tmp_path` in the e2e fixture. |

**Why not testcontainers (PostgreSQL)?** The pipeline runs SQLite locally. Spinning a Docker container adds 30-60s startup and requires Docker available in CI. The sqlite `:memory:` pattern already works and is proven in the existing test file. Reserve testcontainers for integration tests that must validate PostgreSQL-specific queries (e.g., production Supabase migration verification) — not for this milestone.

**Confidence:** HIGH — pattern is already in use in this codebase (`test_transition_fee_status.py`).

---

### Playwright Mock Server (Browser Extraction Layer)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Playwright route interception (built-in) | playwright >=1.40 (already a dependency) | Mock JS-rendered fee pages | Playwright's `page.route()` intercepts network requests within the browser context. Point the crawler at `localhost` URLs served by `pytest-httpserver` — no additional library needed. The pytest-playwright plugin provides `browser` and `page` fixtures but is optional for pipeline testing (the pipeline drives Playwright directly, not the pytest fixtures). |

**Why not pytest-playwright fixtures?** That plugin is for browser UI tests (clicking, asserting DOM). The pipeline controls Playwright programmatically for scraping. Use pytest-httpserver as the server and let the pipeline's own Playwright code hit it.

**Confidence:** MEDIUM — verified Playwright route interception exists in official docs; combined pytest-httpserver + Playwright pipeline pattern inferred from multiple 2025 community examples.

---

### Supporting Utilities

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `freezegun` | >=1.5 | Freeze `datetime.now()` for deterministic timestamps | Use when asserting `crawled_at`, `created_at` fields in DB audit trail. The pipeline writes wall-clock timestamps — freeze time to get deterministic assertions. |
| `pytest-freezer` | >=0.4 | Pytest fixture wrapper around freezegun | Use instead of `@freeze_time` decorator — the `freezer` fixture integrates cleanly with `async` tests. Note: `pytest-freezegun` is deprecated; use `pytest-freezer`. |
| `Faker` | >=30.0 | Generate realistic institution fixture data | Seed test institutions with realistic names/URLs/cert numbers without hardcoding. Keeps tests maintainable as schema evolves. |

**Confidence:** MEDIUM for freezegun/pytest-freezer (PyPI verified, community-confirmed async support). MEDIUM for Faker (widely used, version >=30 confirmed on PyPI as of early 2026).

---

## Stack Not to Use

| Category | Rejected Option | Why |
|----------|----------------|-----|
| HTTP mocking | `responses` library | Only intercepts `requests`; pipeline uses `httpx` + Playwright |
| HTTP mocking | `httpretty` | Socket-level patching breaks async code and Playwright; known incompatibility with asyncio |
| HTTP mocking | `respx` | Good for pure-httpx projects, but pipeline mixes `requests` + `httpx` + Playwright — pytest-httpserver + vcrpy covers all three |
| DB isolation | testcontainers PostgreSQL | Adds Docker dependency and 30-60s startup; SQLite `:memory:` already validated in this codebase |
| LLM testing | DeepEval / LangSmith | LLM quality evaluation tools, not regression fixtures; introduces cost and non-determinism |
| Async testing | `anyio` / `trio` | Pipeline uses only `asyncio`; anyio adds complexity without benefit |
| pytest plugin | `pytest-vcr` | Conflicts with `pytest-recording`; superseded by it |
| Browser testing | `pytest-playwright` fixtures | Designed for UI click-testing; pipeline uses Playwright as a scraping tool, not a browser under test |

---

## Installation

```bash
# Core test dependencies (add to fee_crawler/requirements-test.txt)
pytest>=8.0
pytest-asyncio>=1.0
pytest-timeout>=2.3
pytest-cov>=6.0
pytest-mock>=3.14

# HTTP mocking
pytest-httpserver>=1.1.5
vcrpy>=8.1.1
pytest-recording>=0.13

# Time + data helpers
freezegun>=1.5
pytest-freezer>=0.4
Faker>=30.0
```

```bash
pip install -r fee_crawler/requirements-test.txt
```

### pyproject.toml (or pytest.ini) configuration

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"          # pytest-asyncio v1.0 requirement
timeout = 600                  # Global ceiling for e2e tests
markers = [
    "e2e: full pipeline end-to-end test (slow, requires network)",
    "unit: fast isolated test",
]
```

---

## Key Configuration Decisions

### asyncio_mode = "auto"
pytest-asyncio 1.0 removed the `event_loop` fixture. With `asyncio_mode = "auto"`, all `async def test_*` functions are automatically collected as asyncio tests without `@pytest.mark.asyncio` decorators. This is mandatory — without it, async tests silently pass without actually running on Python 3.12+.

### Session-scoped DB fixture for E2E
E2E tests must share a single SQLite DB across pipeline stages (seed → discover → crawl → extract → validate). Use `scope="session"` on the DB fixture. Per-test DB teardown would break pipeline stage chaining.

### VCR cassette placement
Store cassettes in `fee_crawler/tests/cassettes/`. Add `*.yaml` to `.gitignore` unless you intentionally commit them. For FDIC/NCUA APIs, committing cassettes is recommended — they are public data, stable, and make CI reproducible without network access.

### LLM cost guard
Mark all tests that call the real Anthropic API with `@pytest.mark.e2e`. Add a `--real-llm` CLI flag (custom pytest plugin or conftest option) to the test suite. By default, tests use the mock. CI always runs with the mock. A monthly manual run uses `--real-llm` to verify the actual model hasn't regressed.

---

## Sources

- pytest-asyncio 1.0 migration: https://pytest-asyncio.readthedocs.io/ (verified current docs)
- pytest-httpserver 1.1.5: https://pytest-httpserver.readthedocs.io/ (verified)
- vcrpy 8.1.1 changelog: https://vcrpy.readthedocs.io/en/latest/changelog.html (verified)
- pytest-recording vs pytest-vcr conflict: https://github.com/kiwicom/pytest-recording (verified README)
- VCR.py cassette secret filtering: https://vcrpy.readthedocs.io/en/latest/advanced.html (verified)
- pytest-freezer replacing pytest-freezegun: https://pypi.org/project/pytest-freezer/ (verified)
- pytest-cov 7.0.0: https://pytest-cov.readthedocs.io/ (verified)
- In-memory SQLite pattern: already used in `fee_crawler/tests/test_transition_fee_status.py` (local codebase)
- Playwright route interception: https://playwright.dev/python/docs/mock (verified official docs)
- Testcontainers Python: https://testcontainers-python.readthedocs.io/ (reviewed, rejected for this scope)
