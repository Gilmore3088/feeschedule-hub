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
_session_pool: Optional[asyncpg.Pool] = None


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


async def get_session_pool() -> asyncpg.Pool:
    """Return a process-scoped asyncpg pool configured for SESSION-MODE Postgres.

    Use ONLY for LISTEN/NOTIFY. Writes MUST continue to use get_pool() (transaction
    mode). Supavisor transaction pooler (port 6543) multiplexes connections between
    transactions -- LISTEN registrations do not survive. Session mode (port 5432)
    preserves connection state for the lifetime of the listener.

    Env var DATABASE_URL_SESSION MUST be set to a port-5432 DSN. Distinct from
    DATABASE_URL. DATABASE_URL_SESSION_TEST is accepted as a fallback for tests,
    matching the existing DATABASE_URL / DATABASE_URL_TEST convention.

    Unlike get_pool(), this pool leaves statement_cache_size at asyncpg's default
    because session mode supports prepared statements. Pool is deliberately small
    (min=1, max=3) because listeners are long-lived and few.

    Reference: Phase 62b research Mechanics #2 + Pitfall #2.
    """
    global _session_pool
    if _session_pool is None:
        dsn = os.environ.get("DATABASE_URL_SESSION") or os.environ.get(
            "DATABASE_URL_SESSION_TEST"
        )
        if not dsn:
            raise RuntimeError(
                "DATABASE_URL_SESSION (or DATABASE_URL_SESSION_TEST for tests) "
                "must be set before calling get_session_pool(). Required for "
                "LISTEN/NOTIFY in Phase 62b agent messaging -- transaction-mode "
                "pool does NOT support LISTEN registrations."
            )
        _session_pool = await asyncpg.create_pool(
            dsn=dsn,
            min_size=1,
            max_size=3,
            # Session mode supports prepared statements -- use asyncpg default
            # cache (do NOT set statement_cache_size=0; that is a txn-pool workaround).
            max_inactive_connection_lifetime=0,   # Listeners hold forever
            command_timeout=None,
            server_settings={"application_name": "bfi-agent-messaging"},
            init=_init_connection,
        )
    return _session_pool


async def close_session_pool() -> None:
    """Close the session pool. Primarily for test teardown."""
    global _session_pool
    if _session_pool is not None:
        await _session_pool.close()
        _session_pool = None


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
