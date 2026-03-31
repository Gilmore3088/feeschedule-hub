"""Stage 4: HTML fee extraction specialist."""

import os
import logging
import requests
import anthropic
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

# Reuse the same tool from extract_pdf
from fee_crawler.agents.extract_pdf import _EXTRACT_TOOL, _extract_fees_with_llm


def extract_html(url: str, institution: dict) -> list[dict]:
    """Fetch HTML page and extract fees via Claude."""
    resp = requests.get(url, timeout=15, allow_redirects=True,
                        headers={"User-Agent": "BankFeeIndex/1.0"})
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")

    # Remove non-content
    for tag in soup.find_all(["script", "style", "nav", "header", "footer", "noscript"]):
        tag.decompose()

    text = soup.get_text(separator="\n", strip=True)

    if not text.strip():
        log.warning("HTML text extraction returned empty")
        return []

    return _extract_fees_with_llm(text, institution, "html")
