"""Product rewire — extracted_fees_compat correctness.

The compat view is the wire that connects the engine to the product: it presents
the live published tier in the exact column shape ~18 crawler-db readers expect.
These tests prove it (a) has the legacy columns, (b) maps canonical_fee_key ->
fee_family/fee_category, (c) surfaces conditions via lineage, (d) shows ONLY the
active publish batch, and (e) marks everything approved.
"""

from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.asyncio

_EV = uuid.UUID("66666666-6666-4666-8666-666666666666")

# Columns the legacy readers (src/lib/crawler-db/*) select from extracted_fees.
LEGACY_COLS = {
    "id", "crawl_target_id", "fee_name", "amount", "frequency", "conditions",
    "extraction_confidence", "review_status", "created_at", "validation_flags",
    "fee_family", "fee_category", "account_product_type", "source",
}


async def _publish(pool, rows):
    """Seed crawl_targets + a full raw→verified→published active batch.

    rows: list of (institution_id, canonical_key, fee_name, amount, conditions)
    """
    async with pool.acquire() as conn:
        batch = await conn.fetchval(
            "INSERT INTO publish_batches (status, activated_at) "
            "VALUES ('active', NOW()) RETURNING batch_id"
        )
        for inst, key, name, amt, cond in rows:
            await conn.execute(
                "INSERT INTO crawl_targets (id, institution_name, state_code) "
                "VALUES ($1,'Bank','IA') ON CONFLICT (id) DO NOTHING", inst)
            raw = await conn.fetchval(
                "INSERT INTO fees_raw (institution_id, agent_event_id, fee_name, amount, "
                "conditions, extraction_confidence, source) VALUES ($1,$2,$3,$4,$5,0.95,'knox') "
                "RETURNING fee_raw_id", inst, _EV, name, amt, cond)
            ver = await conn.fetchval(
                "INSERT INTO fees_verified (fee_raw_id, institution_id, canonical_fee_key, "
                "verified_by_agent_event_id, fee_name, amount) VALUES ($1,$2,$3,$4,$5,$6) "
                "RETURNING fee_verified_id", raw, inst, key, _EV, name, amt)
            await conn.execute(
                "INSERT INTO fees_published_engine (batch_id, institution_id, canonical_fee_key, "
                "fee_name, amount, extraction_confidence, lineage_ref) "
                "VALUES ($1,$2,$3,$4,$5,0.95,$6)", batch, inst, key, name, amt, ver)
        return batch


async def test_view_has_legacy_columns(pool):
    async with pool.acquire() as conn:
        cols = {r["column_name"] for r in await conn.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='extracted_fees_compat'")}
    assert LEGACY_COLS.issubset(cols), f"missing: {LEGACY_COLS - cols}"


async def test_maps_family_category_and_conditions(pool):
    await _publish(pool, [(1, "monthly_maintenance", "Monthly Fee", 5.0, "waived w/ $1,500 bal")])
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM extracted_fees_compat WHERE crawl_target_id=1")
    assert row["fee_category"] == "monthly_maintenance"       # identity mapping
    assert row["fee_family"] == "Account Maintenance"          # from taxonomy_ref
    assert row["conditions"] == "waived w/ $1,500 bal"         # surfaced via lineage
    assert row["review_status"] == "approved"                  # published == approved
    assert row["source"] == "engine"
    assert float(row["amount"]) == 5.0


async def test_unknown_key_falls_back_to_other(pool):
    await _publish(pool, [(2, "some_future_key", "Mystery Fee", 3.0, None)])
    async with pool.acquire() as conn:
        fam = await conn.fetchval("SELECT fee_family FROM extracted_fees_compat WHERE crawl_target_id=2")
    assert fam == "Other Fees"                                 # graceful fallback


async def test_only_active_batch_is_visible(pool):
    # Active batch with one fee, plus a superseded batch with a different fee.
    await _publish(pool, [(3, "overdraft", "OD Fee", 35.0, None)])
    async with pool.acquire() as conn:
        old = await conn.fetchval(
            "INSERT INTO publish_batches (status, activated_at) VALUES ('superseded', NOW()) RETURNING batch_id")
        raw = await conn.fetchval(
            "INSERT INTO fees_raw (institution_id, agent_event_id, fee_name, amount, source) "
            "VALUES (3,$1,'Stale Fee',99.0,'knox') RETURNING fee_raw_id", _EV)
        ver = await conn.fetchval(
            "INSERT INTO fees_verified (fee_raw_id, institution_id, canonical_fee_key, "
            "verified_by_agent_event_id, fee_name, amount) VALUES ($1,3,'nsf',$2,'Stale Fee',99.0) "
            "RETURNING fee_verified_id", raw, _EV)
        await conn.execute(
            "INSERT INTO fees_published_engine (batch_id, institution_id, canonical_fee_key, "
            "fee_name, amount, lineage_ref) VALUES ($1,3,'nsf','Stale Fee',99.0,$2)", old, ver)
        names = [r["fee_name"] for r in await conn.fetch(
            "SELECT fee_name FROM extracted_fees_compat WHERE crawl_target_id=3")]
    assert names == ["OD Fee"]                                 # superseded batch excluded


async def test_parity_row_count_matches_active_published(pool):
    # The view's row count must equal fees_published_current (active batch).
    await _publish(pool, [(4, "wire_domestic_outgoing", "Wire", 25.0, None),
                          (4, "stop_payment", "Stop Pay", 30.0, None),
                          (5, "nsf", "NSF", 34.0, None)])
    async with pool.acquire() as conn:
        view_n = await conn.fetchval("SELECT count(*) FROM extracted_fees_compat")
        live_n = await conn.fetchval("SELECT count(*) FROM fees_published_current")
    assert view_n == live_n == 3
