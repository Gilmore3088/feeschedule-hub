"""Validation stage tests — verifies that backfill_validation.run() assigns the correct
review_status based on confidence thresholds and that run_outlier_detection() flags
statistically extreme fee amounts using IQR-based analysis.

Tests:
  - test_confidence_threshold_transitions: VALD-01 — confidence >= 0.85 and no blocking
    flags transitions to 'staged'; confidence < 0.85 triggers low_confidence warning →
    'flagged'; fees without fee_category are skipped and remain 'pending'.
  - test_outlier_detection_flags_statistical_outlier: VALD-02 — a fee whose amount is
    far outside the IQR bounds of its category peers is transitioned to 'flagged' and
    receives a non-null, valid JSON validation_flags entry.

Fixture scoping rationale:
  - validated_db and outlier_db are FUNCTION-scoped.
    Each test needs a clean set of synthetic rows with specific initial states.
    Both fixtures are pure Python/SQLite — no LLM calls, no network I/O.
    Function scope ensures complete isolation between test cases.

Marks: all tests are @pytest.mark.e2e only.
  - No @pytest.mark.llm (no Anthropic API calls).
  - No @pytest.mark.slow (validation is in-memory computation).

Confidence thresholds from config.py (ExtractionConfig defaults):
  - confidence_auto_stage_threshold: 0.85  (staging boundary, inclusive)
  - confidence_approve_threshold:    0.90  (auto-approve boundary, inclusive)

Validation behavior (from validation.py):
  - _check_low_confidence() raises a WARNING flag when confidence < threshold.
    A warning flag is a "blocking" flag → determine_review_status() returns 'flagged'.
    Therefore: low-confidence fees → 'flagged' (not 'pending').
  - 'pending' is the default for fees skipped by backfill_validation (e.g. fee_category IS NULL).
  - Fees with no flags and confidence >= 0.85 → 'staged'.
  - Fees with no flags and confidence >= 0.90 + category + in-range amount → 'approved'.
"""

from __future__ import annotations

import json

import pytest

from fee_crawler.commands.backfill_validation import run as validate_run
from fee_crawler.db import Database
from fee_crawler.pipeline.outlier_detection import run_outlier_detection

# ---------------------------------------------------------------------------
# Constants for test data
# ---------------------------------------------------------------------------

# Confidence values exercising all threshold ranges
_CONF_STAGED = 0.87           # >= 0.85 but < 0.90: staged (not auto-approved)
_CONF_STAGED_BOUNDARY = 0.85  # exactly at threshold: staged
_CONF_LOW = 0.70              # below threshold: triggers low_confidence warning → flagged
_CONF_FLAGGED_AMOUNT = 0.90   # high confidence but amount triggers error flag → flagged

# Amount values for VALD-01
# monthly_maintenance: min=0.00, max=25.00, hard_ceiling=50.00, allows_zero=True
# overdraft:           min=5.00, max=40.00, hard_ceiling=75.00, allows_zero=False
_AMT_NORMAL = 12.0           # within monthly_maintenance range, no amount flags
_AMT_OVERDRAFT = 30.0        # within overdraft range, no amount flags
_AMT_EXCEEDS_CEILING = 999.0  # exceeds monthly_maintenance hard_ceiling (50.00) → error flag

# Fee amounts for VALD-02 (outlier detection test)
# 5 normal atm_non_network fees clustered around $2-5 (IQR will be tight)
_NORMAL_ATM_AMOUNTS = [2.0, 2.5, 3.0, 3.5, 5.0]
_OUTLIER_ATM_AMOUNT = 500.0  # statistically extreme vs $2-5 cluster


# ---------------------------------------------------------------------------
# Helper: insert FK scaffold (crawl_targets -> crawl_runs -> crawl_results)
# Returns (target_id, run_id, result_id).
# ---------------------------------------------------------------------------

def _insert_scaffold(db: Database, cert_suffix: str) -> tuple[int, int, int]:
    db.execute(
        "INSERT INTO crawl_targets (institution_name, charter_type, source, cert_number) "
        "VALUES (?, ?, ?, ?)",
        ("Test Bank", "bank", "fdic", f"TEST-VALD-{cert_suffix}"),
    )
    target_id = db.conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    run_id = db.insert_returning_id(
        "INSERT INTO crawl_runs (trigger, targets_total) VALUES (?, ?)",
        ("test", 1),
    )

    result_id = db.insert_returning_id(
        "INSERT INTO crawl_results (crawl_run_id, crawl_target_id, status) VALUES (?, ?, ?)",
        (run_id, target_id, "success"),
    )
    db.commit()
    return target_id, run_id, result_id


def _teardown(db: Database) -> None:
    """Delete test data in FK-safe order.

    Tables referencing extracted_fees must be deleted first:
      fee_reviews (fee_id FK) and gold_standard_fees (fee_id FK)
    """
    db.execute("DELETE FROM gold_standard_fees")
    db.execute("DELETE FROM fee_reviews")
    db.execute("DELETE FROM extracted_fees")
    db.execute("DELETE FROM crawl_results")
    db.execute("DELETE FROM crawl_runs WHERE trigger = 'test'")
    db.execute("DELETE FROM crawl_targets")
    db.commit()


# ---------------------------------------------------------------------------
# Function-scoped fixture: confidence threshold data, validate, yield, teardown
# ---------------------------------------------------------------------------


@pytest.fixture()
def validated_db(test_db: Database, test_config) -> Database:
    """Function-scoped fixture: insert synthetic fees with known confidence values,
    run backfill_validation.run(), then yield test_db.

    Fee design:

      "High Conf Staged Fee" — confidence 0.87, monthly_maintenance $12 → staged
        (0.87 >= 0.85 stage threshold; 0.87 < 0.90 approve threshold → not auto-approved)

      "Exact Threshold Fee"  — confidence 0.85, overdraft $30 → staged
        (exactly at the boundary; boundary is inclusive per stage_threshold check)

      "Low Confidence Fee"   — confidence 0.70, monthly_maintenance $12 → flagged
        (_check_low_confidence raises WARNING → determine_review_status returns 'flagged')

      "Blocking Flag Fee"    — confidence 0.90, monthly_maintenance $999 → flagged
        (amount $999 exceeds hard_ceiling $50 → amount_out_of_range ERROR flag → flagged)

      "Uncat Skipped Fee"    — confidence 0.90, fee_category=NULL → stays 'pending'
        (backfill_validation skips rows with fee_category IS NULL)
    """
    _teardown(test_db)

    target_id, run_id, result_id = _insert_scaffold(test_db, "001")

    # Fees with fee_category set — will be processed by backfill_validation
    categorized_rows = [
        ("High Conf Staged Fee", "monthly_maintenance", _AMT_NORMAL,          _CONF_STAGED),
        ("Exact Threshold Fee",  "overdraft",           _AMT_OVERDRAFT,        _CONF_STAGED_BOUNDARY),
        ("Low Confidence Fee",   "monthly_maintenance", _AMT_NORMAL,           _CONF_LOW),
        ("Blocking Flag Fee",    "monthly_maintenance", _AMT_EXCEEDS_CEILING,  _CONF_FLAGGED_AMOUNT),
    ]
    for fee_name, fee_category, amount, confidence in categorized_rows:
        test_db.execute(
            "INSERT INTO extracted_fees "
            "(crawl_result_id, crawl_target_id, fee_name, fee_category, amount, "
            "extraction_confidence) VALUES (?, ?, ?, ?, ?, ?)",
            (result_id, target_id, fee_name, fee_category, amount, confidence),
        )

    # Fee with NO fee_category — backfill_validation will skip it → stays pending
    test_db.execute(
        "INSERT INTO extracted_fees "
        "(crawl_result_id, crawl_target_id, fee_name, amount, extraction_confidence) "
        "VALUES (?, ?, ?, ?, ?)",
        (result_id, target_id, "Uncat Skipped Fee", _AMT_NORMAL, 0.90),
    )
    test_db.commit()

    validate_run(test_db, test_config)

    yield test_db

    _teardown(test_db)


# ---------------------------------------------------------------------------
# Function-scoped fixture: outlier detection data, run outlier detect, teardown
# ---------------------------------------------------------------------------


@pytest.fixture()
def outlier_db(test_db: Database, test_config) -> Database:
    """Function-scoped fixture: insert 5 normal and 1 extreme atm_non_network fees,
    all pre-staged, then run run_outlier_detection() to flag the extreme outlier.

    run_outlier_detection() uses IQR-based stats and requires >= 5 rows in
    staged/approved status for a category before it will compute bounds.
    Normal amounts [2.0, 2.5, 3.0, 3.5, 5.0] produce a tight IQR:
      P25=$2.5, median=$3.0, P75=$3.5, IQR=$1.0
      upper_bound = P75 + 3 * IQR = $3.5 + $3.0 = $6.50
    $500.00 >> $6.50, so it is detected as a statistical outlier.
    """
    _teardown(test_db)

    target_id, run_id, result_id = _insert_scaffold(test_db, "002")

    for amount in _NORMAL_ATM_AMOUNTS:
        test_db.execute(
            "INSERT INTO extracted_fees "
            "(crawl_result_id, crawl_target_id, fee_name, fee_category, amount, "
            "extraction_confidence, review_status) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (result_id, target_id, f"ATM Fee ${amount:.2f}", "atm_non_network",
             amount, 0.90, "staged"),
        )

    test_db.execute(
        "INSERT INTO extracted_fees "
        "(crawl_result_id, crawl_target_id, fee_name, fee_category, amount, "
        "extraction_confidence, review_status) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (result_id, target_id, "ATM Fee Outlier", "atm_non_network",
         _OUTLIER_ATM_AMOUNT, 0.90, "staged"),
    )
    test_db.commit()

    run_outlier_detection(test_db)

    yield test_db

    _teardown(test_db)


# ---------------------------------------------------------------------------
# VALD-01: Confidence threshold drives review_status transitions
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_confidence_threshold_transitions(validated_db: Database) -> None:
    """VALD-01: backfill_validation.run() assigns review_status based on confidence.

    Asserts:
      - confidence 0.87 (>= stage threshold, < approve threshold) → staged
      - confidence 0.85 (exactly at stage threshold) → staged (boundary inclusive)
      - confidence 0.70 (below threshold) → flagged (low_confidence warning is blocking)
      - amount exceeding hard_ceiling → flagged (amount_out_of_range error is blocking)
      - fee with fee_category IS NULL → skipped by backfill_validation → stays pending
      - every non-null validation_flags value is valid JSON list
    """
    rows = validated_db.fetchall(
        "SELECT fee_name, review_status, validation_flags FROM extracted_fees"
    )
    by_name = {r["fee_name"]: r for r in rows}

    assert by_name["High Conf Staged Fee"]["review_status"] == "staged", (
        f"Expected 'staged' for confidence {_CONF_STAGED}, "
        f"got {by_name['High Conf Staged Fee']['review_status']!r}"
    )
    assert by_name["Exact Threshold Fee"]["review_status"] == "staged", (
        f"Expected 'staged' for confidence {_CONF_STAGED_BOUNDARY} (boundary inclusive), "
        f"got {by_name['Exact Threshold Fee']['review_status']!r}"
    )
    assert by_name["Low Confidence Fee"]["review_status"] == "flagged", (
        f"Expected 'flagged' for confidence {_CONF_LOW} "
        "(low_confidence warning flag is a blocking flag), "
        f"got {by_name['Low Confidence Fee']['review_status']!r}"
    )
    assert by_name["Blocking Flag Fee"]["review_status"] == "flagged", (
        f"Expected 'flagged' for amount={_AMT_EXCEEDS_CEILING} exceeding hard_ceiling, "
        f"got {by_name['Blocking Flag Fee']['review_status']!r}"
    )
    assert by_name["Uncat Skipped Fee"]["review_status"] == "pending", (
        "Expected 'pending' for fee with fee_category IS NULL "
        "(backfill_validation skips uncategorized fees), "
        f"got {by_name['Uncat Skipped Fee']['review_status']!r}"
    )

    for row in rows:
        if row["validation_flags"] is not None:
            parsed = json.loads(row["validation_flags"])
            assert isinstance(parsed, list), (
                f"validation_flags for {row['fee_name']!r} must be a JSON list, "
                f"got {type(parsed).__name__}"
            )


# ---------------------------------------------------------------------------
# VALD-02: Outlier detection flags statistically extreme amounts
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_outlier_detection_flags_statistical_outlier(outlier_db: Database) -> None:
    """VALD-02: run_outlier_detection() flags extreme amounts using IQR analysis.

    Setup: 5 normal atm_non_network fees at [$2.00-$5.00] + 1 outlier at $500.
    All 6 are pre-staged so IQR stats can be computed (requires >= 5 staged/approved).

    Asserts:
      - The $500 outlier fee has review_status == 'flagged'
      - The $500 outlier fee has non-null validation_flags (JSON list with >= 1 entry)
      - Each flag entry has 'rule', 'severity', 'message' keys
      - The 5 normal fees still have review_status == 'staged' (not incorrectly flagged)
    """
    outlier = outlier_db.fetchone(
        "SELECT id, fee_name, review_status, validation_flags "
        "FROM extracted_fees WHERE amount = ?",
        (_OUTLIER_ATM_AMOUNT,),
    )

    assert outlier is not None, "Outlier fee row not found in DB"
    assert outlier["review_status"] == "flagged", (
        f"Expected 'flagged' for ${_OUTLIER_ATM_AMOUNT} outlier, "
        f"got {outlier['review_status']!r}"
    )
    assert outlier["validation_flags"] is not None, (
        "validation_flags must be non-null for the outlier fee"
    )

    flags = json.loads(outlier["validation_flags"])
    assert isinstance(flags, list) and len(flags) >= 1, (
        f"validation_flags must be a non-empty JSON list, got: {outlier['validation_flags']}"
    )
    for flag in flags:
        assert "rule" in flag, f"Flag entry missing 'rule' key: {flag}"
        assert "severity" in flag, f"Flag entry missing 'severity' key: {flag}"
        assert "message" in flag, f"Flag entry missing 'message' key: {flag}"

    normal_rows = outlier_db.fetchall(
        "SELECT fee_name, review_status FROM extracted_fees WHERE amount < 10.0"
    )
    assert len(normal_rows) == len(_NORMAL_ATM_AMOUNTS), (
        f"Expected {len(_NORMAL_ATM_AMOUNTS)} normal rows, got {len(normal_rows)}"
    )
    for row in normal_rows:
        assert row["review_status"] == "staged", (
            f"Normal fee {row['fee_name']!r} should remain 'staged', "
            f"got {row['review_status']!r}"
        )
