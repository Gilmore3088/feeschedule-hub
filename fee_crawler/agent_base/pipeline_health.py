"""Pipeline health monitoring — R-01 from docs/team/05-product-focus.md.

The freshness UI (src/lib/admin-queries.ts EXPECTED_JOBS) reads
workers_last_run and shows a red banner when any job is stale > 26h.
That UI is operator-pull. This module is the operator-push counterpart:
on each per-minute Modal tick, scan the same EXPECTED_JOBS list and
emit an `agent_events` row with status='health_alert' for any newly-
stale job. Admin UI / Hamilton can then react.

Idempotent: alerts are suppressed if an unresolved 'health_alert' for
the same job_name was emitted in the last 6 hours. Otherwise a single
multi-day outage would spam thousands of identical events.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import asyncpg

log = logging.getLogger(__name__)

AGENT_NAME = "atlas"   # Atlas owns orchestration health
ALERT_DEDUPE_HOURS = 6
DEFAULT_STALE_THRESHOLD_HOURS = 26

# The job inventory mirrors src/lib/admin-queries.ts JOB_INVENTORY.
# Keep these two lists in sync — duplicated here so the Python tick
# doesn't depend on the TS layer.
EXPECTED_JOBS: tuple[tuple[str, int], ...] = (
    ("daily_pipeline",        26),
    ("magellan_rescue",       26),
    ("knox_review",           26),
    ("darwin_drain",          26),
    ("publish_index",         26),
    ("ingest_data",           26),
    ("run_discovery",         26),
    ("run_pdf_extraction",    26),
    ("run_browser_extraction", 26),
    ("knox_rejection_summary", 168),   # weekly job — 7 day threshold
)


@dataclass
class HealthAlertResult:
    checked: int = 0
    fresh: int = 0
    stale: int = 0
    alerts_emitted: int = 0
    alerts_suppressed_dedupe: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


async def _recent_alert_exists(conn: asyncpg.Connection, job_name: str) -> bool:
    """Returns True if a health_alert agent_events row for this job_name
    was written within the last ALERT_DEDUPE_HOURS hours. Suppresses
    duplicate alerts during an extended outage."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=ALERT_DEDUPE_HOURS)
    row = await conn.fetchrow(
        """SELECT 1
             FROM agent_events
            WHERE agent_name = $1
              AND status = 'health_alert'
              AND created_at > $2
              AND input_payload @> $3::jsonb
            LIMIT 1""",
        AGENT_NAME, cutoff, json.dumps({"job_name": job_name}),
    )
    return row is not None


async def _emit_alert(
    conn: asyncpg.Connection,
    job_name: str,
    last_completed_at: Optional[datetime],
    threshold_hours: int,
) -> None:
    """Write a single 'health_alert' agent_events row. The row's
    input_payload carries enough context for an operator dashboard to
    surface it without joining other tables."""
    event_id = str(uuid.uuid4())
    payload = {
        "job_name": job_name,
        "threshold_hours": threshold_hours,
        "last_completed_at": last_completed_at.isoformat() if last_completed_at else None,
        "stale_for_hours": (
            round(
                (datetime.now(timezone.utc) - last_completed_at).total_seconds() / 3600.0,
                1,
            )
            if last_completed_at else None
        ),
    }
    await conn.execute(
        """INSERT INTO agent_events
             (event_id, agent_name, action, tool_name, entity, status,
              correlation_id, input_payload, output_payload, cost_cents)
           VALUES ($1::UUID, $2, 'health_alert', '_pipeline_health',
                   'workers_last_run', 'health_alert',
                   $3::UUID, $4::JSONB, $5::JSONB, 0)""",
        event_id, AGENT_NAME, str(uuid.uuid4()),
        json.dumps(payload),
        json.dumps({"alert": "stale_cron"}),
    )
    log.warning(
        "pipeline_health: emitted alert for %s (stale for %s h, threshold %sh)",
        job_name, payload["stale_for_hours"], threshold_hours,
    )


async def check_pipeline_health(conn: asyncpg.Connection) -> HealthAlertResult:
    """One pass through EXPECTED_JOBS. Emits new health_alert rows for
    stale crons, deduped against the last 6 hours. Returns a summary
    so the dispatcher can log it."""
    result = HealthAlertResult()
    now = datetime.now(timezone.utc)

    rows = await conn.fetch(
        """SELECT job_name, completed_at
             FROM workers_last_run
            WHERE job_name = ANY($1::TEXT[])""",
        [j for j, _ in EXPECTED_JOBS],
    )
    last_by_name: dict[str, Optional[datetime]] = {
        r["job_name"]: r["completed_at"] for r in rows
    }

    for job_name, threshold_h in EXPECTED_JOBS:
        result.checked += 1
        last = last_by_name.get(job_name)
        cutoff = now - timedelta(hours=threshold_h)
        is_stale = (last is None) or (last < cutoff)

        if not is_stale:
            result.fresh += 1
            continue

        result.stale += 1
        if await _recent_alert_exists(conn, job_name):
            result.alerts_suppressed_dedupe += 1
            continue

        await _emit_alert(conn, job_name, last, threshold_h)
        result.alerts_emitted += 1

    return result
