"""Pure unit tests for Darwin — no DB, no network, no async."""
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
