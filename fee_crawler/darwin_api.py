"""Darwin sidecar — FastAPI app exposed as a Modal web endpoint.

Three endpoints:
- POST /darwin/classify-batch   (SSE stream)
- GET  /darwin/status
- POST /darwin/reset

No in-app auth. Next.js server action in front of this endpoint enforces
admin role before calling. Sidecar is deployed inside Modal's private
network; do not expose publicly without adding auth first.
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

from fee_crawler.agents.darwin import classify_batch
from fee_crawler.agents.darwin.config import DEFAULT, DarwinConfig

log = logging.getLogger(__name__)

app = FastAPI(title="darwin")


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


@app.post("/darwin/classify-batch")
async def classify_batch_endpoint(req: BatchRequest) -> StreamingResponse:
    async def stream() -> AsyncIterator[str]:
        queue: asyncio.Queue[Optional[dict]] = asyncio.Queue()

        async def on_event(ev: dict):
            await queue.put(ev)

        async def runner():
            conn = await _get_conn()
            try:
                await classify_batch(conn, req.size, config=DEFAULT, on_event=on_event)
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


@app.get("/darwin/status")
async def status_endpoint():
    return await _collect_status()


@app.post("/darwin/reset")
async def reset_endpoint(req: ResetRequest):
    return await _reset_circuit(req.actor)


async def _collect_status() -> dict:
    conn = await _get_conn()
    try:
        pending = await conn.fetchval(
            "SELECT COUNT(*) FROM fees_raw fr LEFT JOIN fees_verified fv "
            "ON fv.fee_raw_id = fr.fee_raw_id WHERE fv.fee_verified_id IS NULL"
        )
        today_promoted = await conn.fetchval(
            "SELECT COUNT(*) FROM fees_verified WHERE created_at >= CURRENT_DATE"
        ) or 0
        budget_row = await conn.fetchrow(
            "SELECT spent_cents, limit_cents, halted_at, halted_reason "
            "FROM agent_budgets WHERE agent_name='darwin' AND budget_window='per_batch'"
        )
        halted = bool(budget_row and budget_row["halted_at"])
        return {
            "pending": int(pending or 0),
            "today_promoted": int(today_promoted),
            "today_cost_usd": (int(budget_row["spent_cents"]) / 100.0) if budget_row else 0.0,
            "circuit": {
                "halted": halted,
                "reason": (budget_row["halted_reason"] if halted else None),
            },
            "recent_run_avg_tokens_per_row": None,
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
                "WHERE agent_name='darwin' AND budget_window='per_batch'"
            )
            await conn.execute(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, entity_id, status,
                      reasoning_hash, input_payload)
                   VALUES ($1, 'update', 'darwin_reset', 'agent_budgets', 'darwin',
                           'success', $2, $3::JSONB)""",
                f"admin_{actor}", b"\x00" * 32, json.dumps({"actor": actor}),
            )
        return {"ok": True}
    finally:
        await conn.close()
