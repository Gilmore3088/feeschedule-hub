"""Pure unit tests for Darwin — no DB, no network, no async."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from fee_crawler.agents.darwin.circuit import CircuitBreaker, HaltReason
from fee_crawler.agents.darwin.config import DarwinConfig


def test_circuit_no_halt_when_empty():
    cb = CircuitBreaker(DarwinConfig())
    assert cb.halt_reason() is None


def test_circuit_halts_on_5_consecutive_failures():
    cb = CircuitBreaker(DarwinConfig())
    for _ in range(5):
        cb.record_failure()
    assert cb.halt_reason() == HaltReason.CONSECUTIVE_FAILURES


def test_circuit_resets_consecutive_on_success():
    cb = CircuitBreaker(DarwinConfig())
    for _ in range(4):
        cb.record_failure()
    cb.record_success()
    for _ in range(4):
        cb.record_failure()
    assert cb.halt_reason() is None


def test_circuit_halts_on_error_rate():
    cb = CircuitBreaker(DarwinConfig())
    # 40 success, 11 failure across 51 outcomes -> >20% in last 50
    for _ in range(40):
        cb.record_success()
    for _ in range(11):
        cb.record_failure()
    # Window is last 50 outcomes: last 50 = 39 success + 11 fail = 22% failure
    assert cb.halt_reason() == HaltReason.ERROR_RATE


def test_circuit_halts_on_3_consecutive_rate_limits():
    cb = CircuitBreaker(DarwinConfig())
    for _ in range(3):
        cb.record_rate_limit_exhausted()
    assert cb.halt_reason() == HaltReason.RATE_LIMIT_SATURATED


def test_circuit_rate_limit_counter_resets_on_success():
    cb = CircuitBreaker(DarwinConfig())
    cb.record_rate_limit_exhausted()
    cb.record_rate_limit_exhausted()
    cb.record_success()
    cb.record_rate_limit_exhausted()
    assert cb.halt_reason() is None


from fee_crawler.agents.darwin.estimate import estimate_batch_cost_usd


def test_estimate_uses_bootstrap_when_no_history():
    """First run has no history — use bootstrap default."""
    est = estimate_batch_cost_usd(
        size=1000, cache_hit_rate=None, avg_cost_per_miss_usd=None,
        config=DarwinConfig(),
    )
    assert est == 1000 * 0.002  # bootstrap_cost_per_row_usd


def test_estimate_discounts_cache_hits():
    est = estimate_batch_cost_usd(
        size=1000, cache_hit_rate=0.30, avg_cost_per_miss_usd=0.001,
        config=DarwinConfig(),
    )
    # 1000 * (1 - 0.30) * 0.001 = 0.70
    assert abs(est - 0.70) < 1e-6


def test_estimate_zero_at_full_cache_hit():
    est = estimate_batch_cost_usd(
        size=100, cache_hit_rate=1.0, avg_cost_per_miss_usd=0.001,
        config=DarwinConfig(),
    )
    assert est == 0.0


# ---------------------------------------------------------------------------
# A-4: classifier tests
# ---------------------------------------------------------------------------

from fee_crawler.agents.darwin.classifier import (
    validate_llm_result,
    classify_names_with_retry,
)


def test_validate_rejects_unknown_key():
    assert validate_llm_result("totally_fake_name_xyz", "not_a_real_key") is False


def test_validate_rejects_never_merge_nsf_to_overdraft():
    # Name contains "nsf" but suggestion is "overdraft" — NEVER_MERGE_PAIRS guard
    assert validate_llm_result("nsf fee", "overdraft") is False


def test_validate_accepts_valid_mapping():
    from fee_crawler.fee_analysis import CANONICAL_KEY_MAP
    known_key = next(iter(CANONICAL_KEY_MAP.keys()))
    assert validate_llm_result("arbitrary name", known_key) is True


@pytest.mark.asyncio
async def test_classify_names_retries_on_rate_limit():
    import anthropic
    import httpx

    def make_rate_limit_error():
        req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
        resp = httpx.Response(429, request=req)
        e = anthropic.RateLimitError("rate limited", response=resp, body=None)
        e.retry_after = 0
        return e

    calls = {"n": 0}

    async def fake_call(names):
        calls["n"] += 1
        if calls["n"] < 3:
            raise make_rate_limit_error()
        return [{"fee_name": n, "canonical_fee_key": None, "confidence": 0.5} for n in names]

    config = DarwinConfig(backoff_base_seconds=0.0, backoff_max_seconds=0.0)
    result = await classify_names_with_retry(["foo"], _caller=fake_call, config=config)
    assert len(result) == 1
    assert calls["n"] == 3
