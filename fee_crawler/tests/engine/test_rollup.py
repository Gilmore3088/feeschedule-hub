"""Phase 3 — national roll-up: dedupe, validation gate, atomic publish."""

from __future__ import annotations

import uuid

import pytest

from fee_crawler.engine import rollup

pytestmark = pytest.mark.asyncio

_EV = uuid.UUID("33333333-3333-4333-8333-333333333333")


async def _seed_verified(pool, inst, key, name, amount, conf, *, status="verified"):
    """Insert a fees_raw + fees_verified pair."""
    async with pool.acquire() as conn:
        raw_id = await conn.fetchval(
            "INSERT INTO fees_raw (institution_id, agent_event_id, fee_name, amount, "
            "extraction_confidence, source) VALUES ($1,$2,$3,$4,$5,'knox') RETURNING fee_raw_id",
            inst, _EV, name, amount, conf,
        )
        await conn.execute(
            "INSERT INTO fees_verified (fee_raw_id, institution_id, canonical_fee_key, "
            "verified_by_agent_event_id, fee_name, amount, extraction_confidence, review_status) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            raw_id, inst, key, _EV, name, amount, conf, status,
        )


async def test_build_staging_dedupes(pool):
    # Same (institution, canonical_fee_key) twice -> one published row (higher conf).
    await _seed_verified(pool, 1, "monthly_maintenance", "Monthly Fee", 5.0, 0.80)
    await _seed_verified(pool, 1, "monthly_maintenance", "Monthly Service Fee", 6.0, 0.95)
    await _seed_verified(pool, 2, "wire_fee", "Wire", 25.0, 0.90)

    batch_id = await rollup.build_staging(pool)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT institution_id, canonical_fee_key, amount FROM fees_published_engine "
            "WHERE batch_id=$1 ORDER BY institution_id", batch_id
        )
    assert len(rows) == 2                       # deduped
    assert rows[0]["amount"] == 6.0             # higher-confidence winner kept


async def test_validate_passes_clean_batch(pool):
    await _seed_verified(pool, 1, "monthly_maintenance", "Monthly Fee", 5.0, 0.95)
    batch_id = await rollup.build_staging(pool)
    res = await rollup.validate_batch(pool, batch_id)
    assert res.ok is True
    assert res.reasons == []


async def test_validate_rejects_empty(pool):
    batch_id = await rollup.build_staging(pool)   # no verified fees
    res = await rollup.validate_batch(pool, batch_id)
    assert res.ok is False
    assert any("empty" in r for r in res.reasons)


async def test_validate_rejects_catastrophic_drop(pool):
    # Publish a live batch of 10 rows, then a staging batch of 1 -> >30% drop.
    for i in range(10):
        await _seed_verified(pool, i, "k", "Fee", 5.0, 0.95)
    live = await rollup.build_staging(pool)
    assert (await rollup.validate_batch(pool, live)).ok
    await rollup.publish_batch(pool, live)

    # Now wipe most verified and build again.
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM fees_verified WHERE institution_id > 0")
    staging = await rollup.build_staging(pool)
    res = await rollup.validate_batch(pool, staging)
    assert res.ok is False
    assert any("row drop too large" in r for r in res.reasons)


async def test_atomic_publish_flips_pointer(pool):
    await _seed_verified(pool, 1, "k", "Fee A", 5.0, 0.95)
    b1 = await rollup.build_staging(pool)
    await rollup.publish_batch(pool, b1)
    async with pool.acquire() as conn:
        cur = await conn.fetch("SELECT fee_name FROM fees_published_current")
    assert [r["fee_name"] for r in cur] == ["Fee A"]

    # New batch supersedes; only one active batch ever.
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM fees_verified")
    await _seed_verified(pool, 1, "k", "Fee B", 7.0, 0.95)
    b2 = await rollup.build_staging(pool)
    await rollup.publish_batch(pool, b2)
    async with pool.acquire() as conn:
        cur = await conn.fetch("SELECT fee_name FROM fees_published_current")
        actives = await conn.fetchval("SELECT count(*) FROM publish_batches WHERE status='active'")
    assert [r["fee_name"] for r in cur] == ["Fee B"]   # swapped wholesale
    assert actives == 1                                 # exactly one active


async def test_publish_rejects_non_staging(pool):
    await _seed_verified(pool, 1, "k", "Fee", 5.0, 0.95)
    b = await rollup.build_staging(pool)
    await rollup.publish_batch(pool, b)
    with pytest.raises(ValueError):
        await rollup.publish_batch(pool, b)   # already active


async def test_run_national_rollup_publishes_and_revalidates(pool):
    await _seed_verified(pool, 1, "k", "Fee", 5.0, 0.95)
    called = {"n": 0}

    async def revalidate():
        called["n"] += 1

    out = await rollup.run_national_rollup(pool, revalidate=revalidate)
    assert out["published"] is True
    assert called["n"] == 1               # revalidation fired AFTER the swap
    async with pool.acquire() as conn:
        cur = await conn.fetchval("SELECT count(*) FROM fees_published_current")
    assert cur == 1


async def test_run_national_rollup_rejects_bad_batch(pool):
    # Live batch of 10, then empty verified -> staging empty -> rejected, live stays.
    for i in range(10):
        await _seed_verified(pool, i, "k", "Fee", 5.0, 0.95)
    live = await rollup.build_staging(pool)
    await rollup.publish_batch(pool, live)
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM fees_verified")

    out = await rollup.run_national_rollup(pool)
    assert out["published"] is False
    async with pool.acquire() as conn:
        # live batch still active + serving; rejected batch not active
        cur = await conn.fetchval("SELECT count(*) FROM fees_published_current")
        active_batch = await conn.fetchval("SELECT batch_id FROM publish_batches WHERE status='active'")
    assert cur == 10                    # old snapshot untouched
    assert active_batch == live
