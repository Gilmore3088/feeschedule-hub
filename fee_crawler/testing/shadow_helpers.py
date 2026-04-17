"""Shadow-mode context + diff-report helpers (D-21).

Shadow mode is a parallel-implementation safety net: an agent runs end-to-end
inside a ``shadow_run_context`` block, every gateway-wrapped tool call emits
an agent_events row flagged ``is_shadow=true`` with ``status='shadow_diff'``,
and business-table writes are routed to ``shadow_outputs`` instead of the
real target table. Operators compare shadow output vs. production for a bake
period before flipping the agent live.

These helpers do not own the gateway suppression logic — that lives in
``fee_crawler/agent_tools/gateway.py`` (see ``is_shadow_active``). This
module only provides the public API surface tests and agent code use:

  - ``make_shadow_run_id()``       — fresh UUID string.
  - ``shadow_run_context(...)``    — contextmanager that sets shadow_run_id.
  - ``shadow_diff_report(run_id)`` — groups shadow_outputs rows by entity.
"""

from __future__ import annotations

import contextlib
import uuid
from typing import Optional

from fee_crawler.agent_tools.context import with_agent_context
from fee_crawler.agent_tools.pool import get_pool


def make_shadow_run_id() -> str:
    """Return a fresh UUID string for a new shadow run."""
    return str(uuid.uuid4())


@contextlib.contextmanager
def shadow_run_context(
    *,
    agent_name: str,
    shadow_run_id: Optional[str] = None,
):
    """Enter ``with_agent_context()`` with ``shadow_run_id`` set.

    Yields the shadow_run_id string so callers can later query
    ``shadow_diff_report(run_id)``.

    Inside this block, every ``with_agent_tool()`` call writes
    ``is_shadow=true`` + ``status='shadow_diff'`` on agent_events, and the
    business-table writes MUST be routed by the caller to ``shadow_outputs``
    (the gateway enforces the event-row flagging; per-tool code handles
    the write redirection — see research §Mechanics 5).
    """
    rid = shadow_run_id or make_shadow_run_id()
    with with_agent_context(agent_name=agent_name, shadow_run_id=rid):
        yield rid


async def shadow_diff_report(shadow_run_id: str) -> dict:
    """Return ``{entity: [payload_diff rows]}`` for a shadow run.

    Helper for human review: reads all shadow_outputs rows tagged with this
    shadow_run_id, groups by entity, preserves chronological order. Returns
    an empty dict if no rows found.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT entity, payload_diff, created_at, agent_event_id "
            "FROM shadow_outputs "
            "WHERE shadow_run_id = $1::UUID "
            "ORDER BY created_at",
            shadow_run_id,
        )
    grouped: dict = {}
    for r in rows:
        grouped.setdefault(r["entity"], []).append(
            {
                "payload_diff": r["payload_diff"],
                "created_at": r["created_at"].isoformat()
                if r["created_at"]
                else None,
                "agent_event_id": str(r["agent_event_id"])
                if r["agent_event_id"]
                else None,
            }
        )
    return grouped


__all__ = ["make_shadow_run_id", "shadow_run_context", "shadow_diff_report"]
