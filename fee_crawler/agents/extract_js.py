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
        page = browser.new_page(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        )
        page.set_default_timeout(30_000)

        try:
            page.goto(url, wait_until="networkidle", timeout=45_000)
        except Exception as e:
            log.warning(f"Page load failed: {e}")
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=20_000)
                # Wait extra for JS to render fee tables
                page.wait_for_timeout(3000)
            except Exception:
                browser.close()
                return []

        # Wait for content to render (SPAs often load data async)
        try:
            page.wait_for_timeout(2000)
        except Exception:
            pass

        # Expand all accordion/collapsible sections before extracting
        try:
            page.evaluate("""() => {
                // Click all common accordion/expand triggers
                const selectors = [
                    'details:not([open])',
                    '[data-toggle="collapse"]:not(.show)',
                    '.accordion-button.collapsed',
                    '[aria-expanded="false"]',
                    '.expandable:not(.expanded)',
                    '.collapsible-header',
                    '.toggle-content',
                    'button[class*="expand"]',
                    'button[class*="accordion"]',
                    'a[class*="accordion"]',
                    '[class*="collaps"]:not(.show):not(.in)',
                ];
                for (const sel of selectors) {
                    document.querySelectorAll(sel).forEach(el => {
                        try { el.click(); } catch(e) {}
                    });
                }
                // Open all <details> elements
                document.querySelectorAll('details').forEach(d => d.open = true);
            }""")
            page.wait_for_timeout(1500)
        except Exception:
            pass

        # Get rendered text (after expanding)
        text = page.inner_text("body")

        # Check if this is an index page (lots of links, little fee content)
        fee_keywords = [
            "monthly maintenance", "overdraft", "nsf", "atm fee", "wire transfer",
            "service charge", "fee schedule", "stop payment", "returned item",
            "dormant", "inactivity", "statement fee", "per item", "foreign transaction",
        ]
        keyword_hits = sum(1 for kw in fee_keywords if kw in text.lower())

        if keyword_hits >= 1 and len(text) > 200:
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
