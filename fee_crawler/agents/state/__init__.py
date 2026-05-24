"""State agent fleet (state_al, state_ak, …, state_dc).

The 51 state agents in agent_registry are not separate classes — they share
the extractor's code path but each runs under its own `agent_name` so audit
trails and budgets bucket by state. Knox supervises the fleet (Magellan
review at 05:00 spans all states); Atlas dispatches which state runs when
(agents/atlas/orchestrator.py).

Why a thin wrapper and not 51 distinct classes? The work each state does is
identical (download → extract → write fees_raw); only the candidate filter
differs. Per-state autonomy can be added later as overrides without
refactoring the base flow.

Usage:
    from fee_crawler.agents.state import run_state_agent
    result = await run_state_agent(conn, state_code="TX", size=200)
"""

from .orchestrator import (
    STATE_AGENT_PREFIX,
    StateAgentResult,
    list_state_codes,
    run_state_agent,
    state_agent_name,
)

__all__ = [
    "STATE_AGENT_PREFIX",
    "StateAgentResult",
    "list_state_codes",
    "run_state_agent",
    "state_agent_name",
]
