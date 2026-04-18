"""Magellan — coverage rescue agent (slice #1: extraction rescue).

Runs a 5-rung ladder on crawl_targets with URL but no fees, writing
successes to fees_raw so Darwin classifies downstream.
"""
try:
    from fee_crawler.agents.magellan.orchestrator import rescue_batch, BatchResult
    __all__ = ["rescue_batch", "BatchResult"]
except ImportError:
    __all__ = []
