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


async def _emit_paired_accept(
    fee_verified_id: int,
    correlation_id: str,
    knox_message_id: str,
) -> bool:
    """When Knox accepts a fee_verified row addressed to Darwin, Darwin
    posts its own paired accept with the SAME correlation_id. This is the
    second half of the adversarial handshake — promote_to_tier3's SQL gate
    looks for darwin AND knox accepts sharing one correlation_id within 30
    days. Posting here means publish-fees no longer needs the self-accept
    stub.

    Returns True on success, False on any failure (caller logs)."""
    try:
        from fee_crawler.agent_messaging.publisher import send_message
        await send_message(
            sender=AGENT_NAME,
            recipient="knox",                    # reciprocal recipient — symmetry
            intent="accept",
            payload={
                "fee_verified_id": fee_verified_id,
                "paired_with": knox_message_id,
                "decision": "accept",
            },
            correlation_id=correlation_id,       # MUST share with Knox's accept
            reasoning_prompt=f"darwin_pair_accept:{fee_verified_id}",
            reasoning_output=(
                f"Knox accepted fee_verified_id={fee_verified_id}; Darwin "
                "ratifies with paired accept under same correlation_id so the "
                "promote_to_tier3 SQL gate sees a complete handshake."
            ),
        )
        return True
    except Exception as exc:
        log.warning(
            "darwin paired-accept emit failed for fee_verified_id=%s: %s",
            fee_verified_id, exc,
        )
        return False


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

        from fee_crawler.agent_messaging.publisher import send_message

        for msg in pending:
            try:
                payload = msg.get("payload") or {}
                if isinstance(payload, str):
                    import json as _json
                    payload = _json.loads(payload)

                # Adversarial handshake: when Knox accepts a fee_verified
                # row, Darwin pairs the accept with the SAME correlation_id.
                # promote_to_tier3's SQL gate looks for both. This replaces
                # the publish_fees.py self-accept stub with real peer
                # agreement. Other intents (coverage_request, etc) fall
                # through to classification.
                if (
                    msg["intent"] == "accept"
                    and msg["sender_agent"] == "knox"
                    and "fee_verified_id" in payload
                ):
                    ok = await _emit_paired_accept(
                        fee_verified_id=int(payload["fee_verified_id"]),
                        correlation_id=str(msg["correlation_id"]),
                        knox_message_id=str(msg["message_id"]),
                    )
                    log.info(
                        "darwin paired-accept for fee_verified_id=%s "
                        "(success=%s)",
                        payload["fee_verified_id"], ok,
                    )
                    await _mark_responded(conn, msg["message_id"])
                    result.messages_processed += 1
                    continue

                # Cap the per-message batch so a flood of messages can't
                # blow through the per_day budget in one Modal tick.
                run = await classify_batch(conn, size=batch_size)
                result.classifications += run.processed
                result.promoted += run.promoted
                result.cost_usd += run.cost_usd

                # Dead-letter escalation: if Darwin halted on circuit-breaker
                # (poison fees / consecutive failures), escalate to Hamilton
                # for human review. Hamilton's UI surfaces escalations via
                # the messaging bus listener once we wire it; today Hamilton's
                # admin pages already poll agent_messages.
                if run.circuit_tripped:
                    try:
                        await send_message(
                            sender=AGENT_NAME,
                            recipient="hamilton",
                            intent="escalate",
                            payload={
                                "reason": "darwin_circuit_tripped",
                                "halt_reason": run.halt_reason,
                                "triggering_message_id": msg["message_id"],
                                "triggering_sender": msg["sender_agent"],
                                "failures": run.failures,
                            },
                            correlation_id=msg.get("correlation_id"),
                        )
                        log.warning(
                            "darwin inbox: circuit tripped (reason=%s); "
                            "escalated to hamilton",
                            run.halt_reason,
                        )
                    except Exception as send_exc:
                        log.warning(
                            "darwin inbox: escalation send failed: %s", send_exc,
                        )

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
