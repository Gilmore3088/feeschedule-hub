"""read handler — document bytes -> clean text + fee-region span.

Job payload: {"r2_key": str, "doc_type": str}. Entity: "doc:<document_id>".

Deterministic with an escalation ladder (text-extract -> OCR). Records
`needs_ocr` on institution_hints so next cycle routes straight to OCR. Enqueues
an `extract` job carrying the fee-region text.
"""

from __future__ import annotations

import asyncpg

from ..adapters import ObjectStore, Reader
from ..worker import EnqueueSpec, HandlerResult, PermanentError


class ReadHandler:
    queue = "read"

    def __init__(self, store: ObjectStore, reader: Reader):
        self._store = store
        self._reader = reader

    async def handle(self, pool: asyncpg.Pool, job: asyncpg.Record) -> HandlerResult:
        payload = job["payload"] or {}
        r2_key = payload.get("r2_key")
        doc_type = payload.get("doc_type", "html")
        entity = job["entity_id"]
        if not r2_key or not entity.startswith("doc:"):
            raise PermanentError(f"read job missing r2_key/doc: {entity} {payload!r}")
        document_id = int(entity.split(":", 1)[1])

        raw = await self._store.get(r2_key)
        out = await self._reader.read(raw, doc_type, allow_ocr=True)

        if out.ocr_used:
            await _mark_needs_ocr(pool, document_id)

        region = out.text[out.region_start : out.region_end] if out.region_end else out.text
        if not region.strip():
            # No readable content even after OCR -> nothing to extract; not an error.
            return HandlerResult(result={"empty": True})

        return HandlerResult(
            next_jobs=[
                EnqueueSpec(
                    queue="extract",
                    entity_id=f"doc:{document_id}",
                    payload={
                        "region": region,
                        "region_start": out.region_start,
                        "doc_type": doc_type,
                    },
                    state_code=job["state_code"],
                    run_id=job["run_id"],
                )
            ],
            result={"chars": len(region), "ocr": out.ocr_used},
        )


async def _mark_needs_ocr(pool: asyncpg.Pool, document_id: int) -> None:
    async with pool.acquire() as conn:
        target_id = await conn.fetchval(
            "SELECT crawl_target_id FROM documents WHERE id=$1", document_id
        )
        if target_id is None:
            return
        await conn.execute(
            """
            INSERT INTO institution_hints (crawl_target_id, state_code, needs_ocr)
            SELECT id, state_code, TRUE FROM crawl_targets WHERE id=$1
            ON CONFLICT (crawl_target_id)
            DO UPDATE SET needs_ocr=TRUE, updated_at=NOW()
            """,
            target_id,
        )
