"""Idempotency and timing tests for the categorize and validate pipeline stages.

Coverage:
  - IDEM-01: Running categorize_fees.run() or backfill_validation.run() twice on the
    same extracted_fees rows produces identical row counts both times (no phantom rows
    created, no rows deleted on the second pass).
  - TIME-01: Both stages complete within their configured time budgets (5s each on
    synthetic 6-row data), catching hangs before they reach the full pipeline test.

Data strategy:
  - Synthetic data only — no LLM calls, no network I/O.
  - Function-scoped idem_db fixture for complete test isolation.

Marks: @pytest.mark.e2e only (no llm, no slow).
"""

from __future__ import annotations

import time

import pytest

from fee_crawler.commands.categorize_fees import run as categorize_run
from fee_crawler.commands.backfill_validation import run as validate_run
from fee_crawler.db import Database

# ---------------------------------------------------------------------------
# Synthetic fee row names — alias-matchable against the 49-category taxonomy
# (mirrors _FEE_ROWS from test_categorization_stage.py, omitting ZZUNKNOWNFEE)
# ---------------------------------------------------------------------------

_FEE_ROWS = [
    "Monthly Service Fee",    # -> monthly_maintenance
    "NSF Fee",                # -> nsf
    "ATM Fee",                # -> atm_non_network
    "Outgoing Wire Transfer", # -> wire_domestic_outgoing
    "Stop Payment Fee",       # -> stop_payment
    "Cashiers Check",         # -> cashiers_check
]
_ROW_COUNT = 6

# ---------------------------------------------------------------------------
# Time budget constants (D-06: generous 10x expected — catches hangs, not perf)
# ---------------------------------------------------------------------------

BUDGET_CATEGORIZE_S = 5.0
BUDGET_VALIDATE_S = 5.0


# ---------------------------------------------------------------------------
# Helpers — copied from test_audit_trail.py pattern
# ---------------------------------------------------------------------------

def _teardown(db: Database) -> None:
    db.execute("DELETE FROM gold_standard_fees")
    db.execute("DELETE FROM fee_reviews")
    db.execute("DELETE FROM extracted_fees")
    db.execute("DELETE FROM crawl_results")
    db.execute("DELETE FROM crawl_runs WHERE trigger = 'test'")
    db.execute("DELETE FROM crawl_targets")
    db.commit()


def _insert_scaffold(db: Database, cert_suffix: str) -> tuple[int, int, int]:
    db.execute(
        "INSERT INTO crawl_targets (institution_name, charter_type, source, cert_number) "
        "VALUES (?, ?, ?, ?)",
        ("Test Bank", "bank", "fdic", f"TEST-IDEM-{cert_suffix}"),
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


# ---------------------------------------------------------------------------
# Function-scoped fixture: insert FK scaffold + 6 alias-matchable fee rows
# ---------------------------------------------------------------------------

@pytest.fixture()
def idem_db(test_db: Database) -> Database:
    """Function-scoped fixture: clean state, insert 6 synthetic extracted_fees rows,
    yield test_db, then tear down.

    Each test gets a completely fresh set of rows with fee_category=NULL so that
    the first categorize/validate run has something to process, and the second
    run exercises the idempotent no-op path.
    """
    _teardown(test_db)
    target_id, run_id, result_id = _insert_scaffold(test_db, "001")
    for fee_name in _FEE_ROWS:
        test_db.execute(
            "INSERT INTO extracted_fees "
            "(crawl_result_id, crawl_target_id, fee_name, extraction_confidence) "
            "VALUES (?, ?, ?, ?)",
            (result_id, target_id, fee_name, 0.90),
        )
    test_db.commit()
    yield test_db
    _teardown(test_db)


# ---------------------------------------------------------------------------
# IDEM-01: categorize_fees.run() is idempotent
# ---------------------------------------------------------------------------

@pytest.mark.e2e
def test_categorize_is_idempotent(idem_db: Database) -> None:
    """IDEM-01 (categorize): running categorize_fees.run() twice produces identical row counts."""
    categorize_run(idem_db)
    count_run1 = idem_db.fetchone("SELECT COUNT(*) AS cnt FROM extracted_fees")["cnt"]

    categorize_run(idem_db)
    count_run2 = idem_db.fetchone("SELECT COUNT(*) AS cnt FROM extracted_fees")["cnt"]

    assert count_run1 == count_run2, (
        f"Row count changed between categorize runs: run1={count_run1}, run2={count_run2}. "
        "categorize_fees.run() must be idempotent."
    )
    assert count_run2 == _ROW_COUNT, (
        f"Expected {_ROW_COUNT} rows after two categorize runs, got {count_run2}."
    )


# ---------------------------------------------------------------------------
# IDEM-01: backfill_validation.run() is idempotent
# ---------------------------------------------------------------------------

@pytest.mark.e2e
def test_validate_is_idempotent(idem_db: Database, test_config) -> None:
    """IDEM-01 (validate): running backfill_validation.run() twice produces identical row counts."""
    categorize_run(idem_db)  # prerequisite: fee_category must be set before validate

    validate_run(idem_db, test_config)
    count_run1 = idem_db.fetchone("SELECT COUNT(*) AS cnt FROM extracted_fees")["cnt"]

    validate_run(idem_db, test_config)
    count_run2 = idem_db.fetchone("SELECT COUNT(*) AS cnt FROM extracted_fees")["cnt"]

    assert count_run1 == count_run2, (
        f"Row count changed between validate runs: run1={count_run1}, run2={count_run2}. "
        "backfill_validation.run() must be idempotent."
    )
    assert count_run2 == _ROW_COUNT, (
        f"Expected {_ROW_COUNT} rows after two validate runs, got {count_run2}."
    )


# ---------------------------------------------------------------------------
# TIME-01: Stage time budgets
# ---------------------------------------------------------------------------

@pytest.mark.e2e
def test_stage_time_budgets(idem_db: Database, test_config) -> None:
    """TIME-01: categorize_fees.run() and backfill_validation.run() complete within
    their configured time budgets.

    Budgets are intentionally generous (5s each, 10x expected wall-clock) to catch
    hangs or accidental full-table scans — not to benchmark performance.

    Both runs of categorize are timed: run 1 processes 6 rows; run 2 processes 0 rows
    (WHERE fee_category IS NULL matches nothing). Both must finish under budget.
    Similarly for validate.
    """
    # Categorize run 1 (6 rows processed)
    t0 = time.monotonic()
    categorize_run(idem_db)
    elapsed_cat_run1 = time.monotonic() - t0

    # Categorize run 2 (0 rows — idempotent no-op)
    t0 = time.monotonic()
    categorize_run(idem_db)
    elapsed_cat_run2 = time.monotonic() - t0

    # Validate run 1 (rows now have fee_category set)
    t0 = time.monotonic()
    validate_run(idem_db, test_config)
    elapsed_val_run1 = time.monotonic() - t0

    # Validate run 2 (0 rows — validation_flags already set)
    t0 = time.monotonic()
    validate_run(idem_db, test_config)
    elapsed_val_run2 = time.monotonic() - t0

    assert elapsed_cat_run1 < BUDGET_CATEGORIZE_S, (
        f"categorize run 1 took {elapsed_cat_run1:.3f}s, budget is {BUDGET_CATEGORIZE_S}s."
    )
    assert elapsed_cat_run2 < BUDGET_CATEGORIZE_S, (
        f"categorize run 2 (no-op) took {elapsed_cat_run2:.3f}s, budget is {BUDGET_CATEGORIZE_S}s."
    )
    assert elapsed_val_run1 < BUDGET_VALIDATE_S, (
        f"validate run 1 took {elapsed_val_run1:.3f}s, budget is {BUDGET_VALIDATE_S}s."
    )
    assert elapsed_val_run2 < BUDGET_VALIDATE_S, (
        f"validate run 2 (no-op) took {elapsed_val_run2:.3f}s, budget is {BUDGET_VALIDATE_S}s."
    )
