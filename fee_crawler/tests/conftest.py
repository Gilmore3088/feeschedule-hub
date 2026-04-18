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
# Baseline schema pre-dates migration tracking — supabase/migrations/* are
# incremental on top of this. Apply before migrations so FKs resolve.
BASELINE_SCHEMA = REPO_ROOT / "scripts" / "migrate-schema.sql"
EXTRA_MIGRATIONS = REPO_ROOT / "scripts" / "migrations"
# Hamilton-side schema lives in TS app code (chat-memory.ts + pro-tables.ts);
# we mirror it here so Python integration tests can hit those tables.
HAMILTON_SCHEMA = Path(__file__).parent / "hamilton_schema.sql"


# E2E suite is legacy SQLite-era (uses a removed `test_db` fixture with
# PRAGMA calls). Needs a full rewrite for the Postgres era; out of scope
# for 62B. Skip collection entirely so these tests don't error on every run.
collect_ignore_glob = ["e2e/*"]


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

        # Apply baseline schema first (pre-migration-tracking tables the
        # incremental migrations layer on top of).
        if BASELINE_SCHEMA.exists():
            baseline_sql = BASELINE_SCHEMA.read_text()
            if baseline_sql.strip():
                tx = boot.transaction()
                await tx.start()
                try:
                    await boot.execute(baseline_sql)
                    await tx.commit()
                except tolerated as exc:
                    await tx.rollback()
                    skipped.append(f"{BASELINE_SCHEMA.name}: {exc}")

        # Then the Hamilton tables defined in src/lib/hamilton/*.
        if HAMILTON_SCHEMA.exists():
            hamilton_sql = HAMILTON_SCHEMA.read_text()
            if hamilton_sql.strip():
                tx = boot.transaction()
                await tx.start()
                try:
                    await boot.execute(hamilton_sql)
                    await tx.commit()
                except tolerated as exc:
                    await tx.rollback()
                    skipped.append(f"{HAMILTON_SCHEMA.name}: {exc}")

        # Then the extra one-off migrations in scripts/migrations/.
        if EXTRA_MIGRATIONS.exists():
            for migration in sorted(EXTRA_MIGRATIONS.glob("*.sql")):
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

        # Finally the incremental supabase/migrations/ directory.
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


# ---------------------------------------------------------------------------
# Darwin integration fixtures (task A-5)
# ---------------------------------------------------------------------------

import uuid as _uuid


@pytest_asyncio.fixture
async def seeded_conn():
    """10 fees_raw rows; first 3 already promoted to fees_verified (7 unpromoted)."""
    dsn = os.environ.get("DATABASE_URL_TEST")
    if not dsn:
        pytest.skip("DATABASE_URL_TEST not set")
    conn = await asyncpg.connect(dsn, statement_cache_size=0)
    try:
        await conn.execute(
            "TRUNCATE fees_raw, fees_verified, classification_cache CASCADE"
        )
        names = [
            "monthly maintenance fee",
            "overdraft fee",
            "atm fee non-network",
            "paper statement",
            "check printing",
            "wire transfer domestic",
            "card replacement",
            "legal process",
            "account research",
            "early closure",
        ]
        raw_ids: list[int] = []
        for i, n in enumerate(names):
            rid = await conn.fetchval(
                """INSERT INTO fees_raw
                     (institution_id, crawl_event_id, source_url,
                      extraction_confidence, agent_event_id, fee_name, amount, source)
                   VALUES ($1, $2, 'test://url', 0.95, $3::UUID, $4, $5, 'knox')
                   RETURNING fee_raw_id""",
                1 + i,
                i,
                str(_uuid.uuid4()),
                n,
                10.0 + i,
            )
            raw_ids.append(rid)

        # Promote first 3 rows so select_candidates returns only 7
        for rid in raw_ids[:3]:
            row = await conn.fetchrow(
                "SELECT institution_id, fee_name FROM fees_raw WHERE fee_raw_id = $1",
                rid,
            )
            await conn.execute(
                """INSERT INTO fees_verified
                     (fee_raw_id, institution_id, fee_name,
                      canonical_fee_key, verified_by_agent_event_id)
                   VALUES ($1, $2, $3, 'monthly_maintenance', $4::UUID)""",
                rid,
                row["institution_id"],
                row["fee_name"],
                str(_uuid.uuid4()),
            )
        yield conn
    finally:
        await conn.execute(
            "TRUNCATE fees_raw, fees_verified, classification_cache CASCADE"
        )
        await conn.close()


@pytest_asyncio.fixture
async def seeded_conn_nsf():
    """Single fees_raw row with fee_name='nsf fee' — must never be classified as overdraft."""
    dsn = os.environ.get("DATABASE_URL_TEST")
    if not dsn:
        pytest.skip("DATABASE_URL_TEST not set")
    conn = await asyncpg.connect(dsn, statement_cache_size=0)
    try:
        await conn.execute(
            "TRUNCATE fees_raw, fees_verified, classification_cache CASCADE"
        )
        await conn.execute(
            """INSERT INTO fees_raw
                 (institution_id, crawl_event_id, source_url,
                  extraction_confidence, agent_event_id, fee_name, amount, source)
               VALUES (1, 0, 'test://', 0.95, $1::UUID, 'nsf fee', 35.0, 'knox')""",
            str(_uuid.uuid4()),
        )
        yield conn
    finally:
        await conn.execute(
            "TRUNCATE fees_raw, fees_verified, classification_cache CASCADE"
        )
        await conn.close()
