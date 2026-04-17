"""Escalation scanner (COMMS-04 + D-11).

Task 2 fills in the scanner + digest helper. This file exists now so the
package __init__ imports cleanly during Task 1 GREEN.
"""

from __future__ import annotations

import logging

from fee_crawler.agent_tools.pool import get_pool

log = logging.getLogger(__name__)


# Placeholder — real implementation lands in Task 2.
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
    """Placeholder — flips unresolved handshakes to escalated. Task 2 hardens."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(ESCALATE_QUERY)
    return len(rows)


async def list_escalated_threads(*, since_hours: int = 24) -> list[dict]:
    """Placeholder — returns escalated threads for digest. Task 2 hardens."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT message_id, correlation_id, sender_agent, recipient_agent,
                      intent, round_number, payload, created_at
                 FROM agent_messages
                WHERE state = 'escalated'
                  AND created_at > NOW() - make_interval(hours => $1)
                ORDER BY created_at DESC""",
            since_hours,
        )
    return [dict(r) for r in rows]
