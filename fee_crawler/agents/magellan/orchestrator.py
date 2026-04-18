"""Magellan orchestrator — candidate select, rescue_batch, decide_next_state."""
from __future__ import annotations

import logging
from dataclasses import dataclass, asdict
from enum import Enum
from typing import Optional

from fee_crawler.agents.magellan.config import DEFAULT, MagellanConfig
from fee_crawler.agents.magellan.rungs import RungResult

log = logging.getLogger(__name__)

AGENT_NAME = "magellan"


class RescueOutcome(str, Enum):
    RESCUED = "rescued"
    DEAD = "dead"
    NEEDS_HUMAN = "needs_human"
    RETRY_AFTER = "retry_after"


@dataclass
class BatchResult:
    processed: int = 0
    rescued: int = 0
    dead: int = 0
    needs_human: int = 0
    retry_after: int = 0
    failures: int = 0
    cost_usd: float = 0.0
    duration_s: float = 0.0
    circuit_tripped: bool = False
    halt_reason: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


def decide_next_state(last_result: RungResult, plausible: bool) -> RescueOutcome:
    """Map the final rung's outcome to a rescue state.

    Called when the ladder exhausted without a RESCUED win. `plausible`
    reflects the plausibility check on the LAST rung's output.
    """
    err = (last_result.error or "").lower()
    if "timeout" in err or "connection" in err:
        return RescueOutcome.RETRY_AFTER
    if last_result.http_status in (500, 502, 503, 504):
        return RescueOutcome.RETRY_AFTER
    if last_result.fees and not plausible:
        return RescueOutcome.NEEDS_HUMAN
    if last_result.http_status in (403, 404, 410):
        return RescueOutcome.DEAD
    return RescueOutcome.DEAD
