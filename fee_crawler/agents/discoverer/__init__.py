"""Discoverer agent: wraps discovery_worker.run() in an agentic shell.

Before this module existed, the nightly 2am UTC `run_discovery` cron
ran as a plain subprocess — no agent identity, no audit, no budget.
This wrapper:
  - Asserts the `discoverer` agent_name is registered + active
  - Records a session_start / session_end agent_events pair so every
    discovery run is auditable (correlation_id ties start/end)
  - Debits agent_budgets after the run with a conservative per-job
    cost estimate (1¢ / processed job — Playwright + HTTP fan-out)
  - Surfaces structured result counts (processed, found, failed)

Per-job writes to crawl_targets still use the legacy worker code
path; migrating those to update_crawl_target via the gateway is a
follow-up. This shell gives the framework visibility at the
session level today, with a sensible upgrade path.
"""

from .orchestrator import (
    AGENT_NAME,
    DiscovererResult,
    run_discovery_session,
)

__all__ = [
    "AGENT_NAME",
    "DiscovererResult",
    "run_discovery_session",
]
