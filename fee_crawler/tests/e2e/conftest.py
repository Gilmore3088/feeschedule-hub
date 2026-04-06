"""E2E conftest.py — session and function fixtures for pipeline stage tests.

Fixtures defined here are available to all tests under fee_crawler/tests/e2e/.
They establish the safety net for DB isolation (INFRA-03) and R2 bypass (INFRA-04).

Scope decisions (per D-09):
  - test_db_path, test_config, test_db: session scope
    (DB schema created once; data rows may persist across tests — Phase 2+ tests
    must account for this or use their own cleanup)
  - isolated_lock_file: function scope
    (each test starts with a clean lock — avoids stale lock from interrupted tests)
  - prod_db_contamination_guard: session scope, autouse=True
  - r2_bypass_guard: session scope, autouse=True
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from fee_crawler.config import Config, CrawlConfig, DatabaseConfig, ExtractionConfig
from fee_crawler.db import Database

# ---------------------------------------------------------------------------
# Production DB contamination guard (Pattern 6 from RESEARCH.md)
# Pitfall 2: Config defaults to data/crawler.db — forgetting the path override
# would silently write test data into the 117MB production DB.
# ---------------------------------------------------------------------------
PROD_DB = Path("data/crawler.db")


@pytest.fixture(scope="session", autouse=True)
def prod_db_contamination_guard() -> None:
    """Assert data/crawler.db is not modified during any e2e test session.

    Fires at session teardown. If any fixture accidentally used the default
    Config() (which points to data/crawler.db), this guard catches it.
    """
    mtime_before = PROD_DB.stat().st_mtime if PROD_DB.exists() else None
    yield
    if mtime_before is not None:
        mtime_after = PROD_DB.stat().st_mtime
        assert mtime_after == mtime_before, (
            "CRITICAL: data/crawler.db was modified during the e2e test run. "
            "A fixture is not isolating the test DB correctly. "
            f"mtime changed from {mtime_before} to {mtime_after}."
        )


# ---------------------------------------------------------------------------
# R2 bypass guard (Pattern 4 from RESEARCH.md)
# Pitfall 4: If R2_ENDPOINT is set in the developer's environment, the pipeline
# will attempt real Cloudflare R2 uploads from tests.
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session", autouse=True)
def r2_bypass_guard() -> None:
    """Assert R2_ENDPOINT is not set before any e2e test runs.

    Per D-11: R2 bypass is achieved by omitting R2_ENDPOINT + pointing
    document_storage_dir to tmp_path. This guard catches the edge case where
    R2_ENDPOINT leaks in from a sourced .env file.
    """
    r2_endpoint = os.environ.get("R2_ENDPOINT")
    if r2_endpoint:
        raise RuntimeError(
            "R2_ENDPOINT is set in the test environment. "
            "E2e tests must NOT upload documents to Cloudflare R2. "
            "Unset R2_ENDPOINT before running e2e tests: `unset R2_ENDPOINT`"
        )
    yield


# ---------------------------------------------------------------------------
# Test database fixtures (Pattern 2 from RESEARCH.md)
# Per D-01: File-backed temp SQLite (not :memory:) because:
#   1. Database._set_pragmas() sets PRAGMA journal_mode=WAL — silently ignored on :memory:
#   2. File-backed DB can be inspected post-failure with `sqlite3 /tmp/.../test.db`
#   3. Future stages may spawn subprocesses that need to open the same DB file
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def test_db_path(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Create a temp directory and return the path for the test DB file.

    Session-scoped: one DB file for the entire e2e test session.
    The DB file is deleted when pytest cleans up tmp_path_factory at session end.
    """
    db_dir = tmp_path_factory.mktemp("db")
    return db_dir / "test_pipeline.db"


@pytest.fixture(scope="session")
def test_config(
    test_db_path: Path,
    tmp_path_factory: pytest.TempPathFactory,
) -> Config:
    """Construct a test Config with overrides for DB path and document storage.

    Per D-11: document_storage_dir points to tmp_path — no R2 writes.
    Per D-12: daily_budget_usd=2.0 caps LLM spend to a safe test budget.
    Per D-04: crawl delay reduced to 0.5s (still respectful, but faster for tests).
    """
    doc_dir = tmp_path_factory.mktemp("documents")
    return Config(
        database=DatabaseConfig(path=str(test_db_path)),
        crawl=CrawlConfig(delay_seconds=0.5, max_retries=2),
        extraction=ExtractionConfig(
            document_storage_dir=str(doc_dir),
            daily_budget_usd=2.0,
        ),
    )


@pytest.fixture(scope="session")
def test_db(test_config: Config) -> Database:
    """Open the test Database and yield it for the entire session.

    init_tables=True (the default) creates all 27 schema tables on first open.
    The Database context manager closes the connection on session exit.

    Per D-09: Session scope means schema is created once. Phase 2+ tests that
    insert data rows should clean up after themselves or use function-scoped
    sub-fixtures that truncate specific tables.
    """
    with Database(test_config) as db:
        # Verify WAL mode is active (Pitfall 1 — silently disabled on :memory:)
        row = db.conn.execute("PRAGMA journal_mode").fetchone()
        assert row[0] == "wal", (
            f"Expected WAL journal mode, got {row[0]!r}. "
            "This means the DB is not file-backed — check test_db_path fixture."
        )
        yield db


# ---------------------------------------------------------------------------
# Lock file override (Pattern 3 from RESEARCH.md)
# Per D-02: monkeypatch LOCK_FILE — no production code refactoring needed.
# Pitfall 3: Interrupted test (Ctrl-C) leaves stale lock at data/pipeline.lock.
# Pitfall 5: monkeypatch is function-scoped — cannot be used in session-scoped fixtures.
# Solution: Lock fixture is function-scoped (each test gets a fresh lock path).
# ---------------------------------------------------------------------------
@pytest.fixture()
def isolated_lock_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect LOCK_FILE to a tmp_path so e2e tests never leave stale locks.

    Function-scoped (default scope) per Pitfall 5: monkeypatch fixture is
    function-scoped and cannot be used in session-scoped fixtures.

    Usage: Add `isolated_lock_file` as a parameter to any test that calls
    pipeline stages that acquire/release the lock.
    """
    lock = tmp_path / "test.lock"
    monkeypatch.setattr("fee_crawler.pipeline.executor.LOCK_FILE", lock)
    yield lock
    lock.unlink(missing_ok=True)
