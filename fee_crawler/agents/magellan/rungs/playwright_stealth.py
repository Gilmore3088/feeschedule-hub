"""Rung 1 — Playwright (Chromium) with stealth tweaks to bypass bot-blocks."""
from __future__ import annotations

import time

from fee_crawler.agents.magellan.rungs._base import Rung, RungResult, _Target, _Context
from fee_crawler.config import Config


_STEALTH_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
)


async def _extract_fees_from_text(text: str, target: _Target) -> list[dict]:
    """Extract fees from text using the existing LLM extraction pipeline."""
    try:
        from fee_crawler.pipeline.extract_llm import extract_fees_with_llm
        from fee_crawler.config import Config

        config = Config()
        fees = extract_fees_with_llm(
            text,
            config,
            institution_name=target.institution_name or "Unknown",
            charter_type=target.charter_type or "bank",
            document_type="html",
        )
        return [
            {
                "fee_name": f.fee_name,
                "amount": f.amount,
                "frequency": f.frequency,
                "conditions": f.conditions,
                "confidence": f.confidence,
            }
            for f in fees
        ]
    except Exception:
        return []


class PlaywrightStealthRung:
    name = "playwright_stealth"

    async def run(self, target: _Target, context: _Context) -> RungResult:
        t0 = time.time()
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            return RungResult(
                error="playwright not installed", duration_s=time.time() - t0,
            )

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                ctx = await browser.new_context(
                    user_agent=_STEALTH_UA,
                    viewport={"width": 1280, "height": 800},
                )
                page = await ctx.new_page()
                await page.add_init_script(
                    "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
                )
                resp = await page.goto(
                    target.fee_schedule_url, timeout=30_000, wait_until="networkidle"
                )
                http_status = resp.status if resp else None
                text = await page.inner_text("body") if resp else ""
                await browser.close()

            fees = await _extract_fees_from_text(text, target)
            return RungResult(
                fees=fees,
                text=text[:10_000],
                http_status=http_status,
                duration_s=time.time() - t0,
            )
        except Exception as e:
            return RungResult(error=str(e), duration_s=time.time() - t0)
