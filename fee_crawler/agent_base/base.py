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
        """LOOP-06 commit-through stub. Plan 62B-07 wraps this in the adversarial gate."""
        from fee_crawler.agent_base.loop import default_improve_commit

        await default_improve_commit(self.agent_name, lesson)
