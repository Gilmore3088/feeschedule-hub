"""Google Search discovery for fee schedule URLs.

Uses web search to find fee schedule pages that the site crawler missed.
Searches: "[institution name] fee schedule" and checks results for PDFs/fee pages.

Usage:
    python -m fee_crawler google-discover              # dry-run
    python -m fee_crawler google-discover --fix         # update DB
    python -m fee_crawler google-discover --limit 100   # limit batch
    python -m fee_crawler google-discover --extract     # also extract after finding
"""

import os
import re
import logging
import time
from urllib.parse import urlparse

import httpx
import psycopg2
import psycopg2.extras

log = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
}

# Keywords that indicate a page is a fee schedule
FEE_KEYWORDS = [
    "fee schedule", "schedule of fees", "service charges",
    "fee information", "truth in savings", "account fees",
    "fee disclosure", "rates and fees",
]


def _connect():
    conn = psycopg2.connect(
        os.environ["DATABASE_URL"],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    conn.cursor().execute("SET statement_timeout = '120s'")
    conn.commit()
    return conn


def _search_google(query: str, client: httpx.Client) -> list[dict]:
    """Search Google and return results. Uses scraping approach."""
    encoded = query.replace(" ", "+")
    url = f"https://www.google.com/search?q={encoded}&num=5"

    try:
        resp = client.get(url, timeout=15)
        if resp.status_code != 200:
            return []

        text = resp.text
        # Extract URLs from Google results
        results = []
        for match in re.finditer(r'href="(/url\?q=|)(https?://[^"&]+)', text):
            found_url = match.group(2)
            # Skip Google's own URLs
            if "google.com" in found_url or "googleapis.com" in found_url:
                continue
            if "webcache" in found_url or "translate.google" in found_url:
                continue
            results.append({"url": found_url})

        return results[:5]
    except Exception as e:
        log.warning(f"Google search failed for '{query}': {e}")
        return []


def _is_fee_page(url: str, client: httpx.Client) -> bool:
    """Quick check if a URL looks like a fee schedule page."""
    url_lower = url.lower()

    # PDF with fee-related name is almost certainly right
    if url_lower.endswith(".pdf"):
        for kw in ["fee", "schedule", "disclosure", "service-charge", "truth-in-savings"]:
            if kw in url_lower:
                return True

    # Check if URL path contains fee keywords
    for kw in ["fee", "schedule", "disclosure", "service-charge"]:
        if kw in url_lower:
            return True

    return False


def search_for_institution(name: str, website_url: str, client: httpx.Client) -> str | None:
    """Search Google for an institution's fee schedule. Returns URL or None."""
    base_domain = urlparse(website_url).netloc if website_url else ""

    # Search strategies in order of specificity
    queries = [
        f'site:{base_domain} fee schedule',
        f'"{name}" fee schedule filetype:pdf',
        f'"{name}" fee schedule',
    ]

    for query in queries:
        results = _search_google(query, client)
        time.sleep(1)  # Rate limit

        for result in results:
            url = result["url"]
            if _is_fee_page(url, client):
                # Prefer results from the institution's own domain
                result_domain = urlparse(url).netloc.lower()
                if base_domain and base_domain.lower() in result_domain:
                    return url
                # Accept off-domain PDFs (regulatory filings, etc.)
                if url.lower().endswith(".pdf"):
                    return url

    return None


def run(fix: bool = False, limit: int = 0, extract: bool = False):
    """Search Google for fee schedule URLs."""
    conn = _connect()
    cur = conn.cursor()

    query = """
        SELECT ct.id, ct.institution_name, ct.state_code, ct.website_url, ct.asset_size
        FROM crawl_targets ct
        WHERE ct.status = 'active'
          AND ct.website_url IS NOT NULL
          AND ct.fee_schedule_url IS NULL
          AND (ct.document_type IS NULL OR ct.document_type != 'offline')
        ORDER BY ct.asset_size DESC NULLS LAST
    """
    if limit:
        query += f" LIMIT {limit}"

    cur.execute(query)
    targets = cur.fetchall()

    print(f"Google discovery for {len(targets)} institutions...")
    print(f"Mode: {'FIX' if fix else 'DRY RUN'}")
    print()

    found = 0
    checked = 0

    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=15) as client:
        for i, inst in enumerate(targets):
            checked += 1
            url = search_for_institution(
                inst["institution_name"],
                inst["website_url"],
                client,
            )

            if url:
                found += 1
                a = inst["asset_size"]
                if a:
                    real = a * 1000
                    astr = f"${real/1e9:.1f}B" if real >= 1e9 else f"${real/1e6:.0f}M"
                else:
                    astr = "?"
                is_pdf = url.lower().endswith(".pdf")
                doc_type = "pdf" if is_pdf else None

                print(f"  FOUND: {inst['state_code']} {inst['institution_name'][:35]:<35} ({astr}) -> {url[:70]}")

                if fix:
                    cur.execute("""
                        UPDATE crawl_targets
                        SET fee_schedule_url = %s, document_type = %s
                        WHERE id = %s
                    """, (url, doc_type, inst["id"]))
                    conn.commit()

            if (i + 1) % 25 == 0:
                print(f"  [{i+1}/{len(targets)}] checked={checked} found={found}")

            # Rate limit to avoid Google blocking
            time.sleep(2)

    print()
    print(f"=" * 60)
    print(f"RESULTS: {found} URLs found out of {checked} checked ({round(100*found/checked) if checked else 0}%)")
    if not fix:
        print("Run with --fix to update database")

    conn.close()
    return {"found": found, "checked": checked}
