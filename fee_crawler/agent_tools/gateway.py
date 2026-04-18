"""Gateway: transactional wrapper for every agent-triggered write.

Contract (one call = one transaction):
  1. Validate agent_name is in agent_registry and is_active.
  2. Validate reasoning_hash is exactly 32 bytes (sha256).
  3. Check budget — INSERT budget_halt + raise BudgetExceeded on breach.
  4. Truncate oversized JSONB payloads per D-12 (64KB cap in 62a).
  5. INSERT agent_events with status='pending' — RETURNING event_id.
  6. For UPDATE/DELETE entity_id != None: snapshot before_value via SELECT FROM entity.
  7. YIELD (conn, event_id) to caller for target write.
  8. After yield returns: snapshot after_value, INSERT agent_auth_log,
     UPDATE agent_events status='success', account budget.
  9. On exception: transaction rolls back (context manager).

This is the only sanctioned write path in 62a. Plan 62A-13 MCP server is READ-only.
SEC-04 (Phase 68) adds JWT-based agent_name verification without changing call sites.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Optional

import asyncpg

from fee_crawler.agent_tools.budget import (
    BudgetExceeded,  # noqa: F401 — re-exported at package level
    account_budget,
    check_budget,
)
from fee_crawler.agent_tools.context import get_agent_context
from fee_crawler.agent_tools.pool import get_pool

log = logging.getLogger(__name__)

REASONING_INLINE_LIMIT = 8000  # bytes; payloads larger than this go to R2


async def _upload_reasoning_to_r2(key: str, prompt: str, output: str) -> None:
    """Upload reasoning payload to R2 as JSON. Wraps the sync boto3 client."""
    from fee_crawler.pipeline.r2_store import _get_client as _r2_client

    import os

    payload = json.dumps({"prompt": prompt, "output": output}).encode("utf-8")
    bucket = os.environ["R2_BUCKET"]

    def _sync():
        client = _r2_client()
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=payload,
            ContentType="application/json",
        )

    await asyncio.to_thread(_sync)


async def _fetch_reasoning_from_r2(key: str) -> dict:
    """Download reasoning payload from R2. Wraps the sync boto3 client."""
    from fee_crawler.pipeline.r2_store import _get_client as _r2_client

    import os

    bucket = os.environ["R2_BUCKET"]

    def _sync():
        client = _r2_client()
        resp = client.get_object(Bucket=bucket, Key=key)
        return json.loads(resp["Body"].read())

    return await asyncio.to_thread(_sync)

MAX_PAYLOAD_BYTES = 64 * 1024  # 64KB per D-12


def is_shadow_active() -> bool:
    """True when the current agent context has a non-empty ``shadow_run_id``.

    Phase 62b D-21: per-tool code branches on this flag to route business-table
    writes to ``shadow_outputs`` instead of the real entity. The gateway itself
    rewrites the agent_events row below to ``status='shadow_diff'`` and sets
    ``is_shadow=true`` for queryable auditability.
    """
    return bool(get_agent_context().get("shadow_run_id"))


class AgentUnknown(RuntimeError):
    """Raised when agent_name is not in agent_registry or is not is_active."""


def _truncate_payload(payload: Optional[dict]) -> Optional[dict]:
    """Enforce D-12 64KB cap; oversized -> pointer dict for 62b R2 compactor."""
    if payload is None:
        return None
    encoded = json.dumps(payload).encode("utf-8")
    if len(encoded) <= MAX_PAYLOAD_BYTES:
        return payload
    digest = hashlib.sha256(encoded).hexdigest()
    return {
        "oversize": True,
        "size": len(encoded),
        "sha256": digest,
        "r2_key": None,  # 62b compactor uploads and sets this
    }


def _dumps_or_none(payload: Optional[dict]) -> Optional[str]:
    """JSON-stringify for JSONB insert without relying on per-connection codec."""
    if payload is None:
        return None
    return json.dumps(payload, default=str)


async def _snapshot_row(
    conn: asyncpg.Connection,
    entity: str,
    entity_id: Any,
    pk_column: str = "id",
) -> Optional[dict]:
    """SELECT entity row for audit snapshot. Returns None if not found.

    Uses SELECT FOR UPDATE to take a row lock so the snapshot and the caller's
    UPDATE happen atomically. Returns the row as a plain dict (JSONB-safe).
    """
    if entity_id is None:
        return None
    # pk_column is not user-supplied at the tool layer — it comes from the registry.
    # entity is validated via the tool registry allow-list before reaching here.
    query = f'SELECT to_jsonb(t.*) AS row FROM "{entity}" t WHERE "{pk_column}" = $1 FOR UPDATE'
    try:
        row = await conn.fetchrow(query, entity_id)
    except (asyncpg.UndefinedTableError, asyncpg.UndefinedColumnError):
        return None
    if row is None:
        return None
    value = row["row"]
    # With the JSONB codec registered on the pool, value is already a dict; without
    # the codec (raw conn), value is a str — handle both.
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return dict(value) if value else None


@asynccontextmanager
async def with_agent_tool(
    *,
    tool_name: str,
    entity: str,
    entity_id: Any,
    action: str,                 # 'create' | 'read' | 'update' | 'delete' | 'upsert' | 'list'
    agent_name: str,
    reasoning_prompt: str,
    reasoning_output: str,
    input_payload: Optional[dict] = None,
    pk_column: str = "id",
    projected_cost_cents: int = 0,
    parent_event_id: Optional[str] = None,
    pool: Optional[asyncpg.Pool] = None,
) -> AsyncIterator[tuple[asyncpg.Connection, str]]:
    """Wrap a write-CRUD tool call in a single transaction with full audit.

    Yields (connection, event_id). Caller does target-table write INSIDE the
    `async with` block using the yielded connection.

    Args:
      pool: override the module-level pool (test fixtures pass per-schema pools).
    """
    # Validate reasoning_hash inputs up-front.
    reasoning_hash = hashlib.sha256(
        (reasoning_prompt + "\x1f" + reasoning_output).encode("utf-8")
    ).digest()
    if len(reasoning_hash) != 32:
        # sha256().digest() is always 32; this is a belt-and-suspenders assert.
        raise ValueError("reasoning_hash must be 32 bytes")

    ctx = get_agent_context()
    correlation_id = ctx.get("correlation_id") or str(uuid.uuid4())
    effective_parent_event_id = parent_event_id or ctx.get("parent_event_id")

    truncated_input = _truncate_payload(input_payload if input_payload is not None else {})

    if pool is None:
        pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.transaction():
            # 1. Validate agent identity.
            agent_row = await conn.fetchrow(
                "SELECT is_active FROM agent_registry WHERE agent_name = $1",
                agent_name,
            )
            if agent_row is None:
                raise AgentUnknown(
                    f"agent_name={agent_name!r} not in agent_registry"
                )
            if not agent_row["is_active"]:
                raise AgentUnknown(
                    f"agent_name={agent_name!r} is_active=false"
                )

            # 2. Check budget (writes budget_halt event + raises on breach).
            await check_budget(conn, agent_name, projected_cost_cents)

            # 2b. Determine inline vs R2 storage for reasoning text.
            # We need the event_id first (from RETURNING) to build the R2 key,
            # so we stage the values, insert with a placeholder event_id, then
            # handle R2 after. To keep the transaction intact we instead pre-generate
            # the event_id here and supply it as a literal in the INSERT.
            pre_event_id = str(uuid.uuid4())
            prompt_size = len(reasoning_prompt or "")
            output_size = len(reasoning_output or "")
            r2_key: Optional[str] = None
            inline_prompt: Optional[str] = reasoning_prompt
            inline_output: Optional[str] = reasoning_output

            if prompt_size + output_size > REASONING_INLINE_LIMIT:
                try:
                    r2_key = f"reasoning/{pre_event_id}.json"
                    await _upload_reasoning_to_r2(r2_key, reasoning_prompt or "", reasoning_output or "")
                    inline_prompt = None
                    inline_output = None
                except Exception as exc:
                    log.warning(
                        "R2 upload failed for event %s — falling back to truncated inline: %s",
                        pre_event_id, exc,
                    )
                    r2_key = None
                    half = REASONING_INLINE_LIMIT // 2
                    inline_prompt = (reasoning_prompt or "")[:half]
                    inline_output = (reasoning_output or "")[:half]

            # 3. Insert pending agent_events row.
            event_id = await conn.fetchval(
                """INSERT INTO agent_events
                     (event_id, agent_name, action, tool_name, entity, entity_id, status,
                      parent_event_id, correlation_id, reasoning_hash, input_payload,
                      reasoning_prompt_text, reasoning_output_text, reasoning_r2_key)
                   VALUES ($1::UUID, $2, $3, $4, $5, $6, 'pending',
                           $7::UUID, $8::UUID, $9, $10::JSONB,
                           $11, $12, $13)
                   RETURNING event_id""",
                pre_event_id,
                agent_name, action, tool_name, entity,
                str(entity_id) if entity_id is not None else None,
                effective_parent_event_id, correlation_id,
                reasoning_hash,
                _dumps_or_none(truncated_input),
                inline_prompt,
                inline_output,
                r2_key,
            )

            # 4. Snapshot before_value for UPDATE/DELETE.
            before_value: Optional[dict] = None
            if action in ("update", "delete") and entity_id is not None:
                before_value = await _snapshot_row(conn, entity, entity_id, pk_column)

            # 5. Yield to caller for the target-table write.
            yield conn, str(event_id)

            # 6. Snapshot after_value.
            after_value: Optional[dict] = None
            if action in ("create", "update", "upsert") and entity_id is not None:
                after_value = await _snapshot_row(conn, entity, entity_id, pk_column)
            elif action == "delete":
                after_value = None

            # 7. Insert agent_auth_log row.
            await conn.execute(
                """INSERT INTO agent_auth_log
                     (agent_event_id, agent_name, actor_type, tool_name,
                      entity, entity_id, before_value, after_value,
                      reasoning_hash, parent_event_id)
                   VALUES ($1::UUID, $2, 'agent', $3, $4, $5,
                           $6::JSONB, $7::JSONB, $8, $9::UUID)""",
                event_id, agent_name, tool_name, entity,
                str(entity_id) if entity_id is not None else None,
                _dumps_or_none(before_value), _dumps_or_none(after_value),
                reasoning_hash, effective_parent_event_id,
            )

            # 8. Update agent_events status + output payload + cost.
            cost_cents = int(ctx.get("cost_cents", 0))
            output_truncated = _truncate_payload(
                {"after_value": after_value} if after_value is not None else None
            )
            await conn.execute(
                """UPDATE agent_events
                      SET status = 'success',
                          cost_cents = $1,
                          output_payload = $2::JSONB
                    WHERE event_id = $3""",
                cost_cents, _dumps_or_none(output_truncated), event_id,
            )

            # 9. Account budget.
            if cost_cents > 0:
                await account_budget(conn, agent_name, cost_cents)

            # 10. Phase 62b D-21: shadow-mode override.
            # If the outer with_agent_context set shadow_run_id, rewrite the
            # agent_events row (status='shadow_diff', is_shadow=TRUE, embed the
            # shadow_run_id in output_payload) and DELETE the agent_auth_log row
            # we just wrote — no business-table write happened (per-tool code is
            # responsible for routing to shadow_outputs), so no auth-log entry
            # is warranted. See research §Mechanics 5 + Pitfall 5: suppression
            # must live at the gateway, not per-tool.
            shadow_rid = ctx.get("shadow_run_id")
            if shadow_rid:
                await conn.execute(
                    """UPDATE agent_events
                          SET status = 'shadow_diff',
                              is_shadow = TRUE,
                              output_payload = jsonb_set(
                                  COALESCE(output_payload, '{}'::jsonb),
                                  '{shadow_run_id}',
                                  to_jsonb($2::TEXT)
                              )
                        WHERE event_id = $1""",
                    event_id, shadow_rid,
                )
                await conn.execute(
                    "DELETE FROM agent_auth_log WHERE agent_event_id = $1",
                    event_id,
                )
