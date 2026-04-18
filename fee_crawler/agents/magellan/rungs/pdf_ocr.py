"""Rung 2 — fetch URL; if PDF with no extractable text, OCR via tesseract."""
from __future__ import annotations

import time

import httpx

from fee_crawler.agents.magellan.rungs._base import Rung, RungResult, _Target, _Context


class PdfOcrRung:
    name = "pdf_ocr"

    async def run(self, target: _Target, context: _Context) -> RungResult:
        t0 = time.time()
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.get(target.fee_schedule_url)
            ctype = (resp.headers.get("content-type") or "").lower()
            if "pdf" not in ctype and not target.fee_schedule_url.lower().endswith(".pdf"):
                return RungResult(
                    http_status=resp.status_code,
                    error="not a pdf — rung skipped",
                    duration_s=time.time() - t0,
                )

            text = await _pdf_to_text(resp.content)
            if not text.strip():
                text = await _ocr_pdf(resp.content)

            try:
                from fee_crawler.pipeline.extract_llm import extract_fees_from_text
                fees = await extract_fees_from_text(text) if text else []
            except Exception:
                fees = []

            return RungResult(
                fees=fees,
                text=text[:10_000],
                http_status=resp.status_code,
                duration_s=time.time() - t0,
            )
        except Exception as e:
            return RungResult(error=str(e), duration_s=time.time() - t0)


async def _pdf_to_text(blob: bytes) -> str:
    """Primary: pdfplumber text extraction (fast, non-scanned PDFs)."""
    try:
        import pdfplumber, io
        out: list[str] = []
        with pdfplumber.open(io.BytesIO(blob)) as pdf:
            for page in pdf.pages:
                out.append(page.extract_text() or "")
        return "\n".join(out)
    except Exception:
        return ""


async def _ocr_pdf(blob: bytes) -> str:
    """Fallback: pdf2image + pytesseract (slower, handles scanned pages)."""
    try:
        import io
        from pdf2image import convert_from_bytes
        import pytesseract
        images = convert_from_bytes(blob, dpi=200)
        return "\n".join(pytesseract.image_to_string(img) for img in images)
    except Exception as e:
        return f"ocr_error: {e}"
