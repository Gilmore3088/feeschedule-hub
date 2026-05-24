"""Darwin cache TTL — pure-SQL unit test via mocked asyncpg conn.

Verifies the Q-03 fix from docs/team/05-product-focus.md: _lookup_cache
must restrict to entries created within CACHE_TTL_DAYS days so a bad
early classification ages out instead of poisoning every matching
row forever.
"""

import asyncio
from unittest.mock import AsyncMock

from fee_crawler.agents.darwin.orchestrator import CACHE_TTL_DAYS, _lookup_cache


def test_cache_ttl_constant_is_30_days():
    """The TTL is a deliberate 30 days; widening or shrinking should
    require a deliberate code change (this test catches accidental edits)."""
    assert CACHE_TTL_DAYS == 30


def test_lookup_cache_returns_empty_for_empty_names():
    conn = AsyncMock()

    async def run():
        return await _lookup_cache(conn, [])

    assert asyncio.run(run()) == {}
    conn.fetch.assert_not_awaited()


def test_lookup_cache_passes_ttl_param():
    """The SQL must include the days param so old rows are filtered out
    on the DB side (cheaper than client-side filtering at scale)."""
    captured = {}

    async def fake_fetch(sql, *params):
        captured["sql"] = sql
        captured["params"] = params
        return []

    conn = AsyncMock()
    conn.fetch = fake_fetch

    async def run():
        return await _lookup_cache(conn, ["nsf_fee", "overdraft"])

    asyncio.run(run())

    # The query must reference created_at with the TTL window
    assert "created_at" in captured["sql"]
    assert "interval" in captured["sql"].lower()
    # And the days param matches the constant
    assert str(CACHE_TTL_DAYS) in captured["params"]


def test_lookup_cache_returns_parsed_rows():
    rows = [
        {"cache_key": "nsf_fee", "canonical_fee_key": "nsf", "confidence": 0.94},
        {"cache_key": "overdraft", "canonical_fee_key": "overdraft", "confidence": 0.91},
    ]

    async def fake_fetch(_sql, *_params):
        return rows

    conn = AsyncMock()
    conn.fetch = fake_fetch

    async def run():
        return await _lookup_cache(conn, ["nsf_fee", "overdraft"])

    out = asyncio.run(run())
    assert out["nsf_fee"] == ("nsf", 0.94)
    assert out["overdraft"] == ("overdraft", 0.91)
