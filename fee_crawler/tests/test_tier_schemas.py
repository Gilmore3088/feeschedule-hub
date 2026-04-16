"""Schema probes for fees_raw / fees_verified / fees_published — plan 62A-03."""
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


async def _cols(pool, table):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = $1", table)
    return {r["column_name"] for r in rows}


@pytest.mark.asyncio
async def test_tier1(db_schema):
    cols = await _cols(db_schema[1], "fees_raw")
    assert TIER1_REQUIRED - cols == set(), f"fees_raw missing: {TIER1_REQUIRED - cols}"


@pytest.mark.asyncio
async def test_tier2(db_schema):
    cols = await _cols(db_schema[1], "fees_verified")
    assert TIER2_REQUIRED - cols == set(), f"fees_verified missing: {TIER2_REQUIRED - cols}"


@pytest.mark.asyncio
async def test_tier3(db_schema):
    cols = await _cols(db_schema[1], "fees_published")
    assert TIER3_REQUIRED - cols == set(), f"fees_published missing: {TIER3_REQUIRED - cols}"
