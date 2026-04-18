"""Rung registry in priority order."""
from fee_crawler.agents.magellan.rungs._base import Rung, RungResult, _Target, _Context
from fee_crawler.agents.magellan.rungs.playwright_stealth import PlaywrightStealthRung
from fee_crawler.agents.magellan.rungs.pdf_ocr import PdfOcrRung
from fee_crawler.agents.magellan.rungs.ua_rotation import UaRotationRung
from fee_crawler.agents.magellan.rungs.llm_extract import LlmExtractRung

LADDER: list[Rung] = [
    PlaywrightStealthRung(),
    PdfOcrRung(),
    UaRotationRung(),
    LlmExtractRung(),
]

__all__ = ["Rung", "RungResult", "_Target", "_Context", "LADDER"]
