"""SC3 acceptance: three tier tables resolve AND carry the required lineage columns.

ROADMAP.md Phase 62a Success Criterion 3:
  SELECT * FROM fees_raw, fees_verified, fees_published all resolve — Tier 1/2/3
  tables exist with the required lineage columns:
    - Tier 1: source_url, document_r2_key, extraction_confidence, agent_event_id
    - Tier 2: canonical_fee_key, variant_type, outlier_flags + Tier 1 lineage passthrough
    - Tier 3: lineage_ref (Tier 2 FK) + Tier 1 + Tier 2 denormalized lineage
"""

from __future__ import annotations

import uuid

import pytest


TIER1_REQUIRED = {
    "fee_raw_id", "institution_id", "crawl_event_id", "document_r2_key",
    "source_url", "extraction_confidence", "agent_event_id",
    "fee_name", "amount", "frequency", "outlier_flags", "source",
}
TIER2_REQUIRED = {
    "fee_verified_id", "fee_raw_id", "canonical_fee_key", "variant_type",
    "outlier_flags", "verified_by_agent_event_id",
    "institution_id", "source_url", "document_r2_key",
}
TIER3_REQUIRED = {
    "fee_published_id", "lineage_ref", "institution_id",
    "canonical_fee_key", "published_by_adversarial_event_id",
    "source_url", "document_r2_key", "agent_event_id",
    "verified_by_agent_event_id",
}


async def _cols(pool, table: str) -> set[str]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = $1",
            table,
        )
    return {r["column_name"] for r in rows}


@pytest.mark.asyncio
async def test_sc3_three_tiers_resolve(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        for tbl in ("fees_raw", "fees_verified", "fees_published"):
            r = await conn.fetchval("SELECT to_regclass($1)", tbl)
            assert r is not None, f"SC3: {tbl} must exist"


@pytest.mark.asyncio
async def test_sc3_tier1_lineage_columns(db_schema):
    cols = await _cols(db_schema[1], "fees_raw")
    missing = TIER1_REQUIRED - cols
    assert not missing, (
        f"SC3 TIER-01: fees_raw missing lineage columns: {missing}"
    )


@pytest.mark.asyncio
async def test_sc3_tier2_lineage_columns(db_schema):
    cols = await _cols(db_schema[1], "fees_verified")
    missing = TIER2_REQUIRED - cols
    assert not missing, (
        f"SC3 TIER-02: fees_verified missing lineage columns: {missing}"
    )


@pytest.mark.asyncio
async def test_sc3_tier3_lineage_columns(db_schema):
    cols = await _cols(db_schema[1], "fees_published")
    missing = TIER3_REQUIRED - cols
    assert not missing, (
        f"SC3 TIER-03: fees_published missing lineage columns: {missing}"
    )


@pytest.mark.asyncio
async def test_sc3_lineage_chain_walks(db_schema):
    """Lineage chain is queryable: insert one row per tier with FK linkage, walk it."""
    _, pool = db_schema
    ae = str(uuid.uuid4())
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Seed an agent_events row so fees_raw.agent_event_id has a real UUID.
            await conn.execute(
                "INSERT INTO agent_events (event_id, agent_name, action, status) "
                "VALUES ($1::UUID, 'knox', 'extract', 'success')",
                ae,
            )
            raw_id = await conn.fetchval(
                """INSERT INTO fees_raw
                     (institution_id, source_url, agent_event_id, fee_name)
                   VALUES (1, 'https://example.com/fees.pdf', $1::UUID, 'overdraft')
                   RETURNING fee_raw_id""",
                ae,
            )
            verified_id = await conn.fetchval(
                """INSERT INTO fees_verified
                     (fee_raw_id, institution_id, canonical_fee_key,
                      verified_by_agent_event_id, fee_name)
                   VALUES ($1, 1, 'overdraft', $2::UUID, 'overdraft')
                   RETURNING fee_verified_id""",
                raw_id, ae,
            )
            published_id = await conn.fetchval(
                """INSERT INTO fees_published
                     (lineage_ref, institution_id, canonical_fee_key,
                      published_by_adversarial_event_id, fee_name)
                   VALUES ($1, 1, 'overdraft', $2::UUID, 'overdraft')
                   RETURNING fee_published_id""",
                verified_id, ae,
            )
            # Walk the chain from Tier 3 back to Tier 1.
            row = await conn.fetchrow(
                """SELECT fp.fee_published_id, fv.fee_verified_id, fr.fee_raw_id
                     FROM fees_published fp
                     JOIN fees_verified fv ON fp.lineage_ref = fv.fee_verified_id
                     JOIN fees_raw fr ON fv.fee_raw_id = fr.fee_raw_id
                    WHERE fp.fee_published_id = $1""",
                published_id,
            )
            assert row is not None
            assert row["fee_raw_id"] == raw_id
            assert row["fee_verified_id"] == verified_id
