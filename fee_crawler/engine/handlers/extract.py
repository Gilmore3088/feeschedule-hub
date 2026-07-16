"""extract handler — text region -> fees_raw rows (with provenance).

Job payload: {"region": str, "region_start": int, "doc_type": str}.
Entity: "doc:<document_id>".

Uses the injected Extractor (Haiku batch, strict JSON schema). Writes each fee
to fees_raw with document_id + absolute char span + extractor_version, so every
fee traces to exact source text. Enqueues a `verify` job for the document.
"""

from __future__ import annotations

import json
import uuid

import asyncpg

from ..adapters import Extractor
from ..worker import EnqueueSpec, HandlerResult, PermanentError

# Deterministic sentinel namespace so a re-run of the same document produces the
# same agent_event_id and does not duplicate fees_raw rows.
_NS = uuid.UUID("5f3d1b64-0000-4000-8000-000000000001")


class Knox:
    queue = "extract"

    def __init__(self, extractor: Extractor):
        self._extractor = extractor

    async def handle(self, pool: asyncpg.Pool, job: asyncpg.Record) -> HandlerResult:
        payload = job["payload"] or {}
        region = payload.get("region")
        entity = job["entity_id"]
        if region is None or not entity.startswith("doc:"):
            raise PermanentError(f"extract job missing region/doc: {entity}")
        document_id = int(entity.split(":", 1)[1])
        base = int(payload.get("region_start") or 0)

        async with pool.acquire() as conn:
            doc = await conn.fetchrow(
                "SELECT crawl_target_id, source_url, r2_key FROM documents WHERE id=$1",
                document_id,
            )
        if doc is None:
            raise PermanentError(f"document {document_id} missing")
        target_id = int(doc["crawl_target_id"])

        aliases = await _aliases(pool, target_id)
        candidates = await self._extractor.extract(region, aliases=aliases)

        # Idempotent event id per (document, extractor_version).
        event_id = uuid.uuid5(_NS, f"{document_id}:{self._extractor.model_version}")

        written = 0
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Re-run safety: clear prior rows for this exact event.
                await conn.execute(
                    "DELETE FROM fees_raw WHERE agent_event_id=$1", event_id
                )
                for c in candidates:
                    if not c.fee_name:
                        continue
                    cs = base + c.char_start if c.char_start is not None else None
                    ce = base + c.char_end if c.char_end is not None else None
                    await conn.execute(
                        """
                        INSERT INTO fees_raw (
                            institution_id, document_id, source_url, document_r2_key,
                            extraction_confidence, agent_event_id, fee_name, amount,
                            frequency, conditions, char_start, char_end,
                            extractor_version, source, outlier_flags
                        )
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'knox','[]'::jsonb)
                        """,
                        target_id,
                        document_id,
                        doc["source_url"],
                        doc["r2_key"],
                        round(c.confidence, 4),
                        event_id,
                        c.fee_name,
                        c.amount,
                        c.frequency,
                        c.conditions,
                        cs,
                        ce,
                        self._extractor.model_version,
                    )
                    written += 1

        if written == 0:
            return HandlerResult(result={"fees": 0})

        return HandlerResult(
            next_jobs=[
                EnqueueSpec(
                    queue="verify",
                    entity_id=f"doc:{document_id}",
                    payload={"event_id": str(event_id)},
                    state_code=job["state_code"],
                    run_id=job["run_id"],
                )
            ],
            result={"fees": written},
        )


async def _aliases(pool: asyncpg.Pool, target_id: int) -> dict:
    async with pool.acquire() as conn:
        raw = await conn.fetchval(
            "SELECT fee_name_aliases FROM institution_hints WHERE crawl_target_id=$1",
            target_id,
        )
    if not raw:
        return {}
    return raw if isinstance(raw, dict) else json.loads(raw)

# Back-compat alias (persona rename).
ExtractHandler = Knox
