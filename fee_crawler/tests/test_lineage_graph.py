"""Phase 62b — functional tests for lineage_graph(), v_agent_reasoning_trace,
agent_messages_notify_trigger, and the tightened promote_to_tier3 gate.

All tests use the per-schema db_schema fixture from conftest.py. Each test
seeds a minimal Tier 1 -> Tier 2 -> Tier 3 chain and exercises the function
under test. Tests skip cleanly when DATABASE_URL_TEST is unset.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import asyncpg
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _seed_lineage_chain(
    pool: asyncpg.Pool,
    *,
    with_agent_event: bool = True,
    parent_event_id: uuid.UUID | None = None,
) -> dict:
    """Seed institutions -> fees_raw -> fees_verified -> fees_published.

    Returns a dict with the generated ids + the (optional) knox extract event_id.
    When `parent_event_id` is supplied, the Knox extract event chains to it —
    useful for exercising the recursive CTE's `event_chain` walk.
    """
    async with pool.acquire() as conn:
        knox_event_id = uuid.uuid4()
        if with_agent_event:
            await conn.execute(
                """
                INSERT INTO agent_events
                    (event_id, agent_name, action, tool_name, entity, entity_id, status,
                     parent_event_id, correlation_id, input_payload)
                VALUES
                    ($1, 'knox', 'extract', 'extract_fees', 'fees_raw', 'seed',
                     'success', $2, $3, '{"seed":true}'::jsonb)
                """,
                knox_event_id, parent_event_id, uuid.uuid4(),
            )

        fee_raw_id = await conn.fetchval(
            """
            INSERT INTO fees_raw (
                institution_id, document_r2_key, source_url, extraction_confidence,
                agent_event_id, fee_name, amount, frequency, source
            ) VALUES (
                99999, 'r2://docs/seed.pdf', 'https://example.test/fees',
                0.9100, $1, 'Monthly Maintenance', 12.50, 'monthly', 'knox'
            ) RETURNING fee_raw_id
            """,
            knox_event_id,
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
                $1, 99999, 'https://example.test/fees', 'r2://docs/seed.pdf',
                0.9100, 'monthly_maintenance', $2,
                'Monthly Maintenance', 12.50, 'monthly', 'verified'
            ) RETURNING fee_verified_id
            """,
            fee_raw_id, darwin_event_id,
        )

        adversarial_event_id = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO agent_events
                (event_id, agent_name, action, tool_name, entity, entity_id, status,
                 correlation_id)
            VALUES
                ($1, '_adversarial', 'handshake', 'agent_messages', 'fees_verified',
                 $2::text, 'success', $3)
            """,
            adversarial_event_id, fee_verified_id, uuid.uuid4(),
        )

        fee_published_id = await conn.fetchval(
            """
            INSERT INTO fees_published (
                lineage_ref, institution_id, canonical_fee_key,
                source_url, document_r2_key, extraction_confidence,
                agent_event_id, verified_by_agent_event_id, published_by_adversarial_event_id,
                fee_name, amount, frequency
            ) VALUES (
                $1, 99999, 'monthly_maintenance',
                'https://example.test/fees', 'r2://docs/seed.pdf', 0.9100,
                $2, $3, $4,
                'Monthly Maintenance', 12.50, 'monthly'
            ) RETURNING fee_published_id
            """,
            fee_verified_id, knox_event_id, darwin_event_id, adversarial_event_id,
        )

    return {
        "fee_raw_id": fee_raw_id,
        "fee_verified_id": fee_verified_id,
        "fee_published_id": fee_published_id,
        "knox_event_id": knox_event_id,
        "darwin_event_id": darwin_event_id,
        "adversarial_event_id": adversarial_event_id,
    }


# ---------------------------------------------------------------------------
# lineage_graph()
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_lineage_graph_missing_id_returns_error(db_schema):
    """Non-existent fee_published_id returns {'error': ...} (does NOT raise)."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        result = await conn.fetchval("SELECT lineage_graph(-1)")
    assert result is not None
    obj = json.loads(result) if isinstance(result, str) else result
    assert isinstance(obj, dict)
    assert "error" in obj
    assert "fee_published_id not found" in obj["error"]


@pytest.mark.asyncio
async def test_lineage_graph_single_query_full_trace(db_schema):
    """Seeded chain produces nested JSON with tier_3 -> tier_2 -> tier_1 keys and event_chain."""
    _, pool = db_schema
    seeded = await _seed_lineage_chain(pool)
    async with pool.acquire() as conn:
        result = await conn.fetchval(
            "SELECT lineage_graph($1)", seeded["fee_published_id"]
        )
    obj = json.loads(result) if isinstance(result, str) else result
    assert isinstance(obj, dict)

    assert "tier_3" in obj
    t3 = obj["tier_3"]
    assert t3["level"] == 3
    assert t3["row"]["fee_published_id"] == seeded["fee_published_id"]

    # tier_3 -> children[0] -> tier_2
    t2_wrap = t3["children"][0]
    assert "tier_2" in t2_wrap
    t2 = t2_wrap["tier_2"]
    assert t2["level"] == 2
    assert t2["row"]["fee_verified_id"] == seeded["fee_verified_id"]

    # tier_2 -> children[0] -> tier_1
    t1_wrap = t2["children"][0]
    assert "tier_1" in t1_wrap
    t1 = t1_wrap["tier_1"]
    assert t1["level"] == 1
    assert t1["row"]["fee_raw_id"] == seeded["fee_raw_id"]
    assert t1["r2_key"] == "r2://docs/seed.pdf"
    assert t1["source_url"] == "https://example.test/fees"

    # event_chain must contain at least the knox extract event.
    assert isinstance(t1["event_chain"], list)
    assert len(t1["event_chain"]) >= 1
    event_ids = [str(e["event_id"]) for e in t1["event_chain"]]
    assert str(seeded["knox_event_id"]) in event_ids


@pytest.mark.asyncio
async def test_lineage_graph_archived_parent_terminates_gracefully(db_schema):
    """Chain whose parent_event_id points to a non-existent row terminates quietly."""
    _, pool = db_schema
    # Parent UUID that does not exist in agent_events -> recursive CTE joins nothing.
    phantom_parent = uuid.uuid4()
    seeded = await _seed_lineage_chain(pool, parent_event_id=phantom_parent)

    async with pool.acquire() as conn:
        result = await conn.fetchval(
            "SELECT lineage_graph($1)", seeded["fee_published_id"]
        )
    obj = json.loads(result) if isinstance(result, str) else result
    # Function must return, not raise, when parent is missing.
    t1 = obj["tier_3"]["children"][0]["tier_2"]["children"][0]["tier_1"]
    # event_chain is a partial list — at least knox event; no exception.
    assert isinstance(t1["event_chain"], list)
    assert len(t1["event_chain"]) >= 1


# ---------------------------------------------------------------------------
# v_agent_reasoning_trace
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_v_agent_reasoning_trace_union(db_schema):
    """View UNIONs agent_events + agent_messages ordered by created_at per correlation_id."""
    _, pool = db_schema
    correlation = uuid.uuid4()
    async with pool.acquire() as conn:
        # 2 events
        for _ in range(2):
            await conn.execute(
                """
                INSERT INTO agent_events
                    (agent_name, action, tool_name, entity, status, correlation_id)
                VALUES
                    ('knox', 'probe', 'list_recent_events', 'events', 'success', $1)
                """,
                correlation,
            )
        # 2 messages
        for _ in range(2):
            await conn.execute(
                """
                INSERT INTO agent_messages
                    (sender_agent, recipient_agent, intent, correlation_id, payload)
                VALUES
                    ('darwin', 'knox', 'challenge', $1, '{}'::jsonb)
                """,
                correlation,
            )

        rows = await conn.fetch(
            "SELECT kind, created_at FROM v_agent_reasoning_trace "
            "WHERE correlation_id = $1 ORDER BY created_at",
            correlation,
        )
    kinds = [r["kind"] for r in rows]
    assert len(rows) == 4, f"expected 4 rows (2 events + 2 messages), got {len(rows)}: {kinds}"
    assert set(kinds) == {"event", "message"}
    # Monotonic by created_at (view has ORDER BY created_at; re-sort safety).
    timestamps = [r["created_at"] for r in rows]
    assert timestamps == sorted(timestamps)


# ---------------------------------------------------------------------------
# agent_messages_notify_trigger
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_messages_notify_trigger_exists(db_schema):
    """Trigger installed AFTER INSERT on agent_messages; payload is message_id only."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definition
              FROM pg_trigger t
              JOIN pg_class c ON t.tgrelid = c.oid
             WHERE c.relname = 'agent_messages'
               AND t.tgname = 'agent_messages_notify_trigger'
               AND NOT t.tgisinternal
            """
        )
    assert row is not None, "agent_messages_notify_trigger missing"
    defn = row["definition"]
    assert "AFTER INSERT" in defn.upper()
    assert "agent_messages_notify" in defn

    # Also assert the function body contains only message_id in the NOTIFY (not payload),
    # per research Pitfall 4 — 8000-byte cap.
    async with pool.acquire() as conn:
        body = await conn.fetchval(
            "SELECT prosrc FROM pg_proc WHERE proname = 'agent_messages_notify'"
        )
    assert body is not None
    assert "message_id" in body
    # Guard against regressions: the trigger must NOT send the full payload.
    assert "NEW.payload" not in body, (
        "agent_messages_notify must send message_id only "
        "(NEW.payload would risk the 8000-byte NOTIFY cap; research Pitfall 4)."
    )


# ---------------------------------------------------------------------------
# promote_to_tier3 — adversarial handshake gate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_promote_to_tier3_requires_both_handshakes(db_schema):
    """Missing darwin+knox accept messages -> RAISE EXCEPTION 'adversarial handshake incomplete'."""
    _, pool = db_schema
    seeded = await _seed_lineage_chain(pool)
    adversarial_event_id = uuid.uuid4()
    async with pool.acquire() as conn:
        # Ensure no agent_messages with intent='accept' referencing this fee_verified_id.
        with pytest.raises(asyncpg.exceptions.PostgresError) as exc_info:
            await conn.fetchval(
                "SELECT promote_to_tier3($1, $2)",
                seeded["fee_verified_id"], adversarial_event_id,
            )
    assert "adversarial handshake incomplete" in str(exc_info.value)


@pytest.mark.asyncio
async def test_promote_to_tier3_succeeds_when_both_accepts_present(db_schema):
    """Seeded darwin+knox accept rows -> promotion returns new fee_published_id."""
    _, pool = db_schema
    seeded = await _seed_lineage_chain(pool)

    # Seed accept messages from darwin AND knox referencing this fee_verified_id.
    correlation = uuid.uuid4()
    payload = json.dumps({"fee_verified_id": str(seeded["fee_verified_id"])})
    async with pool.acquire() as conn:
        # Set up a parent adversarial event the tightened function writes parent_event_id to.
        adversarial_event_id = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO agent_events
                (event_id, agent_name, action, tool_name, entity, entity_id, status,
                 correlation_id)
            VALUES
                ($1, '_adversarial', 'handshake', 'agent_messages', 'fees_verified',
                 $2::text, 'success', $3)
            """,
            adversarial_event_id, seeded["fee_verified_id"], correlation,
        )
        for sender in ("darwin", "knox"):
            await conn.execute(
                """
                INSERT INTO agent_messages
                    (sender_agent, recipient_agent, intent, correlation_id, payload)
                VALUES
                    ($1, 'atlas', 'accept', $2, $3::jsonb)
                """,
                sender, correlation, payload,
            )

        new_id = await conn.fetchval(
            "SELECT promote_to_tier3($1, $2)",
            seeded["fee_verified_id"], adversarial_event_id,
        )
    assert isinstance(new_id, int)
    assert new_id > 0

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT lineage_ref, published_by_adversarial_event_id, canonical_fee_key "
            "FROM fees_published WHERE fee_published_id = $1",
            new_id,
        )
    assert row["lineage_ref"] == seeded["fee_verified_id"]
    assert row["published_by_adversarial_event_id"] == adversarial_event_id
    assert row["canonical_fee_key"] == "monthly_maintenance"


@pytest.mark.asyncio
async def test_promote_to_tier3_raises_not_notice(db_schema):
    """Belt-and-suspenders check: migration source contains RAISE EXCEPTION, not RAISE NOTICE."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        body = await conn.fetchval(
            "SELECT prosrc FROM pg_proc "
            "WHERE proname = 'promote_to_tier3'"
        )
    assert body is not None
    assert "RAISE EXCEPTION" in body
    # The 62b tighten step must remove the 62a 'RAISE NOTICE ... 62a bootstrap' line.
    assert "62a bootstrap" not in body, (
        "promote_to_tier3 still contains the 62a RAISE NOTICE stub text"
    )
