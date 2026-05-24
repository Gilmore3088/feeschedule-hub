"""Extractor agent: pull discovered URLs, extract fees, write to fees_raw.

Replaces the legacy `fee_crawler crawl` + `state_agent._write_fees` path,
which inserts into the frozen `extracted_fees` table. Every fee write now
goes through `create_fee_raw`, which the agent gateway wraps in audit
(`agent_events` + `agent_auth_log`) and budget enforcement.

Same structural pattern as `agents.magellan.orchestrator` so reviewers can
follow one mental model.

Reusable building blocks (still sync, called via asyncio.to_thread):
  - pipeline.download.download_document
  - pipeline.extract_pdf.extract_text_from_pdf
  - pipeline.extract_html.extract_text_from_html
  - pipeline.extract_llm.extract_fees_with_llm
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

import asyncpg

from fee_crawler.agent_tools.tools_fees import create_fee_raw
from fee_crawler.agent_tools.schemas.fees import CreateFeeRawInput

from .config import DEFAULT, ExtractorConfig

# Heavy pipeline imports (pdfplumber / anthropic / requests stacks) happen
# lazily inside _extract_target so this module is importable in slim
# environments (unit tests, MCP read-only contexts).

log = logging.getLogger(__name__)

AGENT_NAME = "extractor"


@dataclass
class _Target:
    id: int
    fee_schedule_url: str
    institution_name: str
    charter_type: str
    document_type: Optional[str]
    last_content_hash: Optional[str]


@dataclass
class BatchResult:
    processed: int = 0
    extracted: int = 0
    fees_written: int = 0
    unchanged: int = 0
    failed: int = 0
    cost_usd: float = 0.0
    duration_s: float = 0.0

    def to_dict(self) -> dict:
        return {
            "processed": self.processed,
            "extracted": self.extracted,
            "fees_written": self.fees_written,
            "unchanged": self.unchanged,
            "failed": self.failed,
            "cost_usd": round(self.cost_usd, 4),
            "duration_s": round(self.duration_s, 2),
        }


BatchEvent = dict


# ---------------------------------------------------------------------------
# Candidate selection
# ---------------------------------------------------------------------------

async def select_candidates(
    conn: asyncpg.Connection,
    limit: int,
    *,
    config: ExtractorConfig = DEFAULT,
) -> list[_Target]:
    """Pick targets that have a fee URL but no recent successful extraction.

    A target qualifies when:
      - fee_schedule_url is set, and
      - either it has never been extracted, or its last extraction is older
        than `recrawl_after_days`, and
      - if document_type is restricted (pdf / html), it matches.

    `FOR UPDATE … SKIP LOCKED` lets two workers run safely in parallel.
    """
    where = [
        "ct.fee_schedule_url IS NOT NULL",
        "ct.fee_schedule_url != ''",
    ]
    params: list[Any] = [limit, config.recrawl_after_days]
    if config.document_type:
        where.append(f"ct.document_type = ${len(params) + 1}")
        params.append(config.document_type)
    if not config.include_failing:
        where.append("COALESCE(ct.consecutive_failures, 0) < 3")

    where_sql = " AND ".join(where)

    rows = await conn.fetch(
        f"""
        SELECT ct.id,
               ct.fee_schedule_url,
               ct.institution_name,
               ct.charter_type,
               ct.document_type,
               ct.last_content_hash
          FROM crawl_targets ct
          LEFT JOIN LATERAL (
            SELECT MAX(created_at) AS latest
              FROM fees_raw
             WHERE institution_id = ct.id
          ) recent ON TRUE
         WHERE {where_sql}
           AND (recent.latest IS NULL
                OR recent.latest < NOW() - ($2 || ' days')::interval)
         ORDER BY recent.latest NULLS FIRST, ct.id
         LIMIT $1
         FOR UPDATE OF ct SKIP LOCKED
        """,
        *params,
    )
    return [
        _Target(
            id=r["id"],
            fee_schedule_url=r["fee_schedule_url"],
            institution_name=r["institution_name"],
            charter_type=r["charter_type"],
            document_type=r["document_type"],
            last_content_hash=r["last_content_hash"],
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Per-target processing
# ---------------------------------------------------------------------------

async def _extract_target(target: _Target, app_config) -> dict:
    """Download + extract a single target. Returns a result dict.

    Synchronous pipeline pieces are dispatched to a thread so we don't block
    the event loop. Errors are caught and surfaced as `result["error"]`
    rather than raising — the caller decides how to record them.
    """
    # Lazy imports: heavy deps stay out of module load.
    from fee_crawler.pipeline.download import download_document
    from fee_crawler.pipeline.extract_html import extract_text_from_html
    from fee_crawler.pipeline.extract_pdf import (
        PDFProtectedError,
        extract_text_from_pdf,
    )
    from fee_crawler.pipeline.extract_llm import extract_fees_with_llm

    out: dict = {
        "fees": [],
        "document_type": target.document_type,
        "content_hash": None,
        "unchanged": False,
        "error": None,
    }

    try:
        dl = await asyncio.to_thread(
            download_document,
            target.fee_schedule_url,
            target.id,
            app_config,
            last_hash=target.last_content_hash,
        )
    except Exception as e:
        out["error"] = f"download_exception: {e}"
        return out

    if not dl.get("success"):
        out["error"] = dl.get("error") or "download_failed"
        return out

    out["content_hash"] = dl.get("content_hash")
    if dl.get("unchanged"):
        out["unchanged"] = True
        return out

    content = dl.get("content") or b""
    content_type = (dl.get("content_type") or "").lower()
    doc_type = target.document_type
    if not doc_type:
        doc_type = "pdf" if "pdf" in content_type else "html"
    out["document_type"] = doc_type

    try:
        if doc_type == "pdf":
            text = await asyncio.to_thread(extract_text_from_pdf, content)
        else:
            text = await asyncio.to_thread(extract_text_from_html, content)
    except PDFProtectedError as e:
        out["error"] = f"pdf_protected: {e}"
        return out
    except Exception as e:
        out["error"] = f"text_extract_exception: {e}"
        return out

    if not text or not text.strip():
        out["error"] = "empty_text"
        return out

    try:
        extracted = await asyncio.to_thread(
            extract_fees_with_llm,
            text,
            app_config,
            institution_name=target.institution_name,
            charter_type=target.charter_type,
            document_type=doc_type,
        )
    except Exception as e:
        out["error"] = f"llm_exception: {e}"
        return out

    out["fees"] = [_fee_to_dict(f) for f in extracted]
    return out


def _fee_to_dict(fee: Any) -> dict:
    """ExtractedFee dataclass → plain dict suitable for create_fee_raw."""
    if isinstance(fee, dict):
        return fee
    return {
        "fee_name": getattr(fee, "fee_name", None),
        "amount": getattr(fee, "amount", None),
        "frequency": getattr(fee, "frequency", None),
        "conditions": getattr(fee, "conditions", None),
        "confidence": getattr(fee, "extraction_confidence", None) or getattr(fee, "confidence", None),
    }


async def _write_via_gateway(
    target: _Target,
    fees: list[dict],
    doc_type: str,
    content_hash: Optional[str],
) -> int:
    """Insert each fee through create_fee_raw. Returns count successfully written."""
    written = 0
    for fee in fees:
        name = (fee.get("fee_name") or "").strip()
        if not name:
            continue
        try:
            amount = fee.get("amount")
            amount_val = float(amount) if amount is not None else None
        except (TypeError, ValueError):
            amount_val = None

        confidence = fee.get("confidence")
        try:
            conf_val = float(confidence) if confidence is not None else None
        except (TypeError, ValueError):
            conf_val = None

        reasoning_output = json.dumps({
            "document_type": doc_type,
            "content_hash": content_hash,
            "raw": fee,
        })
        try:
            await create_fee_raw(
                inp=CreateFeeRawInput(
                    institution_id=target.id,
                    crawl_event_id=None,
                    document_r2_key=None,
                    source_url=target.fee_schedule_url,
                    extraction_confidence=conf_val,
                    fee_name=name,
                    amount=amount_val,
                    frequency=fee.get("frequency"),
                    conditions=fee.get("conditions"),
                    outlier_flags=[],
                ),
                agent_name=AGENT_NAME,
                reasoning_prompt=f"extractor:{doc_type}",
                reasoning_output=reasoning_output,
            )
            written += 1
        except Exception as e:
            log.warning("create_fee_raw failed for target=%s fee=%r: %s", target.id, name, e)
    return written


# ---------------------------------------------------------------------------
# Batch entry point
# ---------------------------------------------------------------------------

async def extract_batch(
    conn: asyncpg.Connection,
    size: int,
    *,
    config: ExtractorConfig = DEFAULT,
    on_event: Optional[Callable[[BatchEvent], Awaitable[None]]] = None,
) -> BatchResult:
    """Process up to `size` targets. Designed to be called from Modal crons.

    The Modal entry point picks `size` based on its slot timeout. Each target
    is independent — failures don't cascade. Budget enforcement happens at
    the gateway layer (per-tool-call), not here.
    """
    from fee_crawler.config import load_config

    t0 = time.time()
    result = BatchResult()
    app_config = load_config()

    async def emit(ev_type: str, **payload: Any) -> None:
        if on_event:
            await on_event({"type": ev_type, **payload})

    targets = await select_candidates(conn, size, config=config)
    result.processed = len(targets)
    await emit("candidates_selected", count=len(targets))

    if not targets:
        result.duration_s = time.time() - t0
        await emit("done", result=result.to_dict())
        return result

    for target in targets:
        await emit("target_start", target_id=target.id, url=target.fee_schedule_url)

        outcome = await _extract_target(target, app_config)

        if outcome["unchanged"]:
            result.unchanged += 1
            await emit("target_done", target_id=target.id, outcome="unchanged")
        elif outcome["error"]:
            result.failed += 1
            await emit(
                "target_done",
                target_id=target.id,
                outcome="failed",
                error=outcome["error"],
            )
        elif not outcome["fees"]:
            result.failed += 1
            await emit("target_done", target_id=target.id, outcome="no_fees")
        else:
            written = await _write_via_gateway(
                target,
                outcome["fees"],
                outcome["document_type"],
                outcome["content_hash"],
            )
            result.extracted += 1
            result.fees_written += written
            await emit(
                "target_done",
                target_id=target.id,
                outcome="extracted",
                fees=written,
            )

        if config.inter_target_delay_seconds > 0:
            await asyncio.sleep(config.inter_target_delay_seconds)

    result.duration_s = time.time() - t0
    await emit("done", result=result.to_dict())
    return result
