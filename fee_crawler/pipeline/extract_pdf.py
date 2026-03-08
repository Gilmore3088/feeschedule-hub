"""Extract text and tables from PDF fee schedules using pdfplumber.

Multi-strategy extraction:
1. Try 3 different table extraction strategies per page
2. Score each result by quality (dollar amounts, fee keywords, structure)
3. Pick the best result per page
4. Fall back to raw text extraction if tables fail
"""

import io
import logging
import re

import pdfplumber

logger = logging.getLogger(__name__)

MAX_PAGES = 10
MIN_TEXT_LENGTH = 50

STRATEGIES = [
    # 1. Bordered tables (explicit lines/rules)
    {
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "snap_tolerance": 3,
    },
    # 2. Text-aligned (no borders, column alignment only -- common in CU fee schedules)
    {
        "vertical_strategy": "text",
        "horizontal_strategy": "text",
        "min_words_vertical": 2,
        "text_x_tolerance": 5,
        "text_y_tolerance": 3,
    },
    # 3. Mixed (vertical text, horizontal lines -- semi-bordered tables)
    {
        "vertical_strategy": "text",
        "horizontal_strategy": "lines",
        "snap_y_tolerance": 5,
        "intersection_x_tolerance": 15,
    },
]

_FEE_KEYWORDS = frozenset({
    "fee", "charge", "overdraft", "nsf", "wire", "atm",
    "maintenance", "statement", "deposit", "withdrawal",
    "checking", "savings", "transfer", "penalty",
})

_DOLLAR_PATTERN = re.compile(r"\$[\d,.]+")


def score_extraction(text: str) -> int:
    """Score extraction quality (0-100). Higher = more likely a real fee schedule."""
    if not text:
        return 0

    score = 0
    lines = [line.strip() for line in text.split("\n") if line.strip()]

    # Structure (up to 30 pts): tables produce rows
    score += min(len(lines), 30)

    # Dollar amounts (up to 30 pts): fee schedules have prices
    dollar_matches = _DOLLAR_PATTERN.findall(text)
    score += min(len(dollar_matches) * 3, 30)

    # Fee keywords (up to 20 pts)
    words = set(text.lower().split())
    keyword_hits = len(words & _FEE_KEYWORDS)
    score += min(keyword_hits * 4, 20)

    # Coverage (up to 10 pts): ratio of non-whitespace
    density = len(text.replace(" ", "").replace("\n", "")) / max(len(text), 1)
    score += int(density * 10)

    # Row count bonus (up to 10 pts): fee schedules have 5-50 rows
    if 5 <= len(lines) <= 50:
        score += 10
    elif len(lines) > 50:
        score += 5

    return min(score, 100)


def _tables_to_text(tables: list) -> str:
    """Convert pdfplumber tables to pipe-delimited text."""
    parts = []
    for table in tables:
        rows = []
        for row in table:
            cells = [str(cell).strip() if cell else "" for cell in row]
            rows.append(" | ".join(cells))
        parts.append("\n".join(rows))
    return "\n\n".join(parts)


def extract_text_from_pdf(content: bytes) -> str:
    """Extract all text from a PDF using multi-strategy approach.

    Tries 3 different table extraction strategies per page, scores each,
    and picks the best. Falls back to raw text extraction if tables fail.

    Returns the extracted text as a single string.
    """
    parts: list[str] = []

    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages = pdf.pages[:MAX_PAGES]

            if len(pdf.pages) > MAX_PAGES:
                logger.info(
                    "PDF has %d pages, extracting first %d",
                    len(pdf.pages), MAX_PAGES,
                )

            for page in pages:
                candidates: list[str] = []

                # Try each table extraction strategy
                for strategy in STRATEGIES:
                    try:
                        tables = page.extract_tables(table_settings=strategy)
                        text = _tables_to_text(tables)
                        if text.strip():
                            candidates.append(text)
                    except Exception:
                        continue

                # Also try raw text extraction
                try:
                    raw = page.extract_text() or ""
                    if raw.strip():
                        candidates.append(raw.strip())
                except Exception:
                    pass

                # Pick best result by quality score
                if candidates:
                    best = max(candidates, key=score_extraction)
                    parts.append(f"--- Page {page.page_number} ---\n{best}")

    except Exception as e:
        logger.warning("PDF extraction failed: %s", e)
        raise

    return "\n\n".join(parts)


def extract_tables_from_pdf(content: bytes) -> list[list[list[str]]]:
    """Extract just the tables from a PDF.

    Returns a list of tables, where each table is a list of rows,
    and each row is a list of cell values.
    """
    all_tables: list[list[list[str]]] = []

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages[:MAX_PAGES]:
            for strategy in STRATEGIES:
                try:
                    tables = page.extract_tables(table_settings=strategy)
                    for table in tables:
                        cleaned = []
                        for row in table:
                            cells = [str(cell).strip() if cell else "" for cell in row]
                            cleaned.append(cells)
                        if cleaned:
                            all_tables.append(cleaned)
                    if tables:
                        break  # use first strategy that finds tables
                except Exception:
                    continue

    return all_tables


def get_pdf_page_count(content: bytes) -> int:
    """Return the number of pages in a PDF."""
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        return len(pdf.pages)
