"""Pure state machine circuit breaker — shared by Darwin and Magellan.

Accepts any config object that duck-types _HasCircuitConfig:
    - consecutive_failures_to_halt: int
    - error_rate_window: int
    - error_rate_threshold: float
    - consecutive_rate_limits_to_halt: int
"""
from __future__ import annotations

from collections import deque
from enum import Enum
from typing import Optional


class HaltReason(str, Enum):
    CONSECUTIVE_FAILURES = "consecutive_failures"
    ERROR_RATE = "error_rate"
    RATE_LIMIT_SATURATED = "rate_limit_saturated"


class CircuitBreaker:
    """Tracks success/failure/rate-limit outcomes; reports when to halt."""

    def __init__(self, config: object) -> None:
        self._config = config
        self._consecutive_failures = 0
        self._consecutive_rate_limits = 0
        self._recent_outcomes: deque[bool] = deque(
            maxlen=config.error_rate_window  # type: ignore[attr-defined]
        )

    def record_success(self) -> None:
        self._consecutive_failures = 0
        self._consecutive_rate_limits = 0
        self._recent_outcomes.append(True)

    def record_failure(self) -> None:
        self._consecutive_failures += 1
        self._recent_outcomes.append(False)

    def record_rate_limit_exhausted(self) -> None:
        """Called when retries on 429/529 are exhausted."""
        self._consecutive_failures += 1
        self._consecutive_rate_limits += 1
        self._recent_outcomes.append(False)

    def halt_reason(self) -> Optional[HaltReason]:
        cfg = self._config
        if self._consecutive_rate_limits >= cfg.consecutive_rate_limits_to_halt:  # type: ignore[attr-defined]
            return HaltReason.RATE_LIMIT_SATURATED
        if len(self._recent_outcomes) >= cfg.error_rate_window:  # type: ignore[attr-defined]
            failures = sum(1 for o in self._recent_outcomes if not o)
            if failures / len(self._recent_outcomes) > cfg.error_rate_threshold:  # type: ignore[attr-defined]
                return HaltReason.ERROR_RATE
        if self._consecutive_failures >= cfg.consecutive_failures_to_halt:  # type: ignore[attr-defined]
            return HaltReason.CONSECUTIVE_FAILURES
        return None
