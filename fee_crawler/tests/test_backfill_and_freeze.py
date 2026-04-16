"""Phase 62a plan 06 — backfill + freeze integration tests.

These tests seed a minimal legacy surface (crawl_targets, crawl_results,
extracted_fees) inside the per-test Postgres schema produced by the
db_schema fixture, then re-invoke the backfill and freeze migrations so
the guards see the legacy tables and apply the real SQL bodies.

Behaviors verified:
    1. Backfill copies non-rejected extracted_fees rows into fees_raw with
       source='migration_v10', and rows whose crawl_results.document_url is
       NULL get outlier_flags containing 'lineage_missing'.
    2. Freeze trigger blocks INSERT on extracted_fees with 'frozen' in the
       error message.
    3. Kill-switch (SET LOCAL app.allow_legacy_writes='true') permits a
       one-off write inside the same transaction, and the write is blocked
       again after the transaction ends.
    4. Backfill is idempotent: running it twice produces the same row count
       (dedup index prevents duplication).
"""

from __future__ import annotations

import pathlib

import pytest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKFILL_SQL = (
    REPO_ROOT / "supabase" / "migrations" / "20260420_backfill_fees_raw.sql"
)
FREEZE_SQL = (
    REPO_ROOT
    / "supabase"
    / "migrations"
    / "20260420_freeze_extracted_fees_writes.sql"
)


# Minimal legacy surface. We only include the columns the backfill SELECT
# actually touches. The real production tables have many more columns, but
# referencing extra columns in the test schema would be wasted surface.
CREATE_LEGACY_SURFACE = """
CREATE TABLE IF NOT EXISTS crawl_targets (
    id SERIAL PRIMARY KEY,
    institution_name TEXT
);
CREATE TABLE IF NOT EXISTS crawl_results (
    id SERIAL PRIMARY KEY,
    crawl_target_id INTEGER REFERENCES crawl_targets(id),
    document_url TEXT,
    document_path TEXT
);
CREATE TABLE IF NOT EXISTS extracted_fees (
    id SERIAL PRIMARY KEY,
    crawl_target_id INTEGER,
    crawl_result_id INTEGER,
    fee_name TEXT NOT NULL,
    amount NUMERIC(12,2),
    frequency TEXT,
    conditions TEXT,
    extraction_confidence NUMERIC(5,4),
    review_status TEXT DEFAULT 'pending'
);
"""


def _flag_list(flags) -> list[str]:
    """Normalize JSONB outlier_flags to a list of strings.

    asyncpg returns JSONB as a Python string unless a codec is registered on
    the connection/pool. The conftest pool does not register a codec, so we
    parse defensively and tolerate either already-parsed list or raw string.
    """
    if isinstance(flags, list):
        return [str(x) for x in flags]
    if isinstance(flags, str):
        import json
        try:
            parsed = json.loads(flags)
            if isinstance(parsed, list):
                return [str(x) for x in parsed]
        except (ValueError, TypeError):
            pass
    return []


@pytest.mark.asyncio
async def test_backfill_flags_lineage_missing(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(CREATE_LEGACY_SURFACE)
        await conn.execute(
            "INSERT INTO crawl_targets (institution_name) VALUES ('A'), ('B')"
        )
        await conn.execute(
            "INSERT INTO crawl_results (crawl_target_id, document_url, document_path) "
            "VALUES (1, 'https://a.example/fees.pdf', 's3://bucket/a.pdf'), "
            "       (2, NULL, NULL)"
        )
        await conn.execute(
            "INSERT INTO extracted_fees (crawl_target_id, crawl_result_id, fee_name, amount) "
            "VALUES (1, 1, 'wire_domestic', 25.00), "
            "       (2, 2, 'overdraft', 35.00)"
        )

        # Re-run the backfill body now that legacy tables exist. The initial
        # migration run (from db_schema setup) hit the to_regclass guard and
        # returned early.
        await conn.execute(BACKFILL_SQL.read_text())

        rows = await conn.fetch(
            "SELECT fee_name, outlier_flags "
            "FROM fees_raw "
            "WHERE source = 'migration_v10' "
            "ORDER BY fee_name"
        )

    by_name = {r["fee_name"]: _flag_list(r["outlier_flags"]) for r in rows}

    assert "wire_domestic" in by_name, f"expected wire_domestic in {list(by_name)}"
    assert "overdraft" in by_name, f"expected overdraft in {list(by_name)}"

    assert "lineage_missing" in by_name["overdraft"], (
        f"overdraft (NULL document_url) should be flagged lineage_missing; "
        f"got {by_name['overdraft']!r}"
    )
    assert "lineage_missing" not in by_name["wire_domestic"], (
        f"wire_domestic (has document_url) should NOT be flagged; "
        f"got {by_name['wire_domestic']!r}"
    )


@pytest.mark.asyncio
async def test_backfill_skips_rejected(db_schema):
    """Rejected extracted_fees rows should NOT flow into fees_raw."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(CREATE_LEGACY_SURFACE)
        await conn.execute(
            "INSERT INTO crawl_targets (institution_name) VALUES ('A')"
        )
        await conn.execute(
            "INSERT INTO crawl_results (crawl_target_id, document_url) "
            "VALUES (1, 'https://a.example/fees.pdf')"
        )
        await conn.execute(
            "INSERT INTO extracted_fees "
            "(crawl_target_id, crawl_result_id, fee_name, amount, review_status) "
            "VALUES (1, 1, 'should_copy', 10.00, 'pending'), "
            "       (1, 1, 'should_skip', 99.99, 'rejected')"
        )

        await conn.execute(BACKFILL_SQL.read_text())

        rows = await conn.fetch(
            "SELECT fee_name FROM fees_raw WHERE source = 'migration_v10'"
        )

    names = {r["fee_name"] for r in rows}
    assert "should_copy" in names, f"pending row must be backfilled; got {names}"
    assert "should_skip" not in names, (
        f"rejected row must NOT be backfilled; got {names}"
    )


@pytest.mark.asyncio
async def test_freeze_blocks_extracted_fees_writes(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(CREATE_LEGACY_SURFACE)
        # Re-apply the freeze migration now that extracted_fees exists.
        await conn.execute(FREEZE_SQL.read_text())

        with pytest.raises(Exception) as exc_info:
            await conn.execute(
                "INSERT INTO extracted_fees (crawl_target_id, fee_name) "
                "VALUES (1, 'x')"
            )

        assert "frozen" in str(exc_info.value).lower(), (
            f"expected 'frozen' in error message; got {exc_info.value!r}"
        )


@pytest.mark.asyncio
async def test_freeze_kill_switch_permits_write(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(CREATE_LEGACY_SURFACE)
        await conn.execute(FREEZE_SQL.read_text())

        # Inside a transaction, SET LOCAL scopes the kill-switch to the txn.
        async with conn.transaction():
            await conn.execute("SET LOCAL app.allow_legacy_writes = 'true'")
            await conn.execute(
                "INSERT INTO extracted_fees (crawl_target_id, fee_name) "
                "VALUES (1, 'kill-switch-allowed')"
            )

        # After the transaction ends, SET LOCAL expired — writes blocked again.
        with pytest.raises(Exception) as exc_info:
            await conn.execute(
                "INSERT INTO extracted_fees (crawl_target_id, fee_name) "
                "VALUES (1, 'should-be-blocked')"
            )
        assert "frozen" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_backfill_idempotent(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(CREATE_LEGACY_SURFACE)
        await conn.execute(
            "INSERT INTO crawl_targets (institution_name) VALUES ('A')"
        )
        await conn.execute(
            "INSERT INTO crawl_results (crawl_target_id, document_url) "
            "VALUES (1, 'https://a.example/fees.pdf')"
        )
        await conn.execute(
            "INSERT INTO extracted_fees "
            "(crawl_target_id, crawl_result_id, fee_name) "
            "VALUES (1, 1, 'wire')"
        )

        backfill_sql = BACKFILL_SQL.read_text()
        await conn.execute(backfill_sql)
        count1 = await conn.fetchval(
            "SELECT COUNT(*) FROM fees_raw WHERE source = 'migration_v10'"
        )
        await conn.execute(backfill_sql)
        count2 = await conn.fetchval(
            "SELECT COUNT(*) FROM fees_raw WHERE source = 'migration_v10'"
        )

    assert count1 == 1, f"first backfill run should produce 1 row; got {count1}"
    assert count2 == 1, (
        f"second backfill run should still be 1 row (dedup); got {count2}"
    )
