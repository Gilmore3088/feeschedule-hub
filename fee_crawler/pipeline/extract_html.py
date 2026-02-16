"""Extract fee schedule text from HTML pages.

Extracts text from HTML tables and surrounding content,
focusing on fee-related sections.
"""

from bs4 import BeautifulSoup


def extract_text_from_html(content: bytes | str) -> str:
    """Extract fee-relevant text from an HTML page.

    Prioritizes table content, then falls back to full page text.
    Strips navigation, headers, footers, and other boilerplate.

    Returns extracted text as a single string.
    """
    if isinstance(content, bytes):
        content = content.decode("utf-8", errors="replace")

    soup = BeautifulSoup(content, "lxml")

    # Remove non-content elements
    for tag in soup.find_all(["script", "style", "nav", "header", "footer", "noscript"]):
        tag.decompose()

    parts: list[str] = []

    # Extract tables (most fee schedules are tabular)
    tables = soup.find_all("table")
    for table in tables:
        rows = []
        for tr in table.find_all("tr"):
            cells = []
            for td in tr.find_all(["td", "th"]):
                text = td.get_text(separator=" ", strip=True)
                if text:
                    cells.append(text)
            if cells:
                rows.append(" | ".join(cells))
        if rows:
            parts.append("\n".join(rows))

    # If no tables found, extract main content text
    if not parts:
        # Try common content containers
        main = soup.find("main") or soup.find("article") or soup.find(role="main")
        if main:
            text = main.get_text(separator="\n", strip=True)
        else:
            text = soup.get_text(separator="\n", strip=True)

        # Clean up: remove excessive blank lines
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        parts.append("\n".join(lines))

    return "\n\n".join(parts)
