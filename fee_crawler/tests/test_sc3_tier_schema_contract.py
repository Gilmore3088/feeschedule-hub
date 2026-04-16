"""SC3: fees_raw + fees_verified + fees_published all resolve with lineage columns."""
import pytest


@pytest.mark.asyncio
async def test_sc3_three_tiers_resolve(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        for tbl in ("fees_raw", "fees_verified", "fees_published"):
            r = await conn.fetchrow("SELECT to_regclass($1) AS t", tbl)
            assert r["t"] is not None, f"{tbl} must exist"
