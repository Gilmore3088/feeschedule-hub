---
phase: 62B
plan: 05
type: execute
wave: 3
depends_on: [62B-01, 62B-02, 62B-03, 62B-04]
files_modified:
  - fee_crawler/agent_messaging/__init__.py
  - fee_crawler/agent_messaging/schemas.py
  - fee_crawler/agent_messaging/publisher.py
  - fee_crawler/agent_messaging/listener.py
  - fee_crawler/agent_messaging/escalation.py
  - fee_crawler/agent_tools/tools_agent_infra.py
  - fee_crawler/tests/test_agent_messaging.py
autonomous: true
requirements: [COMMS-01, COMMS-02, COMMS-03, COMMS-04, OBS-04]
must_haves:
  truths:
    - "Publisher sends an agent_messages INSERT (via existing tools_agent_infra.insert_agent_message tool) and the NOTIFY trigger fires on channel agent_msg_<recipient>"
    - "Listener opens a session-mode asyncpg connection on DATABASE_URL_SESSION and receives message_id payloads via add_listener"
    - "Listener reconnects within 10 seconds of connection loss (backoff 1,2,4,8s)"
    - "Darwin-challenges-Knox handshake: 3-message sequence (challenge → prove → accept) resolves with state='resolved' on all three after the third message"
    - "Knox-challenges-Darwin direction works symmetrically"
    - "Escalation logic: after 3 unresolved rounds OR expires_at < now(), state is flipped to 'escalated' and a digest query surfaces them"
    - "Pydantic schemas validate payload shapes per intent (challenge/prove/reject/escalate)"
    - "OBS-04 replay-by-hash: SELECT FROM v_agent_reasoning_trace WHERE correlation_id = <hash_uuid> returns an ordered timeline of events+messages for replay"
  artifacts:
    - path: fee_crawler/agent_messaging/schemas.py
      provides: "Pydantic models — ChallengePayload, ProvePayload, RejectPayload, EscalatePayload; intent-specific fields validated"
    - path: fee_crawler/agent_messaging/publisher.py
      provides: "async def send_message(sender, recipient, intent, payload, correlation_id=None, parent_message_id=None) -> message_id; wraps insert_agent_message"
    - path: fee_crawler/agent_messaging/listener.py
      provides: "run_listener(agent_name, handler) with reconnect loop; uses get_session_pool(); raw asyncpg add_listener"
    - path: fee_crawler/agent_messaging/escalation.py
      provides: "async def scan_for_escalations() -> int; finds unresolved handshakes with round_number>=3 OR expires_at<now() and flips state='escalated'"
    - path: fee_crawler/tests/test_agent_messaging.py
      provides: "COMMS-01..04 + OBS-04 integration tests using session pool (includes test_replay_by_hash)"
  key_links:
    - from: "publisher.send_message"
      to: "tools_agent_infra.insert_agent_message"
      via: "gateway-routed INSERT → trigger fires NOTIFY"
      pattern: "insert_agent_message"
    - from: "listener handler"
      to: "SELECT * FROM agent_messages WHERE message_id = $1"
      via: "message_id UUID payload from NOTIFY"
      pattern: "add_listener"
    - from: "escalation.scan_for_escalations"
      to: "UPDATE agent_messages SET state='escalated' WHERE round_number >= 3 OR (expires_at IS NOT NULL AND expires_at < NOW()) AND state = 'open'"
      via: "pg_cron-driven or manual scan"
      pattern: "state = 'escalated'"
---

<objective>
Ship the inter-agent messaging runtime (COMMS-01..04):
- **Publisher** — `send_message()` wraps the existing `insert_agent_message` write-CRUD tool (already in `tools_agent_infra.py` from 62a) so every message goes through the audit gateway AND fires the AFTER INSERT trigger (from 62B-01) that calls `pg_notify('agent_msg_<recipient>', message_id::text)`.
- **Listener** — `run_listener(agent_name, handler)` opens a long-lived session-mode connection (port 5432, via 62B-02's `get_session_pool()`), registers `add_listener` on the per-recipient channel, and on each NOTIFY calls `SELECT * FROM agent_messages WHERE message_id = $1` via the transaction-mode pool, then invokes the handler. Includes reconnect loop (research §Mechanics 2).
- **Schemas** — Pydantic validators for per-intent payload shapes (D-09).
- **Escalation** — scan function flips `state='escalated'` on handshakes that hit round_number >= 3 OR expires_at < now() (D-11).

Purpose: Without this, Phase 64 (Darwin challenges) and Phase 65 (Atlas escalation routing) cannot function.

Output: New `fee_crawler/agent_messaging/` package (5 files) + 1 pytest integration file. Also touches `tools_agent_infra.py` only if we need to widen accepted intents (already accepts `challenge|prove|accept|reject|escalate|coverage_request|clarify` per migration 20260419 — should be no-op).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md
@.planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md
@fee_crawler/agent_tools/pool.py
@fee_crawler/agent_tools/tools_agent_infra.py
@supabase/migrations/20260419_agent_messages.sql
@supabase/migrations/20260508_agent_messages_notify_trigger.sql

<interfaces>
Existing `fee_crawler/agent_tools/tools_agent_infra.py`:
```python
@agent_tool(name="insert_agent_message", entity="agent_messages", crud="create")
async def insert_agent_message(
    *, agent_name, sender_agent, recipient_agent, intent, correlation_id,
    payload=None, parent_message_id=None, parent_event_id=None,
    round_number=1, expires_at=None, reasoning_prompt, reasoning_output,
) -> dict  # returns {'message_id': uuid}

@agent_tool(name="update_agent_message_intent", entity="agent_messages", crud="update")
async def update_agent_message_intent(
    *, message_id, agent_name, intent, payload=None, state=None,
    reasoning_prompt, reasoning_output,
) -> dict
```

Existing `agent_messages` schema (from 62a + 62B-01 trigger):
- `state CHECK IN ('open','answered','resolved','escalated','expired')`
- `intent CHECK IN ('challenge','prove','accept','reject','escalate','coverage_request','clarify')`
- `round_number INTEGER DEFAULT 1`
- `expires_at TIMESTAMPTZ` (nullable)
- AFTER INSERT trigger `agent_messages_notify_trigger` calls `pg_notify('agent_msg_' || recipient_agent, message_id::text)`

Research §Mechanics 2 (lines 861-928): raw asyncpg add_listener pattern with reconnect.
Research §Pitfall 4 (line 334): NOTIFY payload must be message_id only.
Research §Mechanics 10 (lines 1237-1244): exception-digest reads from agent_messages WHERE state='escalated'.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Publisher + listener + schemas</name>
  <files>fee_crawler/agent_messaging/__init__.py, fee_crawler/agent_messaging/schemas.py, fee_crawler/agent_messaging/publisher.py, fee_crawler/agent_messaging/listener.py</files>
  <read_first>
    - fee_crawler/agent_tools/tools_agent_infra.py (full 200 lines — understand `insert_agent_message` signature + return shape + `update_agent_message_intent`)
    - fee_crawler/agent_tools/pool.py (confirm get_pool + get_session_pool signatures after 62B-02)
    - supabase/migrations/20260419_agent_messages.sql (table columns + existing indexes)
    - supabase/migrations/20260508_agent_messages_notify_trigger.sql (trigger function body)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Mechanics 2 (complete listener pattern lines 864-909) + §Pitfall 4 (NOTIFY payload constraint)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md D-09..D-12 (messaging decisions)
  </read_first>
  <behavior>
    - Test 1: send_message("knox", "darwin", "challenge", {"subject_event_id": UUID, "question": "why X?"}, correlation_id) returns a message_id UUID
    - Test 2: After send_message, SELECT FROM agent_messages WHERE message_id = $1 returns a row with sender='knox', recipient='darwin', intent='challenge'
    - Test 3: Pydantic ChallengePayload rejects payload missing subject_event_id OR question
    - Test 4: Pydantic ProvePayload rejects payload missing evidence_refs (non-empty list)
    - Test 5: Listener receives NOTIFY within 3 seconds of a NOTIFY on the agent_msg_<name> channel (real Postgres; skip cleanly if no session-mode DSN)
  </behavior>
  <action>
**File 1: `fee_crawler/agent_messaging/__init__.py`**
```python
"""Phase 62b inter-agent messaging runtime (COMMS-01..04)."""
from fee_crawler.agent_messaging.publisher import send_message
from fee_crawler.agent_messaging.listener import run_listener
from fee_crawler.agent_messaging.schemas import (
    ChallengePayload, ProvePayload, AcceptPayload, RejectPayload, EscalatePayload,
    validate_payload_for_intent,
)
from fee_crawler.agent_messaging.escalation import scan_for_escalations

__all__ = [
    "send_message", "run_listener", "scan_for_escalations",
    "ChallengePayload", "ProvePayload", "AcceptPayload", "RejectPayload", "EscalatePayload",
    "validate_payload_for_intent",
]
```

**File 2: `fee_crawler/agent_messaging/schemas.py`**
```python
"""Pydantic payload schemas per intent (D-09)."""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field, field_validator


class ChallengePayload(BaseModel):
    subject_event_id: str   # UUID as string
    question: str


class ProvePayload(BaseModel):
    evidence_refs: list[dict] = Field(..., min_length=1)  # [{source_url, document_r2_key, agent_event_id, ...}]


class AcceptPayload(BaseModel):
    summary: Optional[str] = None
    fee_verified_id: Optional[int] = None  # Only on TIER-05 handshakes


class RejectPayload(BaseModel):
    reason: str
    counter_evidence_refs: list[dict] = Field(default_factory=list)


class EscalatePayload(BaseModel):
    digest_context: str
    round_number: int


_INTENT_TO_MODEL = {
    "challenge": ChallengePayload,
    "prove": ProvePayload,
    "accept": AcceptPayload,
    "reject": RejectPayload,
    "escalate": EscalatePayload,
}


def validate_payload_for_intent(intent: str, payload: dict) -> BaseModel:
    """Raise pydantic ValidationError if payload does not match intent schema."""
    model = _INTENT_TO_MODEL.get(intent)
    if model is None:
        # coverage_request / clarify left loose per CONTEXT; return passthrough
        return None
    return model.model_validate(payload or {})
```

**File 3: `fee_crawler/agent_messaging/publisher.py`**
```python
"""Publisher: wraps insert_agent_message tool so message-send is gateway-audited."""
from __future__ import annotations

import uuid
from typing import Optional

from fee_crawler.agent_messaging.schemas import validate_payload_for_intent
from fee_crawler.agent_tools.tools_agent_infra import insert_agent_message


async def send_message(
    *,
    sender: str,
    recipient: str,
    intent: str,
    payload: Optional[dict] = None,
    correlation_id: Optional[str] = None,
    parent_message_id: Optional[str] = None,
    round_number: int = 1,
    reasoning_prompt: str = "send_message",
    reasoning_output: str = "",
) -> str:
    """Send an agent message. Returns the new message_id UUID as string.

    Validates payload shape against intent schema.
    """
    validate_payload_for_intent(intent, payload or {})
    corr = correlation_id or str(uuid.uuid4())

    result = await insert_agent_message(
        agent_name=sender,
        sender_agent=sender,
        recipient_agent=recipient,
        intent=intent,
        correlation_id=corr,
        payload=payload or {},
        parent_message_id=parent_message_id,
        round_number=round_number,
        reasoning_prompt=reasoning_prompt,
        reasoning_output=reasoning_output,
    )
    # insert_agent_message returns {"message_id": str, ...} per existing tool.
    return result["message_id"]
```

If the existing tool signature in `tools_agent_infra.py` differs (e.g., different kwarg names), adjust the call accordingly — read the tool verbatim and match it.

**File 4: `fee_crawler/agent_messaging/listener.py`**

Adapt research §Mechanics 2 listener pattern — raw asyncpg on SESSION-mode connection from `get_session_pool`:

```python
"""LISTEN/NOTIFY listener on per-recipient channels (D-10).

Uses DATABASE_URL_SESSION (port 5432) via get_session_pool. Transaction-mode
pooler (port 6543) does NOT support LISTEN — research §Pitfall 2.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Awaitable, Callable, Optional

import asyncpg

from fee_crawler.agent_tools.pool import get_session_pool, get_pool

log = logging.getLogger(__name__)

MessageHandler = Callable[[dict], Awaitable[None]]   # receives full agent_messages row as dict


async def run_listener(
    agent_name: str,
    handler: MessageHandler,
    *,
    stop_event: Optional[asyncio.Event] = None,
    backoff_schedule: tuple[int, ...] = (1, 2, 4, 8),
) -> None:
    """Long-running LISTEN on agent_msg_<agent_name>.

    Reconnects on connection loss with exponential backoff. Exits on stop_event.
    """
    channel = f"agent_msg_{agent_name}"
    queue: asyncio.Queue[str] = asyncio.Queue()

    async def _cb(conn, pid, ch, payload):
        try:
            await queue.put(payload)
        except Exception:
            log.exception("queue put failed")

    backoff_idx = 0
    stop_event = stop_event or asyncio.Event()

    while not stop_event.is_set():
        try:
            session_pool = await get_session_pool()
            async with session_pool.acquire() as conn:
                await conn.add_listener(channel, _cb)
                log.info("agent_messaging listener active on %s", channel)
                backoff_idx = 0  # reset backoff after successful connect
                try:
                    while not stop_event.is_set():
                        try:
                            payload = await asyncio.wait_for(queue.get(), timeout=30)
                        except asyncio.TimeoutError:
                            # Keepalive probe
                            try:
                                await conn.fetchval("SELECT 1", timeout=5)
                            except Exception:
                                log.warning("listener keepalive failed on %s; reconnecting", channel)
                                break
                            continue
                        # Fetch full row via the regular (transaction-mode) pool.
                        await _dispatch(payload, handler)
                finally:
                    try:
                        await conn.remove_listener(channel, _cb)
                    except Exception:
                        pass
        except Exception:
            wait_for = backoff_schedule[min(backoff_idx, len(backoff_schedule) - 1)]
            backoff_idx += 1
            log.exception("listener on %s failed; reconnecting in %ss", channel, wait_for)
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=wait_for)
            except asyncio.TimeoutError:
                pass


async def _dispatch(message_id: str, handler: MessageHandler) -> None:
    """Fetch full agent_messages row and hand to handler."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM agent_messages WHERE message_id = $1::UUID",
            message_id,
        )
    if row is None:
        log.warning("listener got message_id %s but no row found", message_id)
        return
    try:
        await handler(dict(row))
    except Exception:
        log.exception("handler failed for message_id=%s", message_id)
```
  </action>
  <verify>
    <automated>python -c "from fee_crawler.agent_messaging import send_message, run_listener, ChallengePayload, ProvePayload, validate_payload_for_intent; print('import OK')"</automated>
  </verify>
  <acceptance_criteria>
    - Files `fee_crawler/agent_messaging/{__init__,schemas,publisher,listener}.py` all exist
    - `python -c "from fee_crawler.agent_messaging import send_message, run_listener"` exits 0
    - `grep -n "get_session_pool" fee_crawler/agent_messaging/listener.py` returns at least 1 match
    - `grep -n "add_listener\|remove_listener" fee_crawler/agent_messaging/listener.py` returns at least 2 matches
    - `grep -n "DATABASE_URL_SESSION\|session_pool" fee_crawler/agent_messaging/listener.py` returns at least 1 match (ensure NOT using transaction pool for LISTEN)
    - Pydantic models `ChallengePayload`, `ProvePayload`, `AcceptPayload`, `RejectPayload`, `EscalatePayload` defined in schemas.py
  </acceptance_criteria>
  <done>Publisher + listener + schemas implemented; import-clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Escalation scan + full integration tests (COMMS-01..04 end-to-end)</name>
  <files>fee_crawler/agent_messaging/escalation.py, fee_crawler/tests/test_agent_messaging.py</files>
  <read_first>
    - fee_crawler/agent_messaging/publisher.py + listener.py (files just created)
    - supabase/migrations/20260419_agent_messages.sql (state column CHECK values)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md D-11 (3 rounds OR 24h)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-VALIDATION.md lines 48-52 (expected test names)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Mechanics 10 (digest reads escalated rows)
    - fee_crawler/tests/conftest.py (db_schema fixture + DATABASE_URL_SESSION_TEST handling)
  </read_first>
  <behavior>
    - test_listen_notify_roundtrip: insert an agent_messages row; listener receives message_id within 5s (requires DATABASE_URL_SESSION_TEST; skip otherwise)
    - test_darwin_knox_handshake: Darwin sends challenge → Knox sends prove → Darwin sends accept; all 3 rows share correlation_id; after final accept, state='resolved' on the triggering rows (via update_agent_message_intent)
    - test_knox_darwin_handshake: reverse direction — Knox sends challenge → Darwin sends prove → Knox sends accept
    - test_escalation_three_rounds: 3 unresolved rounds (round_number=3 + state='open') → scan_for_escalations flips state='escalated'; row visible by SELECT WHERE state='escalated'
    - test_escalation_time_based: row with round_number=1 but expires_at<NOW() and state='open' → scan also escalates
    - test_payload_validation_challenge: send_message with intent='challenge' and empty payload raises pydantic ValidationError (before DB write)
    - test_replay_by_hash (OBS-04): given an existing correlation_id with an event + a message, SELECT FROM v_agent_reasoning_trace WHERE correlation_id = $1 returns >= 2 ordered rows (kind, created_at, agent_name) sufficient to render a replay timeline
  </behavior>
  <action>
**File 1: `fee_crawler/agent_messaging/escalation.py`**

```python
"""Escalation scanner (COMMS-04 + D-11).

Flips state='escalated' on agent_messages threads that hit:
  - round_number >= 3 AND state='open'  (fast-looping adversarial exhaustion)
  - expires_at < now() AND state='open' (silent stall)

Runs on pg_cron daily (registered in migration 20260509 or 62B-09) OR on demand
from /admin/agents Messages tab.
"""
from __future__ import annotations

import logging
from typing import Optional

from fee_crawler.agent_tools.pool import get_pool

log = logging.getLogger(__name__)

ESCALATE_QUERY = """
    UPDATE agent_messages
       SET state = 'escalated'
     WHERE state = 'open'
       AND (
         round_number >= 3
         OR (expires_at IS NOT NULL AND expires_at < NOW())
       )
    RETURNING message_id
"""


async def scan_for_escalations() -> int:
    """Flip unresolved handshakes to escalated. Returns count of rows escalated."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(ESCALATE_QUERY)
    if rows:
        log.info("Escalated %d agent_messages threads", len(rows))
    return len(rows)


async def list_escalated_threads(*, since_hours: int = 24) -> list[dict]:
    """Return escalated handshakes for digest rendering."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT message_id, correlation_id, sender_agent, recipient_agent, intent,
                      round_number, payload, created_at
                 FROM agent_messages
                WHERE state = 'escalated'
                  AND created_at > NOW() - make_interval(hours => $1)
                ORDER BY created_at DESC""",
            since_hours,
        )
    return [dict(r) for r in rows]
```

**File 2: `fee_crawler/tests/test_agent_messaging.py`**

```python
"""COMMS-01..04 integration tests. Uses db_schema fixture + optional session pool."""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from fee_crawler.agent_messaging import send_message, run_listener, scan_for_escalations
from fee_crawler.agent_messaging.schemas import validate_payload_for_intent
from fee_crawler.agent_tools.tools_agent_infra import update_agent_message_intent


def _session_skip():
    if not (os.environ.get("DATABASE_URL_SESSION") or os.environ.get("DATABASE_URL_SESSION_TEST")):
        pytest.skip("DATABASE_URL_SESSION[_TEST] required for LISTEN/NOTIFY integration")


@pytest.mark.asyncio
async def test_payload_validation_challenge(db_schema):
    with pytest.raises(Exception):
        validate_payload_for_intent("challenge", {})  # missing subject_event_id + question


@pytest.mark.asyncio
async def test_send_message_inserts_and_returns_id(db_schema):
    schema, pool = db_schema
    corr = str(uuid.uuid4())
    ev = str(uuid.uuid4())
    msg_id = await send_message(
        sender="darwin", recipient="knox", intent="challenge",
        payload={"subject_event_id": ev, "question": "why X?"},
        correlation_id=corr,
    )
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT sender_agent, recipient_agent, intent FROM agent_messages WHERE message_id=$1::UUID",
            msg_id,
        )
    assert row["sender_agent"] == "darwin"
    assert row["recipient_agent"] == "knox"
    assert row["intent"] == "challenge"


@pytest.mark.asyncio
async def test_darwin_knox_handshake(db_schema):
    schema, pool = db_schema
    corr = str(uuid.uuid4())
    ev = str(uuid.uuid4())
    # Darwin challenges Knox
    m1 = await send_message(sender="darwin", recipient="knox", intent="challenge",
                             payload={"subject_event_id": ev, "question": "prove X"},
                             correlation_id=corr)
    # Knox proves
    m2 = await send_message(sender="knox", recipient="darwin", intent="prove",
                             payload={"evidence_refs": [{"source_url": "https://x", "agent_event_id": ev}]},
                             correlation_id=corr, parent_message_id=m1, round_number=2)
    # Darwin accepts
    m3 = await send_message(sender="darwin", recipient="knox", intent="accept",
                             payload={"summary": "good proof"},
                             correlation_id=corr, parent_message_id=m2, round_number=3)
    # Resolve m1 + m2 in response to the accept (update their state to 'resolved').
    await update_agent_message_intent(
        message_id=m1, agent_name="darwin", intent="accept", state="resolved",
        reasoning_prompt="resolve", reasoning_output="m1 resolved",
    )
    await update_agent_message_intent(
        message_id=m2, agent_name="darwin", intent="prove", state="resolved",
        reasoning_prompt="resolve", reasoning_output="m2 resolved",
    )
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT state FROM agent_messages WHERE correlation_id=$1::UUID ORDER BY created_at",
            corr,
        )
    states = [r["state"] for r in rows]
    assert states.count("resolved") >= 2


@pytest.mark.asyncio
async def test_knox_darwin_handshake(db_schema):
    schema, pool = db_schema
    corr = str(uuid.uuid4())
    ev = str(uuid.uuid4())
    await send_message(sender="knox", recipient="darwin", intent="challenge",
                        payload={"subject_event_id": ev, "question": "why reject?"},
                        correlation_id=corr)
    await send_message(sender="darwin", recipient="knox", intent="prove",
                        payload={"evidence_refs": [{"rule_id": "R-42"}]},
                        correlation_id=corr, round_number=2)
    await send_message(sender="knox", recipient="darwin", intent="accept",
                        payload={"summary": "ok"},
                        correlation_id=corr, round_number=3)
    async with pool.acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM agent_messages WHERE correlation_id=$1::UUID",
            corr,
        )
    assert count == 3


@pytest.mark.asyncio
async def test_escalation_three_rounds(db_schema):
    schema, pool = db_schema
    corr = str(uuid.uuid4())
    ev = str(uuid.uuid4())
    # Three rounds, all open
    await send_message(sender="darwin", recipient="knox", intent="challenge",
                        payload={"subject_event_id": ev, "question": "q1"},
                        correlation_id=corr, round_number=1)
    await send_message(sender="knox", recipient="darwin", intent="prove",
                        payload={"evidence_refs": [{"x": 1}]},
                        correlation_id=corr, round_number=2)
    await send_message(sender="darwin", recipient="knox", intent="reject",
                        payload={"reason": "insufficient"},
                        correlation_id=corr, round_number=3)
    n = await scan_for_escalations()
    assert n >= 1
    async with pool.acquire() as conn:
        escalated_states = await conn.fetch(
            "SELECT state FROM agent_messages WHERE correlation_id=$1::UUID AND round_number=3",
            corr,
        )
    assert any(r["state"] == "escalated" for r in escalated_states)


@pytest.mark.asyncio
async def test_escalation_time_based(db_schema):
    schema, pool = db_schema
    corr = str(uuid.uuid4())
    # Manually insert a row past expires_at, round_number=1
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_messages
                 (sender_agent, recipient_agent, intent, correlation_id, payload,
                  round_number, expires_at, state)
               VALUES ('darwin','knox','challenge',$1::UUID,'{}'::JSONB,1,
                       NOW() - INTERVAL '1 hour','open')""",
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


@pytest.mark.asyncio
async def test_listen_notify_roundtrip(db_schema):
    _session_skip()
    agent = f"ephemeral_{uuid.uuid4().hex[:6]}"  # won't collide with seeded agents
    # Register the ephemeral agent in agent_registry so FK passes
    schema, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO agent_registry (agent_name, display_name, role) VALUES ($1, $1, 'test')",
            agent,
        )
    received = asyncio.Event()
    captured: dict = {}
    async def handler(row):
        captured["row"] = row
        received.set()
    stop = asyncio.Event()
    task = asyncio.create_task(run_listener(agent, handler, stop_event=stop))
    # Give listener a moment to register
    await asyncio.sleep(1)
    try:
        corr = str(uuid.uuid4())
        ev = str(uuid.uuid4())
        msg_id = await send_message(
            sender="darwin", recipient=agent, intent="challenge",
            payload={"subject_event_id": ev, "question": "ping"},
            correlation_id=corr,
        )
        await asyncio.wait_for(received.wait(), timeout=10)
        assert str(captured["row"]["message_id"]) == msg_id
    finally:
        stop.set()
        await asyncio.wait_for(task, timeout=10)


@pytest.mark.asyncio
async def test_replay_by_hash(db_schema):
    """OBS-04: replay-by-hash. The reasoning-trace view returns an ordered timeline
    of events + messages for a given correlation_id.

    Seeds one agent_events row + one agent_messages row sharing the same correlation,
    then asserts v_agent_reasoning_trace returns >= 2 rows in created_at order with
    the kind discriminator populated.
    """
    schema, pool = db_schema
    corr = str(uuid.uuid4())
    ev = str(uuid.uuid4())
    async with pool.acquire() as conn:
        # Seed an agent_events row first (earlier timestamp)
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status,
                  correlation_id, input_payload, created_at)
               VALUES ('darwin','review','_agent_base','_review','success',
                       $1::UUID, '{"note":"seed event"}'::JSONB,
                       NOW() - INTERVAL '10 seconds')""",
            corr,
        )
    # Seed a messaging row (later timestamp)
    await send_message(
        sender="darwin", recipient="knox", intent="challenge",
        payload={"subject_event_id": ev, "question": "replay?"},
        correlation_id=corr,
    )
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT kind, created_at, agent_name, intent_or_action, tool_name, entity
                 FROM v_agent_reasoning_trace
                WHERE correlation_id = $1::UUID
                ORDER BY created_at""",
            corr,
        )
    assert len(rows) >= 2, f"expected >=2 trace rows, got {len(rows)}"
    kinds = {r["kind"] for r in rows}
    assert "event" in kinds and "message" in kinds
    # Ordering check: first row is the event (earlier timestamp)
    assert rows[0]["kind"] == "event"
```

NOTE: `test_listen_notify_roundtrip` registers an ephemeral agent in `agent_registry` to satisfy the FK on `agent_messages.recipient_agent` — but only if the FK exists. If it doesn't, the INSERT in agent_registry is still harmless. The test must skip cleanly when `DATABASE_URL_SESSION_TEST` is unset (via `_session_skip()` helper).
  </action>
  <verify>
    <automated>pytest fee_crawler/tests/test_agent_messaging.py -x -v --timeout=60</automated>
  </verify>
  <acceptance_criteria>
    - File `fee_crawler/agent_messaging/escalation.py` exists with `async def scan_for_escalations` and `async def list_escalated_threads`
    - `grep -n "state = 'escalated'\|state='escalated'" fee_crawler/agent_messaging/escalation.py` returns at least 2 matches
    - `grep -n "round_number >= 3\|round_number>=3" fee_crawler/agent_messaging/escalation.py` returns at least 1 match
    - `grep -n "expires_at < NOW\|expires_at<NOW" fee_crawler/agent_messaging/escalation.py` returns at least 1 match (time-based branch)
    - `pytest fee_crawler/tests/test_agent_messaging.py -x -v` exits 0 (test_listen_notify_roundtrip may skip cleanly when DATABASE_URL_SESSION_TEST not set in local dev)
    - `pytest fee_crawler/tests/test_agent_messaging.py::test_darwin_knox_handshake fee_crawler/tests/test_agent_messaging.py::test_escalation_three_rounds fee_crawler/tests/test_agent_messaging.py::test_replay_by_hash -x -v` exits 0 (all three must pass against docker Postgres; test_replay_by_hash covers OBS-04 replay-by-hash)
    - CI staging strictness: in CI the quick-suite MUST FAIL (not skip) when `DATABASE_URL_SESSION_TEST` is unset. Set this DSN in CI env (see runbook + 62B-02 Task 2) so `_session_skip()` never triggers in CI.
  </acceptance_criteria>
  <done>Escalation scanner works + 7 integration tests pass including OBS-04 test_replay_by_hash (LISTEN/NOTIFY test runs when session DSN available).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| agent process → agent_messages INSERT | routes through existing 62a gateway — agent identity validated |
| NOTIFY payload → listener | 36-byte UUID only; listener does secondary SELECT for full row |
| escalation scan → UPDATE state | service-role SQL; no user input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-62B-05-01 | Spoofing | Malicious agent sends messages pretending to be another | mitigate | `send_message(sender=...)` flows through `insert_agent_message` gateway tool which sets `sender_agent` from the gateway's `agent_name` header; `sender` kwarg is a hint but not user-settable in production agent code. SEC-04 (Phase 68) hardens to JWT. |
| T-62B-05-02 | Repudiation | NOTIFY payload truncation (>8000 bytes) | mitigate | Trigger function (20260508) sends only message_id UUID (36 bytes). Research §Pitfall 4 + existing test `test_agent_messages_notify_trigger_exists` confirms. |
| T-62B-05-03 | Repudiation | Missed messages when listener disconnects | mitigate | asyncpg.add_listener + reconnect loop with backoff [1,2,4,8]; keepalive SELECT every 30s detects dead TCP. On reconnect, listener can optionally `SELECT * FROM agent_messages WHERE recipient_agent=$1 AND state='open' AND created_at > <last_seen>` to drain missed messages (exposed but not required this phase — documented for Phase 65 Atlas). |
| T-62B-05-04 | Input Validation | Malformed payload crashes listener | mitigate | Pydantic validators on `validate_payload_for_intent` reject bad shapes at send time. Listener handler receives already-validated row from DB; handler errors are caught + logged (`log.exception`). |
| T-62B-05-05 | Denial of Service | Runaway re-escalation loop | mitigate | `scan_for_escalations` only flips `state='open' → 'escalated'`; once escalated, subsequent scans skip (WHERE state='open'). Idempotent. |
</threat_model>

<verification>
- Publisher + listener + escalation import cleanly
- All 6+ integration tests pass (LISTEN/NOTIFY test skips gracefully without session DSN)
- Pydantic validators catch malformed payloads before DB write
</verification>

<success_criteria>
- [ ] `fee_crawler/agent_messaging/` package with 5 modules
- [ ] Listener uses get_session_pool (port 5432, NOT 6543)
- [ ] Darwin↔Knox handshake tests pass (both directions)
- [ ] Escalation flips round_number≥3 OR expired rows
- [ ] LISTEN/NOTIFY roundtrip test passes when session DSN set
</success_criteria>

<output>
After completion, create `.planning/phases/62B-agent-foundation-runtime-layer/62B-05-SUMMARY.md` documenting the publisher/listener handoff, the reconnect backoff schedule, and any deviation from research §Mechanics 2 (e.g., did asyncpg-listen wrapper get adopted or raw pattern suffice?).
</output>
