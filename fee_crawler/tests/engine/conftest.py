"""Test fixtures for the ingestion engine.

Each test gets a throwaway Postgres schema with the minimal `jobs` table plus
the engine's Phase-0/Phase-2 migrations applied, and an asyncpg pool pinned to
that schema via search_path. No production DSN is ever accepted.
"""

from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import AsyncGenerator

import asyncpg
import pytest
import pytest_asyncio

MIGRATIONS = Path(__file__).resolve().parents[3] / "supabase" / "migrations"

# Minimal prerequisite tables the engine migrations ALTER/reference. Mirrors the
# relevant columns of scripts/migrate-schema.sql without pulling the full schema.
_PREREQ = """
CREATE TABLE IF NOT EXISTS jobs (
    id           BIGSERIAL   PRIMARY KEY,
    queue        TEXT        NOT NULL,
    entity_id    TEXT        NOT NULL,
    payload      JSONB,
    status       TEXT        NOT NULL DEFAULT 'pending',
    priority     INT         NOT NULL DEFAULT 0,
    attempts     INT         NOT NULL DEFAULT 0,
    max_attempts INT         NOT NULL DEFAULT 3,
    run_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_by    TEXT,
    locked_at    TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS crawl_targets (
    id BIGSERIAL PRIMARY KEY,
    institution_name TEXT NOT NULL,
    charter_type TEXT NOT NULL DEFAULT 'bank',
    source TEXT NOT NULL DEFAULT 'test',
    state_code CHAR(2),
    fee_schedule_url TEXT,
    website_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    last_content_hash TEXT,
    consecutive_failures INT NOT NULL DEFAULT 0
);
"""

# Engine migrations applied in order (Phase 0, Phase 2).
_ENGINE_MIGRATIONS = [
    "20260716000001_engine_phase0.sql",
    "20260716000002_engine_state_knowledge.sql",
]


def _dsn() -> str:
    dsn = os.environ.get("DATABASE_URL_TEST")
    if not dsn:
        pytest.skip(
            "DATABASE_URL_TEST not set; start a disposable local Postgres and set "
            "DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5432/bfi_test"
        )
    if "supabase.co" in dsn or "pooler." in dsn:
        pytest.fail(f"refusing production/pooler DSN for tests: {dsn!r}")
    return dsn


@pytest_asyncio.fixture
async def pool() -> AsyncGenerator[asyncpg.Pool, None]:
    dsn = _dsn()
    schema = f"engine_test_{secrets.token_hex(6)}"
    admin = await asyncpg.connect(dsn=dsn)
    await admin.execute(f'CREATE SCHEMA "{schema}"')
    await admin.close()

    p = await asyncpg.create_pool(
        dsn=dsn,
        min_size=1,
        max_size=8,
        server_settings={"search_path": schema},
    )
    async with p.acquire() as conn:
        await conn.execute(_PREREQ)
        for name in _ENGINE_MIGRATIONS:
            sql = (MIGRATIONS / name).read_text()
            await conn.execute(sql)
    try:
        yield p
    finally:
        await p.close()
        admin = await asyncpg.connect(dsn=dsn)
        await admin.execute(f'DROP SCHEMA "{schema}" CASCADE')
        await admin.close()
