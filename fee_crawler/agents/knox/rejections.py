"""Knox rejection summary — Q-06 from docs/team/05-product-focus.md.

Knox's _post_decision writes agent_messages with intent='reject' and
payload.reasons = ['low_confidence', 'amount_above_ceiling', ...].
This module aggregates the reasons over a window and writes a
weekly 'rejection_themes' lesson into agent_lessons so:
  1. Operators can spot quality regressions (sudden spike in one reason)
  2. Hamilton can answer "what's Knox rejecting most this week?"
  3. The improve loop has a real signal to optimize against
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import asyncpg

log = logging.getLogger(__name__)

AGENT_NAME = "knox"
LESSON_NAME = "rejection_themes"
SUMMARY_MARKER = "knox_rejection_summary"


@dataclass
class RejectionSummary:
    """Top rejection reasons over a window."""
    window_days: int
    total_rejections: int
    distinct_institutions: int
    top_reasons: list[dict]   # [{"reason": "low_confidence", "count": 42}, …]
    lesson_id: Optional[int] = None

    def to_dict(self) -> dict:
        return asdict(self)


async def _aggregate(
    conn: asyncpg.Connection, days: int, top_n: int,
) -> tuple[int, int, list[dict]]:
    """Return (total_rejections, distinct_institutions, top_reasons[]).
    Reasons are unnested from payload->'reasons' JSONB array."""
    row = await conn.fetchrow(
        """
        SELECT COUNT(*)::int AS total,
               COUNT(DISTINCT (payload->>'fee_verified_id'))::int AS distinct_fees
          FROM agent_messages
         WHERE sender_agent = $1
           AND intent = 'reject'
           AND created_at > NOW() - ($2 || ' days')::interval
        """,
        AGENT_NAME, str(days),
    )
    total = int(row["total"] or 0) if row else 0
    distinct = int(row["distinct_fees"] or 0) if row else 0

    if total == 0:
        return 0, 0, []

    rows = await conn.fetch(
        """
        SELECT reason, COUNT(*)::int AS n
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(payload->'reasons', '[]'::jsonb)) AS reason
              FROM agent_messages
             WHERE sender_agent = $1
               AND intent = 'reject'
               AND created_at > NOW() - ($2 || ' days')::interval
          ) r
         GROUP BY reason
         ORDER BY n DESC
         LIMIT $3
        """,
        AGENT_NAME, str(days), top_n,
    )
    top = [{"reason": r["reason"], "count": int(r["n"])} for r in rows]
    return total, distinct, top


async def summarize_recent_rejections(
    conn: asyncpg.Connection,
    *,
    days: int = 7,
    top_n: int = 10,
    write_lesson: bool = True,
) -> RejectionSummary:
    """Compute the summary; optionally upsert it to agent_lessons."""
    total, distinct, top = await _aggregate(conn, days, top_n)

    summary = RejectionSummary(
        window_days=days,
        total_rejections=total,
        distinct_institutions=distinct,
        top_reasons=top,
    )

    if not write_lesson:
        return summary

    description = (
        f"Knox rejected {total} fees across {distinct} unique fee_verified rows "
        f"in the last {days} days. "
        + (
            "Top reasons: "
            + ", ".join(f"{r['reason']}({r['count']})" for r in top[:3])
            if top else "No rejection reasons recorded."
        )
    )

    # Pre-mint an event_id so source_event_id has a real reference even
    # when we're running outside a gateway context. The agent_events
    # row is a self-describing "summary written" marker.
    event_id = str(uuid.uuid4())
    await conn.execute(
        """INSERT INTO agent_events
             (event_id, agent_name, action, tool_name, entity, status,
              correlation_id, input_payload, output_payload, cost_cents)
           VALUES ($1::UUID, $2, 'understand', '_rejection_summarizer',
                   'agent_lessons', 'success',
                   $3::UUID, $4::JSONB, $5::JSONB, 0)""",
        event_id, AGENT_NAME, str(uuid.uuid4()),
        json.dumps({"window_days": days, "top_n": top_n}),
        json.dumps(summary.to_dict()),
    )

    lesson_id = await conn.fetchval(
        """INSERT INTO agent_lessons
             (agent_name, lesson_name, description, evidence_refs,
              confidence, source_event_id)
           VALUES ($1, $2, $3, $4::JSONB, $5, $6::UUID)
           ON CONFLICT (agent_name, lesson_name) DO UPDATE
             SET description     = EXCLUDED.description,
                 evidence_refs   = EXCLUDED.evidence_refs,
                 confidence      = EXCLUDED.confidence,
                 source_event_id = EXCLUDED.source_event_id
           RETURNING lesson_id""",
        AGENT_NAME, LESSON_NAME, description,
        json.dumps(top), 1.0, event_id,
    )
    summary.lesson_id = int(lesson_id) if lesson_id is not None else None
    return summary


async def maybe_run_weekly_summary(conn: asyncpg.Connection) -> Optional[RejectionSummary]:
    """Atlas/per-minute dispatcher entry point. Runs at most once per 23h
    via workers_last_run marker. Returns the summary if it ran, else None."""
    row = await conn.fetchrow(
        "SELECT completed_at FROM workers_last_run WHERE job_name = $1",
        SUMMARY_MARKER,
    )
    last = row["completed_at"] if row else None
    if last and last >= datetime.now(timezone.utc) - timedelta(hours=23):
        return None

    summary = await summarize_recent_rejections(conn)
    await conn.execute(
        """INSERT INTO workers_last_run (job_name, completed_at, status)
           VALUES ($1, NOW(), 'ok')
           ON CONFLICT (job_name) DO UPDATE
             SET completed_at = EXCLUDED.completed_at,
                 status       = EXCLUDED.status""",
        SUMMARY_MARKER,
    )
    return summary
