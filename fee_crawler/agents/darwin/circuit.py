"""Pure state machine for Darwin's circuit breaker. No I/O."""
from __future__ import annotations
from collections import deque
from enum import Enum
from typing import Optional

from fee_crawler.agents.darwin.config import DarwinConfig


class HaltReason(str, Enum):
    CONSECUTIVE_FAILURES = "consecutive_failures"
    ERROR_RATE = "error_rate"
    RATE_LIMIT_SATURATED = "rate_limit_saturated"


class CircuitBreaker:
    """Tracks success/failure/rate-limit outcomes; reports when to halt."""

    def __init__(self, config: DarwinConfig):
        self._config = config
        self._consecutive_failures = 0
        self._consecutive_rate_limits = 0
        self._recent_outcomes: deque[bool] = deque(maxlen=config.error_rate_window)
        # True = success, False = failure

    def record_success(self) -> None:
        self._consecutive_failures = 0
        self._consecutive_rate_limits = 0
        self._recent_outcomes.append(True)

    def record_failure(self) -> None:
        self._consecutive_failures += 1
        self._recent_outcomes.append(False)

    def record_rate_limit_exhausted(self) -> None:
        """Called when retries on 429/529 are exhausted — counts as a failure
        and also contributes to the rate-limit-specific halt."""
        self._consecutive_failures += 1
        self._consecutive_rate_limits += 1
        self._recent_outcomes.append(False)

    def halt_reason(self) -> Optional[HaltReason]:
        if self._consecutive_rate_limits >= self._config.consecutive_rate_limits_to_halt:
            return HaltReason.RATE_LIMIT_SATURATED
        if len(self._recent_outcomes) >= self._config.error_rate_window:
            failures = sum(1 for o in self._recent_outcomes if not o)
            if failures / len(self._recent_outcomes) > self._config.error_rate_threshold:
                return HaltReason.ERROR_RATE
        if self._consecutive_failures >= self._config.consecutive_failures_to_halt:
            return HaltReason.CONSECUTIVE_FAILURES
        return None
