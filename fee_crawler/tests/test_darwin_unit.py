"""Pure unit tests for Darwin — no DB, no network, no async."""
import asyncio
from unittest.mock import AsyncMock

import pytest

from fee_crawler.agents.darwin.circuit import CircuitBreaker, HaltReason
from fee_crawler.agents.darwin.classifier import (
    classify_names_with_retry,
    validate_llm_result,
)
from fee_crawler.agents.darwin.config import DarwinConfig
from fee_crawler.agents.darwin.estimate import estimate_batch_cost_usd
from fee_crawler.agents.darwin.orchestrator import (
    _Candidate,
    _is_deferable_provider_error,
    _promote_or_cache,
    classify_batch,
)


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


def test_billing_error_is_deferred_to_low_confidence_queue():
    exc = RuntimeError("Your credit balance is too low; visit billing")
    exc.status_code = 400
    assert _is_deferable_provider_error(exc) is True


def test_unrelated_bad_request_is_not_deferred():
    exc = RuntimeError("malformed tool schema")
    exc.status_code = 400
    assert _is_deferable_provider_error(exc) is False


@pytest.mark.asyncio
async def test_cache_hit_does_not_rewrite_classification_cache(monkeypatch):
    cache_upsert = AsyncMock()
    flag_update = AsyncMock()
    monkeypatch.setattr(
        "fee_crawler.agents.darwin.orchestrator.upsert_classification_cache",
        cache_upsert,
    )
    monkeypatch.setattr(
        "fee_crawler.agents.darwin.orchestrator.update_fee_raw_flags",
        flag_update,
    )

    outcome, _ = await _promote_or_cache(
        _Candidate(fee_raw_id=1, fee_name="synthetic uncommon fee"),
        None,
        0.1,
        "cache:synthetic uncommon fee",
        "cache-hit",
        DarwinConfig(),
    )

    assert outcome == "cached_low_conf"
    cache_upsert.assert_not_awaited()
    flag_update.assert_awaited_once()


@pytest.mark.asyncio
async def test_persistence_is_bounded_and_concurrent(monkeypatch):
    candidates = [
        _Candidate(fee_raw_id=i, fee_name=f"synthetic uncommon fee {i}")
        for i in range(12)
    ]
    monkeypatch.setattr(
        "fee_crawler.agents.darwin.orchestrator.select_candidates",
        AsyncMock(return_value=candidates),
    )
    monkeypatch.setattr(
        "fee_crawler.agents.darwin.orchestrator._lookup_cache",
        AsyncMock(
            return_value={candidate.normalized_name: (None, 0.1) for candidate in candidates}
        ),
    )

    active = 0
    maximum = 0

    async def persist(*_args, **_kwargs):
        nonlocal active, maximum
        active += 1
        maximum = max(maximum, active)
        await asyncio.sleep(0.01)
        active -= 1
        return "cached_low_conf", None

    monkeypatch.setattr(
        "fee_crawler.agents.darwin.orchestrator._promote_or_cache",
        persist,
    )

    result = await classify_batch(
        object(),
        len(candidates),
        config=DarwinConfig(persistence_concurrency=3),
    )

    assert result.cached_low_conf == len(candidates)
    assert maximum == 3


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
