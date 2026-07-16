"""Adapter interfaces + data shapes for capability workers.

Handlers depend on these protocols, not on concrete network/LLM/R2 code, so the
handler logic (change-gate, chaining, error classification, DB writes) is
unit-testable with fakes. Real adapters (Playwright fetcher, pdfplumber/OCR
reader, Anthropic batch extractor, R2 object store) implement the same
protocols and wrap the existing modules; they live in engine/adapters_impl.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Protocol


# --- fetch -----------------------------------------------------------------

@dataclass
class FetchOutcome:
    ok: bool
    dead: bool = False               # URL is gone (hard 404 etc.) -> rescue/fail
    raw_bytes: bytes = b""
    text: str = ""
    http_status: Optional[int] = None
    render_mode: str = "http"        # http | browser
    doc_type: str = "html"           # pdf | html | js
    error: str = ""


class Fetcher(Protocol):
    async def fetch(self, url: str, *, prefer_render: Optional[str] = None) -> FetchOutcome:
        """Fetch a URL, escalating http -> browser as needed. `prefer_render`
        (from institution_hints) lets the caller skip straight to browser."""
        ...


class ObjectStore(Protocol):
    async def put(self, key: str, data: bytes) -> None:
        """Content-addressed put. Idempotent: putting the same key twice is a no-op."""
        ...

    async def get(self, key: str) -> bytes:
        ...


# --- read ------------------------------------------------------------------

@dataclass
class ReadOutcome:
    text: str
    region_start: int = 0            # char offset of the fee-relevant region
    region_end: int = 0
    needs_ocr: bool = False          # true if text extraction was empty
    ocr_used: bool = False


class Reader(Protocol):
    async def read(self, raw_bytes: bytes, doc_type: str, *, allow_ocr: bool = True) -> ReadOutcome:
        """Bytes -> clean text + fee-region span, escalating text-extract -> OCR."""
        ...


# --- extract ---------------------------------------------------------------

@dataclass
class FeeCandidate:
    fee_name: str
    amount: Optional[float]
    frequency: Optional[str]
    conditions: Optional[str]
    confidence: float
    char_start: Optional[int] = None
    char_end: Optional[int] = None


class Extractor(Protocol):
    model_version: str

    async def extract(
        self, text: str, *, aliases: Optional[dict[str, str]] = None
    ) -> list[FeeCandidate]:
        """Structured fee extraction from a text region (strict schema, batch)."""
        ...


# --- verify ----------------------------------------------------------------

@dataclass
class VerifyDecision:
    promote: bool
    canonical_key: Optional[str]
    flags: list[str] = field(default_factory=list)


class Classifier(Protocol):
    async def classify(self, fee: dict[str, Any]) -> Optional[str]:
        """Assign a canonical_fee_key (Darwin's job). None if unclassifiable."""
        ...


class Promoter(Protocol):
    async def promote(self, conn: asyncpg.Connection, raw_fee: dict[str, Any], canonical_key: str) -> None:
        """Promote a clean, classified raw fee into fees_verified."""
        ...

    async def flag(self, conn: asyncpg.Connection, raw_fee: dict[str, Any], flags: list[str]) -> None:
        """Mark a raw fee as flagged (stays in fees_raw for human/Knox review)."""
        ...
