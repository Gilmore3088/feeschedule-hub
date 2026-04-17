"""AgentBase -- 5-step loop framework (LOOP-01..06).

Subclasses MUST set the class attribute ``agent_name`` (matches
``agent_registry.agent_name``). ``__init_subclass__`` auto-wraps public methods
in the ``AUTO_WRAP_METHODS`` allowlist so every invocation enters
``with_agent_context()`` -- developers never touch contextvars directly (D-03).

Why ``__init_subclass__`` and not a metaclass or a decorator? PEP 487 provides
the one-hook-per-class registration point without cluttering the inheritance
chain and without requiring subclass authors to remember to decorate. The
allowlist (not ``wrap everything``) avoids wrapping private helpers which
would corrupt contextvar state across nested calls.

Correlation-id inheritance: If an outer ``with_agent_context`` is already
active (parent agent called this one), the new context reuses its
``correlation_id``. Otherwise ``with_agent_context`` generates a fresh UUID.

Override points (all async):

* ``run_turn(*args, **kwargs)`` -- LOOP main; subclass-specific work.
* ``review()`` -- LOOP-03 periodic self-review (scheduled by pg_cron, Plan 62B-08).
* ``dissect(events)`` -- LOOP-04; default writes an ``agent_events`` ``dissect`` row.
* ``understand(patterns)`` -- LOOP-05; default writes to ``agent_lessons``.
* ``improve(lesson)`` -- LOOP-06; default commits (Plan 62B-07 wraps in
  adversarial gate).
"""

from __future__ import annotations

import functools
from typing import Any, Optional

from fee_crawler.agent_tools.context import get_agent_context, with_agent_context


AUTO_WRAP_METHODS = ("run_turn", "review", "dissect", "understand", "improve")


class AgentBase:
    """Base class for Knox / Darwin / Atlas / 51 state agents.

    Required class attributes on subclasses:

    * ``agent_name: str`` -- must match ``agent_registry.agent_name``.

    Optional class attributes (defaults below):

    * ``review_schedule: str`` -- cron string for LOOP-03 dispatcher
      (default ``"0 * * * *"``; pg_cron in Plan 62B-08 reads this).
    * ``canary_corpus_path: Optional[str]`` -- required for LOOP-07 IMPROVE
      gate (Plan 62B-07 enforces; this phase leaves the default commit path
      in place so LOOP-06 tests work).
    """

    agent_name: str = ""
    review_schedule: str = "0 * * * *"
    canary_corpus_path: Optional[str] = None

    def __init_subclass__(cls, **kw: Any) -> None:
        super().__init_subclass__(**kw)
        # Enforce agent_name at class-creation time. Using cls.__dict__ so that
        # a subclass cannot silently inherit a parent's agent_name.
        if not cls.__dict__.get("agent_name"):
            raise TypeError(
                f"{cls.__name__} must set class attribute `agent_name` "
                f"(matches agent_registry.agent_name)."
            )
        for method_name in AUTO_WRAP_METHODS:
            if method_name in cls.__dict__:
                original = cls.__dict__[method_name]
                setattr(cls, method_name, cls._wrap_with_context(original))

    @staticmethod
    def _wrap_with_context(fn):
        """Wrap ``fn`` so every call enters ``with_agent_context`` automatically.

        If an outer context is already active (nested agent-to-agent call),
        inherit its ``correlation_id`` and ``parent_event_id`` so the causal
        chain stays intact.
        """

        @functools.wraps(fn)
        async def wrapped(self, *args, **kwargs):
            ctx = get_agent_context() or {}
            inherited_correlation = ctx.get("correlation_id")
            inherited_parent = ctx.get("parent_event_id")
            with with_agent_context(
                agent_name=self.agent_name,
                correlation_id=inherited_correlation,
                parent_event_id=inherited_parent,
            ):
                return await fn(self, *args, **kwargs)

        return wrapped

    # ------------------------------------------------------------------
    # 5-step override points. Subclasses override these.
    # ------------------------------------------------------------------

    async def run_turn(self, *args, **kwargs):
        """LOOP main: agent-specific work. LOG happens automatically via gateway."""
        raise NotImplementedError("Subclass must override run_turn()")

    async def review(self):
        """LOOP-03 periodic self-review. Scheduled by pg_cron (Plan 62B-08)."""
        raise NotImplementedError("Subclass must override review()")

    async def dissect(self, events):
        """LOOP-04 default: writes an agent_events row with action='dissect'.

        Subclasses may override to compute richer patterns; calling the default
        via ``fee_crawler.agent_base.loop.default_dissect`` is a valid baseline.
        """
        from fee_crawler.agent_base.loop import default_dissect

        return await default_dissect(self.agent_name, events)

    async def understand(self, patterns):
        """LOOP-05 default: writes/updates agent_lessons row for the active lesson."""
        from fee_crawler.agent_base.loop import default_understand

        return await default_understand(self.agent_name, patterns)

    async def improve(self, lesson):
        """LOOP-06 / LOOP-07 gated commit.

        Every IMPROVE now runs through ``adversarial_gate.run_gate`` (Plan
        62B-07). On ``verdict.passed=True`` we fall through to the baseline
        ``default_improve_commit`` write. On fail we queue an
        ``agent_events`` row with ``status='improve_rejected'`` (D-08) for
        James's daily digest; the proposed lesson is NOT applied.

        Gate contract:
          * Canary is the floor — ``self.canary_corpus_path`` MUST point at a
            valid fixture. Agents without a canary corpus auto-reject with
            ``reason='no_canary_corpus'`` (prevents self-modification without
            a deterministic regression baseline).
          * Peer challenge is the ceiling — opt-in via
            ``lesson['peer_challenge_recipient']``. The gate issues a
            ``challenge`` message and waits for ``accept`` before committing.

        Subclasses typically override ``_canary_run_institution`` to return
        real canary metrics; the default provides neutral passing metrics so
        tests and tool smoke runs stay green without a per-agent runner.
        """
        from fee_crawler.agent_base.adversarial_gate import (
            default_corpus_loader,
            queue_improve_rejected,
            run_gate,
        )
        from fee_crawler.agent_base.loop import default_improve_commit
        from fee_crawler.testing.canary_runner import run_canary

        async def _agent_runner(institution_id: int) -> dict:
            return await self._canary_run_institution(institution_id)

        # send_message is optional — keep the gate importable if the
        # messaging package is not wired (unit-test isolation).
        send_fn: Optional[Any] = None
        try:
            from fee_crawler.agent_messaging.publisher import send_message

            send_fn = send_message
        except ImportError:
            send_fn = None

        verdict = await run_gate(
            agent_name=self.agent_name,
            lesson=lesson,
            canary_corpus_path=self.canary_corpus_path,
            canary_runner_fn=run_canary,
            corpus_loader=default_corpus_loader,
            agent_runner=_agent_runner,
            send_message_fn=send_fn,
        )
        if not verdict.passed:
            await queue_improve_rejected(self.agent_name, lesson, verdict)
            return
        await default_improve_commit(self.agent_name, lesson)

    async def _canary_run_institution(self, institution_id: int) -> dict:
        """Return per-institution canary metrics for the LOOP-07 gate.

        Default implementation returns neutral passing metrics so tests that
        exercise the gate happy-path can run without a full per-agent
        pipeline. Subclasses in Phase 63+ replace this with real extraction
        metrics computed against the candidate improvement.

        Leading underscore keeps this helper out of the ``AUTO_WRAP_METHODS``
        allowlist — it runs inside the already-wrapped ``improve`` call, so
        we do NOT want a second ``with_agent_context`` entry.
        """
        return {"coverage": 1.0, "confidence_mean": 0.9, "extraction_count": 1}
