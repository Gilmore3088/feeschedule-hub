"""Rung 3 — retry plain HTTP with varied User-Agent + headers."""
from __future__ import annotations

import time

import httpx

from fee_crawler.agents.magellan.rungs._base import Rung, RungResult, _Target, _Context


_UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
]


async def _extract_fees_from_html(text: str, target: _Target) -> list[dict]:
    """Extract fees from HTML text using the existing LLM extraction pipeline."""
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


class UaRotationRung:
    name = "ua_rotation"

    async def run(self, target: _Target, context: _Context) -> RungResult:
        t0 = time.time()
        last_status = None
        last_err = None
        for ua in _UAS:
            headers = {
                "User-Agent": ua,
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                "DNT": "1",
                "Upgrade-Insecure-Requests": "1",
            }
            try:
                async with httpx.AsyncClient(
                    timeout=20.0, follow_redirects=True, headers=headers
                ) as c:
                    resp = await c.get(target.fee_schedule_url)
                last_status = resp.status_code
                if (
                    200 <= resp.status_code < 300
                    and "text/html" in (resp.headers.get("content-type") or "")
                ):
                    fees = await _extract_fees_from_html(resp.text, target)
                    return RungResult(
                        fees=fees,
                        text=resp.text[:10_000],
                        http_status=resp.status_code,
                        duration_s=time.time() - t0,
                    )
            except Exception as e:
                last_err = str(e)
        return RungResult(
            http_status=last_status,
            error=last_err,
            duration_s=time.time() - t0,
        )
