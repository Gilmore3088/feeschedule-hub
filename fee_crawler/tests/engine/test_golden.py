"""Phase 5 — golden-set regression gate."""

from __future__ import annotations

import uuid

import pytest

from fee_crawler.engine import golden, rollup

pytestmark = pytest.mark.asyncio

_EV = uuid.UUID("44444444-4444-4444-8444-444444444444")


async def _golden(pool, tid, key, expected, tol=0.0):
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO golden_institutions (crawl_target_id, label) VALUES ($1,'g') "
            "ON CONFLICT DO NOTHING", tid
        )
        await conn.execute(
            "INSERT INTO golden_fees (crawl_target_id, canonical_fee_key, expected_amount, tolerance) "
            "VALUES ($1,$2,$3,$4)", tid, key, expected, tol,
        )


async def _verified(pool, tid, key, amount):
    async with pool.acquire() as conn:
        raw = await conn.fetchval(
            "INSERT INTO fees_raw (institution_id, agent_event_id, fee_name, amount, source) "
            "VALUES ($1,$2,'f',$3,'knox') RETURNING fee_raw_id", tid, _EV, amount,
        )
        await conn.execute(
            "INSERT INTO fees_verified (fee_raw_id, institution_id, canonical_fee_key, "
            "verified_by_agent_event_id, fee_name, amount) VALUES ($1,$2,$3,$4,'f',$5)",
            raw, tid, key, _EV, amount,
        )


async def test_clean_golden_no_regression(pool):
    await _golden(pool, 1, "monthly_maintenance", 5.0, tol=0.5)
    await _verified(pool, 1, "monthly_maintenance", 5.25)   # within tolerance
    assert await golden.golden_regressions(pool) == []


async def test_wrong_amount_flags_regression(pool):
    await _golden(pool, 1, "monthly_maintenance", 5.0, tol=0.5)
    await _verified(pool, 1, "monthly_maintenance", 9.0)    # outside tolerance
    regs = await golden.golden_regressions(pool)
    assert len(regs) == 1
    assert regs[0].wrong_amount[0][0] == "monthly_maintenance"


async def test_missing_fee_flags_regression(pool):
    await _golden(pool, 1, "wire_fee", 25.0)
    # nothing verified -> missing
    regs = await golden.golden_regressions(pool)
    assert regs[0].missing == ["wire_fee"]


async def test_rollup_blocks_publish_on_regression(pool):
    # A golden institution whose extraction regressed must block the swap.
    await _golden(pool, 1, "monthly_maintenance", 5.0, tol=0.1)
    await _verified(pool, 1, "monthly_maintenance", 99.0)   # regressed
    out = await rollup.run_national_rollup(pool, enforce_golden=True)
    assert out["published"] is False
    assert any("golden regression" in r for r in out["reasons"])
    async with pool.acquire() as conn:
        live = await conn.fetchval("SELECT count(*) FROM fees_published_current")
    assert live == 0   # nothing published


async def test_rollup_publishes_when_golden_clean(pool):
    await _golden(pool, 1, "monthly_maintenance", 5.0, tol=0.5)
    await _verified(pool, 1, "monthly_maintenance", 5.1)
    out = await rollup.run_national_rollup(pool, enforce_golden=True)
    assert out["published"] is True
