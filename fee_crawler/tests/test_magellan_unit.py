"""Pure unit tests for Magellan — no DB, no network."""
import pytest

import fee_crawler.agents.magellan.orchestrator as orchestrator
from fee_crawler.agents.magellan.config import MagellanConfig
from fee_crawler.agents.magellan.plausibility import is_plausible_fee_schedule
from fee_crawler.agents.magellan.rungs._base import _Target


def test_plausible_with_real_fees():
    fees = [
        {"name": "Monthly Maintenance Fee", "amount": 12.0},
        {"name": "Overdraft Fee", "amount": 35.0},
        {"name": "NSF Fee", "amount": 35.0},
    ]
    text = "Schedule of Fees - Monthly Maintenance Fee $12 - Overdraft $35"
    assert is_plausible_fee_schedule(fees, text) is True


def test_not_plausible_when_no_fees():
    assert is_plausible_fee_schedule([], "any text") is False


def test_not_plausible_when_text_is_404():
    fees = [{"name": "thing", "amount": 1.0}]
    text = "404 Not Found — the page you requested does not exist"
    assert is_plausible_fee_schedule(fees, text) is False


def test_not_plausible_when_text_is_cookie_banner():
    fees = [{"name": "cookie", "amount": 1.0}]
    text = "We use cookies to improve your experience. Accept All / Reject All"
    assert is_plausible_fee_schedule(fees, text) is False


def test_plausible_without_text_when_many_fees():
    fees = [
        {"name": "ATM Fee Non-Network", "amount": 3.0},
        {"name": "Wire Transfer Domestic", "amount": 25.0},
        {"name": "Paper Statement Fee", "amount": 2.0},
    ]
    assert is_plausible_fee_schedule(fees, "") is True


def test_not_plausible_with_one_ambiguous_fee():
    fees = [{"name": "Delivery Fee", "amount": 5.99}]
    text = "Restaurant menu — delivery fee applies to orders under $20"
    assert is_plausible_fee_schedule(fees, text) is False


from fee_crawler.agents.magellan.orchestrator import decide_next_state, RescueOutcome
from fee_crawler.agents.magellan.rungs import RungResult


def test_decide_retry_after_on_timeout():
    r = RungResult(error="TimeoutError: connection timed out")
    assert decide_next_state(r, plausible=False) == RescueOutcome.RETRY_AFTER


def test_decide_retry_after_on_5xx():
    r = RungResult(http_status=503)
    assert decide_next_state(r, plausible=False) == RescueOutcome.RETRY_AFTER


def test_decide_needs_human_when_fees_but_not_plausible():
    r = RungResult(fees=[{"name": "x", "amount": 1}], http_status=200)
    assert decide_next_state(r, plausible=False) == RescueOutcome.NEEDS_HUMAN


def test_decide_dead_on_403():
    r = RungResult(http_status=403)
    assert decide_next_state(r, plausible=False) == RescueOutcome.DEAD


def test_decide_dead_on_404():
    r = RungResult(http_status=404)
    assert decide_next_state(r, plausible=False) == RescueOutcome.DEAD


def test_decide_dead_default():
    r = RungResult()
    assert decide_next_state(r, plausible=False) == RescueOutcome.DEAD


def _targets(count: int) -> list[_Target]:
    return [
        _Target(
            id=index + 1,
            fee_schedule_url=f"https://example{index}.test/fees",
            institution_name=f"Bank {index}",
            charter_type="bank",
        )
        for index in range(count)
    ]


@pytest.mark.asyncio
async def test_rescue_batch_dead_urls_do_not_trip_circuit(monkeypatch):
    class _DeadRung:
        name = "dead"

        async def run(self, target, context):
            return RungResult(fees=[], http_status=404)

    async def fake_select_candidates(conn, limit):
        return _targets(limit)

    async def fake_mark_target(target, outcome, reasoning):
        return None

    monkeypatch.setattr(orchestrator, "select_candidates", fake_select_candidates)
    monkeypatch.setattr(orchestrator, "_mark_target", fake_mark_target)
    orchestrator.LADDER.clear()
    orchestrator.LADDER.append(_DeadRung())
    try:
        result = await orchestrator.rescue_batch(object(), size=5)
    finally:
        orchestrator.LADDER.clear()

    assert result.selected == 5
    assert result.processed == 5
    assert result.dead == 5
    assert result.circuit_tripped is False


@pytest.mark.asyncio
async def test_rescue_batch_attempted_count_stops_at_circuit(monkeypatch):
    class _TransientRung:
        name = "transient"

        async def run(self, target, context):
            raise TimeoutError("upstream timed out")

    async def fake_select_candidates(conn, limit):
        return _targets(limit)

    async def fake_mark_target(target, outcome, reasoning):
        return None

    monkeypatch.setattr(orchestrator, "select_candidates", fake_select_candidates)
    monkeypatch.setattr(orchestrator, "_mark_target", fake_mark_target)
    orchestrator.LADDER.clear()
    orchestrator.LADDER.append(_TransientRung())
    try:
        result = await orchestrator.rescue_batch(
            object(),
            size=5,
            config=MagellanConfig(consecutive_failures_to_halt=2),
        )
    finally:
        orchestrator.LADDER.clear()

    assert result.selected == 5
    assert result.processed == 2
    assert result.retry_after == 2
    assert result.circuit_tripped is True
