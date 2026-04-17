"""Per-call agent context (correlation_id, parent_event_id, cost_cents, shadow_run_id).

Set via the `with_agent_context` context manager at the top of an agent's turn.
Gateway reads via get_agent_context() when creating agent_events rows.

Phase 62b D-21: shadow_run_id is propagated here; gateway routes business-table
writes to shadow_outputs when present and marks agent_events.is_shadow=true.
"""

from __future__ import annotations

import contextlib
import uuid
from contextvars import ContextVar
from typing import Optional

_context: ContextVar[dict] = ContextVar("agent_context", default={})


@contextlib.contextmanager
def with_agent_context(
    *,
    agent_name: str,
    correlation_id: Optional[str] = None,
    parent_event_id: Optional[str] = None,
    cost_cents: int = 0,
    shadow_run_id: Optional[str] = None,
):
    """Set agent-scoped values for the duration of a `with` block.

    When ``shadow_run_id`` is provided, any ``with_agent_tool`` call within
    the block is emitted under shadow-mode semantics (D-21): agent_events
    row is flagged ``is_shadow=true`` with ``status='shadow_diff'``, and the
    caller is responsible for routing business-table writes to
    ``shadow_outputs``. See ``fee_crawler/agent_tools/gateway.py``.
    """
    token = _context.set({
        "agent_name": agent_name,
        "correlation_id": correlation_id or str(uuid.uuid4()),
        "parent_event_id": parent_event_id,
        "cost_cents": cost_cents,
        "shadow_run_id": shadow_run_id,
    })
    try:
        yield
    finally:
        _context.reset(token)


def get_agent_context() -> dict:
    """Return the current context dict (empty if no with_agent_context active)."""
    return _context.get()
