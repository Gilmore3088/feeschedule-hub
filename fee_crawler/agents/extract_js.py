"""Stage 4: JS-rendered fee extraction specialist.

Uses Playwright to render JS-heavy pages (SPAs, Kentico, etc.).
Can follow sub-links if the page is an index/hub.
"""

import os
import logging
import anthropic
from playwright.sync_api import sync_playwright

log = logging.getLogger(__name__)

from fee_crawler.agents.extract_pdf import _EXTRACT_TOOL, _extract_fees_with_llm


def extract_js(url: str, institution: dict) -> list[dict]:
    """Render page with Playwright, extract fees."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent="BankFeeIndex/1.0 (fee-schedule-agent)")
        page.set_default_timeout(15_000)

        try:
            page.goto(url, wait_until="networkidle", timeout=30_000)
        except Exception as e:
            log.warning(f"Page load failed: {e}")
            # Try with domcontentloaded fallback
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=15_000)
            except Exception:
                browser.close()
                return []

        # Get rendered text
        text = page.inner_text("body")

        # Check if this is an index page (lots of links, little fee content)
        fee_keywords = [
            "monthly maintenance", "overdraft", "nsf", "atm fee", "wire transfer",
            "service charge", "fee schedule", "stop payment", "returned item",
            "dormant", "inactivity", "statement fee", "per item", "foreign transaction",
        ]
        keyword_hits = sum(1 for kw in fee_keywords if kw in text.lower())

        if keyword_hits >= 2 and len(text) > 300:
            # Page has fee content — extract directly
            browser.close()
            return _extract_fees_with_llm(text, institution, "js_rendered")

        # This might be a link index page (like Space Coast)
        # Find sub-links that look like fee schedules
        links = page.evaluate("""() => {
            const results = [];
            document.querySelectorAll('a[href]').forEach(a => {
                const text = a.innerText?.trim().toLowerCase();
                const href = a.href;
                if (href && (text.includes('fee') || text.includes('schedule') ||
                    text.includes('disclosure') || text.includes('truth in savings') ||
                    href.includes('fee') || href.includes('schedule'))) {
                    results.push({text: a.innerText?.trim(), href});
                }
            });
            return results;
        }""")

        if links:
            log.info(f"Found {len(links)} fee-related sub-links, following top 3")
            all_fees = []

            for link in links[:3]:
                try:
                    sub_url = link["href"]
                    if sub_url.lower().endswith(".pdf"):
                        # Download PDF
                        from fee_crawler.agents.extract_pdf import extract_pdf
                        fees = extract_pdf(sub_url, institution)
                    else:
                        page.goto(sub_url, wait_until="networkidle", timeout=20_000)
                        sub_text = page.inner_text("body")
                        fees = _extract_fees_with_llm(sub_text, institution, "js_rendered")

                    all_fees.extend(fees)
                except Exception as e:
                    log.warning(f"Sub-link {link.get('href')} failed: {e}")

            browser.close()
            return all_fees

        # Last resort: just extract whatever we have
        browser.close()
        if len(text) > 100:
            return _extract_fees_with_llm(text, institution, "js_rendered")
        return []
