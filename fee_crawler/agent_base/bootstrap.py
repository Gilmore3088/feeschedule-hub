"""Lifecycle-state branch helper (Phase 62b BOOT-01 / D-22).

AgentBase.run_turn reads ``agent_registry.lifecycle_state`` at turn start
and picks the Q1/Q2/Q3/paused behavior branch. This module centralizes the
three things the wrapper needs:

* :func:`get_lifecycle_state` -- one-shot read from ``agent_registry``.
* :func:`write_paused_abort` -- log an ``agent_events`` row when a turn is
  aborted because ``lifecycle_state = 'paused'`` (so ``/admin/agents``
  Overview can see halted agents without scraping stdout).
* :class:`AgentPaused` -- sentinel exception raised from ``run_turn`` so
  subclasses (and tests) can detect the abort.
* :func:`should_hold_for_human` -- the D-24 exception-review policy,
  factored out so other loop stages can reuse it.

The wrapper in ``AgentBase._wrap_with_context`` only branches for
``run_turn`` — other AUTO_WRAP_METHODS (review / dissect / understand /
improve) keep their existing auto-wrap semantics from 62B-03.
"""

from __future__ import annotations

import logging
from typing import Optional

from fee_crawler.agent_tools.pool import get_pool

log = logging.getLogger(__name__)


class AgentPaused(RuntimeError):
    """Raised from ``AgentBase.run_turn`` when ``lifecycle_state = 'paused'``.

    Distinct exception class so callers (cron dispatchers, tests, a parent
    agent orchestrator) can catch it explicitly without swallowing
    unrelated RuntimeErrors.
    """


async def get_lifecycle_state(agent_name: str) -> Optional[str]:
    """Return the current lifecycle_state for ``agent_name``.

    Returns ``None`` if the agent is not registered (``agent_registry`` has
    no matching row). Callers treat ``None`` as "unknown agent" and
    generally surface a non-zero exit.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT lifecycle_state FROM agent_registry WHERE agent_name = $1",
            agent_name,
        )


async def write_paused_abort(agent_name: str) -> None:
    """Log an ``agent_events`` row for a paused-state abort.

    Writes ``action='paused_abort'`` with ``status='success'`` (the abort
    itself succeeded — the agent did NOT do work). The input_payload
    captures the reason so the Overview tile can surface "halted because
    lifecycle_state=paused" without joining to agent_registry.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status, input_payload)
               VALUES ($1, 'paused_abort', '_agent_base', '_run_turn', 'success',
                       '{"reason":"lifecycle_state=paused"}'::JSONB)""",
            agent_name,
        )


def should_hold_for_human(
    lifecycle_state: Optional[str],
    confidence: Optional[float] = None,
) -> bool:
    """Return True if an output must be held for human review (D-24).

    Policy:
      * ``q1_validation`` -> always hold (Q1 holds every output).
      * ``q2_high_confidence`` -> hold iff confidence is known AND below
        0.85. Unknown confidence (``None``) does NOT hold — callers that
        don't measure confidence are trusted to auto-commit in Q2.
      * ``q3_autonomy`` -> no hold (quarterly sampling handled elsewhere).
      * ``paused`` / unknown -> no hold (the agent is either off or not
        yet registered; the caller should have aborted already).
    """
    if lifecycle_state == "q1_validation":
        return True
    if lifecycle_state == "q2_high_confidence":
        if confidence is None:
            return False
        return confidence < 0.85
    return False
