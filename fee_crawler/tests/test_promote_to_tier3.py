"""Reliability Roadmap #12 — direct tests for the promote_to_tier3 SQL gate.

The SQL function at supabase/migrations/20260510_promote_to_tier3_tighten.sql
is a single point of failure: every fees_verified -> fees_published promotion
passes through it. A regression in this one function breaks the entire
publishing pipeline, so it deserves its own contract test suite independent
of the Python orchestrators that usually call it.

Each test:
  * uses the per-test Postgres schema from conftest (applies all migrations)
  * seeds the minimum upstream rows (crawl_targets, fees_raw, fees_verified,
    and the required agent_events + agent_messages)
  * calls promote_to_tier3 directly and asserts behaviour

Coverage:
    test_happy_path_both_accepts_promotes
    test_rejects_when_darwin_accept_missing
    test_rejects_when_knox_accept_missing
    test_rejects_when_knox_rejects
    test_rejects_unknown_fee_verified_id
    test_idempotency_currently_not_enforced  (known-weakness)
    test_shared_correlation_id_matches_preferred_path  (20260420 tighten)
    test_stale_accept_beyond_30d_fails                 (20260420 tighten)
    test_cross_correlation_grandfather_path_still_publishes  (20260420 tighten)
    test_batch_id_lands_on_fees_published_row                (20260420 batch_id)
    test_batch_id_null_when_omitted                          (20260420 batch_id)
    test_batch_id_threaded_via_tools_fees_wrapper            (20260420 batch_id)
"""
from __future__ import annotations

import uuid

import pytest


async def _seed_verified_fee(conn, *, institution_id: int = 99001) -> int:
    """Insert the minimal upstream rows and return a fee_verified_id."""
    knox_event_id = uuid.uuid4()
    await conn.execute(
        """
        INSERT INTO agent_events
            (event_id, agent_name, action, tool_name, entity, entity_id, status,
             correlation_id)
        VALUES
            ($1, 'knox', 'extract', 'extract', 'fees_raw', 'seed', 'success', $2)
        """,
        knox_event_id, uuid.uuid4(),
    )
    fee_raw_id = await conn.fetchval(
        """
        INSERT INTO fees_raw (
            institution_id, document_r2_key, source_url, extraction_confidence,
            agent_event_id, fee_name, amount, frequency, source
        ) VALUES (
            $1, 'r2://docs/seed.pdf', 'https://example.test/fees',
            0.92, $2, 'Monthly Maintenance', 12.50, 'monthly', 'knox'
        ) RETURNING fee_raw_id
        """,
        institution_id, knox_event_id,
    )

    darwin_event_id = uuid.uuid4()
    await conn.execute(
        """
        INSERT INTO agent_events
            (event_id, agent_name, action, tool_name, entity, entity_id, status,
             correlation_id)
        VALUES
            ($1, 'darwin', 'verify', 'promote_to_tier2', 'fees_verified', 'seed',
             'success', $2)
        """,
        darwin_event_id, uuid.uuid4(),
    )

    fee_verified_id = await conn.fetchval(
        """
        INSERT INTO fees_verified (
            fee_raw_id, institution_id, source_url, document_r2_key,
            extraction_confidence, canonical_fee_key, verified_by_agent_event_id,
            fee_name, amount, frequency, review_status
        ) VALUES (
            $1, $2, 'https://example.test/fees', 'r2://docs/seed.pdf',
            0.92, 'monthly_maintenance', $3,
            'Monthly Maintenance', 12.50, 'monthly', 'verified'
        ) RETURNING fee_verified_id
        """,
        fee_raw_id, institution_id, darwin_event_id,
    )
    return fee_verified_id


async def _post_message(
    conn,
    *,
    sender: str,
    intent: str,
    fee_verified_id: int,
    correlation_id=None,
    created_at_sql: str | None = None,
):
    """Write a minimal agent_messages row for the handshake check.

    recipient_agent is NOT NULL on agent_messages — for the tier-3 gate we
    only check sender+intent, so pair darwin<->knox arbitrarily.

    When `correlation_id` is omitted, a fresh UUID is generated (legacy
    cross-correlation behaviour — grandfather path on the tightened gate).
    When `created_at_sql` is provided, it's a SQL expression used to
    override created_at (e.g. "now() - interval '60 days'" for the
    stale-retention test).

    Returns the correlation_id used so tests can reuse it for the partner.
    """
    recipient = "knox" if sender == "darwin" else "darwin"
    corr = correlation_id if correlation_id is not None else uuid.uuid4()
    if created_at_sql is None:
        await conn.execute(
            """
            INSERT INTO agent_messages
                (message_id, sender_agent, recipient_agent, intent,
                 correlation_id, payload)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            uuid.uuid4(), sender, recipient, intent, corr,
            f'{{"fee_verified_id": {fee_verified_id}}}',
        )
    else:
        # Inline the created_at expression so PG evaluates it. Safe:
        # created_at_sql is test-only and never user-derived.
        await conn.execute(
            f"""
            INSERT INTO agent_messages
                (message_id, sender_agent, recipient_agent, intent,
                 correlation_id, payload, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, {created_at_sql})
            """,
            uuid.uuid4(), sender, recipient, intent, corr,
            f'{{"fee_verified_id": {fee_verified_id}}}',
        )
    return corr


async def _call_promote(conn, fee_verified_id: int, batch_id: str | None = None) -> int:
    """Invoke promote_to_tier3 with a fresh adversarial event id.

    `batch_id` is optional; NULL matches pre-rollback behaviour. When supplied,
    the 3-arg signature (20260420_promote_to_tier3_batch_id.sql) stamps the
    value onto the resulting fees_published row.
    """
    adversarial_event_id = uuid.uuid4()
    await conn.execute(
        """
        INSERT INTO agent_events
            (event_id, agent_name, action, tool_name, entity, entity_id, status,
             correlation_id)
        VALUES ($1, '_adversarial', 'resolve', 'adversarial', 'agent_messages',
                'seed', 'success', $2)
        """,
        adversarial_event_id, uuid.uuid4(),
    )
    if batch_id is None:
        # Exercise the 2-arg default-parameter call shape (rollback-unaware callers).
        return await conn.fetchval(
            "SELECT promote_to_tier3($1, $2)",
            fee_verified_id, adversarial_event_id,
        )
    return await conn.fetchval(
        "SELECT promote_to_tier3($1, $2, $3)",
        fee_verified_id, adversarial_event_id, batch_id,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_both_accepts_promotes(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        fvid = await _seed_verified_fee(conn)
        await _post_message(conn, sender="darwin", intent="accept", fee_verified_id=fvid)
        await _post_message(conn, sender="knox", intent="accept", fee_verified_id=fvid)

        published_id = await _call_promote(conn, fvid)
        assert published_id is not None and published_id > 0

        row = await conn.fetchrow(
            "SELECT lineage_ref, canonical_fee_key FROM fees_published WHERE fee_published_id = $1",
            published_id,
        )
        assert row is not None, "fees_published row must exist"
        assert row["lineage_ref"] == fvid
        assert row["canonical_fee_key"] == "monthly_maintenance"


@pytest.mark.asyncio
async def test_rejects_when_darwin_accept_missing(db_schema):
    """Handshake is NOT complete when only knox has accepted — must raise."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        fvid = await _seed_verified_fee(conn)
        await _post_message(conn, sender="knox", intent="accept", fee_verified_id=fvid)

        with pytest.raises(Exception, match="handshake incomplete"):
            await _call_promote(conn, fvid)


@pytest.mark.asyncio
async def test_rejects_when_knox_accept_missing(db_schema):
    """Handshake is NOT complete when only darwin has accepted — must raise."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        fvid = await _seed_verified_fee(conn)
        await _post_message(conn, sender="darwin", intent="accept", fee_verified_id=fvid)

        with pytest.raises(Exception, match="handshake incomplete"):
            await _call_promote(conn, fvid)


@pytest.mark.asyncio
async def test_rejects_when_knox_rejects(db_schema):
    """A knox intent='reject' message must NOT satisfy the accept check."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        fvid = await _seed_verified_fee(conn)
        await _post_message(conn, sender="darwin", intent="accept", fee_verified_id=fvid)
        await _post_message(conn, sender="knox", intent="reject", fee_verified_id=fvid)

        with pytest.raises(Exception, match="handshake incomplete"):
            await _call_promote(conn, fvid)


@pytest.mark.asyncio
async def test_rejects_unknown_fee_verified_id(db_schema):
    """Promoting a non-existent fee_verified_id must raise 'not found'."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        with pytest.raises(Exception, match="not found"):
            await _call_promote(conn, 999_999_999)


@pytest.mark.asyncio
async def test_idempotency_currently_not_enforced(db_schema):
    """Documents the known weakness: promote_to_tier3 will happily duplicate.

    This is a real issue tracked on the reliability roadmap but not yet fixed
    — the function has no ON CONFLICT / dedup on lineage_ref, so a retry after
    a network blip could produce two fees_published rows for the same verified
    fee. This test asserts the current behaviour so a future fix (adding a
    unique constraint or check) will flip it from pass -> fail and force an
    explicit update.
    """
    _, pool = db_schema
    async with pool.acquire() as conn:
        fvid = await _seed_verified_fee(conn)
        await _post_message(conn, sender="darwin", intent="accept", fee_verified_id=fvid)
        await _post_message(conn, sender="knox", intent="accept", fee_verified_id=fvid)

        first = await _call_promote(conn, fvid)
        second = await _call_promote(conn, fvid)
        # Both succeed — the function allows duplicates. When we fix this,
        # update the assertion to `assert second is None` or similar.
        assert first != second, "duplicate promotion currently creates two rows"


# ---------------------------------------------------------------------------
# Tightened-search tests (20260420_promote_to_tier3_tighten_search.sql)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_shared_correlation_id_matches_preferred_path(db_schema):
    """When darwin+knox accepts share correlation_id, the preferred (non-grandfather) path matches."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        fvid = await _seed_verified_fee(conn)
        shared = uuid.uuid4()
        await _post_message(
            conn, sender="darwin", intent="accept",
            fee_verified_id=fvid, correlation_id=shared,
        )
        await _post_message(
            conn, sender="knox", intent="accept",
            fee_verified_id=fvid, correlation_id=shared,
        )

        published_id = await _call_promote(conn, fvid)
        assert published_id is not None and published_id > 0

        # The preferred (non-grandfather) path stamps the handshake_correlation_id
        # into the audit event payload. Assert it matches the correlation we posted.
        row = await conn.fetchrow(
            """
            SELECT input_payload->>'handshake_correlation_id' AS corr,
                   input_payload->>'grandfathered'           AS gf
              FROM agent_events
             WHERE tool_name = 'promote_to_tier3'
               AND entity_id = $1::TEXT
            """,
            published_id,
        )
        assert row is not None
        assert row["corr"] == str(shared), f"expected shared corr {shared}, got {row['corr']!r}"
        assert row["gf"] == "false", f"expected grandfathered=false, got {row['gf']!r}"


@pytest.mark.asyncio
async def test_stale_accept_beyond_30d_fails(db_schema):
    """An accept whose created_at is older than 30 days no longer satisfies the gate."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        fvid = await _seed_verified_fee(conn)
        # Both sides accept but with a created_at outside the 30d window.
        await _post_message(
            conn, sender="darwin", intent="accept", fee_verified_id=fvid,
            created_at_sql="now() - interval '60 days'",
        )
        await _post_message(
            conn, sender="knox", intent="accept", fee_verified_id=fvid,
            created_at_sql="now() - interval '60 days'",
        )

        with pytest.raises(Exception, match="handshake incomplete"):
            await _call_promote(conn, fvid)


@pytest.mark.asyncio
async def test_cross_correlation_grandfather_path_still_publishes(db_schema):
    """Legacy pairs with DIFFERENT correlation_ids still publish via the grandfather branch."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        fvid = await _seed_verified_fee(conn)
        # Two different correlation ids (this is the default helper behaviour).
        await _post_message(conn, sender="darwin", intent="accept", fee_verified_id=fvid)
        await _post_message(conn, sender="knox", intent="accept", fee_verified_id=fvid)

        published_id = await _call_promote(conn, fvid)
        assert published_id is not None and published_id > 0

        row = await conn.fetchrow(
            """
            SELECT input_payload->>'grandfathered' AS gf
              FROM agent_events
             WHERE tool_name = 'promote_to_tier3'
               AND entity_id = $1::TEXT
            """,
            published_id,
        )
        assert row is not None
        assert row["gf"] == "true", f"expected grandfathered=true, got {row['gf']!r}"


# ---------------------------------------------------------------------------
# batch_id threading tests (20260420_promote_to_tier3_batch_id.sql + roadmap #6)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_batch_id_lands_on_fees_published_row(db_schema):
    """When batch_id is supplied, it must persist on the fees_published row."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        fvid = await _seed_verified_fee(conn)
        shared = uuid.uuid4()
        await _post_message(
            conn, sender="darwin", intent="accept",
            fee_verified_id=fvid, correlation_id=shared,
        )
        await _post_message(
            conn, sender="knox", intent="accept",
            fee_verified_id=fvid, correlation_id=shared,
        )

        batch_id = "drain-2026-04-19-darwin-test01"
        published_id = await _call_promote(conn, fvid, batch_id=batch_id)
        assert published_id is not None and published_id > 0

        row = await conn.fetchrow(
            "SELECT batch_id FROM fees_published WHERE fee_published_id = $1",
            published_id,
        )
        assert row is not None and row["batch_id"] == batch_id


@pytest.mark.asyncio
async def test_batch_id_null_when_omitted(db_schema):
    """Backward-compat: 2-arg callers still get a row with batch_id NULL."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        fvid = await _seed_verified_fee(conn)
        await _post_message(conn, sender="darwin", intent="accept", fee_verified_id=fvid)
        await _post_message(conn, sender="knox", intent="accept", fee_verified_id=fvid)

        published_id = await _call_promote(conn, fvid)  # no batch_id kwarg
        assert published_id is not None and published_id > 0

        row = await conn.fetchrow(
            "SELECT batch_id FROM fees_published WHERE fee_published_id = $1",
            published_id,
        )
        assert row is not None and row["batch_id"] is None


@pytest.mark.asyncio
async def test_batch_id_threaded_via_tools_fees_wrapper(db_schema):
    """Exercise the Python tools_fees.promote_fee_to_tier3 wrapper path.

    Asserts that PromoteFeeToTier3Input(batch_id=...) survives pydantic
    validation, reaches the SQL function, and lands on fees_published.
    """
    from fee_crawler.agent_tools import pool as pool_mod
    from fee_crawler.agent_tools.context import with_agent_context
    from fee_crawler.agent_tools.schemas import PromoteFeeToTier3Input
    from fee_crawler.agent_tools.tools_fees import promote_fee_to_tier3

    _, pool = db_schema
    pool_mod._pool = pool
    try:
        async with pool.acquire() as conn:
            fvid = await _seed_verified_fee(conn)
            shared = uuid.uuid4()
            await _post_message(
                conn, sender="darwin", intent="accept",
                fee_verified_id=fvid, correlation_id=shared,
            )
            await _post_message(
                conn, sender="knox", intent="accept",
                fee_verified_id=fvid, correlation_id=shared,
            )

        batch_id = "drain-2026-04-19-darwin-wrapper"
        with with_agent_context(agent_name="darwin"):
            out = await promote_fee_to_tier3(
                inp=PromoteFeeToTier3Input(
                    fee_verified_id=fvid,
                    batch_id=batch_id,
                ),
                agent_name="darwin",
                reasoning_prompt="publish-fees drain",
                reasoning_output=f"auto-promote fvid={fvid}",
            )
        assert out.success is True
        assert out.fee_published_id is not None

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT batch_id FROM fees_published WHERE fee_published_id = $1",
                out.fee_published_id,
            )
        assert row is not None and row["batch_id"] == batch_id, (
            f"expected batch_id={batch_id!r} on fees_published row, got {row['batch_id']!r}"
        )
    finally:
        pool_mod._pool = None
