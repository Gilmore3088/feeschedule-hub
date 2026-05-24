"""Discoverer agent orchestrator.

Wraps fee_crawler.workers.discovery_worker.run() in:
  • a registry/budget-checked agent identity (`discoverer`)
  • paired session_start / session_end agent_events for audit
  • a post-run agent_budgets debit (estimated cost from job count)

The inner worker still talks to crawl_targets directly. That's the
remaining gap; this shell makes the discovery STAGE visible to the
framework today without rewriting Playwright + DNS + queue plumbing.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from dataclasses import asdict, dataclass

log = logging.getLogger(__name__)

AGENT_NAME = "discoverer"

# Estimated cost per discovery job: Playwright run + ~5 URL probes ≈ 1¢.
# This is a placeholder; refine once we instrument the worker for
# real per-job cost tracking.
_COST_PER_JOB_CENTS = 1


@dataclass
class DiscovererResult:
    processed: int = 0
    found: int = 0
    failed: int = 0
    duration_s: float = 0.0
    cost_cents: int = 0
    session_event_id: str | None = None
    raw_summary: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


_SUMMARY_RE = re.compile(
    r"processed[:=]?\s*(?P<processed>\d+).*?found[:=]?\s*(?P<found>\d+)",
    re.IGNORECASE | re.DOTALL,
)


def _parse_worker_summary(summary: str) -> tuple[int, int]:
    """Best-effort parse of discovery_worker's free-text summary string.

    Returns (processed, found). If the string doesn't match either
    field, returns (0, 0) — the agent_events row still records the raw
    summary so an operator can see what came back."""
    if not summary:
        return 0, 0
    m = _SUMMARY_RE.search(summary)
    if not m:
        return 0, 0
    return int(m.group("processed") or 0), int(m.group("found") or 0)


async def _record_session_start(conn, correlation_id: str) -> str:
    """Write a session_start agent_events row, return its event_id."""
    event_id = str(uuid.uuid4())
    await conn.execute(
        """INSERT INTO agent_events
             (event_id, agent_name, action, tool_name, entity, status,
              correlation_id, input_payload, cost_cents)
           VALUES ($1::UUID, $2, 'session_start', '_discoverer', 'crawl_targets',
                   'pending', $3::UUID, $4::JSONB, 0)""",
        event_id, AGENT_NAME, correlation_id,
        json.dumps({"trigger": "agentic_run"}),
    )
    return event_id


async def _record_session_end(
    conn, session_event_id: str, correlation_id: str,
    *, processed: int, found: int, failed: int, duration_s: float,
    cost_cents: int, status: str, raw_summary: str | None,
) -> None:
    """Write a session_end agent_events row tied to the start via
    correlation_id + parent_event_id."""
    await conn.execute(
        """INSERT INTO agent_events
             (agent_name, action, tool_name, entity, status,
              correlation_id, parent_event_id,
              input_payload, output_payload, cost_cents)
           VALUES ($1, 'session_end', '_discoverer', 'crawl_targets', $2,
                   $3::UUID, $4::UUID, $5::JSONB, $6::JSONB, $7)""",
        AGENT_NAME, status, correlation_id, session_event_id,
        json.dumps({"processed": processed}),
        json.dumps({
            "processed": processed,
            "found": found,
            "failed": failed,
            "duration_s": round(duration_s, 2),
            "cost_cents": cost_cents,
            "summary": raw_summary,
        }),
        cost_cents,
    )


async def run_discovery_session(
    *,
    concurrency: int = 20,
) -> DiscovererResult:
    """Run one discovery batch under the `discoverer` agent identity.

    Returns a DiscovererResult with counts + the session_start event_id
    so callers can trace the run end-to-end via correlation_id."""
    import asyncpg
    from fee_crawler.agent_tools.budget import (
        BudgetExceeded,
        account_budget,
        check_budget,
    )
    from fee_crawler.workers.discovery_worker import run as worker_run

    t0 = time.time()
    correlation_id = str(uuid.uuid4())
    result = DiscovererResult()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is required for discoverer")

    conn = await asyncpg.connect(db_url)
    try:
        # 1. Agent identity + budget pre-flight (gateway-style checks
        # done manually since we're not wrapping a single tool call).
        agent_row = await conn.fetchrow(
            "SELECT is_active FROM agent_registry WHERE agent_name = $1",
            AGENT_NAME,
        )
        if agent_row is None or not agent_row["is_active"]:
            raise RuntimeError(
                f"agent '{AGENT_NAME}' not registered or inactive. "
                f"Apply 20260529_discoverer_agent.sql."
            )

        # Conservative projection: assume up to 200 jobs/batch at 1¢ each.
        try:
            await check_budget(conn, AGENT_NAME, projected_cost_cents=200)
        except BudgetExceeded as exc:
            log.warning("discoverer budget exceeded: %s", exc)
            raise

        # 2. session_start audit row
        result.session_event_id = await _record_session_start(conn, correlation_id)

        # 3. Hand off to the existing worker (runs its own pool)
        worker_summary = await worker_run(concurrency=concurrency)
        result.raw_summary = worker_summary
        result.duration_s = time.time() - t0

        processed, found = _parse_worker_summary(worker_summary)
        result.processed = processed
        result.found = found
        result.cost_cents = processed * _COST_PER_JOB_CENTS

        # 4. Debit budget against agent_budgets.spent_cents
        if result.cost_cents > 0:
            await account_budget(conn, AGENT_NAME, result.cost_cents)

        # 5. session_end audit row
        await _record_session_end(
            conn, result.session_event_id, correlation_id,
            processed=result.processed, found=result.found,
            failed=result.failed, duration_s=result.duration_s,
            cost_cents=result.cost_cents, status="success",
            raw_summary=result.raw_summary,
        )
        return result

    except Exception as exc:
        result.duration_s = time.time() - t0
        result.failed = result.processed - result.found
        if result.session_event_id:
            try:
                await _record_session_end(
                    conn, result.session_event_id, correlation_id,
                    processed=result.processed, found=result.found,
                    failed=result.failed, duration_s=result.duration_s,
                    cost_cents=result.cost_cents, status="failed",
                    raw_summary=str(exc),
                )
            except Exception:
                pass
        raise
    finally:
        await conn.close()
