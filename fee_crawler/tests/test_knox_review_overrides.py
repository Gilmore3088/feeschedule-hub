"""Roadmap #7 — Knox review UI: integration test for the override path.

Verifies:
  1. migration 20260419_knox_review_overrides.sql applies cleanly.
  2. The server-action override flow (recorded here as raw SQL that mirrors
     src/app/admin/agents/knox/reviews/actions.ts) re-promotes a rejected
     fees_verified row to fees_published when it inserts the missing knox
     'accept' message alongside an existing darwin 'accept'.
  3. The unique index on rejection_msg_id prevents double-review.
"""

from __future__ import annotations

import uuid

import pytest


@pytest.mark.asyncio
async def test_knox_overrides_table_present(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT table_name
                 FROM information_schema.tables
                WHERE table_name = 'knox_overrides'
                  AND table_schema = current_schema()"""
        )
    assert row is not None, "knox_overrides table missing"


@pytest.mark.asyncio
async def test_override_promotes_fee_when_darwin_already_accepted(db_schema):
    """End-to-end: a Knox rejection exists, Darwin already said accept; human
    override writes a Knox accept + calls promote_to_tier3 and a fees_published
    row is created."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        # --- minimal fixtures -------------------------------------------------
        inst_id = 900001
        # crawl_targets is part of baseline; insert if table exists, otherwise
        # skip the FK-ish linkage (the review_overrides table does not FK
        # institution_id).
        try:
            await conn.execute(
                """INSERT INTO crawl_targets (id, institution_name, state_code)
                        VALUES ($1, 'Test Bank', 'CA')
                   ON CONFLICT (id) DO NOTHING""",
                inst_id,
            )
        except Exception:
            pass

        # A user for reviewer_id FK.
        reviewer_id = 900002
        try:
            await conn.execute(
                """INSERT INTO users (id, username, display_name, role, is_active,
                                       password_hash)
                        VALUES ($1, 'tester', 'Tester', 'analyst', true, 'x:x')
                   ON CONFLICT (id) DO NOTHING""",
                reviewer_id,
            )
        except Exception:
            pytest.skip("users table shape unexpected in test baseline")

        # Seed the tier chain raw -> verified.
        raw_id = await conn.fetchval(
            """INSERT INTO fees_raw
                    (institution_id, agent_event_id, fee_name, amount, source)
                 VALUES ($1, '00000000-0000-0000-0000-000000000000'::uuid,
                         'Overdraft Fee', 34.00, 'knox')
              RETURNING fee_raw_id""",
            inst_id,
        )
        verified_id = await conn.fetchval(
            """INSERT INTO fees_verified
                    (fee_raw_id, institution_id, canonical_fee_key,
                     verified_by_agent_event_id, fee_name, amount)
                 VALUES ($1, $2, 'overdraft',
                         gen_random_uuid(), 'Overdraft Fee', 34.00)
              RETURNING fee_verified_id""",
            raw_id,
            inst_id,
        )

        corr = uuid.uuid4()

        # Knox rejected.
        rejection_msg_id = await conn.fetchval(
            """INSERT INTO agent_messages
                    (sender_agent, recipient_agent, intent, state,
                     correlation_id, payload, round_number)
                 VALUES ('knox', 'darwin', 'reject', 'answered',
                         $1::uuid,
                         jsonb_build_object(
                           'fee_verified_id', $2::text,
                           'reason', 'amount is extreme outlier'
                         ),
                         1)
              RETURNING message_id""",
            corr,
            verified_id,
        )

        # Darwin accepted (preexisting).
        await conn.execute(
            """INSERT INTO agent_messages
                    (sender_agent, recipient_agent, intent, state,
                     correlation_id, payload, round_number)
                 VALUES ('darwin', 'knox', 'accept', 'resolved',
                         $1::uuid,
                         jsonb_build_object('fee_verified_id', $2::text),
                         1)""",
            corr,
            verified_id,
        )

        # --- simulate overrideRejection() -------------------------------------
        async with conn.transaction():
            await conn.execute(
                """INSERT INTO knox_overrides
                        (rejection_msg_id, fee_verified_id, decision,
                         reviewer_id, note)
                     VALUES ($1, $2, 'override', $3, 'Knox misread')""",
                rejection_msg_id,
                verified_id,
                reviewer_id,
            )
            await conn.execute(
                """INSERT INTO agent_messages
                        (sender_agent, recipient_agent, intent, state,
                         correlation_id, payload, round_number)
                     VALUES ('knox', 'darwin', 'accept', 'resolved',
                             $1::uuid,
                             jsonb_build_object(
                               'fee_verified_id', $2::text,
                               'source', 'human_override'
                             ),
                             1)""",
                corr,
                verified_id,
            )
            adv_event = await conn.fetchval(
                """INSERT INTO agent_events
                        (agent_name, action, tool_name, entity, entity_id,
                         status, correlation_id, input_payload)
                     VALUES ('_human_review', 'knox_override', 'knox_review_ui',
                             'agent_messages', $1, 'success', $2::uuid,
                             jsonb_build_object('fee_verified_id', $3))
                   RETURNING event_id""",
                str(rejection_msg_id),
                corr,
                verified_id,
            )
            published_id = await conn.fetchval(
                "SELECT promote_to_tier3($1::bigint, $2::uuid)",
                verified_id,
                adv_event,
            )

        assert published_id is not None and published_id > 0, (
            "promote_to_tier3 should return a fees_published_id"
        )

        published_row = await conn.fetchrow(
            "SELECT * FROM fees_published WHERE fee_published_id = $1",
            published_id,
        )
        assert published_row is not None
        assert published_row["lineage_ref"] == verified_id
        assert published_row["fee_name"] == "Overdraft Fee"


@pytest.mark.asyncio
async def test_override_unique_per_rejection(db_schema):
    """Only one knox_overrides row per rejection_msg_id."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        reviewer_id = 900003
        try:
            await conn.execute(
                """INSERT INTO users (id, username, display_name, role, is_active,
                                       password_hash)
                        VALUES ($1, 'tester2', 'Tester 2', 'analyst', true, 'x:x')
                   ON CONFLICT (id) DO NOTHING""",
                reviewer_id,
            )
        except Exception:
            pytest.skip("users table shape unexpected in test baseline")

        corr = uuid.uuid4()
        rejection_msg_id = await conn.fetchval(
            """INSERT INTO agent_messages
                    (sender_agent, recipient_agent, intent, state,
                     correlation_id, payload, round_number)
                 VALUES ('knox', 'darwin', 'reject', 'answered',
                         $1::uuid,
                         jsonb_build_object('reason', 'test'),
                         1)
              RETURNING message_id""",
            corr,
        )

        await conn.execute(
            """INSERT INTO knox_overrides
                    (rejection_msg_id, decision, reviewer_id, note)
                 VALUES ($1, 'confirm', $2, 'first')""",
            rejection_msg_id,
            reviewer_id,
        )

        import asyncpg

        with pytest.raises(asyncpg.exceptions.UniqueViolationError):
            await conn.execute(
                """INSERT INTO knox_overrides
                        (rejection_msg_id, decision, reviewer_id, note)
                     VALUES ($1, 'override', $2, 'duplicate')""",
                rejection_msg_id,
                reviewer_id,
            )
