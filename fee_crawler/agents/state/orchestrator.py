"""State agent: extract fees for institutions in a single US state.

Wraps fee_crawler.agents.extractor.extract_batch with two adjustments:
  1. state_code filter — only crawl_targets in this state become candidates
  2. agent_name override — writes go through gateway as 'state_xx', so
     audit + budget bucket per-state

Knox (parent) supervises the fleet via the existing 05:00 review job.
Atlas dispatches which state runs when (agents/atlas/orchestrator.py).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import asyncpg

from fee_crawler.agents.extractor import extract_batch
from fee_crawler.agents.extractor.config import ExtractorConfig

STATE_AGENT_PREFIX = "state_"

# 50 states + DC — same list seeded into agent_registry by
# 20260422_agent_registry_and_budgets.sql.
_STATE_CODES: tuple[str, ...] = (
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
    "DC",
)


def list_state_codes() -> tuple[str, ...]:
    """All 51 state codes the fleet supports. Stable order."""
    return _STATE_CODES


def state_agent_name(state_code: str) -> str:
    """Resolve a state code to its agent_registry name (`state_tx`).

    Validates the code is one of the 51 supported — raises ValueError
    otherwise so a typo can't accidentally invent a new agent identity
    that gateway will then reject.
    """
    s = (state_code or "").upper()
    if s not in _STATE_CODES:
        raise ValueError(f"unknown state code {state_code!r}; expected one of {_STATE_CODES}")
    return f"{STATE_AGENT_PREFIX}{s.lower()}"


@dataclass
class StateAgentResult:
    """Per-state run result. Wraps extractor BatchResult + state metadata."""
    state_code: str
    agent_name: str
    processed: int = 0
    extracted: int = 0
    fees_written: int = 0
    unchanged: int = 0
    failed: int = 0
    cost_usd: float = 0.0
    duration_s: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


async def run_state_agent(
    conn: asyncpg.Connection,
    state_code: str,
    size: int = 100,
    *,
    config: ExtractorConfig | None = None,
) -> StateAgentResult:
    """Run extraction for one state under that state's agent identity.

    Args:
        conn: asyncpg connection.
        state_code: 2-letter code (case-insensitive).
        size: max targets to process this run.
        config: ExtractorConfig override; defaults to extractor.DEFAULT.

    Returns:
        StateAgentResult with per-state counters.
    """
    agent_name = state_agent_name(state_code)
    cfg = config or ExtractorConfig()

    batch = await extract_batch(
        conn, size=size, config=cfg,
        state_code=state_code.upper(),
        agent_name=agent_name,
    )

    return StateAgentResult(
        state_code=state_code.upper(),
        agent_name=agent_name,
        processed=batch.processed,
        extracted=batch.extracted,
        fees_written=batch.fees_written,
        unchanged=batch.unchanged,
        failed=batch.failed,
        cost_usd=batch.cost_usd,
        duration_s=batch.duration_s,
    )
