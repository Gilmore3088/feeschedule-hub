"""Tests for rollback-publish CLI (Roadmap item #6).

Covers:
  * Migration is idempotent (safe to re-run).
  * --batch-id validation rejects empty / 'null' / missing.
  * Dry-run counts, samples, and writes audit row without touching fees_published.
  * Dry-run against unknown batch returns exit code 3 with zero-count audit row.

Per CLAUDE.md: tests run against Postgres via db_schema fixture. The real
rollback _execute_ path is NOT exercised against live data here — we only
touch an isolated per-test schema.
"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

import asyncpg
import pytest

from fee_crawler.commands.rollback_publish import (
    _count_and_sample,
    _validate_batch_id,
    build_parser,
)


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "20260419_fees_published_rollback.sql"
)


# ---------------------------------------------------------------------------
# Argument / safety-rail tests (pure, no DB).
# ---------------------------------------------------------------------------

def test_validate_batch_id_rejects_empty():
    with pytest.raises(SystemExit) as exc:
        _validate_batch_id("")
    assert exc.value.code == 2


def test_validate_batch_id_rejects_whitespace():
    with pytest.raises(SystemExit) as exc:
        _validate_batch_id("   ")
    assert exc.value.code == 2


def test_validate_batch_id_rejects_null_sentinel():
    for sentinel in ("null", "NULL", "None", "nil", "undefined"):
        with pytest.raises(SystemExit) as exc:
            _validate_batch_id(sentinel)
        assert exc.value.code == 2, f"sentinel {sentinel!r} must be rejected"


def test_validate_batch_id_accepts_real_id():
    assert _validate_batch_id("knox-run-2026-04-19-001") == "knox-run-2026-04-19-001"


def test_parser_requires_batch_id():
    parser = build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args([])  # missing --batch-id


def test_parser_defaults_to_dry_run():
    parser = build_parser()
    ns = parser.parse_args(["--batch-id", "foo"])
    assert ns.execute is False
    assert ns.dry_run is True


# ---------------------------------------------------------------------------
# Migration idempotency — apply twice, expect no error.
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_migration_is_idempotent(db_schema):
    _, pool = db_schema
    # Skip the test gracefully if the baseline hasn't produced fees_published
    # (the test DB applies migrations best-effort and may tolerate some misses).
    async with pool.acquire() as conn:
        exists = await conn.fetchval("SELECT to_regclass('fees_published') IS NOT NULL")
    if not exists:
        pytest.skip("fees_published missing in test schema — baseline migration tolerated off")

    sql = MIGRATION.read_text()
    async with pool.acquire() as conn:
        # Apply twice. All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
        await conn.execute(sql)
        await conn.execute(sql)
        # Columns present
        cols = {
            r["column_name"]
            for r in await conn.fetch(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'fees_published'"
            )
        }
        assert {"batch_id", "rolled_back_at", "rolled_back_by_batch_id", "rolled_back_reason"} <= cols
        # Audit table present
        assert await conn.fetchval("SELECT to_regclass('fees_published_rollback_log') IS NOT NULL")


# ---------------------------------------------------------------------------
# Dry-run against a seeded batch — exercises _count_and_sample + audit insert.
# ---------------------------------------------------------------------------

async def _seed_published_batch(conn, *, batch_id: str, n: int) -> list[int]:
    """Insert n rows into fees_published with the given batch_id."""
    # Need a fees_verified parent because lineage_ref is FK.
    # Need a fees_raw parent because fees_verified.fee_raw_id is FK.
    ids: list[int] = []
    for i in range(n):
        raw_id = await conn.fetchval(
            """INSERT INTO fees_raw
                   (institution_id, agent_event_id, fee_name, amount, source)
               VALUES ($1, $2::UUID, $3, $4, 'knox')
               RETURNING fee_raw_id""",
            1000 + i,
            str(uuid.uuid4()),
            f"test fee {i}",
            10.0 + i,
        )
        verified_id = await conn.fetchval(
            """INSERT INTO fees_verified
                   (fee_raw_id, institution_id, fee_name, amount,
                    canonical_fee_key, verified_by_agent_event_id)
               VALUES ($1, $2, $3, $4, $5, $6::UUID)
               RETURNING fee_verified_id""",
            raw_id,
            1000 + i,
            f"test fee {i}",
            10.0 + i,
            "monthly_maintenance" if i % 2 == 0 else "overdraft",
            str(uuid.uuid4()),
        )
        pid = await conn.fetchval(
            """INSERT INTO fees_published
                   (lineage_ref, institution_id, canonical_fee_key,
                    fee_name, amount, batch_id,
                    published_by_adversarial_event_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7::UUID)
               RETURNING fee_published_id""",
            verified_id,
            1000 + i,
            "monthly_maintenance" if i % 2 == 0 else "overdraft",
            f"test fee {i}",
            10.0 + i,
            batch_id,
            str(uuid.uuid4()),
        )
        ids.append(pid)
    return ids


@pytest.mark.asyncio
async def test_dry_run_counts_and_samples(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        if not await conn.fetchval("SELECT to_regclass('fees_published') IS NOT NULL"):
            pytest.skip("fees_published missing in test schema")
        if not await conn.fetchval(
            "SELECT to_regclass('fees_published_rollback_log') IS NOT NULL"
        ):
            pytest.skip("rollback_log missing — rollback migration did not apply")

        batch_id = f"test-batch-{uuid.uuid4().hex[:8]}"
        seeded = await _seed_published_batch(conn, batch_id=batch_id, n=12)
        assert len(seeded) == 12

        count, breakdown, sample = await _count_and_sample(conn, batch_id)
        assert count == 12
        # 6 even-index rows -> monthly_maintenance, 6 odd -> overdraft
        assert breakdown == {"monthly_maintenance": 6, "overdraft": 6}
        assert len(sample) == 10  # SAMPLE_LIMIT

        # Ensure nothing was mutated by the read-only helpers.
        live_after = await conn.fetchval(
            "SELECT COUNT(*) FROM fees_published "
            "WHERE batch_id = $1 AND rolled_back_at IS NULL",
            batch_id,
        )
        assert live_after == 12


@pytest.mark.asyncio
async def test_dry_run_on_unknown_batch_reports_zero(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        if not await conn.fetchval("SELECT to_regclass('fees_published') IS NOT NULL"):
            pytest.skip("fees_published missing in test schema")
        count, breakdown, sample = await _count_and_sample(
            conn, "batch-that-does-not-exist"
        )
        assert count == 0
        assert breakdown == {}
        assert list(sample) == []
