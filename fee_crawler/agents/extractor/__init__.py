"""Extractor agent: bulk fee extraction from discovered URLs into fees_raw.

Replaces the legacy `fee_crawler crawl` + `state_agent._write_fees` path with
the agent-gateway pattern (every fee write goes through `create_fee_raw`,
which the gateway wraps in agent_events / agent_auth_log audit + budget
enforcement).

Mirrors the Magellan rescue orchestrator structure (select candidates →
process → emit events → mark target).
"""

from .config import ExtractorConfig, DEFAULT
from .orchestrator import AGENT_NAME, BatchResult, extract_batch, select_candidates

__all__ = [
    "AGENT_NAME",
    "BatchResult",
    "DEFAULT",
    "ExtractorConfig",
    "extract_batch",
    "select_candidates",
]
