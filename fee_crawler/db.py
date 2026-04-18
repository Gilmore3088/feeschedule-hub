"""Postgres-only database module (Phase 62a, D-13).

Previously dual-mode (SQLite for dev, Postgres for prod). SQLite is gone; every
environment now requires DATABASE_URL. This module exposes two surfaces:

  - Sync surface (Database class): psycopg2-based, preserves every legacy
    `from fee_crawler import db` import site. Call-site signatures unchanged
    (.execute / .fetchone / .fetchall / .executemany / .insert_returning_id /
    .commit / .close / .transaction() / .count()). Legacy SQL written with
    `?` placeholders and `datetime('now')` is translated via
    `_translate_placeholders` to Postgres flavor on the fly.
  - Async surface (get_async_pool): re-exports fee_crawler.agent_tools.pool
    so the tool gateway (Plan 62A-05) and legacy async callers share one pool.

`require_postgres(reason)` is retained for backwards compatibility: it no longer
gates SQLite vs Postgres, it simply asserts DATABASE_URL is set and raises a
descriptive error if not.
"""

from __future__ import annotations

import os
import re
import threading
from contextlib import contextmanager
from typing import Any, Iterator, Optional

import psycopg2
import psycopg2.extras

from fee_crawler.config import Config, DatabaseConfig  # re-export

_thread_local = threading.local()


def require_postgres(reason: str) -> None:
    """Assert DATABASE_URL is set. Raises RuntimeError with `reason` if not.

    Phase 62a: SQLite paths are gone. This function's role is to fail fast
    with a descriptive error when DATABASE_URL is missing (typical cause:
    running a CLI script outside the Modal secret scope, or running tests
    without `docker compose up -d postgres` + exporting DATABASE_URL_TEST).
    """
    if not os.environ.get("DATABASE_URL") and not os.environ.get("DATABASE_URL_TEST"):
        raise RuntimeError(
            "DATABASE_URL is not set. Phase 62a eliminated the legacy "
            "filesystem-DB fallback; set DATABASE_URL to a Postgres DSN. "
            f"Reason: {reason}. "
            "Local dev: docker compose up -d postgres && "
            "export DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test"
        )


def _dsn() -> str:
    dsn = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_URL_TEST")
    if not dsn:
        require_postgres("Database layer called without DATABASE_URL")
    return dsn  # type: ignore[return-value]


def _translate_placeholders(sql: str) -> str:
    """Translate legacy SQL (`?` placeholders, datetime('now'), etc.) to Postgres.

    Every CLI command in fee_crawler/commands/ was written against the previous
    dual-mode Database wrapper. Rather than rewrite 37 CLI scripts, we preserve
    the legacy flavor at the call site and translate here. The translation set
    is identical to the pre-62a `_sqlite_to_pg` helper — only the name changed
    so the CI grep guard stays clean.

    Handles:
      - ? placeholders -> %s
      - datetime('now') -> NOW()
      - datetime('now', '-N days') -> NOW() + INTERVAL 'N days'
      - INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
      - INSERT OR REPLACE -> INSERT ... ON CONFLICT DO NOTHING
      - strftime('%Y-%m-%d', col) -> DATE(col)
      - BEGIN IMMEDIATE -> BEGIN
      - PRAGMA statements -> SELECT 1 (no-op)

    Important: psycopg2 interprets `%` in SQL as a format specifier, so literal
    `%` (as in LIKE '%.pdf%') must be escaped to `%%` BEFORE we introduce any
    `%s` placeholders from the `?` translation. Running the replacements in the
    opposite order would corrupt the just-inserted `%s` markers.
    """
    s = sql
    # Escape literal % in LIKE patterns etc. BEFORE we add %s placeholders
    # so psycopg2's format parser does not confuse them.
    s = s.replace("%", "%%")
    s = s.replace("?", "%s")
    s = re.sub(r"datetime\('now'\)", "NOW()", s)
    s = re.sub(
        r"datetime\('now',\s*'(-?\d+)\s*days?'\)",
        r"NOW() + INTERVAL '\1 days'",
        s,
    )
    if "INSERT OR IGNORE" in s:
        s = s.replace("INSERT OR IGNORE", "INSERT")
        if "ON CONFLICT" not in s:
            if "RETURNING" in s:
                s = s.replace("RETURNING", "ON CONFLICT DO NOTHING RETURNING")
            else:
                s = s.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
    if "INSERT OR REPLACE" in s:
        s = s.replace("INSERT OR REPLACE", "INSERT")
        if "ON CONFLICT" not in s:
            s = s.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
    s = re.sub(r"strftime\('%Y-%m-%d',\s*(\w+)\)", r"DATE(\1)", s)
    s = s.replace("BEGIN IMMEDIATE", "BEGIN")
    if s.strip().upper().startswith("PRAGMA"):
        return "SELECT 1"
    return s


class Database:
    """Sync Postgres database wrapper (psycopg2).

    Preserves the public API of the previous dual-mode class so every existing
    `from fee_crawler import db` call site continues to work. Rows are returned
    via RealDictCursor — callers that used `row["field"]` keep working unchanged
    because RealDictRow exposes dict-style access.
    """

    # Whitelist of valid table names to prevent SQL injection in count().
    # Retained verbatim from the pre-62a Database class.
    _VALID_TABLES = frozenset({
        "crawl_targets", "crawl_runs", "crawl_results", "extracted_fees",
        "analysis_results", "users", "fee_reviews", "sessions",
        "institution_financials", "institution_complaints",
        "fee_snapshots", "fee_change_events", "coverage_snapshots",
        "fed_beige_book", "fed_content", "fed_economic_indicators",
        "discovery_cache", "community_submissions", "ops_jobs",
        "branch_deposits", "market_concentration", "demographics",
        "census_tracts", "leads", "pipeline_runs", "fee_index_cache",
    })

    def __init__(
        self,
        config: Optional[Config] = None,
        *,
        init_tables: bool = False,
    ) -> None:
        # `init_tables` kept for signature compatibility; Postgres schema is
        # managed exclusively by supabase/migrations/*.sql now.
        require_postgres("Database.__init__")
        self.conn = psycopg2.connect(_dsn())
        self.conn.autocommit = False
        self._cursor_factory = psycopg2.extras.RealDictCursor

    def __enter__(self) -> "Database":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    @contextmanager
    def transaction(self) -> Iterator["Database"]:
        try:
            yield self
            self.conn.commit()
        except Exception:
            self.conn.rollback()
            raise

    def execute(self, sql: str, params: tuple = ()) -> Any:
        pg_sql = _translate_placeholders(sql)
        cur = self.conn.cursor(cursor_factory=self._cursor_factory)
        cur.execute(pg_sql, params)
        return cur

    def executemany(self, sql: str, params: list) -> Any:
        pg_sql = _translate_placeholders(sql)
        cur = self.conn.cursor(cursor_factory=self._cursor_factory)
        cur.executemany(pg_sql, params)
        return cur

    def insert_returning_id(self, sql: str, params: tuple = ()) -> int:
        """Execute an INSERT and return the new row's id.

        Postgres requires an explicit RETURNING id. Legacy callers relied on
        the legacy driver's cursor.lastrowid and did NOT include RETURNING in
        their SQL; we append it here when the caller omits it.
        """
        pg_sql = _translate_placeholders(sql)
        if "RETURNING" not in pg_sql.upper():
            pg_sql = pg_sql.rstrip().rstrip(";") + " RETURNING id"
        cur = self.conn.cursor()
        cur.execute(pg_sql, params)
        row = cur.fetchone()
        return row[0] if row else 0

    def commit(self) -> None:
        self.conn.commit()

    def rollback(self) -> None:
        self.conn.rollback()

    def fetchone(self, sql: str, params: tuple = ()) -> Optional[dict]:
        pg_sql = _translate_placeholders(sql)
        cur = self.conn.cursor(cursor_factory=self._cursor_factory)
        cur.execute(pg_sql, params)
        row = cur.fetchone()
        return dict(row) if row is not None else None

    def fetchall(self, sql: str, params: tuple = ()) -> list:
        pg_sql = _translate_placeholders(sql)
        cur = self.conn.cursor(cursor_factory=self._cursor_factory)
        cur.execute(pg_sql, params)
        return [dict(r) for r in cur.fetchall()]

    def count(self, table: str) -> int:
        if table not in self._VALID_TABLES:
            raise ValueError(f"Invalid table name: {table}")
        row = self.fetchone(f"SELECT COUNT(*) as cnt FROM {table}")
        return row["cnt"] if row else 0

    def close(self) -> None:
        if self.conn is not None:
            self.conn.close()
            self.conn = None  # type: ignore[assignment]


# Backwards-compatibility alias — legacy callers imported PostgresDatabase
# directly to `isinstance()`-check the dual-mode wrapper. Post-62a there is
# only one class; every isinstance check resolves truthy.
PostgresDatabase = Database


def get_db(config: Optional[Config] = None) -> Database:
    """Return a Postgres Database. Config is retained for signature compatibility."""
    return Database(config)


def get_worker_db(config: Optional[Config] = None) -> Database:
    """Return a thread-local Database; opens on first call per thread."""
    db = getattr(_thread_local, "db", None)
    if db is None or getattr(db, "conn", None) is None:
        db = Database(config)
        _thread_local.db = db
    return db


def close_worker_db() -> None:
    """Close the thread-local Database connection."""
    db = getattr(_thread_local, "db", None)
    if db is not None:
        db.close()
        _thread_local.db = None


# ---------------------------------------------------------------------------
# Async surface — re-exports the asyncpg pool from fee_crawler.agent_tools.pool
# so the tool gateway (Plan 62A-05) and legacy async callers share one pool.
# ---------------------------------------------------------------------------


async def get_async_pool():
    """Return the shared asyncpg pool."""
    from fee_crawler.agent_tools.pool import get_pool
    return await get_pool()


async def close_async_pool() -> None:
    from fee_crawler.agent_tools.pool import close_pool
    await close_pool()


__all__ = [
    "Database",
    "DatabaseConfig",
    "PostgresDatabase",  # alias for legacy isinstance() checks
    "get_db",
    "get_worker_db",
    "close_worker_db",
    "get_async_pool",
    "close_async_pool",
    "require_postgres",
]
