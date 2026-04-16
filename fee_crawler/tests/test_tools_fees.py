"""Integration tests for Plan 62A-07 fee-domain tools.

Tests require DATABASE_URL_TEST pointed at a Postgres with the db_schema fixture.
conftest applies all migrations so agent_registry + fees_raw + promote_to_tier2 exist.

Coverage:
  - test_create_fee_raw_writes_event_and_auth_log — AGENT-02 + AGENT-04 via tool wrapper
  - test_update_fee_raw_flags_records_before_and_after — before/after snapshots captured
  - test_promote_fee_to_tier2_darwin_only — TIER-04 Darwin-only gate (non-Darwin raises)
  - test_registry_covers_six_fee_entities — registry introspection (no DB needed)

Tests inject the per-test pool into the module-level singleton via pool._pool so the
gateway's implicit get_pool() routes to the isolated schema. The pool is restored to
None in try/finally so test ordering is not poisoned.
"""

from __future__ import annotations

import pytest

from fee_crawler.agent_tools.context import with_agent_context
from fee_crawler.agent_tools.schemas import (
    CreateFeeRawInput, PromoteFeeToTier2Input, UpdateFeeRawFlagsInput,
)
from fee_crawler.agent_tools.tools_fees import (
    create_fee_raw, promote_fee_to_tier2, update_fee_raw_flags,
)


@pytest.mark.asyncio
async def test_create_fee_raw_writes_event_and_auth_log(db_schema):
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool  # inject per-test pool into singleton
    try:
        with with_agent_context(agent_name="knox"):
            out = await create_fee_raw(
                inp=CreateFeeRawInput(institution_id=1, fee_name="overdraft", amount=35.00),
                agent_name="knox",
                reasoning_prompt="extract",
                reasoning_output="found $35 overdraft",
            )
        assert out.success is True
        assert out.fee_raw_id is not None
        assert out.event_ref is not None

        async with pool.acquire() as conn:
            ev_count = await conn.fetchval(
                "SELECT COUNT(*) FROM agent_events "
                "WHERE tool_name = 'create_fee_raw' AND status = 'success'"
            )
            auth_count = await conn.fetchval(
                "SELECT COUNT(*) FROM agent_auth_log WHERE tool_name = 'create_fee_raw'"
            )
            raw_count = await conn.fetchval(
                "SELECT COUNT(*) FROM fees_raw WHERE fee_raw_id = $1",
                out.fee_raw_id,
            )
        assert ev_count == 1, f"expected 1 success event, got {ev_count}"
        assert auth_count == 1, f"expected 1 auth_log row, got {auth_count}"
        assert raw_count == 1, f"expected fees_raw row to exist, got {raw_count}"
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_update_fee_raw_flags_records_before_and_after(db_schema):
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        with with_agent_context(agent_name="darwin"):
            created = await create_fee_raw(
                inp=CreateFeeRawInput(institution_id=1, fee_name="wire"),
                agent_name="darwin",
                reasoning_prompt="p", reasoning_output="o",
            )
            await update_fee_raw_flags(
                inp=UpdateFeeRawFlagsInput(
                    fee_raw_id=created.fee_raw_id,
                    outlier_flags=["suspicious"],
                ),
                agent_name="darwin",
                reasoning_prompt="review",
                reasoning_output="flagged",
            )
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT before_value, after_value FROM agent_auth_log "
                "WHERE tool_name = 'update_fee_raw_flags'"
            )
        assert row is not None, "expected agent_auth_log row for update_fee_raw_flags"
        # before_value has empty outlier_flags; after has suspicious.
        assert "suspicious" not in str(row["before_value"]), f"before={row['before_value']}"
        assert "suspicious" in str(row["after_value"]), f"after={row['after_value']}"
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_promote_fee_to_tier2_darwin_only(db_schema):
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        # Seed a fees_raw row so promote has something to promote.
        with with_agent_context(agent_name="knox"):
            created = await create_fee_raw(
                inp=CreateFeeRawInput(institution_id=1, fee_name="atm_foreign"),
                agent_name="knox", reasoning_prompt="p", reasoning_output="o",
            )

        # Knox calling promote_fee_to_tier2 must fail at the DB function level.
        with pytest.raises(Exception) as exc:
            with with_agent_context(agent_name="knox"):
                await promote_fee_to_tier2(
                    inp=PromoteFeeToTier2Input(
                        fee_raw_id=created.fee_raw_id,
                        canonical_fee_key="atm_foreign",
                    ),
                    agent_name="knox",
                    reasoning_prompt="p", reasoning_output="o",
                )
        err = str(exc.value).lower()
        assert "darwin" in err or "privilege" in err, f"unexpected error: {exc.value!r}"

        # Darwin succeeds.
        with with_agent_context(agent_name="darwin"):
            out = await promote_fee_to_tier2(
                inp=PromoteFeeToTier2Input(
                    fee_raw_id=created.fee_raw_id,
                    canonical_fee_key="atm_foreign",
                ),
                agent_name="darwin",
                reasoning_prompt="p", reasoning_output="o",
            )
        assert out.success is True
        assert out.fee_verified_id is not None

        async with pool.acquire() as conn:
            verified_count = await conn.fetchval(
                "SELECT COUNT(*) FROM fees_verified WHERE fee_verified_id = $1",
                out.fee_verified_id,
            )
        assert verified_count == 1, f"expected fees_verified row, got {verified_count}"
    finally:
        pool_mod._pool = None


def test_registry_covers_six_fee_entities():
    """Pure registry introspection; no DB fixture needed. Import triggers decorator registration."""
    import fee_crawler.agent_tools.tools_fees  # noqa: F401
    from fee_crawler.agent_tools.registry import TOOL_REGISTRY, entities_covered

    required_tools = {
        "create_fee_raw", "update_fee_raw_flags",
        "promote_fee_to_tier2", "promote_fee_to_tier3",
        "create_fee_review", "create_fee_change_event", "create_roomba_log",
    }
    assert required_tools <= set(TOOL_REGISTRY.keys()), (
        f"missing tools: {required_tools - set(TOOL_REGISTRY.keys())}"
    )

    required_entities = {
        "fees_raw", "fees_verified", "fees_published",
        "fee_reviews", "fee_change_events", "roomba_log",
    }
    covered = entities_covered()
    assert required_entities <= covered, f"missing entities: {required_entities - covered}"
