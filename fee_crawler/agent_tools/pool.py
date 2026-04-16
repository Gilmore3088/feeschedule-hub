"""asyncpg connection pool singleton for agent_tools.

Configured for Supabase transaction-mode pooler (port 6543):
  - statement_cache_size=0 (prepared statements incompatible with Supavisor)
  - max_cached_statement_lifetime=0 (belt-and-suspenders)
  - JSONB encoded/decoded via python json module

Reference: Supabase docs on disabling prepared statements
  https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL
"""

from __future__ import annotations

import json
import os
from typing import Optional

import asyncpg

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Return a process-scoped asyncpg pool. Creates on first call."""
    global _pool
    if _pool is None:
        dsn = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_URL_TEST")
        if not dsn:
            raise RuntimeError(
                "DATABASE_URL (or DATABASE_URL_TEST for tests) must be set "
                "before calling get_pool()."
            )
        _pool = await asyncpg.create_pool(
            dsn=dsn,
            min_size=1,
            max_size=10,
            statement_cache_size=0,             # REQUIRED for transaction pooler (Supavisor)
            max_cached_statement_lifetime=0,    # Belt-and-suspenders
            max_inactive_connection_lifetime=60,
            command_timeout=30,
            server_settings={"application_name": "bfi-agent-tool"},
            init=_init_connection,
        )
    return _pool


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Register JSONB codec so JSONB round-trips via python dict.

    Every new connection opened by the pool goes through this init callback.
    Also enforces statement_cache_size=0 behavior on per-connection codecs.
    """
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )
    await conn.set_type_codec(
        "json",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


async def close_pool() -> None:
    """Close the pool. Primarily for test teardown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def open_pool_from_dsn(
    dsn: str,
    *,
    server_settings: Optional[dict] = None,
) -> asyncpg.Pool:
    """Open a fresh pool pointing at an explicit DSN (used by tests to pin search_path).

    Bypasses the module-level singleton so per-test schema fixtures can route traffic
    to their own schema via `server_settings={'search_path': '<schema>, public'}`.
    Caller owns closing the returned pool. statement_cache_size=0 is enforced here too.
    """
    pool = await asyncpg.create_pool(
        dsn=dsn,
        min_size=1,
        max_size=3,
        statement_cache_size=0,
        max_cached_statement_lifetime=0,
        max_inactive_connection_lifetime=60,
        command_timeout=30,
        server_settings=server_settings or {"application_name": "bfi-agent-tool-test"},
        init=_init_connection,
    )
    return pool
