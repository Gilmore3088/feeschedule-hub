"""Magellan sidecar — FastAPI app deployed as a Modal web endpoint.

Endpoints:
- POST /magellan/rescue-batch  (SSE stream)
- GET  /magellan/status
- POST /magellan/reset
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import AsyncIterator, Optional

import asyncpg
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from fee_crawler.agents.magellan import rescue_batch
from fee_crawler.agents.magellan.config import DEFAULT

log = logging.getLogger(__name__)

app = FastAPI(title="magellan")


class BatchRequest(BaseModel):
    size: int = Field(gt=0, le=5000)


class ResetRequest(BaseModel):
    actor: str = Field(min_length=1, max_length=64)


async def _get_conn() -> asyncpg.Connection:
    return await asyncpg.connect(
        os.environ["DATABASE_URL"],
        statement_cache_size=0,  # required for pgbouncer transaction-mode pooler
    )


def _sse(event_type: str, payload: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"


@app.post("/magellan/rescue-batch")
async def rescue_batch_endpoint(req: BatchRequest) -> StreamingResponse:
    async def stream() -> AsyncIterator[str]:
        queue: asyncio.Queue[Optional[dict]] = asyncio.Queue()

        async def on_event(ev: dict):
            await queue.put(ev)

        async def runner():
            conn = await _get_conn()
            try:
                await rescue_batch(conn, req.size, config=DEFAULT, on_event=on_event)
            except Exception as e:
                await queue.put({"type": "error", "message": str(e)})
            finally:
                await queue.put(None)
                await conn.close()

        task = asyncio.create_task(runner())
        try:
            while True:
                ev = await queue.get()
                if ev is None:
                    break
                yield _sse(ev.get("type", "event"), ev)
        finally:
            await task

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.get("/magellan/status")
async def status_endpoint():
    return await _collect_status()


@app.post("/magellan/reset")
async def reset_endpoint(req: ResetRequest):
    return await _reset_circuit(req.actor)


async def _collect_status() -> dict:
    conn = await _get_conn()
    try:
        pending = await conn.fetchval(
            "SELECT COUNT(*) FROM crawl_targets WHERE fee_schedule_url IS NOT NULL "
            "AND fee_schedule_url != '' AND rescue_status IN ('pending','retry_after')"
        ) or 0
        rescued = await conn.fetchval(
            "SELECT COUNT(*) FROM crawl_targets WHERE rescue_status = 'rescued'"
        ) or 0
        dead = await conn.fetchval(
            "SELECT COUNT(*) FROM crawl_targets WHERE rescue_status = 'dead'"
        ) or 0
        needs_human = await conn.fetchval(
            "SELECT COUNT(*) FROM crawl_targets WHERE rescue_status = 'needs_human'"
        ) or 0
        retry_after = await conn.fetchval(
            "SELECT COUNT(*) FROM crawl_targets WHERE rescue_status = 'retry_after'"
        ) or 0
        budget = await conn.fetchrow(
            "SELECT spent_cents, halted_at, halted_reason FROM agent_budgets "
            "WHERE agent_name='magellan' AND budget_window='per_batch'"
        )
        halted = bool(budget and budget["halted_at"])
        return {
            "pending": int(pending),
            "rescued": int(rescued),
            "dead": int(dead),
            "needs_human": int(needs_human),
            "retry_after": int(retry_after),
            "today_cost_usd": (int(budget["spent_cents"]) / 100.0) if budget else 0.0,
            "circuit": {
                "halted": halted,
                "reason": (budget["halted_reason"] if halted else None),
            },
        }
    finally:
        await conn.close()


async def _reset_circuit(actor: str) -> dict:
    """Clear halt state. Logged via agent_events."""
    conn = await _get_conn()
    try:
        async with conn.transaction():
            await conn.execute(
                "UPDATE agent_budgets SET halted_at = NULL, halted_reason = NULL "
                "WHERE agent_name='magellan' AND budget_window='per_batch'"
            )
            await conn.execute(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, entity_id, status,
                      reasoning_hash, input_payload)
                   VALUES ($1, 'update', 'magellan_reset', 'agent_budgets', 'magellan',
                           'success', $2, $3::JSONB)""",
                f"admin_{actor}", b"\x00" * 32, json.dumps({"actor": actor}),
            )
        return {"ok": True}
    finally:
        await conn.close()
