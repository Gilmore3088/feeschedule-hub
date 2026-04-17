"""LOOP-07: adversarial review gate.

Canary (D-07 floor): every IMPROVE runs canary regression vs. frozen baseline.
Peer challenge (D-07 ceiling): opt-in via ``lesson['peer_challenge_recipient']``.
Failed IMPROVE writes ``improve_rejected`` (D-08) to the daily digest queue.

Contract:
    ``run_gate`` returns a ``GateVerdict`` describing whether the proposed
    IMPROVE should commit. Callers (``AgentBase.improve``) map the verdict to
    either ``default_improve_commit`` (on pass) or ``queue_improve_rejected``
    (on fail). No silent drops — every rejected IMPROVE lands in ``agent_events``
    with ``status='improve_rejected'`` and is discoverable via the digest query:

        SELECT * FROM agent_events
         WHERE status = 'improve_rejected'
           AND created_at > NOW() - INTERVAL '24 hours';

Reject reasons:
    * ``no_canary_corpus``        — agent has no canary corpus path set
    * ``corpus_load_error: <exc>``— CanaryCorpus failed to load / validate
    * ``canary_regression``       — canary runner returned passed=False
    * ``peer_rejected_or_timeout``— peer did not accept within the time budget
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from pathlib import Path
from typing import Any, Awaitable, Callable, NamedTuple, Optional

from fee_crawler.agent_tools.context import get_agent_context
from fee_crawler.agent_tools.pool import get_pool

log = logging.getLogger(__name__)


# Tool/entity labels mirror fee_crawler.agent_base.loop so digest queries
# group ``improve`` action rows (both successes and rejections) under the
# same ``_agent_base`` bucket.
_TOOL_NAME = "_agent_base"
_IMPROVE_ENTITY = "_improve"


class GateVerdict(NamedTuple):
    """Outcome of ``run_gate``. ``passed`` drives commit vs. reject."""

    passed: bool
    reason: str
    verdict_payload: Optional[dict] = None


async def run_gate(
    *,
    agent_name: str,
    lesson: dict,
    canary_corpus_path: Optional[str],
    canary_runner_fn: Callable[..., Awaitable[Any]],
    corpus_loader: Callable[[str], Any],
    agent_runner: Callable[[int], Awaitable[dict]],
    send_message_fn: Optional[Callable[..., Awaitable[str]]] = None,
    peer_wait_seconds: int = 60,
    correlation_id: Optional[str] = None,
) -> GateVerdict:
    """Run the adversarial gate for one proposed IMPROVE.

    D-07 floor (canary regression):
        * ``canary_corpus_path`` MUST point at a valid CanaryCorpus JSON file.
          Absent path → immediate reject with reason ``no_canary_corpus``.
        * ``canary_runner_fn(agent_name, corpus, agent_runner)`` runs every
          expectation in the corpus and returns a ``CanaryVerdict``. If
          ``verdict.passed`` is False, the gate rejects with reason
          ``canary_regression`` and surfaces the three deltas in
          ``verdict_payload``.

    D-07 ceiling (peer challenge):
        * Opt-in. When ``lesson['peer_challenge_recipient']`` is set AND
          ``send_message_fn`` is provided, the gate sends an ``agent_messages``
          row with ``intent='challenge'`` to that peer and polls for an
          ``accept`` reply within ``peer_wait_seconds``. No accept → reject
          with reason ``peer_rejected_or_timeout``.
        * ``correlation_id`` is an optional override so deterministic tests
          can pre-seed an accept row on a known correlation UUID.
    """
    # D-07 floor: canary corpus MUST exist.
    if not canary_corpus_path:
        return GateVerdict(passed=False, reason="no_canary_corpus")

    try:
        corpus = corpus_loader(canary_corpus_path)
    except Exception as exc:
        log.warning(
            "adversarial_gate: corpus load failed for %s at %s: %s",
            agent_name, canary_corpus_path, exc,
        )
        return GateVerdict(passed=False, reason=f"corpus_load_error: {exc}")

    verdict = await canary_runner_fn(agent_name, corpus, agent_runner)
    if not getattr(verdict, "passed", False):
        return GateVerdict(
            passed=False,
            reason="canary_regression",
            verdict_payload={
                "coverage_delta": getattr(verdict, "coverage_delta", None),
                "confidence_delta": getattr(verdict, "confidence_delta", None),
                "extraction_count_delta": getattr(verdict, "extraction_count_delta", None),
                "reason": getattr(verdict, "reason", None),
            },
        )

    # D-07 ceiling: optional peer challenge.
    peer = lesson.get("peer_challenge_recipient") if isinstance(lesson, dict) else None
    if peer and send_message_fn:
        corr = correlation_id or str(uuid.uuid4())
        await send_message_fn(
            sender=agent_name,
            recipient=peer,
            intent="challenge",
            payload={
                "subject_event_id": lesson.get(
                    "source_event_id", str(uuid.uuid4())
                ),
                "question": lesson.get(
                    "peer_challenge_question",
                    f"{agent_name} proposes: {lesson.get('name', '(unnamed)')}",
                ),
            },
            correlation_id=corr,
        )
        accepted = await _await_peer_accept(
            correlation_id=corr,
            peer=peer,
            originator=agent_name,
            timeout=peer_wait_seconds,
        )
        if not accepted:
            return GateVerdict(
                passed=False,
                reason="peer_rejected_or_timeout",
                verdict_payload={
                    "peer": peer,
                    "correlation_id": corr,
                    "wait_seconds": peer_wait_seconds,
                },
            )

    return GateVerdict(passed=True, reason="ok")


async def _await_peer_accept(
    *,
    correlation_id: str,
    peer: str,
    originator: str,
    timeout: int,
) -> bool:
    """Poll ``agent_messages`` for a reply on ``correlation_id``.

    Returns True when the latest matching row has ``intent='accept'``; False on
    ``reject`` or timeout. Filter on ``sender_agent = peer`` AND
    ``recipient_agent = originator`` (T-62B-07-02 spoofing guard).
    """
    pool = await get_pool()
    deadline = asyncio.get_event_loop().time() + max(0, int(timeout))
    # Poll at 1s cadence; cheap index hit on (correlation_id).
    while True:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT intent
                     FROM agent_messages
                    WHERE correlation_id = $1::UUID
                      AND sender_agent = $2
                      AND recipient_agent = $3
                      AND intent IN ('accept', 'reject')
                    ORDER BY created_at DESC
                    LIMIT 1""",
                correlation_id,
                peer,
                originator,
            )
        if row is not None:
            return row["intent"] == "accept"
        if asyncio.get_event_loop().time() >= deadline:
            return False
        await asyncio.sleep(1)


async def queue_improve_rejected(
    agent_name: str, lesson: dict, verdict: GateVerdict
) -> None:
    """D-08: record a failed IMPROVE for James's daily digest.

    Writes exactly one ``agent_events`` row with ``status='improve_rejected'``
    (enabled by migration 20260501). The row carries the proposed lesson plus
    the gate's reason/verdict so the digest can render context inline. No
    retry logic here — James reviews the digest and decides.
    """
    pool = await get_pool()
    ctx = get_agent_context() or {}
    payload = {
        "lesson": lesson,
        "reason": verdict.reason,
        "verdict": verdict.verdict_payload,
    }
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status,
                  correlation_id, parent_event_id, input_payload)
               VALUES ($1, 'improve', $2, $3, 'improve_rejected',
                       COALESCE($4::UUID, gen_random_uuid()),
                       $5::UUID, $6::JSONB)""",
            agent_name,
            _TOOL_NAME,
            _IMPROVE_ENTITY,
            ctx.get("correlation_id"),
            ctx.get("parent_event_id"),
            json.dumps(payload),
        )


def default_corpus_loader(path: str) -> Any:
    """Load a ``CanaryCorpus`` JSON fixture from disk.

    Imported lazily so circular-import cycles via ``fee_crawler.testing`` stay
    broken; the loader is a thin shim over ``CanaryCorpus.model_validate_json``.
    """
    from fee_crawler.testing.canary_schema import CanaryCorpus

    data = Path(path).read_text()
    return CanaryCorpus.model_validate_json(data)


__all__ = [
    "GateVerdict",
    "run_gate",
    "queue_improve_rejected",
    "default_corpus_loader",
]
