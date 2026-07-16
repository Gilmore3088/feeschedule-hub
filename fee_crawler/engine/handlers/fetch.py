"""fetch handler — URL -> content-addressed document, with the change-gate.

Job payload: {"url": str}. Entity: "target:<crawl_target_id>".

Flow (plan §5, §6.1):
  1. read institution_hints.render_mode to skip the escalation ladder if known
  2. fetch (http -> browser escalation inside the Fetcher)
  3. dead URL -> enqueue a rescue (magellan) job, bump consecutive_failures
  4. store raw bytes content-addressed in R2
  5. record_document: if normalized content unchanged -> STOP (no read job)
  6. changed -> enqueue a `read` job and reset the target's failure streak
"""

from __future__ import annotations

import asyncpg

from ..adapters import Fetcher, ObjectStore
from ..documents import record_document
from ..worker import EnqueueSpec, HandlerResult, PermanentError, RetryableError


class Magellan:
    queue = "fetch"

    def __init__(self, fetcher: Fetcher, store: ObjectStore):
        self._fetcher = fetcher
        self._store = store

    async def handle(self, pool: asyncpg.Pool, job: asyncpg.Record) -> HandlerResult:
        payload = job["payload"] or {}
        url = payload.get("url")
        entity = job["entity_id"]
        if not url or not entity.startswith("target:"):
            raise PermanentError(f"fetch job missing url/target: {entity} {payload!r}")
        target_id = int(entity.split(":", 1)[1])
        state = job["state_code"]
        run_id = job["run_id"]

        prefer = await _hint_render_mode(pool, target_id)

        outcome = await self._fetcher.fetch(url, prefer_render=prefer)

        if outcome.dead:
            await _bump_failure(pool, target_id)
            return HandlerResult(
                next_jobs=[
                    EnqueueSpec(
                        queue="fetch",  # magellan rescue is a fetch escalation rung
                        entity_id=entity,
                        payload={"url": url, "rescue": True},
                        state_code=state,
                        run_id=run_id,
                        priority=-1,  # after normal work
                    )
                ]
                if not payload.get("rescue")
                else [],  # already a rescue attempt -> give up this cycle
                result={"dead": True},
            )
        if not outcome.ok:
            raise RetryableError(outcome.error or "fetch failed")

        # Content-addressed raw store (idempotent).
        async with pool.acquire() as conn:
            cap = await record_document(
                conn,
                crawl_target_id=target_id,
                state_code=state or "??",
                source_url=url,
                text=outcome.text,
                raw_bytes=outcome.raw_bytes,
                http_status=outcome.http_status,
                render_mode=outcome.render_mode,
                doc_type=outcome.doc_type,
                run_id=run_id,
            )
        await self._store.put(cap.r2_key, outcome.raw_bytes)

        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE crawl_targets "
                "SET last_content_hash=$2, consecutive_failures=0 WHERE id=$1",
                target_id,
                cap.content_sha256,
            )

        if not cap.changed:
            # Change-gate hit: no read job. This is the throughput lever.
            return HandlerResult(result={"changed": False, "document_id": cap.document_id})

        return HandlerResult(
            next_jobs=[
                EnqueueSpec(
                    queue="read",
                    entity_id=f"doc:{cap.document_id}",
                    payload={"r2_key": cap.r2_key, "doc_type": outcome.doc_type},
                    state_code=state,
                    run_id=run_id,
                )
            ],
            result={"changed": True, "document_id": cap.document_id},
        )


async def _hint_render_mode(pool: asyncpg.Pool, target_id: int):
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT render_mode FROM institution_hints WHERE crawl_target_id=$1",
            target_id,
        )


async def _bump_failure(pool: asyncpg.Pool, target_id: int) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE crawl_targets SET consecutive_failures=consecutive_failures+1 "
            "WHERE id=$1",
            target_id,
        )

# Back-compat alias (persona rename).
FetchHandler = Magellan
