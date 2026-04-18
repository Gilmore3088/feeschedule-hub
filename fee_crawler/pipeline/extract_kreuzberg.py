"""Kreuzberg-backed extraction wrapper.

Drop-in replacement for the pdfplumber + shell-tesseract pipeline in
``extract_pdf.py`` and the ad-hoc HTML extractors in ``extract_html.py``.
Kreuzberg bundles 91 format extractors + a native Tesseract binding under
one Rust-core library, so we can collapse three custom extraction paths
into one.

Enabled by ``USE_KREUZBERG=1`` in the env. Default-off so the migration is
reversible mid-flight. When off, callers fall back to the legacy extractors.

API contract intentionally mirrors ``extract_text_from_pdf`` so callers can
swap the import without threading changes.
"""

from __future__ import annotations

import io
import logging
import os
from typing import Optional

from kreuzberg import (
    ExtractionConfig,
    ExtractionResult,
    extract_bytes_sync,
)

logger = logging.getLogger(__name__)


USE_KREUZBERG = os.environ.get("USE_KREUZBERG", "").lower() in ("1", "true", "yes")


class PDFProtectedError(Exception):
    """Raised when a PDF is password-protected and cannot be opened.

    Re-exported so callers that catch this from ``extract_pdf`` keep working
    when they swap the import.
    """


def _default_config() -> ExtractionConfig:
    """Default extraction config tuned for fee schedule documents.

    - Markdown output so downstream LLM prompts get structure-preserving text
      (tables rendered as markdown, not flattened).
    - Tesseract OCR is the default backend; Kreuzberg's native binding handles
      scanned/image PDFs automatically.
    """
    return ExtractionConfig(output_format="markdown")


def extract_text_from_bytes(
    content: bytes,
    *,
    mime_type: Optional[str] = None,
    config: Optional[ExtractionConfig] = None,
) -> str:
    """Extract text from a document given its raw bytes.

    Matches the legacy ``extract_text_from_pdf`` signature but accepts any
    Kreuzberg-supported MIME type (PDF, DOCX, XLSX, HTML, images, email, ...).

    Raises ``PDFProtectedError`` for password-protected PDFs so existing
    callers can keep their try/except structure.
    """
    cfg = config or _default_config()
    try:
        result: ExtractionResult = extract_bytes_sync(
            content, mime_type=mime_type, config=cfg
        )
    except Exception as exc:  # noqa: BLE001 — translating to domain error
        msg = str(exc).lower()
        if "password" in msg or "encrypted" in msg or "decrypt" in msg:
            raise PDFProtectedError(f"PDF is password-protected: {exc}") from exc
        raise

    return result.content or ""


def extract_text_from_pdf(content: bytes) -> str:
    """Legacy-named shim. Identical to ``extract_text_from_bytes`` with no mime hint."""
    return extract_text_from_bytes(content, mime_type="application/pdf")


def extract_tables_from_bytes(
    content: bytes,
    *,
    mime_type: Optional[str] = None,
) -> list[list[list[str]]]:
    """Extract tables as a list of tables, each a list of rows of cells.

    Same shape as ``extract_pdf.extract_tables_from_pdf`` so downstream table
    consumers (fee normalization, outlier detection) don't need to change.
    """
    cfg = _default_config()
    result = extract_bytes_sync(content, mime_type=mime_type, config=cfg)

    tables: list[list[list[str]]] = []
    for tbl in result.tables or []:
        rows: list[list[str]] = []
        # Kreuzberg tables expose .cells as list[list[Cell]] with .text attrs;
        # defend against both dict-shape (JSON) and object-shape returns.
        cell_rows = getattr(tbl, "cells", None) or []
        for row in cell_rows:
            rows.append([(getattr(c, "text", None) or str(c)).strip() for c in row])
        if rows:
            tables.append(rows)
    return tables


def is_available() -> bool:
    """Cheap probe so callers can log a clear warning if the library broke."""
    try:
        import kreuzberg  # noqa: F401
        return True
    except ImportError:
        return False
