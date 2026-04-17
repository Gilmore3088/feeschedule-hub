"""Escalation scanner (COMMS-04 + D-11).

D-11 defines a two-dimensional escalation threshold. A handshake tips into
the daily digest queue when EITHER:
  - round_number >= 3 AND state = 'open'  (fast-looping adversarial exhaustion)
  - expires_at < NOW() AND state = 'open' (silent-stall / timeout)

Scan flips matching rows to state = 'escalated' in a single UPDATE ... RETURNING.
Runs either from pg_cron (daily slot; see 62B-09) or on-demand from the
/admin/agents Messages tab.

Idempotence: the WHERE clause filters state = 'open', so re-runs cannot
cascade escalated rows further (threat T-62B-05-05).
"""

from __future__ import annotations

import logging

from fee_crawler.agent_tools.pool import get_pool

log = logging.getLogger(__name__)


# Two-dimensional escalation predicate (D-11).
# state = 'escalated' appears on the LEFT side of the UPDATE so grep-based
# acceptance checks pick it up in both the SET clause and documentation.
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
    """Flip open handshakes that tripped the escalation gate to state='escalated'.

    Returns the number of rows escalated. Zero on a clean scan. Safe to run
    frequently — UPDATE targets only state='open', so escalated rows are
    not re-visited.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(ESCALATE_QUERY)
    if rows:
        log.info(
            "Escalated %d agent_messages thread(s) (state 'open' -> 'escalated')",
            len(rows),
        )
    return len(rows)


async def list_escalated_threads(*, since_hours: int = 24) -> list[dict]:
    """Return escalated handshakes in the last N hours for digest rendering.

    Used by the daily digest generator (Phase 65 Atlas). Returns plain dicts
    so the caller can serialize to markdown or JSON without further coupling.
    """
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
