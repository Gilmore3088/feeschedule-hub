"""Hamilton scheduling primitives (C-02).

Subscriptions live in `hamilton_digest_subscriptions`; per-execution
records in `hamilton_digest_runs`. The Modal per-minute dispatcher
calls `process_due_digests(conn, max_runs)` which:
  1. Picks subscriptions with `next_due_at <= NOW()` AND `active = TRUE`
  2. Records a `pending` run for each
  3. Calls the Hamilton API (HTTP) with the subscription's prompt
  4. Stores the response text + cost
  5. Bumps `next_due_at` per the cadence
"""

from .digest import (
    AGENT_NAME,
    DigestRunResult,
    cadence_to_interval,
    process_due_digests,
)

__all__ = [
    "AGENT_NAME",
    "DigestRunResult",
    "cadence_to_interval",
    "process_due_digests",
]
