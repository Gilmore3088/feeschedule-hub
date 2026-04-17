"""LISTEN/NOTIFY listener on per-recipient channel (D-10 + COMMS-01).

Phase 62b D-10: each agent LISTENs on its own channel `agent_msg_<name>`. The
AFTER INSERT trigger on agent_messages (migration 20260508) pg_notify()s the
recipient's channel with the new message_id (UUID, 36 bytes — research
§Pitfall 4 explains why payload MUST be a pointer, not the full row).

Connection requirements:
  - Uses DATABASE_URL_SESSION (port 5432) via get_session_pool(). Supavisor
    transaction-mode pooler on port 6543 multiplexes connections between
    transactions, so add_listener registrations do not survive (research
    §Mechanics 2, §Pitfall 2).
  - Full row lookup goes through the transaction-mode pool via get_pool() —
    keeps the session connection free to receive further notifications.

Reconnect semantics:
  - Backoff schedule (1, 2, 4, 8) seconds after the last successful connect.
  - 30s keepalive probe (SELECT 1) to detect dead TCP early.
  - Handler errors are logged (not raised) — one bad message must not kill the
    listener loop.

Shutdown:
  - Pass an asyncio.Event to stop_event; the loop exits on set().
"""

from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable, Optional

from fee_crawler.agent_tools.pool import get_pool, get_session_pool

log = logging.getLogger(__name__)


# Handler signature: async def on_message(row: dict) -> None
MessageHandler = Callable[[dict], Awaitable[None]]


async def run_listener(
    agent_name: str,
    handler: MessageHandler,
    *,
    stop_event: Optional[asyncio.Event] = None,
    backoff_schedule: tuple[int, ...] = (1, 2, 4, 8),
    keepalive_seconds: float = 30.0,
) -> None:
    """Long-running LISTEN on agent_msg_<agent_name>.

    Args:
      agent_name: recipient identity; LISTEN channel is f'agent_msg_{agent_name}'.
      handler: async callable invoked with the full agent_messages row dict.
      stop_event: optional; set() to terminate the loop cleanly.
      backoff_schedule: seconds to wait after consecutive connection failures.
      keepalive_seconds: keepalive probe interval; detect dead TCP early.
    """
    channel = f"agent_msg_{agent_name}"
    stop = stop_event or asyncio.Event()
    queue: asyncio.Queue[str] = asyncio.Queue()

    async def _on_notify(_conn, _pid, _ch, payload: str) -> None:
        # The add_listener callback runs in asyncpg's protocol loop; we must
        # not do heavy work here. Hand off to the consumer task via queue.
        try:
            await queue.put(payload)
        except Exception:
            log.exception("listener queue put failed on %s", channel)

    backoff_idx = 0

    while not stop.is_set():
        try:
            session_pool = await get_session_pool()
            async with session_pool.acquire() as conn:
                await conn.add_listener(channel, _on_notify)
                log.info("agent_messaging listener active on %s", channel)
                # Reset backoff on a successful connect.
                backoff_idx = 0

                try:
                    while not stop.is_set():
                        try:
                            payload = await asyncio.wait_for(
                                queue.get(), timeout=keepalive_seconds
                            )
                        except asyncio.TimeoutError:
                            # Keepalive probe — detects dead TCP before
                            # add_listener silently stops delivering.
                            try:
                                await conn.fetchval("SELECT 1", timeout=5)
                            except Exception:
                                log.warning(
                                    "listener keepalive failed on %s; reconnecting",
                                    channel,
                                )
                                break
                            continue
                        # Full-row dispatch happens on the transaction-mode
                        # pool so the session connection stays free.
                        await _dispatch_message(payload, handler)
                finally:
                    try:
                        await conn.remove_listener(channel, _on_notify)
                    except Exception:
                        # Best effort — connection may already be dead.
                        pass
        except Exception:
            wait_for = backoff_schedule[min(backoff_idx, len(backoff_schedule) - 1)]
            backoff_idx += 1
            log.exception(
                "listener on %s errored; reconnecting in %ss", channel, wait_for
            )
            try:
                await asyncio.wait_for(stop.wait(), timeout=wait_for)
            except asyncio.TimeoutError:
                pass


async def _dispatch_message(message_id: str, handler: MessageHandler) -> None:
    """Fetch the full agent_messages row and hand it to the user's handler.

    Handler errors are logged but do not propagate — one bad handler call must
    not kill the listener loop.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM agent_messages WHERE message_id = $1::UUID",
            message_id,
        )
    if row is None:
        log.warning(
            "listener received message_id=%s but no agent_messages row found",
            message_id,
        )
        return
    try:
        await handler(dict(row))
    except Exception:
        log.exception("agent_messaging handler raised for message_id=%s", message_id)
