"""Atlas: orchestrator agent.

Atlas was registered in agent_registry from day one but had no
implementation — the orchestrator role was being filled implicitly by
`fee_crawler.modal_app.run_post_processing`. This module gives Atlas
real code: it picks which state needs work next and dispatches that
state's agent.

Atlas is invoked by Modal (per-minute dispatcher window or a new cron)
and operates entirely through the gateway, so every dispatch decision
shows up in agent_events under agent_name='atlas'.
"""

from .orchestrator import (
    AGENT_NAME,
    DispatchPlan,
    DispatchResult,
    dispatch_state_fleet,
    select_next_states,
)

__all__ = [
    "AGENT_NAME",
    "DispatchPlan",
    "DispatchResult",
    "dispatch_state_fleet",
    "select_next_states",
]
