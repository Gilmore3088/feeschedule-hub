"""
Stage 2: AI-powered URL discovery.

Uses Claude + Playwright to find fee schedule URLs.
Max 8 page loads per institution. Three strategies:
  1. AI-guided navigation (up to 7 pages)
  2. Common path probing (fee-schedule, disclosures, etc.)
  3. PDF link scanning on any page visited
"""

import os
import re
import json
import logging
from urllib.parse import urljoin

import anthropic
from playwright.sync_api import sync_playwright

log = logging.getLogger(__name__)

_client = None

# Common fee schedule paths to probe if AI navigation fails
COMMON_PATHS = [
    "/fee-schedule", "/fees", "/fee-schedule.pdf",
    "/disclosures", "/disclosure", "/disclosures/fee-schedule",
    "/rates-and-fees", "/rates-fees", "/rates",
    "/personal/fees", "/personal/disclosures",
    "/about/fees", "/about/disclosures",
    "/resources/fee-schedule", "/resources/disclosures",
    "/documents", "/forms-and-disclosures", "/forms",
    "/truth-in-savings", "/service-charges",
    "/wp-content/uploads/fee-schedule.pdf",
    "/sites/default/files/fee-schedule.pdf",
    # Credit union patterns
    "/learn/information/fee-schedule", "/members/fee-schedule",
    "/membership/fees", "/accounts/fees",
    # Community bank patterns
    "/personal-banking/fees", "/checking/fees",
    "/customer-service/disclosures", "/about-us/disclosures",
    "/legal/disclosures", "/legal/fees",
    # CMS patterns
    "/content/fee-schedule", "/page/fee-schedule",
]

# Keywords that indicate a link points to a fee schedule
FEE_LINK_KEYWORDS = [
    "fee schedule", "fee-schedule", "service charge", "service fee",
    "truth in savings", "schedule of fees", "account fees",
    "fee disclosure", "pricing", "rates and fees", "fees and charges",
]


def _get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    return _client


def discover_url(institution_name: str, website_url: str, knowledge: str = "") -> dict:
    """
    Find the fee schedule URL for an institution.

    Returns: {"found": bool, "url": str|None, "document_type": str|None,
              "confidence": float, "reason": str, "pages_checked": int}
    """
    pages_checked = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent="BankFeeIndex/1.0 (fee-schedule-agent)",
        )
        page.set_default_timeout(15_000)

        # Load homepage
        try:
            page.goto(website_url, wait_until="domcontentloaded", timeout=20_000)
            pages_checked += 1
        except Exception as e:
            browser.close()
            return _not_found(f"Homepage load failed: {e}", pages_checked)

        # Collect all PDF links from every page we visit
        all_pdf_links = []

        # Extract links from homepage
        links = _extract_links(page)
        all_pdf_links.extend(_find_pdf_links(links))

        # Quick check: any link text directly mentions fee schedule?
        direct_hit = _check_direct_fee_links(links)
        if direct_hit:
            browser.close()
            return _found(direct_hit, pages_checked, "Direct fee schedule link found on homepage")

        if not links:
            browser.close()
            return _not_found("No links found on homepage", pages_checked)

        # ── Strategy 1: AI-guided navigation (up to 7 more pages) ────
        client = _get_client()

        # Truncate knowledge to avoid blowing context
        knowledge_context = knowledge[:2000] if knowledge else ""

        links_text = _format_links(links)
        result = _ask_claude(client, institution_name, website_url, links_text, knowledge_context)

        for attempt in range(7):
            if not result:
                break

            if result.get("action") == "found":
                url = result["url"]
                browser.close()
                return _found(url, pages_checked, result.get("reason", "AI found"))

            if result.get("action") == "navigate" and result.get("url"):
                nav_url = result["url"]
                try:
                    page.goto(nav_url, wait_until="domcontentloaded", timeout=15_000)
                    pages_checked += 1
                except Exception as e:
                    log.warning(f"Navigation failed: {e}")
                    # Don't break — try next strategy
                    break

                links = _extract_links(page)
                all_pdf_links.extend(_find_pdf_links(links))

                # Check for direct fee links on this page too
                direct_hit = _check_direct_fee_links(links)
                if direct_hit:
                    browser.close()
                    return _found(direct_hit, pages_checked, "Direct fee schedule link found after navigation")

                page_text = page.inner_text("body")[:2000]
                links_text = _format_links(links)

                # Check if this page itself IS the fee schedule
                if _page_has_fee_content(page_text):
                    browser.close()
                    return _found(nav_url, pages_checked, "Page contains fee schedule content")

                result = _ask_claude_followup(client, institution_name, nav_url, page_text, links_text)
            else:
                # not_found — break to try other strategies
                break

        # ── Strategy 2: Check collected PDF links ─────────────────────
        fee_pdfs = _score_pdf_links(all_pdf_links)
        if fee_pdfs:
            best = fee_pdfs[0]
            browser.close()
            return _found(best, pages_checked, "Fee-related PDF found in page links")

        # ── Strategy 2.5: Navigate to /disclosures and scan for PDFs ──
        from urllib.parse import urlparse
        base = urlparse(website_url)
        base_url = f"{base.scheme}://{base.netloc}"

        for disc_path in ["/disclosures", "/disclosure", "/resources", "/documents", "/forms"]:
            try:
                resp = page.goto(base_url + disc_path, wait_until="domcontentloaded", timeout=10_000)
                pages_checked += 1
                if resp and resp.status == 200:
                    disc_links = _extract_links(page)
                    # Check direct fee links
                    direct_hit = _check_direct_fee_links(disc_links)
                    if direct_hit:
                        browser.close()
                        return _found(direct_hit, pages_checked, f"Fee link found on {disc_path} page")
                    # Score all PDFs on this page
                    disc_pdfs = _score_pdf_links(_find_pdf_links(disc_links))
                    if disc_pdfs:
                        browser.close()
                        return _found(disc_pdfs[0], pages_checked, f"Fee PDF found on {disc_path} page")
                    # Check page content
                    body = page.inner_text("body")[:2000]
                    if _page_has_fee_content(body):
                        browser.close()
                        return _found(base_url + disc_path, pages_checked, f"Fee content found on {disc_path} page")
            except Exception:
                continue
            if pages_checked >= 12:
                break

        # ── Strategy 3: Probe common paths ────────────────────────────
        for path in COMMON_PATHS:
            probe_url = base_url + path
            try:
                resp = page.goto(probe_url, wait_until="domcontentloaded", timeout=8_000)
                pages_checked += 1
                if resp and resp.status == 200:
                    content_type = resp.headers.get("content-type", "")
                    if "pdf" in content_type:
                        browser.close()
                        return _found(probe_url, pages_checked, f"PDF found at common path {path}")

                    body = page.inner_text("body")[:2000]
                    if _page_has_fee_content(body):
                        browser.close()
                        return _found(probe_url, pages_checked, f"Fee content found at common path {path}")

                    # Check links on this page for fee PDFs
                    probe_links = _extract_links(page)
                    direct_hit = _check_direct_fee_links(probe_links)
                    if direct_hit:
                        browser.close()
                        return _found(direct_hit, pages_checked, f"Fee link found on {path} page")

                    # Also check PDFs on this page
                    probe_pdfs = _score_pdf_links(_find_pdf_links(probe_links))
                    if probe_pdfs:
                        browser.close()
                        return _found(probe_pdfs[0], pages_checked, f"Fee PDF found on {path} page")
            except Exception:
                continue

            # Stop probing after 15 total pages
            if pages_checked >= 15:
                break

        browser.close()
        return _not_found(
            result.get("reason", "Exhausted all strategies") if result else "All strategies exhausted",
            pages_checked,
        )


def _found(url: str, pages_checked: int, reason: str) -> dict:
    doc_type = "pdf" if url.lower().endswith(".pdf") else None
    return {
        "found": True,
        "url": url,
        "document_type": doc_type,
        "confidence": 0.85,
        "reason": reason,
        "pages_checked": pages_checked,
    }


def _not_found(reason: str, pages_checked: int) -> dict:
    return {
        "found": False,
        "url": None,
        "document_type": None,
        "confidence": 0,
        "reason": reason,
        "pages_checked": pages_checked,
    }


def _check_direct_fee_links(links: list[dict]) -> str | None:
    """Check if any link text directly matches fee schedule patterns."""
    for link in links:
        text = link.get("text", "").lower()
        href = link.get("href", "").lower()
        for kw in FEE_LINK_KEYWORDS:
            if kw in text or kw.replace(" ", "-") in href or kw.replace(" ", "_") in href:
                return link["href"]
    return None


def _find_pdf_links(links: list[dict]) -> list[str]:
    """Extract all PDF links from a link list."""
    return [l["href"] for l in links if l.get("href", "").lower().endswith(".pdf")]


def _score_pdf_links(pdf_urls: list[str]) -> list[str]:
    """Score PDF links by likelihood of being a fee schedule. Return sorted."""
    fee_keywords = ["fee", "schedule", "service-charge", "truth-in-savings", "disclosure", "pricing"]
    non_fee = ["privacy", "loan", "mortgage", "annual-report", "cra", "complaint", "application", "enrollment"]

    scored = []
    for url in pdf_urls:
        lower = url.lower()
        if any(kw in lower for kw in non_fee):
            continue
        score = sum(1 for kw in fee_keywords if kw in lower)
        if score > 0:
            scored.append((score, url))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [url for _, url in scored]


def _page_has_fee_content(text: str) -> bool:
    """Check if page text contains fee schedule content (3+ keywords)."""
    lower = text.lower()
    keywords = [
        "monthly maintenance", "overdraft", "nsf", "insufficient funds",
        "atm fee", "wire transfer", "stop payment", "returned item",
        "service charge", "fee schedule", "account fee", "dormant",
    ]
    return sum(1 for kw in keywords if kw in lower) >= 3


def _format_links(links: list[dict]) -> str:
    return "\n".join(f"- {l['text']}: {l['href']}" for l in links[:80])


def _ask_claude(client, institution_name: str, current_url: str, links_text: str, knowledge: str = "") -> dict | None:
    knowledge_section = ""
    if knowledge:
        knowledge_section = f"\n\nPrior knowledge about this institution/region:\n{knowledge}\n"

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        system=f"""You find fee schedule URLs on bank and credit union websites. Every bank publishes a fee schedule — your job is to find it.

Look for links to: fees, fee schedule, service charges, disclosures, truth in savings, account agreements, pricing, schedule of fees, rates & fees.

Fee schedules are often 1-2 clicks deep under: Disclosures, Resources, About, Rates & Fees, Personal Banking, Documents, Forms.
{knowledge_section}
RULES:
1. If you see a direct link to a fee schedule or fee-related PDF, return "found"
2. If no direct link, navigate to the most promising section page
3. ALWAYS navigate — never return "not_found" unless you've already navigated to at least 2 sub-pages
4. Prefer pages titled: Disclosures, Documents, Forms, Resources, Rates, Fees, About

Return JSON only:
{{"action": "found", "url": "https://...", "confidence": 0.9, "reason": "..."}}
{{"action": "navigate", "url": "https://...", "reason": "..."}}
{{"action": "not_found", "reason": "Checked multiple sub-pages, no fee schedule found"}}""",
        messages=[{
            "role": "user",
            "content": f"Institution: {institution_name}\nCurrent page: {current_url}\n\nVisible links:\n{links_text}",
        }],
        timeout=30,
    )
    return _parse_json(response)


def _ask_claude_followup(client, institution_name: str, current_url: str, page_text: str, links_text: str) -> dict | None:
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        system="""You find fee schedule URLs on bank and credit union websites.
You've navigated to a sub-page. Look for the fee schedule link or PDF.

RULES:
1. Check if any link text mentions fees, fee schedule, service charges, truth in savings, disclosures
2. Check if any PDF links contain fee-related terms in the filename
3. If you see a promising link, return "found" or "navigate"
4. Only return "not_found" if this page clearly has no fee-related links at all

Return JSON only:
{"action": "found", "url": "https://...", "confidence": 0.9, "reason": "..."}
{"action": "navigate", "url": "https://...", "reason": "..."}
{"action": "not_found", "reason": "This page has no fee-related links"}""",
        messages=[{
            "role": "user",
            "content": f"Institution: {institution_name}\nCurrent page: {current_url}\n\nPage text (first 1500 chars):\n{page_text[:1500]}\n\nVisible links:\n{links_text}",
        }],
        timeout=30,
    )
    return _parse_json(response)


def _extract_links(page) -> list[dict]:
    """Extract all visible links with text from a Playwright page."""
    try:
        links = page.evaluate("""() => {
            const results = [];
            document.querySelectorAll('a[href]').forEach(a => {
                const text = a.innerText?.trim();
                const href = a.href;
                if (text && href && href.startsWith('http') && text.length < 200) {
                    results.push({text, href});
                }
            });
            return results;
        }""")
        return links
    except Exception:
        return []


def _parse_json(response) -> dict | None:
    """Extract JSON from Claude response."""
    text = "".join(b.text for b in response.content if b.type == "text")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = re.search(r'\{[^{}]*\}', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return None
