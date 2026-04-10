"""Tests for canonical key outlier detection and reassignment sweeps in Roomba.

Uses pure-function helpers to avoid requiring a real DB connection.
"""

import pytest

# Import the pure logic helpers (these will be added to roomba.py)
from fee_crawler.commands.roomba import (
    detect_canonical_outliers,
    compute_canonical_stats,
    sweep_canonical_reassignments,
)


# ---------------------------------------------------------------------------
# Helper builders
# ---------------------------------------------------------------------------


def _stats(key: str, median: float, stddev: float, count: int = 10) -> dict:
    return {
        "canonical_fee_key": key,
        "median_amount": median,
        "stddev_amount": stddev,
        "obs_count": count,
    }


def _fee(fee_id: int, key: str, amount: float, status: str = "pending") -> dict:
    return {
        "id": fee_id,
        "fee_name": f"Test fee {fee_id}",
        "amount": amount,
        "canonical_fee_key": key,
        "review_status": status,
        "fee_category": key,  # default: category == canonical key
    }


# ---------------------------------------------------------------------------
# Test 1: $3 overdraft is flagged as outlier (median=$35, stddev=$8)
# 3+ stddev below: 35 - 3*8 = 11, so $3 < $11 → should flag
# ---------------------------------------------------------------------------


def test_roomba_canonical_outlier_below():
    stats = {"overdraft": _stats("overdraft", median=35.0, stddev=8.0)}
    fees = [_fee(1, "overdraft", 3.0)]

    flagged = detect_canonical_outliers(stats, fees)

    assert len(flagged) == 1
    assert flagged[0]["fee_id"] == 1
    assert flagged[0]["canonical_key"] == "overdraft"


# ---------------------------------------------------------------------------
# Test 2: $25 overdraft is NOT flagged (median=$35, stddev=$8)
# Thresholds: low=35-24=11, high=35+24=59. $25 is within range.
# ---------------------------------------------------------------------------


def test_roomba_canonical_no_flag_within_range():
    stats = {"overdraft": _stats("overdraft", median=35.0, stddev=8.0)}
    fees = [_fee(2, "overdraft", 25.0)]

    flagged = detect_canonical_outliers(stats, fees)

    assert len(flagged) == 0


# ---------------------------------------------------------------------------
# Test 3: Fees with canonical_fee_key IS NULL are skipped
# ---------------------------------------------------------------------------


def test_roomba_canonical_skips_null_key():
    stats = {"overdraft": _stats("overdraft", median=35.0, stddev=8.0)}
    null_key_fee = {
        "id": 3,
        "fee_name": "Some fee",
        "amount": 3.0,
        "canonical_fee_key": None,
        "review_status": "pending",
        "fee_category": "overdraft",
    }

    flagged = detect_canonical_outliers(stats, [null_key_fee])

    assert len(flagged) == 0


# ---------------------------------------------------------------------------
# Test 4: Categories with fewer than 5 observations are skipped
# ---------------------------------------------------------------------------


def test_roomba_canonical_skips_insufficient_data():
    # Only 4 observations — not enough for statistical outlier detection
    stats = {"overdraft": _stats("overdraft", median=35.0, stddev=8.0, count=4)}
    fees = [_fee(4, "overdraft", 3.0)]

    flagged = detect_canonical_outliers(stats, fees)

    assert len(flagged) == 0


# ---------------------------------------------------------------------------
# Test 5: compute_canonical_stats excludes $0 amounts and already-rejected fees
# Tests that the stats input is expected to exclude $0 and rejected rows
# (This tests the logic contract; the SQL enforces it at DB level)
# ---------------------------------------------------------------------------


def test_roomba_canonical_stats_contract():
    """compute_canonical_stats returns only non-zero, non-rejected fee amounts."""
    rows = [
        {"amount": 35.0, "canonical_fee_key": "overdraft", "review_status": "pending"},
        {"amount": 0.0, "canonical_fee_key": "overdraft", "review_status": "pending"},   # excluded: $0
        {"amount": 30.0, "canonical_fee_key": "overdraft", "review_status": "rejected"},  # excluded: rejected
        {"amount": 40.0, "canonical_fee_key": "overdraft", "review_status": "staged"},
        {"amount": 38.0, "canonical_fee_key": "overdraft", "review_status": "approved"},
        {"amount": 33.0, "canonical_fee_key": "overdraft", "review_status": "pending"},
    ]

    stats = compute_canonical_stats(rows)

    assert "overdraft" in stats
    assert stats["overdraft"]["obs_count"] == 4  # $0 and rejected excluded
    assert stats["overdraft"]["median_amount"] > 0


# ---------------------------------------------------------------------------
# Test 6: $0 amounts are excluded from outlier detection
# ---------------------------------------------------------------------------


def test_roomba_canonical_skips_zero_amounts():
    stats = {"overdraft": _stats("overdraft", median=35.0, stddev=8.0)}
    zero_fee = {
        "id": 6,
        "fee_name": "No charge overdraft",
        "amount": 0.0,
        "canonical_fee_key": "overdraft",
        "review_status": "pending",
        "fee_category": "overdraft",
    }

    flagged = detect_canonical_outliers(stats, [zero_fee])

    assert len(flagged) == 0


# ---------------------------------------------------------------------------
# Test 7: High outlier is also flagged (amount > median + 3*stddev)
# median=$35, stddev=$8 → high threshold = 35+24=59. $90 > $59 → flag
# ---------------------------------------------------------------------------


def test_roomba_canonical_outlier_above():
    stats = {"overdraft": _stats("overdraft", median=35.0, stddev=8.0)}
    fees = [_fee(7, "overdraft", 90.0)]

    flagged = detect_canonical_outliers(stats, fees)

    assert len(flagged) == 1
    assert flagged[0]["fee_id"] == 7


# ---------------------------------------------------------------------------
# Test 8: Already-flagged and rejected fees are not re-flagged
# ---------------------------------------------------------------------------


def test_roomba_canonical_skips_already_flagged():
    stats = {"overdraft": _stats("overdraft", median=35.0, stddev=8.0)}
    flagged_fee = _fee(8, "overdraft", 3.0, status="flagged")
    rejected_fee = _fee(9, "overdraft", 3.0, status="rejected")

    result = detect_canonical_outliers(stats, [flagged_fee, rejected_fee])

    assert len(result) == 0


# ---------------------------------------------------------------------------
# Test 9: sweep_canonical_reassignments import check
# ---------------------------------------------------------------------------


def test_sweep_canonical_reassignments_importable():
    """Ensure the function is importable and callable (smoke test)."""
    assert callable(sweep_canonical_reassignments)
