"""COMMS-01..04 + OBS-04 integration tests for Phase 62b agent messaging.

Coverage map:
  - test_payload_validation_challenge         -> COMMS-01 (publisher-side validation)
  - test_send_message_inserts_and_returns_id  -> COMMS-01 (INSERT + gateway audit)
  - test_darwin_knox_handshake                -> COMMS-02 (3-message handshake)
  - test_knox_darwin_handshake                -> COMMS-03 (reverse direction)
  - test_escalation_three_rounds              -> COMMS-04 (round-count branch)
  - test_escalation_time_based                -> COMMS-04 (expires_at branch)
  - test_listen_notify_roundtrip              -> COMMS-01 (NOTIFY trigger + listener)
  - test_replay_by_hash                       -> OBS-04 (v_agent_reasoning_trace)

The db_schema fixture skips cleanly when DATABASE_URL_TEST is unset (see
fee_crawler/tests/conftest.py). The LISTEN/NOTIFY roundtrip additionally
requires DATABASE_URL_SESSION[_TEST]; in CI the quick-suite MUST set
DATABASE_URL_SESSION_TEST so _session_skip() never triggers (see CLAUDE.md).
"""

from __future__ import annotations

import asyncio
import os
import uuid

import pytest

from fee_crawler.agent_messaging import (
    run_listener,
    scan_for_escalations,
    send_message,
)
from fee_crawler.agent_messaging.schemas import validate_payload_for_intent
from fee_crawler.agent_tools import with_agent_context
from fee_crawler.agent_tools.schemas import UpdateAgentMessageIntentInput
from fee_crawler.agent_tools.tools_agent_infra import update_agent_message_intent


def _session_skip():
    """Skip the LISTEN/NOTIFY roundtrip if no session-mode DSN is configured.

    CI MUST set DATABASE_URL_SESSION_TEST — the skip is for local dev only.
    """
    if not (
        os.environ.get("DATABASE_URL_SESSION")
        or os.environ.get("DATABASE_URL_SESSION_TEST")
    ):
        pytest.skip(
            "DATABASE_URL_SESSION[_TEST] required for LISTEN/NOTIFY integration; "
            "CI MUST set DATABASE_URL_SESSION_TEST (see CLAUDE.md)"
        )


def _bind_pool(pool):
    """Redirect fee_crawler.agent_tools.pool._pool to the per-test pool.

    Matches the pattern used by test_tools_agent_infra.py so publisher/updater
    tools call into the per-schema Postgres rather than the module singleton.
    Returns a restore function.
    """
    from fee_crawler.agent_tools import pool as pool_mod

    original = pool_mod._pool
    pool_mod._pool = pool

    def restore() -> None:
        pool_mod._pool = original

    return restore


# ---------------------------------------------------------------------------
# Pure-Python validation (no DB needed)
# ---------------------------------------------------------------------------


def test_payload_validation_challenge():
    """COMMS-01: bad payload shape must be rejected BEFORE any DB write."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        # Missing subject_event_id + question.
        validate_payload_for_intent("challenge", {})


def test_payload_validation_prove_requires_evidence():
    """COMMS-01: ProvePayload rejects empty evidence_refs."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        validate_payload_for_intent("prove", {"evidence_refs": []})


# ---------------------------------------------------------------------------
# Publisher smoke tests (DB-backed)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_message_inserts_and_returns_id(db_schema):
    """COMMS-01: send_message writes a row through the gateway + returns id."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        corr = str(uuid.uuid4())
        ev = str(uuid.uuid4())
        msg_id = await send_message(
            sender="darwin",
            recipient="knox",
            intent="challenge",
            payload={"subject_event_id": ev, "question": "why X?"},
            correlation_id=corr,
        )
        assert msg_id, "send_message returned empty message_id"

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT sender_agent, recipient_agent, intent, state
                     FROM agent_messages
                    WHERE message_id = $1::UUID""",
                msg_id,
            )
        assert row is not None
        assert row["sender_agent"] == "darwin"
        assert row["recipient_agent"] == "knox"
        assert row["intent"] == "challenge"
        assert row["state"] == "open"
    finally:
        restore()


# ---------------------------------------------------------------------------
# COMMS-02: Darwin challenges Knox
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_darwin_knox_handshake(db_schema):
    """COMMS-02: 3-message sequence resolves with state='resolved' on m1+m2."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        corr = str(uuid.uuid4())
        ev = str(uuid.uuid4())

        # Round 1 — Darwin challenges Knox.
        m1 = await send_message(
            sender="darwin",
            recipient="knox",
            intent="challenge",
            payload={"subject_event_id": ev, "question": "prove X"},
            correlation_id=corr,
            round_number=1,
        )
        # Round 2 — Knox proves.
        m2 = await send_message(
            sender="knox",
            recipient="darwin",
            intent="prove",
            payload={"evidence_refs": [{"source_url": "https://x", "agent_event_id": ev}]},
            correlation_id=corr,
            parent_message_id=m1,
            round_number=2,
        )
        # Round 3 — Darwin accepts.
        m3 = await send_message(
            sender="darwin",
            recipient="knox",
            intent="accept",
            payload={"summary": "evidence accepted"},
            correlation_id=corr,
            parent_message_id=m2,
            round_number=3,
        )
        assert m3  # sanity — the accept landed.

        # Resolve the open rows in response to the accept. The accept itself is
        # terminal; m1 + m2 flip to resolved.
        with with_agent_context(agent_name="darwin", correlation_id=corr):
            await update_agent_message_intent(
                inp=UpdateAgentMessageIntentInput(message_id=m1, state="resolved"),
                agent_name="darwin",
                reasoning_prompt="resolve m1",
                reasoning_output="challenge satisfied",
            )
            await update_agent_message_intent(
                inp=UpdateAgentMessageIntentInput(message_id=m2, state="resolved"),
                agent_name="darwin",
                reasoning_prompt="resolve m2",
                reasoning_output="prove accepted",
            )

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT intent, state
                     FROM agent_messages
                    WHERE correlation_id = $1::UUID
                    ORDER BY created_at""",
                corr,
            )
        states = [r["state"] for r in rows]
        intents = [r["intent"] for r in rows]
        assert len(rows) == 3, f"expected 3 rows, got {len(rows)}: {intents}"
        assert intents == ["challenge", "prove", "accept"]
        # The triggering challenge + prove rows both resolved after the accept.
        assert states.count("resolved") >= 2, f"states={states}"
    finally:
        restore()


# ---------------------------------------------------------------------------
# COMMS-03: Knox challenges Darwin (reverse direction)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_knox_darwin_handshake(db_schema):
    """COMMS-03: same three-message shape, reversed sender/recipient."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        corr = str(uuid.uuid4())
        ev = str(uuid.uuid4())
        await send_message(
            sender="knox",
            recipient="darwin",
            intent="challenge",
            payload={"subject_event_id": ev, "question": "why reject?"},
            correlation_id=corr,
            round_number=1,
        )
        await send_message(
            sender="darwin",
            recipient="knox",
            intent="prove",
            payload={"evidence_refs": [{"rule_id": "R-42"}]},
            correlation_id=corr,
            round_number=2,
        )
        await send_message(
            sender="knox",
            recipient="darwin",
            intent="accept",
            payload={"summary": "ok"},
            correlation_id=corr,
            round_number=3,
        )
        async with pool.acquire() as conn:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM agent_messages WHERE correlation_id=$1::UUID",
                corr,
            )
            senders = await conn.fetch(
                """SELECT sender_agent FROM agent_messages
                    WHERE correlation_id=$1::UUID ORDER BY created_at""",
                corr,
            )
        assert count == 3
        assert [s["sender_agent"] for s in senders] == ["knox", "darwin", "knox"]
    finally:
        restore()


# ---------------------------------------------------------------------------
# COMMS-04: Escalation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_escalation_three_rounds(db_schema):
    """COMMS-04 round-count branch: round_number>=3 + state='open' -> escalated."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        corr = str(uuid.uuid4())
        ev = str(uuid.uuid4())
        await send_message(
            sender="darwin",
            recipient="knox",
            intent="challenge",
            payload={"subject_event_id": ev, "question": "q1"},
            correlation_id=corr,
            round_number=1,
        )
        await send_message(
            sender="knox",
            recipient="darwin",
            intent="prove",
            payload={"evidence_refs": [{"x": 1}]},
            correlation_id=corr,
            round_number=2,
        )
        await send_message(
            sender="darwin",
            recipient="knox",
            intent="reject",
            payload={"reason": "insufficient"},
            correlation_id=corr,
            round_number=3,
        )

        n = await scan_for_escalations()
        assert n >= 1, f"expected at least one row escalated, got {n}"

        async with pool.acquire() as conn:
            round3 = await conn.fetch(
                """SELECT state FROM agent_messages
                    WHERE correlation_id=$1::UUID
                      AND round_number = 3""",
                corr,
            )
        assert any(r["state"] == "escalated" for r in round3), (
            f"round 3 row not escalated: {[r['state'] for r in round3]}"
        )
    finally:
        restore()


@pytest.mark.asyncio
async def test_escalation_time_based(db_schema):
    """COMMS-04 timeout branch: expires_at<NOW() + state='open' -> escalated."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        corr = str(uuid.uuid4())
        # Directly INSERT a past-due row — bypass the publisher so we can set
        # expires_at to a historical value without clock manipulation.
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO agent_messages
                     (sender_agent, recipient_agent, intent, correlation_id,
                      payload, round_number, expires_at, state)
                   VALUES ('darwin','knox','challenge',$1::UUID,'{}'::JSONB,
                           1, NOW() - INTERVAL '1 hour','open')""",
                corr,
            )

        n = await scan_for_escalations()
        assert n >= 1

        async with pool.acquire() as conn:
            state = await conn.fetchval(
                "SELECT state FROM agent_messages WHERE correlation_id=$1::UUID",
                corr,
            )
        assert state == "escalated"
    finally:
        restore()


# ---------------------------------------------------------------------------
# COMMS-01 end-to-end: LISTEN/NOTIFY roundtrip
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_listen_notify_roundtrip(db_schema):
    """COMMS-01 integration: trigger fires NOTIFY + listener picks up within 10s.

    Skipped locally when DATABASE_URL_SESSION[_TEST] is unset. CI MUST set
    DATABASE_URL_SESSION_TEST so this never silently skips.
    """
    _session_skip()
    _, pool = db_schema
    restore = _bind_pool(pool)

    # Use an ephemeral recipient so we never collide with another test's channel.
    # recipient_agent has no FK to agent_registry (see migration 20260419) so
    # ad-hoc names are allowed.
    agent = f"ephemeral_{uuid.uuid4().hex[:6]}"
    received = asyncio.Event()
    captured: dict = {}

    async def handler(row: dict) -> None:
        captured["row"] = row
        received.set()

    stop = asyncio.Event()
    task = asyncio.create_task(run_listener(agent, handler, stop_event=stop))
    try:
        # Give the listener a short moment to register on the channel.
        await asyncio.sleep(1.0)

        corr = str(uuid.uuid4())
        ev = str(uuid.uuid4())
        msg_id = await send_message(
            sender="darwin",
            recipient=agent,
            intent="challenge",
            payload={"subject_event_id": ev, "question": "ping"},
            correlation_id=corr,
        )
        await asyncio.wait_for(received.wait(), timeout=10)
        # The listener should hand us the full row, not just the payload pointer.
        assert str(captured["row"]["message_id"]) == msg_id
        assert captured["row"]["recipient_agent"] == agent
        assert captured["row"]["intent"] == "challenge"
    finally:
        stop.set()
        try:
            await asyncio.wait_for(task, timeout=10)
        except asyncio.TimeoutError:
            task.cancel()
        restore()


# ---------------------------------------------------------------------------
# OBS-04: replay-by-hash — v_agent_reasoning_trace
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_replay_by_hash(db_schema):
    """OBS-04: v_agent_reasoning_trace returns an ordered event+message timeline
    for a given correlation_id.

    Seeds one agent_events row + one agent_messages row sharing the same
    correlation, then asserts the view returns >=2 rows in chronological order
    with the kind discriminator populated. This is the DB primitive the
    /admin/agents Replay tab queries.
    """
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        corr = str(uuid.uuid4())
        ev = str(uuid.uuid4())

        # Seed an agent_events row with an earlier created_at so ordering is
        # deterministic. The view uses status-agnostic columns only.
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, status,
                      correlation_id, input_payload, created_at)
                   VALUES ('darwin','review','_agent_base','_review','success',
                           $1::UUID, '{"note":"seed event"}'::JSONB,
                           NOW() - INTERVAL '10 seconds')""",
                corr,
            )

        # Seed an agent_messages row via the publisher (so the gateway audit
        # trail also lands in the same correlation).
        await send_message(
            sender="darwin",
            recipient="knox",
            intent="challenge",
            payload={"subject_event_id": ev, "question": "replay?"},
            correlation_id=corr,
        )

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT kind, created_at, agent_name, intent_or_action,
                          tool_name, entity
                     FROM v_agent_reasoning_trace
                    WHERE correlation_id = $1::UUID
                    ORDER BY created_at""",
                corr,
            )
        assert len(rows) >= 2, f"expected >=2 trace rows, got {len(rows)}"
        kinds = {r["kind"] for r in rows}
        assert "event" in kinds, f"event kind missing: {kinds}"
        assert "message" in kinds, f"message kind missing: {kinds}"
        # Ordering: the seeded event landed 10 seconds earlier.
        assert rows[0]["kind"] == "event", (
            f"expected first row kind=event, got {rows[0]['kind']}"
        )
    finally:
        restore()
