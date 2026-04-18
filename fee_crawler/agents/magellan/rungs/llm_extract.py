"""Rung 4 — last-resort: ask Haiku to extract fees from any text we pulled."""
from __future__ import annotations

import json
import os
import time

import httpx

from fee_crawler.agents.magellan.rungs._base import Rung, RungResult, _Target, _Context


_PROMPT = """\
You are a bank-fee extractor. The following text was pulled from a page that
should contain a bank's fee schedule, but structured extraction already failed.

Extract every fee you can identify. For each: fee name (verbatim if possible),
amount in USD (numeric), frequency if stated (monthly/yearly/per-use).

Return strictly a JSON object: {"fees": [{"name": "...", "amount": 12.0, "frequency": "monthly"}]}.
If no fees are found, return {"fees": []}.
"""


class LlmExtractRung:
    name = "llm_extract"

    async def run(self, target: _Target, context: _Context) -> RungResult:
        t0 = time.time()
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as c:
                resp = await c.get(target.fee_schedule_url)
            status = resp.status_code
            if status >= 400 or not resp.text:
                return RungResult(http_status=status, duration_s=time.time() - t0)

            import anthropic
            client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
            result = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=2048,
                system=_PROMPT,
                messages=[{"role": "user", "content": resp.text[:20_000]}],
            )
            body = "".join(block.text for block in result.content if hasattr(block, "text"))
            try:
                parsed = json.loads(body)
                fees = parsed.get("fees", [])
            except Exception:
                fees = []

            return RungResult(
                fees=fees,
                text=resp.text[:10_000],
                http_status=status,
                cost_usd=0.002,
                duration_s=time.time() - t0,
            )
        except Exception as e:
            return RungResult(error=str(e), duration_s=time.time() - t0)
