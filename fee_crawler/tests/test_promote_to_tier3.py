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
    test_idempotency_currently_not_enforced  (known-weakness, xfail)
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


async def _post_message(conn, *, sender: str, intent: str, fee_verified_id: int) -> None:
    """Write a minimal agent_messages row for the handshake check.

    recipient_agent is NOT NULL on agent_messages — for the tier-3 gate we
    only check sender+intent, so pair darwin<->knox arbitrarily.
    """
    recipient = "knox" if sender == "darwin" else "darwin"
    await conn.execute(
        """
        INSERT INTO agent_messages
            (message_id, sender_agent, recipient_agent, intent,
             correlation_id, payload)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        uuid.uuid4(), sender, recipient, intent, uuid.uuid4(),
        f'{{"fee_verified_id": {fee_verified_id}}}',
    )


async def _call_promote(conn, fee_verified_id: int) -> int:
    """Invoke promote_to_tier3 with a fresh adversarial event id."""
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
    return await conn.fetchval(
        "SELECT promote_to_tier3($1, $2)",
        fee_verified_id, adversarial_event_id,
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
