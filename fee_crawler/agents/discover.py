"""
Stage 2: AI-powered URL discovery.

Uses Claude + Playwright to find fee schedule URLs.
Max 5 page loads per institution.
"""

import os
import logging

import anthropic
from playwright.sync_api import sync_playwright

log = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    return _client


def discover_url(institution_name: str, website_url: str) -> dict:
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

        # Load homepage and extract links
        try:
            page.goto(website_url, wait_until="domcontentloaded", timeout=20_000)
            pages_checked += 1
        except Exception as e:
            browser.close()
            return {"found": False, "url": None, "document_type": None,
                    "confidence": 0, "reason": f"Homepage load failed: {e}", "pages_checked": 1}

        # Extract all visible links
        links = _extract_links(page)
        homepage_text = page.inner_text("body")[:3000]

        if not links:
            browser.close()
            return {"found": False, "url": None, "document_type": None,
                    "confidence": 0, "reason": "No links found on homepage", "pages_checked": 1}

        # Ask Claude which link to follow
        client = _get_client()

        links_text = "\n".join(f"- {l['text']}: {l['href']}" for l in links[:60])

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            system="""You find fee schedule URLs on bank and credit union websites. Every bank and credit union publishes a fee schedule — your job is to find it.

Look for links containing: fees, fee schedule, service charges, disclosures, rates, truth in savings, account agreements, pricing, schedule of fees, or PDFs with these terms.

Fee schedules are often found under: Disclosures, Resources, About, Rates & Fees, Personal Banking, Checking, or Document Library pages.

IMPORTANT: If you don't see a direct fee schedule link, navigate to the most promising page (Disclosures, Resources, Rates, About). NEVER give up on the first page — always navigate at least once.

Return JSON only:
{"action": "found", "url": "https://...", "confidence": 0.9, "reason": "..."}
{"action": "navigate", "url": "https://...", "reason": "Fee schedule likely under this page"}
{"action": "not_found", "reason": "Exhausted all promising navigation paths"}""",
            messages=[{
                "role": "user",
                "content": f"Institution: {institution_name}\nCurrent page: {website_url}\n\nVisible links:\n{links_text}",
            }],
            timeout=30,
        )

        result = _parse_json(response)
        if not result:
            browser.close()
            return {"found": False, "url": None, "document_type": None,
                    "confidence": 0, "reason": "AI response parse error", "pages_checked": pages_checked}

        # Follow up to 4 more pages
        for attempt in range(4):
            if result.get("action") == "found":
                url = result["url"]
                doc_type = "pdf" if url.lower().endswith(".pdf") else None
                browser.close()
                return {
                    "found": True,
                    "url": url,
                    "document_type": doc_type,
                    "confidence": result.get("confidence", 0.8),
                    "reason": result.get("reason", ""),
                    "pages_checked": pages_checked,
                }

            if result.get("action") == "navigate" and result.get("url"):
                nav_url = result["url"]
                try:
                    page.goto(nav_url, wait_until="domcontentloaded", timeout=15_000)
                    pages_checked += 1
                except Exception as e:
                    log.warning(f"Navigation failed: {e}")
                    break

                links = _extract_links(page)
                page_text = page.inner_text("body")[:3000]
                links_text = "\n".join(f"- {l['text']}: {l['href']}" for l in links[:60])

                response = client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=500,
                    system="""You find fee schedule URLs on bank and credit union websites.
Given links from a page, identify which URL leads to the fee schedule.

Return JSON only:
{"action": "found", "url": "https://...", "confidence": 0.9, "reason": "..."}
{"action": "navigate", "url": "https://...", "reason": "Fee schedule likely under this page"}
{"action": "not_found", "reason": "No fee schedule link visible"}""",
                    messages=[{
                        "role": "user",
                        "content": f"Institution: {institution_name}\nCurrent page: {nav_url}\n\nPage text (first 1000 chars):\n{page_text[:1000]}\n\nVisible links:\n{links_text}",
                    }],
                    timeout=30,
                )
                result = _parse_json(response)
                if not result:
                    break
            else:
                break

        browser.close()
        return {
            "found": False,
            "url": None,
            "document_type": None,
            "confidence": 0,
            "reason": result.get("reason", "Could not find fee schedule") if result else "AI gave up",
            "pages_checked": pages_checked,
        }


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
    import json
    try:
        # Try direct parse
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try extracting from fenced block
    import re
    m = re.search(r'\{[^{}]*\}', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return None
