"""Phase 1 — FeesVerifiedPromoter (real verify sink) + Darwin integration."""

from __future__ import annotations

import uuid

import pytest

from fee_crawler.engine import queue as q
from fee_crawler.engine.handlers.verify import Darwin
from fee_crawler.engine.promoter import FeesVerifiedPromoter
from fee_crawler.engine.worker import run_once

pytestmark = pytest.mark.asyncio

_EV = uuid.UUID("22222222-2222-4222-8222-222222222222")


async def _seed_raw(pool, name, amount, conf, *, event=_EV):
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "INSERT INTO fees_raw (institution_id, agent_event_id, fee_name, amount, "
            "frequency, extraction_confidence, source_url, document_r2_key, source) "
            "VALUES (1,$1,$2,$3,'monthly',$4,'u','k','knox') RETURNING fee_raw_id",
            event, name, amount, conf,
        )


async def test_promote_writes_fees_verified_once(pool):
    raw_id = await _seed_raw(pool, "Monthly Fee", 5.0, 0.95)
    promoter = FeesVerifiedPromoter()
    fee = {"fee_raw_id": raw_id, "fee_name": "Monthly Fee"}
    async with pool.acquire() as conn:
        await promoter.promote(conn, fee, "monthly_maintenance")
        await promoter.promote(conn, fee, "monthly_maintenance")  # idempotent
        rows = await conn.fetch(
            "SELECT canonical_fee_key, fee_name FROM fees_verified WHERE fee_raw_id=$1", raw_id
        )
    assert len(rows) == 1
    assert rows[0]["canonical_fee_key"] == "monthly_maintenance"
    assert rows[0]["fee_name"] == "Monthly Fee"


async def test_flag_merges_outlier_flags(pool):
    raw_id = await _seed_raw(pool, "Weird", -1.0, 0.95)
    promoter = FeesVerifiedPromoter()
    fee = {"fee_raw_id": raw_id}
    async with pool.acquire() as conn:
        await promoter.flag(conn, fee, ["negative_amount"])
        await promoter.flag(conn, fee, ["negative_amount", "review"])  # dedups
        flags = await conn.fetchval("SELECT outlier_flags FROM fees_raw WHERE fee_raw_id=$1", raw_id)
    assert set(flags) == {"negative_amount", "review"}


class _Classifier:
    async def classify(self, fee):
        return "monthly_maintenance"


async def test_verify_handler_end_to_end_promotes(pool):
    clean = await _seed_raw(pool, "Monthly Fee", 5.0, 0.95)
    dirty = await _seed_raw(pool, "Bad Fee", -9.0, 0.95)
    handler = Darwin(_Classifier(), FeesVerifiedPromoter())
    async with pool.acquire() as conn:
        await q.enqueue(conn, "verify", "doc:1", payload={"event_id": str(_EV)}, state_code="IA")
    await run_once(pool, handler, "w")
    async with pool.acquire() as conn:
        verified = await conn.fetch("SELECT fee_raw_id FROM fees_verified")
        dirty_flags = await conn.fetchval("SELECT outlier_flags FROM fees_raw WHERE fee_raw_id=$1", dirty)
    assert [r["fee_raw_id"] for r in verified] == [clean]     # only the clean one promoted
    assert "negative_amount" in dirty_flags                    # dirty one flagged in place
