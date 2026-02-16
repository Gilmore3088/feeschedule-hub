"""Extract text and tables from PDF fee schedules using pdfplumber.

Strategy:
1. Try table extraction (structured data)
2. Fall back to full page text extraction
3. Combine both for maximum coverage
"""

import io

import pdfplumber


def extract_text_from_pdf(content: bytes) -> str:
    """Extract all text from a PDF document.

    Combines table extraction with full text extraction to capture
    both structured tables and surrounding context.

    Returns the extracted text as a single string.
    """
    parts: list[str] = []

    with pdfplumber.open(io.BytesIO(content)) as pdf:
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

    return "\n\n".join(parts)


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
