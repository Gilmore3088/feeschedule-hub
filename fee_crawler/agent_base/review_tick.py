"""LOOP-04 → LOOP-07 wiring for orchestrator-style agents (no AgentBase subclass).

Concrete production agents (extractor, magellan, darwin, knox, atlas,
discoverer, the state fleet) are orchestrator FUNCTIONS, not AgentBase
subclasses. They still need the improvement loop to fire periodically
so agent_lessons populates and the adversarial gate runs.

This module provides:

- run_review_tick(agent_name) — one full pass through:
    LOOP-04  dissect    : summarize recent agent_events into a digest
    LOOP-05  understand : derive a one-line lesson from the digest
    LOOP-06  improve    : commit the lesson via the adversarial gate
    LOOP-07  guard      : run the canary corpus; reject regression

- A minimal canary_runner that passes when the corpus loads cleanly
  (treats the gate as a contract enforcement point — actual semantic
  regression checks per-agent are TODO).

Wired into Atlas's per-minute Modal dispatcher: each tick rotates to
one agent so over 7 minutes the whole fleet gets reviewed.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import asyncpg

from fee_crawler.agents._canary import canary_path_for

log = logging.getLogger(__name__)


@dataclass
class ReviewTickResult:
    agent_name: str
    events_seen: int = 0
    lesson_committed: bool = False
    gate_passed: bool = False
    gate_reason: Optional[str] = None
    lesson_name: Optional[str] = None
    duration_s: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# LOOP-04: dissect (read recent events, summarize)
# ---------------------------------------------------------------------------

async def _dissect(conn: asyncpg.Connection, agent_name: str) -> dict:
    """Pull the last hour of agent_events for `agent_name`. Returns a digest."""
    rows = await conn.fetch(
        """
        SELECT status, COALESCE(tool_name, '') AS tool_name, cost_cents
          FROM agent_events
         WHERE agent_name = $1
           AND created_at > NOW() - INTERVAL '1 hour'
        """,
        agent_name,
    )
    statuses = Counter(r["status"] for r in rows)
    tools = Counter(r["tool_name"] for r in rows if r["tool_name"])
    cost_cents_total = sum(int(r["cost_cents"] or 0) for r in rows)

    return {
        "agent_name": agent_name,
        "window": "1h",
        "events_count": len(rows),
        "status_counts": dict(statuses),
        "tool_counts": dict(tools),
        "cost_cents_total": cost_cents_total,
        "snapshot_at": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# LOOP-05: understand (derive a lesson from the digest)
# ---------------------------------------------------------------------------

def _derive_lesson(digest: dict) -> dict:
    """Heuristic: if failure rate is elevated, that's the lesson."""
    counts = digest.get("status_counts", {})
    total = sum(counts.values()) or 1
    failed = counts.get("failed", 0) + counts.get("budget_halt", 0)
    rate = failed / total
    cost_dollars = (digest.get("cost_cents_total", 0) or 0) / 100.0

    if total == 0:
        lesson_name = "idle_hour"
        narrative = "no events in the last hour"
    elif rate >= 0.10:
        lesson_name = "elevated_failure_rate"
        narrative = f"failure rate {rate:.0%} ({failed}/{total}) — investigate"
    elif cost_dollars >= 1.00:
        lesson_name = "cost_concentration"
        narrative = f"hourly spend ${cost_dollars:.2f} — watch the per_day cap"
    else:
        lesson_name = "healthy_hour"
        narrative = f"{total} events, {rate:.0%} failure rate, ${cost_dollars:.4f}"

    return {
        "lesson_name": lesson_name,
        "narrative": narrative,
        "digest_excerpt": {
            "total": total,
            "failed": failed,
            "failure_rate": round(rate, 4),
            "cost_dollars": cost_dollars,
        },
    }


# ---------------------------------------------------------------------------
# LOOP-07: minimal canary runner (passes when corpus loads)
# ---------------------------------------------------------------------------

class _CanaryVerdict:
    """Duck-types adversarial_gate's CanaryVerdict expectations."""
    def __init__(self, passed: bool, reason: str = "", **kw):
        self.passed = passed
        self.reason = reason
        self.coverage_delta = kw.get("coverage_delta")
        self.confidence_delta = kw.get("confidence_delta")
        self.extraction_count_delta = kw.get("extraction_count_delta")


def _load_corpus(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


async def _bootstrap_canary_runner(agent_name: str, corpus: dict, _agent_runner) -> _CanaryVerdict:
    """Bootstrap canary: passes if corpus is well-formed (has expectations).

    Real per-agent semantic verifiers (Darwin runs classify against the
    corpus; extractor runs against HTML fixtures) are TODO — this lets
    the gate FIRE today without auto-rejecting every improvement.
    """
    expectations = corpus.get("expectations") or []
    if not expectations:
        return _CanaryVerdict(passed=False, reason="empty_expectations")
    return _CanaryVerdict(passed=True, reason="bootstrap_passed")


async def _noop_agent_runner(_budget_cents: int) -> dict:
    """Stub agent_runner — adversarial_gate requires the param but the
    bootstrap canary doesn't exercise it."""
    return {"ok": True}


# ---------------------------------------------------------------------------
# LOOP-04 + 05 + 06 + 07: the full tick
# ---------------------------------------------------------------------------

async def _write_dissect_event(
    conn: asyncpg.Connection, agent_name: str, correlation_id: str, digest: dict,
) -> str:
    event_id = str(uuid.uuid4())
    await conn.execute(
        """INSERT INTO agent_events
             (event_id, agent_name, action, tool_name, entity, status,
              correlation_id, input_payload, output_payload, cost_cents)
           VALUES ($1::UUID, $2, 'dissect', '_review_tick', '_dissect', 'success',
                   $3::UUID, $4::JSONB, $5::JSONB, 0)""",
        event_id, agent_name, correlation_id,
        json.dumps({"window": digest["window"]}),
        json.dumps(digest),
    )
    return event_id


async def _write_lesson(
    conn: asyncpg.Connection,
    agent_name: str,
    lesson: dict,
    source_event_id: str,
) -> None:
    """LOOP-05: upsert into agent_lessons. Overwrites the active row for
    (agent_name, lesson_name) — history is preserved via agent_events."""
    await conn.execute(
        """INSERT INTO agent_lessons
             (agent_name, lesson_name, description, evidence_refs,
              confidence, source_event_id)
           VALUES ($1, $2, $3, $4::JSONB, $5, $6::UUID)
           ON CONFLICT (agent_name, lesson_name) DO UPDATE
             SET description     = EXCLUDED.description,
                 evidence_refs   = EXCLUDED.evidence_refs,
                 confidence      = EXCLUDED.confidence,
                 source_event_id = EXCLUDED.source_event_id""",
        agent_name,
        lesson["lesson_name"],
        lesson["narrative"],
        json.dumps([lesson["digest_excerpt"]]),
        0.95,                          # bootstrap confidence
        source_event_id,
    )


async def _write_improve_event(
    conn: asyncpg.Connection,
    agent_name: str,
    correlation_id: str,
    parent_event_id: str,
    lesson: dict,
    gate_passed: bool,
    gate_reason: str,
) -> None:
    status = "success" if gate_passed else "improve_rejected"
    await conn.execute(
        """INSERT INTO agent_events
             (agent_name, action, tool_name, entity, status,
              correlation_id, parent_event_id,
              input_payload, output_payload, cost_cents)
           VALUES ($1, 'improve', '_review_tick', '_improve', $2,
                   $3::UUID, $4::UUID, $5::JSONB, $6::JSONB, 0)""",
        agent_name, status, correlation_id, parent_event_id,
        json.dumps({"lesson_name": lesson["lesson_name"]}),
        json.dumps({"gate_reason": gate_reason, "lesson": lesson}),
    )


async def run_review_tick(agent_name: str) -> ReviewTickResult:
    """One LOOP-04→07 pass for `agent_name`. Best-effort: never raises."""
    import time
    from fee_crawler.agent_base.adversarial_gate import run_gate

    t0 = time.time()
    result = ReviewTickResult(agent_name=agent_name)
    correlation_id = str(uuid.uuid4())

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        log.warning("review_tick: DATABASE_URL missing; skipping")
        result.duration_s = time.time() - t0
        return result

    conn = await asyncpg.connect(db_url)
    try:
        # LOOP-04: dissect
        digest = await _dissect(conn, agent_name)
        result.events_seen = digest["events_count"]
        dissect_event_id = await _write_dissect_event(
            conn, agent_name, correlation_id, digest,
        )

        # LOOP-05: understand
        lesson = _derive_lesson(digest)
        result.lesson_name = lesson["lesson_name"]

        # LOOP-07: adversarial gate
        verdict = await run_gate(
            agent_name=agent_name,
            lesson=lesson,
            canary_corpus_path=canary_path_for(agent_name),
            canary_runner_fn=_bootstrap_canary_runner,
            corpus_loader=_load_corpus,
            agent_runner=_noop_agent_runner,
            correlation_id=correlation_id,
        )
        result.gate_passed = verdict.passed
        result.gate_reason = verdict.reason

        # LOOP-06: commit on pass
        if verdict.passed:
            await _write_lesson(conn, agent_name, lesson, dissect_event_id)
            result.lesson_committed = True

        # Audit the improve decision (success or improve_rejected)
        await _write_improve_event(
            conn, agent_name, correlation_id, dissect_event_id,
            lesson, verdict.passed, verdict.reason,
        )

        return result
    except Exception as exc:
        log.exception("review_tick failed for %s: %s", agent_name, exc)
        return result
    finally:
        await conn.close()
        result.duration_s = time.time() - t0
