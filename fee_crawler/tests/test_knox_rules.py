"""Unit tests for Knox review rules."""

from fee_crawler.agents.knox.rules import (
    apply_rules,
    check_excessive_amount,
    check_zero_without_waiver,
)


def test_excessive_accept_below_threshold():
    decision, _ = check_excessive_amount(100.0, 50.0, peer_count=10, threshold_multiplier=5.0)
    assert decision == "accept"


def test_excessive_accept_at_boundary():
    decision, _ = check_excessive_amount(250.0, 50.0, peer_count=10, threshold_multiplier=5.0)
    assert decision == "accept"


def test_excessive_reject_above_threshold():
    decision, reason = check_excessive_amount(251.0, 50.0, peer_count=10, threshold_multiplier=5.0)
    assert decision == "reject"
    assert "exceeds" in reason.lower()


def test_excessive_skips_when_few_peers():
    # Only 3 peers is below the min_peers=5 safety threshold
    decision, reason = check_excessive_amount(
        10000.0, 50.0, peer_count=3, threshold_multiplier=5.0, min_peers=5
    )
    assert decision == "accept"
    assert "below min" in reason.lower() or "peer_count" in reason.lower()


def test_excessive_accepts_on_missing_median():
    decision, _ = check_excessive_amount(1000.0, None, peer_count=10, threshold_multiplier=5.0)
    assert decision == "accept"


def test_zero_accept_with_free():
    decision, _ = check_zero_without_waiver(0.0, "Free Checks: Free")
    assert decision == "accept"


def test_zero_accept_with_waived():
    decision, _ = check_zero_without_waiver(0.0, "Monthly Fee Waived")
    assert decision == "accept"


def test_zero_accept_case_insensitive():
    decision, _ = check_zero_without_waiver(0.0, "NO CHARGE for wire transfers")
    assert decision == "accept"


def test_zero_reject_mystery_fee():
    decision, reason = check_zero_without_waiver(0.0, "Mystery Fee")
    assert decision == "reject"
    assert "free-fee" in reason.lower() or "no free" in reason.lower()


def test_zero_check_skipped_for_nonzero():
    decision, _ = check_zero_without_waiver(25.0, "Anything Fee")
    assert decision == "accept"


def test_apply_rules_accept_normal():
    decision, reasons = apply_rules(
        amount=100.0, fee_name="Monthly Maintenance", peer_median=50.0, peer_count=10
    )
    assert decision == "accept"
    assert len(reasons) == 2


def test_apply_rules_reject_excessive():
    decision, reasons = apply_rules(
        amount=500.0, fee_name="Excessive", peer_median=50.0, peer_count=10
    )
    assert decision == "reject"
    # Short-circuits after Rule 1
    assert len(reasons) == 1


def test_apply_rules_reject_zero_without_waiver():
    decision, reasons = apply_rules(
        amount=0.0, fee_name="Bogus Zero", peer_median=50.0, peer_count=10
    )
    assert decision == "reject"
    assert len(reasons) == 2


def test_apply_rules_accept_zero_with_free():
    decision, _ = apply_rules(
        amount=0.0, fee_name="Free Online Banking", peer_median=50.0, peer_count=10
    )
    assert decision == "accept"
