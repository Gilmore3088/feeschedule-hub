"""Pure unit tests for Magellan — no DB, no network, no async."""
from fee_crawler.agents.magellan.plausibility import is_plausible_fee_schedule


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
