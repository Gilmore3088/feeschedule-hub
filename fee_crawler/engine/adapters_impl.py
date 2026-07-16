"""Concrete adapters wrapping the existing crawler code.

These are thin integration glue over modules that already exist (r2_store,
playwright_fetcher, extract_llm, pdfplumber/bs4/tesseract, Darwin classifier).
They implement the protocols in adapters.py so the handler logic — which is
unit-tested with fakes — runs unchanged in production.

Heavy dependencies are imported lazily so importing this module (e.g. in a
worker entrypoint) doesn't require playwright/anthropic to be installed until
the adapter is actually used.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any, Optional

from .adapters import (
    FeeCandidate,
    FetchOutcome,
    ReadOutcome,
)

# Heuristic that locates the fee-relevant region so the extractor sees a small
# window, not a 40-page booklet (cuts input tokens ~5x).
_FEE_REGION = re.compile(
    r"(fee\s+schedule|schedule\s+of\s+fees|service\s+charges|truth[\s-]in[\s-]savings"
    r"|account\s+disclosures?)",
    re.IGNORECASE,
)
_HARD_404 = frozenset({404, 410})


def _fee_region_span(text: str, window: int = 12000) -> tuple[int, int]:
    """Return (start, end) of the fee-relevant slice, or the whole text if no
    marker is found (bounded to `window` chars around the first hit)."""
    m = _FEE_REGION.search(text)
    if not m or len(text) <= window:
        return 0, len(text)
    start = max(0, m.start() - 500)
    return start, min(len(text), start + window)


class R2ObjectStore:
    """Content-addressed object store over pipeline/r2_store.py (S3/R2)."""

    async def put(self, key: str, data: bytes) -> None:
        from ..pipeline import r2_store

        # r2_store.upload_document is sync; run off the event loop.
        await asyncio.to_thread(_r2_put_if_absent, r2_store, key, data)

    async def get(self, key: str) -> bytes:
        from ..pipeline import r2_store

        return await asyncio.to_thread(r2_store.download_document, key)


def _r2_put_if_absent(r2_store: Any, key: str, data: bytes) -> None:
    if r2_store.document_exists(key):
        return
    # upload_document is content-addressed internally; pass the explicit key.
    r2_store.upload_document(data, key=key)


class HttpBrowserFetcher:
    """HTTP-first fetch with a Playwright browser escalation rung."""

    def __init__(self, timeout: int = 30):
        self._timeout = timeout

    async def fetch(self, url: str, *, prefer_render: Optional[str] = None) -> FetchOutcome:
        if prefer_render == "browser":
            return await self._browser(url)
        out = await self._http(url)
        if out.ok and out.raw_bytes and not _looks_empty(out.text):
            return out
        if out.dead:
            return out
        # HTTP failed or empty -> escalate to browser.
        return await self._browser(url)

    async def _http(self, url: str) -> FetchOutcome:
        import httpx

        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=self._timeout) as c:
                r = await c.get(url)
        except Exception as exc:  # network -> retryable
            return FetchOutcome(ok=False, error=f"http error: {exc}")
        if r.status_code in _HARD_404:
            return FetchOutcome(ok=False, dead=True, http_status=r.status_code)
        if r.status_code >= 400:
            return FetchOutcome(ok=False, http_status=r.status_code, error=f"status {r.status_code}")
        ctype = r.headers.get("content-type", "")
        doc_type = "pdf" if "pdf" in ctype or url.lower().endswith(".pdf") else "html"
        text = "" if doc_type == "pdf" else r.text
        return FetchOutcome(
            ok=True, raw_bytes=r.content, text=text, http_status=r.status_code,
            render_mode="http", doc_type=doc_type,
        )

    async def _browser(self, url: str) -> FetchOutcome:
        from ..pipeline import playwright_fetcher

        if not playwright_fetcher.is_playwright_available():
            return FetchOutcome(ok=False, error="browser unavailable")
        try:
            res = await asyncio.to_thread(playwright_fetcher.fetch_with_browser, url, self._timeout)
        except Exception as exc:
            return FetchOutcome(ok=False, error=f"browser error: {exc}")
        content = res.get("content", b"") if isinstance(res, dict) else b""
        html = res.get("html", "") if isinstance(res, dict) else ""
        if not content and not html:
            return FetchOutcome(ok=False, error="browser empty")
        raw = content if content else html.encode("utf-8")
        return FetchOutcome(
            ok=True, raw_bytes=raw, text=html, http_status=200,
            render_mode="browser", doc_type="js",
        )


def _looks_empty(text: str) -> bool:
    return len(re.sub(r"\s+", "", text or "")) < 200


class DocumentReader:
    """pdf/html/js -> clean text + fee-region span, with OCR escalation."""

    async def read(self, raw_bytes: bytes, doc_type: str, *, allow_ocr: bool = True) -> ReadOutcome:
        text, ocr_used = await asyncio.to_thread(self._read_sync, raw_bytes, doc_type, allow_ocr)
        start, end = _fee_region_span(text)
        return ReadOutcome(text=text, region_start=start, region_end=end,
                           needs_ocr=ocr_used, ocr_used=ocr_used)

    def _read_sync(self, raw: bytes, doc_type: str, allow_ocr: bool) -> tuple[str, bool]:
        if doc_type == "pdf":
            text = _pdf_text(raw)
            if not text.strip() and allow_ocr:
                return _ocr_pdf(raw), True
            return text, False
        # html / js
        return _html_text(raw), False


def _pdf_text(raw: bytes) -> str:
    import io

    import pdfplumber

    out = []
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        for page in pdf.pages:
            out.append(page.extract_text() or "")
    return "\n".join(out)


def _ocr_pdf(raw: bytes) -> str:
    try:
        import io

        import pytesseract
        from pdf2image import convert_from_bytes

        pages = convert_from_bytes(raw)
        return "\n".join(pytesseract.image_to_string(p) for p in pages)
    except Exception:
        return ""


def _html_text(raw: bytes) -> str:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(raw, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    return soup.get_text("\n", strip=True)


class LLMExtractor:
    """Structured fee extraction via the existing extract_fees_with_llm.

    model_version is stamped on every fees_raw row for golden-set regression
    attribution.
    """

    def __init__(self, config: Any = None):
        from ..config import Config

        self._config = config or Config()
        self.model_version = getattr(getattr(self._config, "claude", None), "model", "unknown")

    async def extract(self, text: str, *, aliases: Optional[dict[str, str]] = None) -> list[FeeCandidate]:
        from ..pipeline.extract_llm import extract_fees_with_llm

        fees = await asyncio.to_thread(extract_fees_with_llm, text, self._config)
        out: list[FeeCandidate] = []
        for f in fees:
            name = getattr(f, "fee_name", None) or getattr(f, "name", None)
            if not name:
                continue
            out.append(
                FeeCandidate(
                    fee_name=name,
                    amount=getattr(f, "amount", None),
                    frequency=getattr(f, "frequency", None),
                    conditions=getattr(f, "conditions", None),
                    confidence=float(getattr(f, "extraction_confidence", getattr(f, "confidence", 0.0)) or 0.0),
                )
            )
        return out
