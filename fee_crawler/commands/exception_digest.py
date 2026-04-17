"""Daily exception digest CLI (Phase 62b BOOT-01 / D-08 + D-11 + D-24).

Usage:
    python -m fee_crawler exception-digest [--hours 24] [--out path.md]

Emits a Markdown digest listing, for the last N hours:
  1. Improve Rejected -- ``agent_events`` rows with ``status='improve_rejected'``
     (failed IMPROVE gates; LOOP-07 D-08).
  2. Escalated Handshakes -- ``agent_messages`` rows with ``state='escalated'``
     (handshakes past 3 rounds or 24h; COMMS-04 D-11).
  3. Q2 Exception Samples -- ``agent_events.status='success'`` rows emitted by
     agents in ``lifecycle_state='q2_high_confidence'`` where either
     ``confidence < 0.85`` OR a random 5% sample (D-24).

Target: James reviews in under 20 minutes per day. The 48-hour review SLA
is documented in ``.planning/runbooks/agent-bootstrap.md`` section 5.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fee_crawler.agent_messaging.escalation import list_escalated_threads
from fee_crawler.agent_tools.pool import get_pool


_HEADER_FMT = "# Agent Exception Digest — {ts}"
_META_FMT = "_Window: last {hours}h · SLA: review within 48h_"


def _header(since_hours: int) -> list[str]:
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return [
        _HEADER_FMT.format(ts=ts),
        _META_FMT.format(hours=since_hours),
        "",
    ]


async def _improve_rejected_section(since_hours: int) -> list[str]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT event_id, agent_name, created_at, input_payload::TEXT AS payload
                 FROM agent_events
                WHERE status = 'improve_rejected'
                  AND created_at > NOW() - make_interval(hours => $1)
                ORDER BY created_at DESC""",
            since_hours,
        )
    lines = [f"## 1. Improve Rejected ({len(rows)})"]
    if not rows:
        lines.append("_none_")
    for row in rows[:50]:
        payload_snip = (row["payload"] or "")[:200]
        lines.append(
            f"- `{row['event_id']}` · {row['agent_name']} · "
            f"{row['created_at'].isoformat()} — {payload_snip}"
        )
    lines.append("")
    return lines


async def _escalated_section(since_hours: int) -> list[str]:
    escalated = await list_escalated_threads(since_hours=since_hours)
    lines = [f"## 2. Escalated Handshakes ({len(escalated)})"]
    if not escalated:
        lines.append("_none_")
    for row in escalated[:50]:
        lines.append(
            f"- `{row['correlation_id']}` · "
            f"{row['sender_agent']}→{row['recipient_agent']} · "
            f"round {row['round_number']} · {row['intent']} · "
            f"{row['created_at'].isoformat()}"
        )
    lines.append("")
    return lines


async def _q2_samples_section(since_hours: int) -> list[str]:
    """Q2 exception sample rows per D-24.

    Policy: for agents in ``q2_high_confidence``, surface every success event
    with ``confidence < 0.85`` PLUS a random 5% sample of the rest. NULL
    confidence is excluded from the low-confidence arm (we can't decide).
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT e.event_id, e.agent_name, e.tool_name, e.entity,
                      e.confidence, e.created_at
                 FROM agent_events e
                 JOIN agent_registry r ON r.agent_name = e.agent_name
                WHERE r.lifecycle_state = 'q2_high_confidence'
                  AND e.status = 'success'
                  AND e.created_at > NOW() - make_interval(hours => $1)
                  AND (
                        (e.confidence IS NOT NULL AND e.confidence < 0.85)
                     OR random() < 0.05
                      )
                ORDER BY e.created_at DESC
                LIMIT 100""",
            since_hours,
        )
    lines = [f"## 3. Q2 Exception Samples ({len(rows)})"]
    if not rows:
        lines.append("_none_")
    for row in rows:
        conf = (
            f"{float(row['confidence']):.2f}"
            if row["confidence"] is not None
            else "n/a"
        )
        lines.append(
            f"- `{row['event_id']}` · {row['agent_name']} · "
            f"{row['tool_name']} → {row['entity']} · "
            f"conf={conf} · {row['created_at'].isoformat()}"
        )
    lines.append("")
    return lines


async def build_digest(since_hours: int = 24) -> str:
    """Return the full Markdown digest for the last ``since_hours`` hours."""
    lines: list[str] = []
    lines.extend(_header(since_hours))
    lines.extend(await _improve_rejected_section(since_hours))
    lines.extend(await _escalated_section(since_hours))
    lines.extend(await _q2_samples_section(since_hours))
    return "\n".join(lines)


async def run(since_hours: int, out_path: Optional[Path]) -> int:
    digest = await build_digest(since_hours)
    if out_path is None:
        sys.stdout.write(digest)
        sys.stdout.write("\n")
    else:
        out_path.write_text(digest)
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    """argparse entry. Returns a process exit code."""
    ap = argparse.ArgumentParser(
        prog="exception-digest",
        description=(
            "Render the daily agent exception digest (improve_rejected + "
            "escalated handshakes + Q2 sample)."
        ),
    )
    ap.add_argument(
        "--hours",
        type=int,
        default=24,
        help="time window in hours (default: 24)",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=None,
        help="optional output path; default stdout",
    )
    args = ap.parse_args(argv)
    return asyncio.run(run(args.hours, args.out))


if __name__ == "__main__":
    raise SystemExit(main())
