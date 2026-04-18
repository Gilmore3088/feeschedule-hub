"""Rung 5 — paid proxy rotation. STUB until provider is chosen.

Currently returns a no-op RungResult so the ladder completes. Replace
with real implementation (BrightData, ScraperAPI, etc.) when budget +
provider are signed off.
"""
from __future__ import annotations

from fee_crawler.agents.magellan.rungs._base import Rung, RungResult, _Target, _Context


class ProxyRotationRung:
    name = "proxy_rotation"

    async def run(self, target: _Target, context: _Context) -> RungResult:
        return RungResult(
            error="proxy rung stub — provider not configured",
            duration_s=0.001,
        )
