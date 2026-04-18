"""Rung registry in priority order."""
from fee_crawler.agents.magellan.rungs._base import Rung, RungResult, _Target, _Context

LADDER: list[Rung] = []

__all__ = ["Rung", "RungResult", "_Target", "_Context", "LADDER"]
