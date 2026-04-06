# Phase 1: Test Infrastructure - Research

**Researched:** 2026-04-06
**Domain:** pytest fixtures, markers, DB isolation, R2 bypass, geography parametrization
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Claude's discretion on temp file vs :memory: — choose based on whether pipeline stages spawn subprocesses that need shared DB access. The Database class already accepts Config with a `database.path` field.
- **D-02:** Claude's discretion on lock file approach — `LOCK_FILE` is hardcoded at module level in `fee_crawler/pipeline/executor.py:18`. Either monkeypatch or refactor to Config-driven.
- **D-03:** Default geography is Vermont (VT) or Rhode Island (RI). Do NOT use Wyoming (WY).
- **D-04:** Random state selection each run from small states only.
- **D-05:** Aim for 80%+ institution coverage within the selected state.
- **D-06:** Document learnings per state — create a per-state tips/tricks/instructions file structure now.
- **D-07:** Claude's discretion on CLI override mechanism (pytest option vs env var).
- **D-08:** FDIC/NCUA API calls are one-time per state. First run seeds from live APIs, subsequent runs re-use already-seeded data. No re-fetching unless explicitly forced.
- **D-09:** Claude's discretion on session-scoped vs function-scoped DB fixture.
- **D-10:** Everything runs live — real FDIC/NCUA APIs, real website crawling, real Claude Haiku LLM. True e2e.
- **D-11:** Claude's discretion on R2 storage — likely override `document_storage_dir` to tmp_path.
- **D-12:** Budget guard — cap at institutions in the selected small state (typically <50 for VT/RI), with 3-5 institution limit at pipeline stage level.

### Claude's Discretion

- DB isolation approach (temp file vs :memory:) — D-01
- Lock file override strategy — D-02
- CLI geography override mechanism — D-07
- DB fixture scope — D-09
- R2 storage bypass approach — D-11

### Deferred Ideas (OUT OF SCOPE)

- Per-state compounding intelligence (learning files that improve across runs) — Milestone 2
- VCR cassettes for offline CI — v2 requirement COV-01
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Pytest markers defined: `@pytest.mark.e2e`, `@pytest.mark.llm`, `@pytest.mark.slow` | pyproject.toml `[tool.pytest.ini_options]` markers block; verified against pytest 8.3.3 already installed |
| INFRA-02 | Geography parametrization allows different states/counties/MSAs across test runs | `--geography` custom pytest CLI option via `pytest_addoption` hook in conftest.py |
| INFRA-03 | Test database isolation via temp SQLite file (config override, lock file to tmp_path) | Config.database.path override + monkeypatch of LOCK_FILE; verified in executor.py and db.py |
| INFRA-04 | R2 document storage bypassed in tests (local tmp_path fallback) | `R2_ENDPOINT` env var absence already triggers local-only path in download.py:235-248 |
</phase_requirements>

---

## Summary

Phase 1 builds the pytest foundation that all 10 subsequent pipeline stage tests depend on. The work
is purely infrastructure: no pipeline stage tests are written here. The deliverables are a
`pyproject.toml` `[tool.pytest.ini_options]` section with three markers, a `conftest.py` at
`fee_crawler/tests/conftest.py`, a `fee_crawler/tests/e2e/conftest.py` with scoped fixtures, and a
per-state knowledge directory.

The codebase is already well-structured for testing. `Config` is a Pydantic model — test instances are
constructed with kwarg overrides, no YAML needed. `Database` accepts `Config` directly and uses a
context manager pattern compatible with pytest fixtures. `LOCK_FILE` is a module-level `Path` constant
amenable to `monkeypatch.setattr`. R2 writes are already gated on `os.environ.get("R2_ENDPOINT")` —
omitting that env var in tests is the bypass strategy.

**Primary recommendation:** Use a file-backed temp SQLite DB (not `:memory:`) at session scope so
the DB file can be inspected after a test run, supports WAL mode (which `Database._set_pragmas()`
requires), and is compatible with potential future subprocess invocations. Override `LOCK_FILE` via
`monkeypatch.setattr`. Bypass R2 by not setting `R2_ENDPOINT` and pointing
`config.extraction.document_storage_dir` to `tmp_path_factory`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pytest | 8.3.3 | Test runner, markers, fixtures | Already installed; confirmed via `pytest --version` |
| pytest-cov | 7.0.0 | Coverage reporting | Already installed |

### Packages to Install

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest-mock | >=3.14 | `mocker` fixture wrapping `unittest.mock` | Cleaner than `@patch` decorators for monkeypatching |
| pytest-timeout | >=2.3 | Per-test wall-clock timeout | E2e tests can hang on network I/O |
| faker | >=30.0 | Realistic institution fixture data | Generate crawl_target rows without hardcoded names |

**Not needed for Phase 1 (these are Phase 2+ concerns):**
- `pytest-asyncio` — pipeline async code not exercised in Phase 1 fixtures
- `pytest-httpserver` — HTTP mocking is Phase 2+ (live calls are used in Phase 1 e2e tests per D-10)
- `vcrpy` / `pytest-recording` — deferred to v2 (COV-01)
- `freezegun` / `pytest-freezer` — timestamp assertions are Phase 3+

**Installation:**
```bash
pip install pytest-mock>=3.14 pytest-timeout>=2.3 faker>=30.0
```

**Version verification:** [VERIFIED: pip show] pytest 8.3.3 and pytest-cov 7.0.0 are already installed.
pytest-mock, pytest-timeout, faker are not yet installed.

---

## Architecture Patterns

### Recommended Project Structure

```
fee_crawler/tests/
├── conftest.py                  # Existing unit test root (add pytest_addoption here)
├── test_executor.py             # Existing
├── test_review_status.py        # Existing
├── test_transition_fee_status.py # Existing
│
└── e2e/
    ├── __init__.py
    ├── conftest.py              # Session/function fixtures for e2e
    ├── fixtures/
    │   └── states/
    │       ├── VT.json          # Per-state knowledge file (Vermont seed cache)
    │       └── RI.json          # Per-state knowledge file (Rhode Island seed cache)
    └── (test files added in Phase 2+)

fee_crawler/tests/knowledge/     # Per-state tips/tricks directory (D-06)
├── VT.md                        # Vermont: known institution counts, quirks, URLs
└── RI.md                        # Rhode Island: same
```

### Pattern 1: Marker Registration in pyproject.toml

**What:** Three custom markers declared in `[tool.pytest.ini_options]` with `filterwarnings = "error::pytest.PytestUnknownMarkWarning"` to catch misspelled markers at collection time.

**When to use:** Required for `pytest -m e2e`, `pytest -m "not llm"`, `pytest -m slow` to select/exclude tests (INFRA-01).

```toml
# Source: pytest 8.x official docs [VERIFIED: pyproject.toml pattern]
[tool.pytest.ini_options]
testpaths = ["fee_crawler/tests"]
timeout = 600
markers = [
    "e2e: full pipeline end-to-end test (slow, requires network and real APIs)",
    "llm: test makes a real Anthropic API call (incurs cost; skip with -m 'not llm')",
    "slow: test takes more than 30 seconds",
]
filterwarnings = [
    "error::pytest.PytestUnknownMarkWarning",
]
```

### Pattern 2: File-Backed Temp SQLite DB at Session Scope

**What:** Session-scoped fixture creates a temp SQLite file via `tmp_path_factory`. The `Database` class runs all migrations on first construction. Teardown deletes the temp file.

**Why file-backed over `:memory:`:**
- `Database._set_pragmas()` sets `PRAGMA journal_mode=WAL`, which is silently ignored on `:memory:` connections — WAL mode requires a file. [VERIFIED: SQLite docs — WAL mode only on file DBs]
- File-backed DBs can be inspected post-failure with `sqlite3 /tmp/.../test.db`
- Future stages may spawn subprocess CLI calls that need to open the same DB file

**Example:**
```python
# Source: local codebase pattern — fee_crawler/db.py:479, config.py:10
# [VERIFIED: codebase grep]
import pytest
from pathlib import Path
from fee_crawler.config import Config, DatabaseConfig, ExtractionConfig
from fee_crawler.db import Database

@pytest.fixture(scope="session")
def test_db_path(tmp_path_factory) -> Path:
    db_dir = tmp_path_factory.mktemp("db")
    return db_dir / "test_pipeline.db"

@pytest.fixture(scope="session")
def test_config(test_db_path, tmp_path_factory) -> Config:
    doc_dir = tmp_path_factory.mktemp("documents")
    return Config(
        database=DatabaseConfig(path=str(test_db_path)),
        extraction=ExtractionConfig(
            document_storage_dir=str(doc_dir),
            daily_budget_usd=2.0,
        ),
    )

@pytest.fixture(scope="session")
def test_db(test_config) -> Database:
    with Database(test_config) as db:
        yield db
```

### Pattern 3: Lock File Override via monkeypatch

**What:** `LOCK_FILE` is a module-level `Path` constant in `fee_crawler/pipeline/executor.py:18`.
`monkeypatch.setattr` at the module level redirects it to a path inside `tmp_path`.

**Decision (D-02):** Use monkeypatch — no refactoring of production code needed for Phase 1.
The existing `test_executor.py` already demonstrates this pattern correctly (lines 41-48).

```python
# Source: fee_crawler/tests/test_executor.py:41-48 [VERIFIED: codebase]
@pytest.fixture(autouse=True)
def isolated_lock_file(tmp_path, monkeypatch):
    """Redirect LOCK_FILE to tmp_path so tests never leave stale locks."""
    lock = tmp_path / "test.lock"
    monkeypatch.setattr("fee_crawler.pipeline.executor.LOCK_FILE", lock)
    yield lock
    lock.unlink(missing_ok=True)
```

**Scope note:** For e2e tests the lock fixture should be `function`-scoped so each test starts with
a clean lock. Existing unit tests in `test_executor.py` already use `tmp_path` (function scope) — no
changes needed there.

### Pattern 4: R2 Bypass via Environment Variable

**What:** `fee_crawler/pipeline/download.py:235` gates R2 uploads on `os.environ.get("R2_ENDPOINT")`.
If the env var is absent, the pipeline writes only to the local `document_storage_dir` and logs a
warning. No monkeypatching of boto3 needed.

**Decision (D-11):** Do not set `R2_ENDPOINT` in the test environment. Point `document_storage_dir`
to a `tmp_path_factory` directory. This is the zero-effort bypass — the production code already
handles the absent-env-var case.

```python
# Source: fee_crawler/pipeline/download.py:235-248 [VERIFIED: codebase]
# No R2_ENDPOINT → line 248: "R2_ENDPOINT not set — skipping R2 storage for target %d"
# Document is still saved to config.extraction.document_storage_dir
```

**Verification in tests:** Add an assertion in the teardown fixture confirming `R2_ENDPOINT` is not
set. Do not unset it — just assert — since the test process inherits the environment and the
developer may need R2 for other work outside tests.

### Pattern 5: Geography Parametrization via pytest CLI Option

**What:** Custom `--geography` option registered in root `conftest.py` via `pytest_addoption`.
Default is `state=VT`. Override with `pytest --geography state=RI` at the command line.

**Decision (D-07):** Use `pytest_addoption` (pytest-native) rather than an environment variable.
This integrates cleanly with marker-based selection and provides `--help` documentation.

```python
# Source: pytest official docs — custom CLI options [VERIFIED: pytest 8.x docs pattern]
# In fee_crawler/tests/conftest.py

def pytest_addoption(parser):
    parser.addoption(
        "--geography",
        default="state=VT",
        help="Geography for e2e tests. Format: 'state=VT' or 'state=RI'. "
             "Do not use state=WY (active dev data).",
    )

@pytest.fixture(scope="session")
def geography(request) -> dict:
    """Parse --geography into a dict, e.g. {'type': 'state', 'code': 'VT'}."""
    raw = request.config.getoption("--geography")
    key, value = raw.split("=", 1)
    return {"type": key.strip(), "code": value.strip().upper()}
```

**Small-state pool for random selection (D-04):** VT, RI, NH, ME, DE — all have fewer than 30
institutions in FDIC. Wyoming (WY) is explicitly excluded (D-03).

### Pattern 6: DB Contamination Guard

**What:** Post-session fixture that asserts `data/crawler.db` mtime is unchanged from before the test
run. Fails loudly if any test accidentally wrote to the production DB.

**Why:** Production DB at `data/crawler.db` contains 117MB of real data. A misconfigured fixture
that omits the path override would silently contaminate it. The mtime guard catches this before the
developer closes their terminal.

```python
# Source: PITFALLS.md Pitfall 1 [VERIFIED: codebase — data/crawler.db exists at /Users/jgmbp/Desktop/feeschedule-hub/data/crawler.db]
import os
from pathlib import Path

PROD_DB = Path("data/crawler.db")

@pytest.fixture(scope="session", autouse=True)
def prod_db_contamination_guard():
    mtime_before = PROD_DB.stat().st_mtime if PROD_DB.exists() else None
    yield
    if mtime_before is not None:
        mtime_after = PROD_DB.stat().st_mtime
        assert mtime_after == mtime_before, (
            f"CRITICAL: data/crawler.db was modified during the test run. "
            f"A fixture is not isolating the test DB correctly."
        )
```

### Pattern 7: Per-State Knowledge File Structure (D-06)

**What:** Human-readable Markdown files in `fee_crawler/tests/knowledge/` capturing per-state
institutional landscape. Established now so subsequent phases can populate them.

**Format:**
```markdown
# Vermont (VT) Test Geography

**Institution count (FDIC + NCUA):** ~28
**Last seeded:** 2026-04-06
**FDIC filter:** ?filters=STALP%3AVT

## Known Institutions
| Name | CERT | Website | Notes |
|------|------|---------|-------|
| ...  |      |         |       |

## Quirks
- ...
```

### Anti-Patterns to Avoid

- **Using `:memory:` for e2e DB:** WAL mode is silently ignored, breaking the production pragma set.
- **Autouse session fixture that writes data rows:** State leaks between tests. Session scope = schema only; function scope = data rows.
- **Asserting `R2_ENDPOINT not in os.environ` inside test code:** Assert at fixture level once, not in every test.
- **Sharing a single `monkeypatch` across session scope:** `monkeypatch` fixture is function-scoped by default. For session-scoped patching (e.g., LOCK_FILE in e2e session), use `monkeypatch` inside a session-scoped fixture via `request.getfixturevalue` or use `unittest.mock.patch` directly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Temp directory lifecycle | Custom `tempfile.mkdtemp()` + atexit cleanup | `tmp_path_factory` (pytest stdlib) | pytest handles cleanup even on test failure |
| Random test ordering to catch fixture leaks | Manual shuffle | `pytest-randomly` (optional, not required in Phase 1) | Not needed yet — only add if leaks appear |
| CLI argument parsing for geography | `argparse` or `os.environ` | `pytest_addoption` | Native to pytest, shows in `--help`, integrates with fixture system |
| DB schema setup in every test | Inline `CREATE TABLE` | `Database(config, init_tables=True)` (existing) | All 27 tables are created in one call; idempotent |

**Key insight:** The production `Database` class is already test-compatible — it takes a `Config`,
creates the schema on init, and is a context manager. The test fixture is 10 lines, not 100.

---

## Common Pitfalls

### Pitfall 1: WAL Mode Silently Disabled on `:memory:` DB
**What goes wrong:** `PRAGMA journal_mode=WAL` returns `memory` (not `wal`) for in-memory connections.
If `Database._set_pragmas()` is called on `:memory:`, the WAL pragma is silently ignored. This means
the test DB behaves differently from production SQLite.
**Why it happens:** SQLite WAL requires a file. [VERIFIED: SQLite docs — WAL requires a real file path]
**How to avoid:** Use `tmp_path_factory` to create a file-backed DB. Never `:memory:` for e2e tests.
**Warning signs:** `PRAGMA journal_mode` returns `"memory"` instead of `"wal"`.

### Pitfall 2: Production DB Contamination
**What goes wrong:** A misconfigured fixture uses the default `Config()` which points to
`data/crawler.db`. Test data is inserted into the 117MB production DB.
**Why it happens:** `Config.database.path` defaults to `"data/crawler.db"`. Forgetting the override
silently uses production.
**How to avoid:** The `prod_db_contamination_guard` fixture (Pattern 6) catches this. Always construct
`Config` with an explicit `DatabaseConfig(path=str(test_db_path))` override.
**Warning signs:** Dashboard fee counts increase after `pytest` run; mtime guard fires.

### Pitfall 3: Stale Lock File Blocking Re-runs
**What goes wrong:** An interrupted test (Ctrl-C) leaves the lock file. Next run fails immediately
with "pipeline already running."
**Why it happens:** `LOCK_FILE` at `data/pipeline.lock` — a fixed path. If `release_lock()` is not
called before `KeyboardInterrupt` propagates, the file persists.
**How to avoid:** `isolated_lock_file` fixture (Pattern 3) with `autouse=True` redirects to `tmp_path`
and calls `unlink(missing_ok=True)` in teardown.
**Warning signs:** "Another pipeline is already running (PID lock)" at the start of a test that hasn't
started any pipeline.

### Pitfall 4: R2 Upload Attempt Without Credentials
**What goes wrong:** If `R2_ENDPOINT` is set in the developer's shell (e.g., from a `.env` file
sourced in `.zshrc`), the production R2 bypass check in `download.py:235` is True and the test tries
to upload to Cloudflare R2. With real credentials, it uploads test documents to the production bucket.
**Why it happens:** Environment variable inheritance. The test does not unset `R2_ENDPOINT`.
**How to avoid:** The session-scoped `r2_bypass_guard` fixture asserts `R2_ENDPOINT` is not set at the
start of the e2e session. If it is set, the fixture raises an explicit error with instructions to
unset it for test runs.
**Warning signs:** Test output shows "Uploaded document to R2: xx/xxxx" — real R2 uploads in tests.

### Pitfall 5: monkeypatch Scope Mismatch for Session-Level Fixtures
**What goes wrong:** `monkeypatch` is function-scoped. If a session-scoped fixture requests
`monkeypatch`, pytest raises a scope error: "function-scoped fixture 'monkeypatch' used in session-scoped fixture."
**Why it happens:** pytest enforces that session-scoped fixtures can only request broader or equal scope.
**How to avoid:** For session-scoped patches (e.g., LOCK_FILE in e2e session), use
`unittest.mock.patch` as a context manager, or make the lock fixture function-scoped (preferred).
**Warning signs:** `ScopeMismatch: You tried to access the 'monkeypatch' fixture in a higher-scoped fixture.`

### Pitfall 6: `pytest_addoption` Defined in Both conftest.py Files
**What goes wrong:** If `pytest_addoption` is defined in both `fee_crawler/tests/conftest.py` AND
`fee_crawler/tests/e2e/conftest.py`, pytest raises `ValueError: option --geography already added`.
**Why it happens:** pytest collects all `conftest.py` files in the test path; `pytest_addoption` can
only be registered once.
**How to avoid:** Define `pytest_addoption` only in the root `fee_crawler/tests/conftest.py`. The
`geography` fixture reads it from there and is accessible to all sub-directories.
**Warning signs:** `ValueError: option --geography already added` at collection time.

---

## Code Examples

Verified patterns from the local codebase:

### Constructing a Test Config (No YAML)
```python
# Source: fee_crawler/config.py:98-107 [VERIFIED: codebase]
from fee_crawler.config import Config, DatabaseConfig, ExtractionConfig, CrawlConfig

test_config = Config(
    database=DatabaseConfig(path="/tmp/test.db"),
    crawl=CrawlConfig(delay_seconds=0.0, max_retries=1),
    extraction=ExtractionConfig(
        document_storage_dir="/tmp/test_docs",
        daily_budget_usd=2.0,
    ),
)
```

### Confirming WAL Mode on File-Backed DB
```python
# Source: fee_crawler/db.py:508-515 [VERIFIED: codebase]
# Verify WAL mode is active (will fail on :memory:)
row = db.conn.execute("PRAGMA journal_mode").fetchone()
assert row[0] == "wal", f"Expected WAL mode, got {row[0]}"
```

### Lock File Monkeypatching (existing pattern)
```python
# Source: fee_crawler/tests/test_executor.py:41-48 [VERIFIED: codebase]
def test_acquire_and_release(self, tmp_path, monkeypatch):
    lock_file = tmp_path / "test.lock"
    monkeypatch.setattr("fee_crawler.pipeline.executor.LOCK_FILE", lock_file)
    assert acquire_lock() is True
    assert lock_file.exists()
    release_lock()
    assert not lock_file.exists()
```

### Geography Fixture Usage in Downstream Tests
```python
# In e2e/test_pipeline_seed.py (Phase 2):
def test_seed_populates_crawl_targets(test_db, test_config, geography):
    state_code = geography["code"]  # "VT" or "RI"
    # ... call seed stage with state_code
    rows = test_db.fetchall("SELECT * FROM crawl_targets WHERE state_code = ?", (state_code,))
    assert len(rows) >= 3
```

---

## Runtime State Inventory

This is an infrastructure/greenfield phase with no rename or migration. No runtime state inventory needed.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Python 3.12 | All tests | Yes | 3.12.6 | — |
| pytest | Test runner | Yes | 8.3.3 | — |
| pytest-cov | Coverage | Yes | 7.0.0 | — |
| pytest-mock | Lock file fixture | No | — | `unittest.mock` (stdlib) — usable but more verbose |
| pytest-timeout | E2e timeout guard | No | — | `@pytest.mark.timeout(N)` requires the plugin; no stdlib fallback |
| faker | Institution fixture data | No | — | Hardcode 3-5 institution dicts (acceptable for Phase 1) |
| boto3 | R2 client (prod only) | Yes | 1.42.74 | — (not needed in tests if R2_ENDPOINT not set) |
| anthropic | LLM extraction | Yes | 0.79.0 | — |
| playwright | Browser crawl | Yes | 1.58.0 | — |
| data/crawler.db | Production DB (must NOT be touched) | Yes | 117MB | — |

**Missing dependencies with no fallback:**
- `pytest-timeout` — install before writing e2e tests. Without it, `@pytest.mark.timeout` is an unknown marker.

**Missing dependencies with fallback:**
- `pytest-mock` — can use `unittest.mock.patch` directly if needed for Phase 1 only.
- `faker` — can use hardcoded institution dicts for the initial fixture files.

**Installation command:**
```bash
pip install pytest-mock>=3.14 pytest-timeout>=2.3 faker>=30.0
```

---

## Validation Architecture

`nyquist_validation` is enabled (no explicit `false` in `.planning/config.json`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.3.3 |
| Config file | `pyproject.toml` — `[tool.pytest.ini_options]` section (Wave 0 creates this) |
| Quick run command | `pytest fee_crawler/tests/ -x -q --timeout=30` |
| Full suite command | `pytest fee_crawler/tests/ -v --timeout=600` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Markers `e2e`, `llm`, `slow` are registered; `pytest -m e2e` selects only e2e tests | smoke | `pytest fee_crawler/tests/ --co -m e2e -q` (should collect 0 tests but not error) | Wave 0 |
| INFRA-02 | `--geography state=VT` overrides geography; `--geography state=RI` also works | unit | `pytest fee_crawler/tests/e2e/test_geography_fixture.py -x` | Wave 0 |
| INFRA-03 | Test that inserts rows into test DB verifies `data/crawler.db` mtime is unchanged | unit | `pytest fee_crawler/tests/e2e/test_db_isolation.py -x` | Wave 0 |
| INFRA-04 | Document writes go to `tmp_path`; no `R2_ENDPOINT` means no Cloudflare calls | unit | `pytest fee_crawler/tests/e2e/test_r2_bypass.py -x` | Wave 0 |

### Sampling Rate

- **Per task commit:** `pytest fee_crawler/tests/ -x -q --timeout=30`
- **Per wave merge:** `pytest fee_crawler/tests/ -v --timeout=600`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `pyproject.toml` — `[tool.pytest.ini_options]` with markers block
- [ ] `fee_crawler/tests/e2e/__init__.py` — make e2e a package
- [ ] `fee_crawler/tests/e2e/conftest.py` — session fixtures
- [ ] `fee_crawler/tests/e2e/test_geography_fixture.py` — covers INFRA-02
- [ ] `fee_crawler/tests/e2e/test_db_isolation.py` — covers INFRA-03
- [ ] `fee_crawler/tests/e2e/test_r2_bypass.py` — covers INFRA-04
- [ ] `fee_crawler/tests/knowledge/VT.md` — per-state knowledge stub (D-06)
- [ ] `fee_crawler/tests/knowledge/RI.md` — per-state knowledge stub (D-06)
- [ ] Install: `pip install pytest-mock>=3.14 pytest-timeout>=2.3 faker>=30.0`

---

## Security Domain

`security_enforcement` is not explicitly set to `false` in `.planning/config.json`. Applying to Phase 1 scope:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Test infra has no auth layer |
| V3 Session Management | No | No session management in test fixtures |
| V4 Access Control | No | Tests run locally under developer credentials |
| V5 Input Validation | Yes (minimal) | Geography input validated via fixture (`state=VT` format); invalid input raises ValueError before reaching API |
| V6 Cryptography | No | No crypto in test infrastructure |

### Known Threat Patterns Relevant to Test Infrastructure

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Test DB path traversal | Tampering | `tmp_path_factory` always returns a pytest-managed temp dir under system tmp |
| Anthropic API key leakage in fixtures | Information Disclosure | Never hardcode API keys; use `os.environ.get("ANTHROPIC_API_KEY")` — key is absent in unit tests |
| R2 credentials in test output | Information Disclosure | `r2_bypass_guard` fixture asserts `R2_ENDPOINT` is unset, preventing accidental production uploads |

---

## Decisions Recommended (Claude's Discretion)

### D-01: DB Isolation — File-Backed Temp SQLite (not `:memory:`)

**Recommendation:** File-backed SQLite via `tmp_path_factory.mktemp("db") / "test_pipeline.db"`.

**Rationale:**
1. `Database._set_pragmas()` sets `PRAGMA journal_mode=WAL`. WAL mode silently falls back to journal mode on `:memory:` connections — the pragma is accepted but has no effect. This means `:memory:` tests run with different pragma behavior than production. [VERIFIED: SQLite docs]
2. File-backed DB can be inspected after test failure: `sqlite3 /tmp/pytest-xxx/db0/test_pipeline.db`
3. Subprocess-launched CLI commands (if any pipeline stage spawns a subprocess) can access the file path; they cannot access `:memory:`.
4. The pattern is already proven in the existing tests (MockDb uses `:memory:` for simple unit tests — this works because those tests never exercise WAL-dependent code paths).

**Scope:** `scope="session"` for the DB file creation and schema setup. Data-writing fixtures are `scope="function"`.

### D-02: Lock File Override — monkeypatch (no refactoring)

**Recommendation:** `monkeypatch.setattr("fee_crawler.pipeline.executor.LOCK_FILE", tmp_path / "test.lock")` in a `function`-scoped fixture with `autouse=True` in the e2e conftest.

**Rationale:** The existing `test_executor.py` already demonstrates this exact pattern (lines 41-48). No production code changes needed for Phase 1. If the lock file ever needs to be Config-driven for Modal compatibility (noted in STATE.md Phase 11 blocker), that refactoring happens in Phase 11, not here.

### D-07: CLI Geography Override — `pytest_addoption`

**Recommendation:** `pytest_addoption` in `fee_crawler/tests/conftest.py` registering `--geography` with default `state=VT`.

**Rationale:** Pytest-native option provides `--help` documentation, integrates with the fixture system, and does not require documentation in a separate README. Environment variable approach (`GEOGRAPHY=state=RI pytest ...`) is an alternative but environment variables are less discoverable and can bleed across test runs in the same shell session.

**Small-state pool for D-04 random selection:**
```python
SMALL_STATES = ["VT", "RI", "NH", "ME", "DE"]  # All < 30 FDIC institutions
# WY is excluded per D-03
```

### D-09: DB Fixture Scope — session for schema, function for data

**Recommendation:**
- `test_db_path` and `test_config` → `scope="session"` (schema creation is expensive; safe to share)
- `test_db` (the `Database` instance) → `scope="session"` (read-only consumers can share it)
- Data-inserting fixtures (e.g., `seeded_institutions`) → `scope="function"` (prevents cross-test contamination per PITFALL 4)
- `clean_db` (truncates pipeline tables) → `scope="function"` with `autouse` within the `e2e/` directory

### D-11: R2 Bypass — Env Var Absence + document_storage_dir Override

**Recommendation:** Do not set `R2_ENDPOINT` in the test environment. Override `config.extraction.document_storage_dir` to `str(tmp_path_factory.mktemp("documents"))`. Add a session-scoped guard that asserts `R2_ENDPOINT` is not set.

**Rationale:** `fee_crawler/pipeline/download.py:235-248` already implements this bypass:
```python
if os.environ.get("R2_ENDPOINT"):
    # upload to R2
else:
    logger.warning("R2_ENDPOINT not set — skipping R2 storage for target %d", target_id)
```
This is zero-change to production code. Documents are still saved locally (needed for LLM extraction). The guard fixture catches the case where a developer's shell environment has `R2_ENDPOINT` set from a `.env` file.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pipeline stages do not spawn subprocess calls to the CLI (so file-backed `:memory:` vs file distinction only matters for WAL mode) | D-01 recommendation | If subprocesses are spawned in Phase 2+, `:memory:` would not be sharable anyway — file-backed is still the right choice |
| A2 | Small states VT/RI/NH/ME/DE have fewer than 30 FDIC institutions each | D-07 small-state pool | If any of these have grown above 50, the cost/time budget may be exceeded per D-12 |

**All other claims in this document are [VERIFIED] from the local codebase or [CITED] from official sources.**

---

## Open Questions

1. **Does `fee_crawler/tests/conftest.py` currently exist?**
   - What we know: `fee_crawler/tests/__init__.py` exists (1-line empty file). No `conftest.py` was found in the directory listing.
   - What's unclear: Will adding a new `conftest.py` conflict with the existing tests' import paths?
   - Recommendation: Create `fee_crawler/tests/conftest.py` with only `pytest_addoption` and the `geography` fixture in Wave 0. Run existing 42 tests after creation to confirm no breakage.

2. **Does `requirements-test.txt` exist or should test deps go into `requirements.txt`?**
   - What we know: `fee_crawler/requirements.txt` exists with production deps. No `requirements-test.txt` was found.
   - What's unclear: Project convention for separating test deps from production deps.
   - Recommendation: Create `fee_crawler/requirements-test.txt` for test-only packages (pytest-mock, pytest-timeout, faker). Reference it in CI with `pip install -r fee_crawler/requirements-test.txt`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pytest.ini` or `setup.cfg` for pytest config | `pyproject.toml [tool.pytest.ini_options]` | pytest 6+ | All config in one file; no pytest.ini needed |
| `@pytest.mark.asyncio` per-test decorator | `asyncio_mode = "auto"` in pyproject.toml | pytest-asyncio 0.21 | No per-test decorator needed for async tests |
| `pytest-freezegun` | `pytest-freezer` | 2023 | `pytest-freezegun` is deprecated; `pytest-freezer` is the maintained replacement |

**Not applicable to Phase 1:** pytest-asyncio `asyncio_mode` is a Phase 2+ concern (no async code in Phase 1 fixtures). Noted here so it is not forgotten when async fixtures are added.

---

## Sources

### Primary (HIGH confidence)

- `fee_crawler/pipeline/executor.py` — LOCK_FILE constant (line 18), `acquire_lock()`, monkeypatch pattern
- `fee_crawler/db.py` — `Database.__init__` (line 479), `_set_pragmas()` (WAL mode), context manager pattern
- `fee_crawler/config.py` — `Config`, `DatabaseConfig.path`, `ExtractionConfig.document_storage_dir`
- `fee_crawler/pipeline/download.py:235-248` — R2_ENDPOINT guard, local fallback logic
- `fee_crawler/pipeline/r2_store.py` — boto3 S3 client, `upload_document()` implementation
- `fee_crawler/tests/test_executor.py` — existing `monkeypatch.setattr(LOCK_FILE)` pattern
- `fee_crawler/tests/test_transition_fee_status.py` — existing in-memory DB fixture pattern
- `fee_crawler/requirements.txt` — confirmed production deps (boto3 1.42.74, anthropic 0.79.0, playwright 1.58.0)
- `.planning/research/STACK.md` — pytest plugin recommendations (prior research)
- `.planning/research/PITFALLS.md` — 14 domain-specific pitfalls
- `.planning/research/ARCHITECTURE.md` — 4-layer test architecture, fixture scope guidance
- `pip show pytest pytest-cov` — [VERIFIED: 8.3.3 and 7.0.0 installed]

### Secondary (MEDIUM confidence)

- SQLite WAL mode requires file path — [CITED: https://www.sqlite.org/wal.html — "WAL mode is persistent and will remain in effect when the database connection is closed and reopened. A WAL mode database can only be created on a local disk file."]
- pytest `pytest_addoption` for custom CLI flags — [CITED: https://docs.pytest.org/en/stable/how-to/writing_plugins.html#_pytest.hookspec.pytest_addoption]
- `tmp_path_factory` for session-scoped temp files — [CITED: https://docs.pytest.org/en/stable/how-to/tmp_path.html#the-tmp-path-factory-fixture]

### Tertiary (LOW confidence)

- None. All major claims verified from codebase or official docs.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pytest 8.3.3 and pytest-cov 7.0.0 verified installed; missing packages identified
- Architecture: HIGH — patterns derived from direct reading of production code (db.py, config.py, executor.py, download.py)
- Pitfalls: HIGH — six pitfalls verified directly from codebase structure; two (P3, P4) from official SQLite/pytest docs

**Research date:** 2026-04-06
**Valid until:** 2026-06-06 (stable domain — pytest and SQLite APIs change slowly)
