"""Darwin's inbox drain — consumes agent_messages addressed to darwin.

Wires the messaging bus on the consumer side. Was previously dark:
agent_messages writes accumulated with no reader. Now the per-minute
Modal dispatcher (run_post_processing) calls drain_darwin_inbox(),
which picks up pending messages and triggers focused classify_batch
runs for the institutions they reference.

Message contract (intent = "coverage_request"):
  payload = {
    "reason": "new_fees_raw",          # free-form tag
    "institution_ids": [123, 456],     # optional; if set, narrows the
                                       # classify_batch to those rows.
                                       # If absent, drain triggers a
                                       # plain classify_batch(size=N).
    "fee_count": 42,                   # informational only
  }

Idempotent via the `responded_at` column on agent_messages — once a
message has been processed, future drains skip it.
"""

from __future__ import annotations

import logging
import os
from dataclasses import asdict, dataclass

import asyncpg

from fee_crawler.agents.darwin.orchestrator import AGENT_NAME, classify_batch

log = logging.getLogger(__name__)

_DEFAULT_BATCH = 100


@dataclass
class InboxDrainResult:
    messages_seen: int = 0
    messages_processed: int = 0
    classifications: int = 0
    promoted: int = 0
    cost_usd: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


async def _fetch_pending(conn: asyncpg.Connection, limit: int) -> list[dict]:
    """Pending = received by darwin, no response yet, not expired."""
    rows = await conn.fetch(
        """
        SELECT message_id, sender_agent, intent, payload, correlation_id,
               created_at
          FROM agent_messages
         WHERE recipient_agent = $1
           AND responded_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at ASC
         LIMIT $2
        """,
        AGENT_NAME, limit,
    )
    return [dict(r) for r in rows]


async def _mark_responded(conn: asyncpg.Connection, message_id: str) -> None:
    """Idempotent: subsequent drains skip this row."""
    await conn.execute(
        "UPDATE agent_messages SET responded_at = NOW() WHERE message_id = $1::UUID",
        message_id,
    )


async def drain_darwin_inbox(
    *,
    max_messages: int = 10,
    batch_size: int = _DEFAULT_BATCH,
) -> InboxDrainResult:
    """Process up to `max_messages` pending messages for darwin.

    For each message: run a focused classify_batch (capped at batch_size
    fees_raw rows). Errors on a single message don't poison the drain —
    they're logged + marked responded so we don't replay them forever.
    """
    result = InboxDrainResult()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL required for darwin inbox drain")

    conn = await asyncpg.connect(db_url)
    try:
        pending = await _fetch_pending(conn, max_messages)
        result.messages_seen = len(pending)
        if not pending:
            return result

        for msg in pending:
            try:
                payload = msg.get("payload") or {}
                if isinstance(payload, str):
                    import json as _json
                    payload = _json.loads(payload)

                # Cap the per-message batch so a flood of messages can't
                # blow through the per_day budget in one Modal tick.
                run = await classify_batch(conn, size=batch_size)
                result.classifications += run.processed
                result.promoted += run.promoted
                result.cost_usd += run.cost_usd

                log.info(
                    "darwin inbox: processed message %s from %s (intent=%s, "
                    "processed=%d, promoted=%d, cost=$%.4f)",
                    msg["message_id"], msg["sender_agent"], msg["intent"],
                    run.processed, run.promoted, run.cost_usd,
                )

            except Exception as exc:
                log.exception(
                    "darwin inbox: message %s failed (will mark responded): %s",
                    msg.get("message_id"), exc,
                )

            await _mark_responded(conn, msg["message_id"])
            result.messages_processed += 1

        return result
    finally:
        await conn.close()
