"""Phase 62b agent runtime -- 5-step loop framework (LOOP-01..06).

AgentBase is the Python subclass contract. Knox / Darwin / Atlas / 51 state agents
(Phases 63-65) subclass it and receive automatic context propagation, LOG via the
62a gateway, and baseline DISSECT / UNDERSTAND / IMPROVE plumbing.
"""

from fee_crawler.agent_base.base import AgentBase, AUTO_WRAP_METHODS

__all__ = ["AgentBase", "AUTO_WRAP_METHODS"]
