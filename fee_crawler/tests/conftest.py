"""pytest fixtures for fee_crawler test suite.

Phase 62a: SQLite fixtures removed. Every test runs against a throwaway
Postgres schema, applied migrations, dropped on teardown.

Set DATABASE_URL_TEST to a Postgres DSN (e.g., postgres://postgres:postgres@localhost:5433/bfi_test).
"""

from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import AsyncGenerator

import asyncpg
import pytest
import pytest_asyncio


REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"


# NOTE: Legacy SQLite fixtures removed in Phase 62a per D-13. Callers that
# still need sync DB access should use psycopg2 directly against db_schema's
# dsn; async callers use the pool yielded above.


def _test_dsn() -> str:
    dsn = os.environ.get("DATABASE_URL_TEST")
    if not dsn:
        pytest.skip(
            "DATABASE_URL_TEST not set; "
            "start docker compose up -d postgres and set "
            "DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test"
        )
    # Refuse production/pooler DSNs — test writes would be destructive.
    # We check supabase.co and pooler. hostnames independently.
    if "supabase.co" in dsn:
        pytest.fail(
            f"DATABASE_URL_TEST refuses supabase.co host: {dsn!r}. "
            "Use a disposable local/CI Postgres only."
        )
    if "pooler." in dsn:
        pytest.fail(
            f"DATABASE_URL_TEST refuses pooler. host: {dsn!r}. "
            "Use a disposable local/CI Postgres only."
        )
    return dsn


@pytest_asyncio.fixture
async def db_schema() -> AsyncGenerator[tuple[str, asyncpg.Pool], None]:
    """Per-test Postgres schema + applied migrations + async pool bound to it.

    Yields (schema_name, pool). Drops the schema on teardown.
    """
    dsn = _test_dsn()
    schema = f"test_{secrets.token_hex(8)}"

    # The supabase/migrations/ directory holds *incremental* diffs on top of
    # a baseline production schema (initial feature tables like extracted_fees,
    # fees_raw, institutions, etc. were created pre-migration-tracking).
    # For a fresh local Postgres we can only apply migrations whose prereqs
    # either exist or are defined later in the same directory. We tolerate
    # UndefinedTableError / UndefinedObjectError — those are baseline-dependent
    # migrations irrelevant to 62B agent tests, which define their own tables.

    # Bootstrap: create schema + run migrations, each in its own subtransaction
    # so a failure doesn't poison subsequent migrations.
    tolerated = (
        asyncpg.exceptions.UndefinedTableError,
        asyncpg.exceptions.UndefinedObjectError,
        asyncpg.exceptions.UndefinedColumnError,
        asyncpg.exceptions.UndefinedFunctionError,
        asyncpg.exceptions.GroupingError,
        asyncpg.exceptions.DuplicateTableError,
        asyncpg.exceptions.DuplicateObjectError,
    )
    boot = await asyncpg.connect(dsn, statement_cache_size=0)
    skipped: list[str] = []
    try:
        await boot.execute(f'CREATE SCHEMA "{schema}"')
        await boot.execute(f'SET search_path TO "{schema}", public')
        for migration in sorted(MIGRATIONS_DIR.glob("*.sql")):
            sql = migration.read_text()
            if not sql.strip():
                continue
            tx = boot.transaction()
            await tx.start()
            try:
                await boot.execute(sql)
                await tx.commit()
            except tolerated as exc:
                await tx.rollback()
                skipped.append(f"{migration.name}: {exc}")
    finally:
        await boot.close()

    if os.environ.get("BFI_DEBUG_MIGRATIONS") and skipped:
        print(f"\n[conftest] Skipped {len(skipped)} migrations:")
        for s in skipped:
            print(f"  - {s}")

    # Create a pool for the test, pinned to the schema.
    # Mirror production: register the jsonb/json codec on every new connection
    # so tests can pass/receive python dicts for JSONB columns (same behavior
    # as fee_crawler.agent_tools.pool._init_connection).
    from fee_crawler.agent_tools.pool import _init_connection

    pool = await asyncpg.create_pool(
        dsn,
        min_size=1,
        max_size=3,
        statement_cache_size=0,
        server_settings={"search_path": f"{schema}, public"},
        init=_init_connection,
    )

    try:
        yield schema, pool
    finally:
        await pool.close()
        cleanup = await asyncpg.connect(dsn, statement_cache_size=0)
        try:
            await cleanup.execute(f'DROP SCHEMA "{schema}" CASCADE')
        finally:
            await cleanup.close()


@pytest.fixture
def migrations_dir() -> Path:
    """Path to supabase/migrations/ for tests that inspect migration files."""
    return MIGRATIONS_DIR
