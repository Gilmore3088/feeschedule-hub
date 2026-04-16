"""Integration tests for Plan 62A-10 peer+research tools."""

from __future__ import annotations

import pytest

from fee_crawler.agent_tools import with_agent_context
from fee_crawler.agent_tools.tools_peer_research import (
    upsert_classification_cache,
    create_saved_subscriber_peer_group,
    delete_saved_subscriber_peer_group,
)
from fee_crawler.agent_tools.schemas import (
    UpsertClassificationCacheInput,
    CreateSavedSubscriberPeerGroupInput,
    DeleteSavedSubscriberPeerGroupInput,
)


@pytest.mark.asyncio
async def test_upsert_classification_cache_idempotent(db_schema):
    """Same cache_key called twice yields one row, updated in place."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        with with_agent_context(agent_name="darwin"):
            await upsert_classification_cache(
                inp=UpsertClassificationCacheInput(
                    cache_key="overdraft:fees_v1",
                    canonical_fee_key="overdraft",
                    confidence=0.82,
                    model="haiku-4-5",
                    source="darwin",
                ),
                agent_name="darwin",
                reasoning_prompt="classify", reasoning_output="overdraft@0.82",
            )
            # Second call: same key, higher confidence.
            await upsert_classification_cache(
                inp=UpsertClassificationCacheInput(
                    cache_key="overdraft:fees_v1",
                    canonical_fee_key="overdraft",
                    confidence=0.95,
                    model="haiku-4-5",
                    source="darwin",
                ),
                agent_name="darwin",
                reasoning_prompt="re-classify", reasoning_output="overdraft@0.95",
            )

        async with pool.acquire() as conn:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM classification_cache WHERE cache_key = 'overdraft:fees_v1'"
            )
            assert count == 1, f"expected 1 row (upsert), got {count}"
            conf = await conn.fetchval(
                "SELECT confidence FROM classification_cache WHERE cache_key = 'overdraft:fees_v1'"
            )
            assert float(conf) == 0.95, f"expected confidence=0.95 after upsert, got {conf}"
            auth_count = await conn.fetchval(
                "SELECT COUNT(*) FROM agent_auth_log WHERE tool_name='upsert_classification_cache'"
            )
            assert auth_count == 2, f"expected 2 auth_log rows (one per upsert), got {auth_count}"
    finally:
        pool_mod._pool = None


@pytest.mark.asyncio
async def test_saved_subscriber_peer_group_cross_user_rejected(db_schema):
    """User B cannot delete user A's peer group."""
    _, pool = db_schema
    from fee_crawler.agent_tools import pool as pool_mod
    pool_mod._pool = pool
    try:
        with with_agent_context(agent_name="hamilton"):
            out = await create_saved_subscriber_peer_group(
                inp=CreateSavedSubscriberPeerGroupInput(
                    user_id="user_alpha",
                    name="My peers",
                    institution_ids=[1, 2, 3],
                ),
                agent_name="hamilton",
                reasoning_prompt="save", reasoning_output="saved",
            )
            assert out.group_id is not None

            with pytest.raises(PermissionError):
                with with_agent_context(agent_name="hamilton"):
                    await delete_saved_subscriber_peer_group(
                        inp=DeleteSavedSubscriberPeerGroupInput(
                            group_id=out.group_id,
                            user_id="user_beta",  # wrong owner
                        ),
                        agent_name="hamilton",
                        reasoning_prompt="delete",
                        reasoning_output="attempt",
                    )

            async with pool.acquire() as conn:
                count = await conn.fetchval(
                    "SELECT COUNT(*) FROM saved_subscriber_peer_groups WHERE id = $1::UUID",
                    out.group_id,
                )
                assert count == 1, "peer group must survive cross-user delete attempt"
    finally:
        pool_mod._pool = None
