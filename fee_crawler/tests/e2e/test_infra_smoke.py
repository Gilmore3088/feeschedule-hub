"""Smoke tests for Phase 1 test infrastructure fixtures.

Verifies that the DB isolation, R2 bypass, and lock file override fixtures
are working as expected before any pipeline stage tests are written (Phase 2+).

All tests are marked @pytest.mark.e2e. No network calls, no LLM calls.
"""

import os
from pathlib import Path

import pytest

from fee_crawler.pipeline.executor import LOCK_FILE as PROD_LOCK_FILE


@pytest.mark.e2e
def test_db_is_file_backed_wal_mode(test_db) -> None:
    """Test DB must use WAL journal mode (requires file-backed SQLite)."""
    row = test_db.conn.execute("PRAGMA journal_mode").fetchone()
    assert row[0] == "wal", (
        f"Expected WAL mode, got {row[0]!r}. "
        "E2e DB must be file-backed, not :memory:."
    )


@pytest.mark.e2e
def test_db_path_is_not_production(test_db_path: Path) -> None:
    """Test DB path must not be the production crawler.db."""
    prod_db = Path("data/crawler.db").resolve()
    assert test_db_path.resolve() != prod_db, (
        "test_db_path points to the production DB. "
        "The DB isolation fixture is not working."
    )


@pytest.mark.e2e
def test_config_document_dir_is_temp(test_config) -> None:
    """Document storage dir must be a temp directory, not the default data/documents."""
    default_doc_dir = Path("data/documents").resolve()
    actual_dir = Path(test_config.extraction.document_storage_dir).resolve()
    assert actual_dir != default_doc_dir, (
        "test_config.extraction.document_storage_dir still points to data/documents. "
        "R2 bypass requires a temp directory."
    )
    # The temp dir must exist (created by tmp_path_factory)
    assert actual_dir.exists(), f"Document temp dir does not exist: {actual_dir}"


@pytest.mark.e2e
def test_config_budget_guard(test_config) -> None:
    """Daily LLM budget must be capped at the test limit (per D-12)."""
    assert test_config.extraction.daily_budget_usd == 2.0, (
        f"Expected daily_budget_usd=2.0, got {test_config.extraction.daily_budget_usd}. "
        "D-12 requires a budget cap for test runs."
    )


@pytest.mark.e2e
def test_config_db_path_matches_test_db_path(test_config, test_db_path: Path) -> None:
    """Config.database.path must match test_db_path — they must be consistent."""
    assert test_config.database.path == str(test_db_path), (
        f"Config.database.path={test_config.database.path!r} does not match "
        f"test_db_path={str(test_db_path)!r}"
    )


@pytest.mark.e2e
def test_isolated_lock_file_is_not_production(isolated_lock_file: Path) -> None:
    """Lock file must be redirected away from data/pipeline.lock."""
    prod_lock = Path("data/pipeline.lock").resolve()
    assert isolated_lock_file.resolve() != prod_lock, (
        "isolated_lock_file still points to data/pipeline.lock. "
        "The lock file override fixture is not working."
    )
    # The monkeypatch must also have taken effect on the module-level constant
    from fee_crawler.pipeline import executor
    assert executor.LOCK_FILE == isolated_lock_file, (
        "LOCK_FILE in executor module was not patched. "
        "isolated_lock_file fixture monkeypatch did not apply."
    )
