"""Shared agent utilities — circuit breaker, etc."""
from fee_crawler.agents._common.circuit import CircuitBreaker, HaltReason

__all__ = ["CircuitBreaker", "HaltReason"]
