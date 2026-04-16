"""Per-call agent context (correlation_id, parent_event_id, cost_cents).

Set via the `with_agent_context` context manager at the top of an agent's turn.
Gateway reads via get_agent_context() when creating agent_events rows.
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
):
    """Set agent-scoped values for the duration of a `with` block."""
    token = _context.set({
        "agent_name": agent_name,
        "correlation_id": correlation_id or str(uuid.uuid4()),
        "parent_event_id": parent_event_id,
        "cost_cents": cost_cents,
    })
    try:
        yield
    finally:
        _context.reset(token)


def get_agent_context() -> dict:
    """Return the current context dict (empty if no with_agent_context active)."""
    return _context.get()
