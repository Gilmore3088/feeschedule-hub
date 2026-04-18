"""Magellan integration tests — real Postgres, mocked rungs."""
from __future__ import annotations

import os

import asyncpg
import pytest
import pytest_asyncio

from fee_crawler.agents.magellan import BatchResult, rescue_batch
from fee_crawler.agents.magellan.orchestrator import select_candidates
from fee_crawler.agents.magellan.rungs import LADDER, RungResult
from fee_crawler.agents.magellan.rungs._base import _Context, _Target


class _FakeRung:
    def __init__(self, name: str, result: RungResult) -> None:
        self.name = name
        self._result = result

    async def run(self, target: _Target, context: _Context) -> RungResult:
        return self._result


@pytest_asyncio.fixture
async def magellan_seeded_conn():
    dsn = os.environ.get("DATABASE_URL_TEST")
    if not dsn:
        pytest.skip("DATABASE_URL_TEST not set")
    conn = await asyncpg.connect(dsn)
    try:
        await conn.execute("TRUNCATE crawl_targets RESTART IDENTITY CASCADE;")
        for i in range(5):
            await conn.execute(
                """INSERT INTO crawl_targets
                     (institution_name, charter_type, fee_schedule_url, state, status, rescue_status)
                   VALUES ($1, 'bank', $2, 'WY', 'active', 'pending')""",
                f"Bank {i}",
                f"https://example{i}.test/fees",
            )
        yield conn
    finally:
        await conn.execute("TRUNCATE crawl_targets RESTART IDENTITY CASCADE")
        await conn.close()


@pytest.mark.asyncio
async def test_select_candidates_picks_pending(magellan_seeded_conn):
    rows = await select_candidates(magellan_seeded_conn, limit=10)
    assert len(rows) == 5


@pytest.mark.asyncio
async def test_rescue_batch_happy_path_first_rung_wins(magellan_seeded_conn):
    LADDER.clear()
    LADDER.append(
        _FakeRung(
            "fake-playwright",
            RungResult(
                fees=[
                    {"name": "Monthly Maintenance Fee", "amount": 12.0},
                    {"name": "Overdraft Fee", "amount": 35.0},
                ],
                text="Schedule of Fees",
                http_status=200,
            ),
        )
    )
    try:
        result: BatchResult = await rescue_batch(magellan_seeded_conn, size=5)
    finally:
        LADDER.clear()

    assert result.processed == 5
    assert result.rescued == 5
