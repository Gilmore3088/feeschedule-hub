"""
Stage 3: Document type classification.

Determines if a URL points to a PDF, static HTML, or JS-rendered page.
"""

import logging
import requests

log = logging.getLogger(__name__)

FEE_KEYWORDS = [
    "monthly maintenance fee", "overdraft fee", "nsf fee",
    "insufficient funds", "atm fee", "wire transfer fee",
    "service charge", "account fee", "stop payment",
    "returned item", "foreign transaction",
]


def classify_document(url: str) -> str:
    """
    Classify a URL as 'pdf', 'html', or 'js_rendered'.

    Returns: document type string
    """
    # PDF by URL extension
    if url.lower().endswith(".pdf"):
        return "pdf"

    # HEAD request for content type
    try:
        resp = requests.head(url, timeout=10, allow_redirects=True,
                             headers={"User-Agent": "BankFeeIndex/1.0"})
        content_type = resp.headers.get("Content-Type", "").lower()

        if "application/pdf" in content_type:
            return "pdf"
    except Exception as e:
        log.warning(f"HEAD request failed for {url}: {e}")

    # GET request to check content richness
    try:
        resp = requests.get(url, timeout=15, allow_redirects=True,
                            headers={"User-Agent": "BankFeeIndex/1.0"})
        if "application/pdf" in resp.headers.get("Content-Type", "").lower():
            return "pdf"

        text = resp.text
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(text, "lxml")

        # Remove non-content
        for tag in soup.find_all(["script", "style", "nav", "header", "footer"]):
            tag.decompose()

        visible_text = soup.get_text(separator=" ", strip=True)
        link_count = len(soup.find_all("a"))
        keyword_matches = sum(1 for kw in FEE_KEYWORDS if kw in visible_text.lower())

        # Rich content with fee keywords → static HTML
        if len(visible_text) > 500 and keyword_matches >= 2:
            return "html"

        # Thin content → likely JS-rendered
        return "js_rendered"

    except Exception as e:
        log.warning(f"GET request failed for {url}: {e}")
        return "js_rendered"  # Assume JS if we can't tell
