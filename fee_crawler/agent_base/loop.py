"""Default implementations of LOOP-04 / LOOP-05 / LOOP-06 steps.

Subclasses of ``AgentBase`` can override ``dissect`` / ``understand`` /
``improve`` entirely OR call these defaults to get baseline behaviour
(write-through to ``agent_events`` and ``agent_lessons``).

Deviation from research template: ``default_understand`` uses a plain
``ON CONFLICT (agent_name, lesson_name) DO UPDATE`` upsert. The research
template's two-step ``superseded_by = -1`` placeholder pattern would violate
the self-referencing FK (``superseded_by`` is a positive ``BIGINT``
referencing ``agent_lessons(lesson_id)``), so we overwrite the active row
in place. History is still recoverable via ``agent_events`` rows.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Optional

from fee_crawler.agent_tools.context import get_agent_context
from fee_crawler.agent_tools.pool import get_pool


# Tool/entity labels used when the default helpers write to agent_events.
# Leading underscore keeps them out of the tool registry and makes them easy
# to filter out of Hamilton / operator queries.
_TOOL_NAME = "_agent_base"
_DISSECT_ENTITY = "_dissect"
_IMPROVE_ENTITY = "_improve"


def _ctx_uuid(key: str) -> Optional[str]:
    ctx = get_agent_context() or {}
    value = ctx.get(key)
    return value if value else None


async def default_dissect(agent_name: str, events: list) -> list:
    """LOOP-04: write an ``agent_events`` ``dissect`` row summarizing inputs.

    Returns ``events`` unchanged so callers can chain the default with their
    own pattern extraction. The payload includes ``events_count`` plus up to
    the first 10 events (for audit/debug); larger payloads are capped by the
    JSONB 64KB convention used elsewhere (gateway truncation is only applied
    on tool-calls; the default helpers rely on caller discipline).
    """
    pool = await get_pool()
    correlation_id = _ctx_uuid("correlation_id")
    parent_event_id = _ctx_uuid("parent_event_id")
    truncated_preview = list(events or [])[:10]
    payload = {
        "events_count": len(events or []),
        "events": truncated_preview,
    }
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status,
                  correlation_id, parent_event_id, input_payload)
               VALUES ($1, 'dissect', $2, $3, 'success',
                       COALESCE($4::UUID, gen_random_uuid()),
                       $5::UUID, $6::JSONB)""",
            agent_name,
            _TOOL_NAME,
            _DISSECT_ENTITY,
            correlation_id,
            parent_event_id,
            json.dumps(payload),
        )
    return events or []


async def default_understand(agent_name: str, patterns: list) -> dict:
    """LOOP-05: write/update an ``agent_lessons`` row for the named lesson.

    Returns the lesson dict ``{name, description, evidence, lesson_id}``. If
    ``patterns`` is empty, returns ``{}`` without touching the database.

    Supersede semantics: because ``(agent_name, lesson_name)`` is UNIQUE, a
    second call with the same name updates ``description`` / ``evidence_refs``
    on the existing row. ``superseded_by`` stays NULL on the active row.
    Historical versions are preserved via the ``agent_events`` action='understand'
    trail (subclasses should write one) -- not in ``agent_lessons`` itself.
    """
    if not patterns:
        return {}

    first = patterns[0] if isinstance(patterns[0], dict) else {}
    lesson_name = first.get("name") or f"auto_{uuid.uuid4().hex[:8]}"
    description = first.get("description") or "auto-generated lesson from dissect patterns"
    evidence: list[Any] = [
        p.get("evidence_ref")
        for p in patterns
        if isinstance(p, dict) and p.get("evidence_ref")
    ]

    pool = await get_pool()
    async with pool.acquire() as conn:
        lesson_id = await conn.fetchval(
            """INSERT INTO agent_lessons
                 (agent_name, lesson_name, description, evidence_refs)
               VALUES ($1, $2, $3, $4::JSONB)
               ON CONFLICT (agent_name, lesson_name) DO UPDATE
                 SET description   = EXCLUDED.description,
                     evidence_refs = EXCLUDED.evidence_refs,
                     created_at    = NOW()
               RETURNING lesson_id""",
            agent_name,
            lesson_name,
            description,
            json.dumps(evidence),
        )

    return {
        "name": lesson_name,
        "description": description,
        "evidence": evidence,
        "lesson_id": lesson_id,
    }


async def default_improve_commit(agent_name: str, lesson: dict) -> None:
    """LOOP-06: commit an IMPROVE step with before/after snapshot payload.

    Plan 62B-07 wraps this in the adversarial canary gate; until then, this
    default commits directly so LOOP-06 contract tests can exercise the write
    path. ``lesson`` may include ``before`` / ``after`` / ``name`` keys; when
    ``after`` is absent, the full ``lesson`` is used as the post-state.
    """
    pool = await get_pool()
    correlation_id = _ctx_uuid("correlation_id")
    parent_event_id = _ctx_uuid("parent_event_id")
    payload = {
        "before": lesson.get("before") if isinstance(lesson, dict) else None,
        "after": (lesson.get("after") if isinstance(lesson, dict) and "after" in lesson else lesson),
        "lesson_name": lesson.get("name") if isinstance(lesson, dict) else None,
    }
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status,
                  correlation_id, parent_event_id, input_payload)
               VALUES ($1, 'improve', $2, $3, 'success',
                       COALESCE($4::UUID, gen_random_uuid()),
                       $5::UUID, $6::JSONB)""",
            agent_name,
            _TOOL_NAME,
            _IMPROVE_ENTITY,
            correlation_id,
            parent_event_id,
            json.dumps(payload),
        )
