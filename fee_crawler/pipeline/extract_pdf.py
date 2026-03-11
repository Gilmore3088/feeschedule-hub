"""Extract text and tables from PDF fee schedules using pdfplumber.

Strategy:
1. Try table extraction (structured data)
2. Fall back to full page text extraction
3. Combine both for maximum coverage
4. OCR fallback for scanned/image PDFs when pdfplumber returns insufficient text
"""

import io
import logging
import subprocess
import tempfile
from pathlib import Path

import pdfplumber

logger = logging.getLogger(__name__)

# OCR constraints
_OCR_MAX_PAGES = 10
_OCR_REJECT_PAGES = 20
_OCR_MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
_OCR_PAGE_TIMEOUT = 30  # seconds per page
_OCR_TOTAL_TIMEOUT = 120  # seconds total
_OCR_MIN_TEXT_THRESHOLD = 50  # chars — below this, try OCR


def _ocr_available() -> bool:
    """Check if tesseract and pdftoppm are installed."""
    try:
        subprocess.run(
            ["tesseract", "--version"],
            capture_output=True, timeout=5,
        )
        subprocess.run(
            ["pdftoppm", "-v"],
            capture_output=True, timeout=5,
        )
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _extract_with_ocr(content: bytes) -> str:
    """Extract text from a scanned PDF using pdftoppm + tesseract.

    Converts PDF pages to images at 300 DPI, then runs OCR.
    """
    if len(content) > _OCR_MAX_FILE_SIZE:
        logger.warning("PDF too large for OCR: %d bytes", len(content))
        return ""

    # Check page count before committing to OCR
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            page_count = len(pdf.pages)
    except Exception:
        return ""

    if page_count > _OCR_REJECT_PAGES:
        logger.warning("PDF has %d pages, exceeds OCR limit of %d", page_count, _OCR_REJECT_PAGES)
        return ""

    pages_to_process = min(page_count, _OCR_MAX_PAGES)
    parts: list[str] = []

    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = Path(tmpdir) / "input.pdf"
        pdf_path.write_bytes(content)

        # Convert pages to images with pdftoppm
        try:
            subprocess.run(
                [
                    "pdftoppm", "-r", "300", "-png",
                    "-l", str(pages_to_process),
                    str(pdf_path), str(Path(tmpdir) / "page"),
                ],
                capture_output=True,
                timeout=_OCR_TOTAL_TIMEOUT,
                check=True,
            )
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError) as e:
            logger.warning("pdftoppm failed: %s", e)
            return ""

        # OCR each page image
        image_files = sorted(Path(tmpdir).glob("page-*.png"))
        for i, img_path in enumerate(image_files):
            try:
                result = subprocess.run(
                    ["tesseract", str(img_path), "stdout", "--psm", "6"],
                    capture_output=True,
                    text=True,
                    timeout=_OCR_PAGE_TIMEOUT,
                )
                text = result.stdout.strip()
                if text:
                    parts.append(f"--- Page {i + 1} (OCR) ---\n{text}")
            except (subprocess.TimeoutExpired, FileNotFoundError) as e:
                logger.warning("Tesseract failed on page %d: %s", i + 1, e)
                continue

    return "\n\n".join(parts)


class PDFProtectedError(Exception):
    """Raised when a PDF is password-protected and cannot be opened."""


def extract_text_from_pdf(content: bytes) -> str:
    """Extract all text from a PDF document.

    Combines table extraction with full text extraction to capture
    both structured tables and surrounding context.

    Falls back to OCR (tesseract) if pdfplumber returns insufficient text.

    Raises PDFProtectedError for password-protected PDFs.

    Returns the extracted text as a single string.
    """
    parts: list[str] = []

    try:
        pdf_file = pdfplumber.open(io.BytesIO(content))
    except Exception as e:
        err_msg = str(e).lower()
        if "password" in err_msg or "encrypted" in err_msg or "decrypt" in err_msg:
            raise PDFProtectedError(f"PDF is password-protected: {e}") from e
        raise

    with pdf_file as pdf:
        for i, page in enumerate(pdf.pages):
            page_parts: list[str] = []

            # Try table extraction first
            tables = page.extract_tables()
            if tables:
                for table in tables:
                    rows = []
                    for row in table:
                        # Clean cells: replace None with empty string
                        cells = [str(cell).strip() if cell else "" for cell in row]
                        rows.append(" | ".join(cells))
                    page_parts.append("\n".join(rows))

            # Also extract full page text for context outside tables
            text = page.extract_text()
            if text and text.strip():
                page_parts.append(text.strip())

            if page_parts:
                parts.append(f"--- Page {i + 1} ---\n" + "\n\n".join(page_parts))

    result_text = "\n\n".join(parts)

    # OCR fallback: if pdfplumber returned too little text, try OCR
    if len(result_text.strip()) < _OCR_MIN_TEXT_THRESHOLD:
        if _ocr_available():
            logger.info("pdfplumber returned %d chars, attempting OCR fallback", len(result_text.strip()))
            ocr_text = _extract_with_ocr(content)
            if len(ocr_text.strip()) > len(result_text.strip()):
                return ocr_text

    return result_text


def extract_tables_from_pdf(content: bytes) -> list[list[list[str]]]:
    """Extract just the tables from a PDF.

    Returns a list of tables, where each table is a list of rows,
    and each row is a list of cell values.
    """
    all_tables: list[list[list[str]]] = []

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                cleaned = []
                for row in table:
                    cells = [str(cell).strip() if cell else "" for cell in row]
                    cleaned.append(cells)
                if cleaned:
                    all_tables.append(cleaned)

    return all_tables


def get_pdf_page_count(content: bytes) -> int:
    """Return the number of pages in a PDF."""
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        return len(pdf.pages)
