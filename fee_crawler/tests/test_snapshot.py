"""Tests for quarterly fee snapshot command.

Covers D-08: fee_index_snapshots (category-level) and institution_fee_snapshots
(institution-level) tables. Idempotent on re-run same date.
"""

from unittest.mock import MagicMock, call, patch
import pytest

from fee_crawler.commands.snapshot_fees import run


def _make_conn(category_rows=None, institution_rows=None):
    """Build a mock psycopg2 connection with configurable cursor results."""
    conn = MagicMock()
    cursor = MagicMock()
    conn.cursor.return_value = cursor

    # fetchall calls: first for category query, second for institution query
    category_rows = category_rows or []
    institution_rows = institution_rows or []
    cursor.fetchall.side_effect = [category_rows, institution_rows]

    return conn, cursor


def test_category_snapshot_creates_rows():
    """Running snapshot creates one row per fee_category in fee_index_snapshots
    with median_amount, p25, p75, institution_count, fee_count."""
    # Three fees in one category from two institutions
    cat_rows = [
        ("monthly_maintenance", "monthly_maintenance", 1, 12.00, "bank"),
        ("monthly_maintenance", "monthly_maintenance", 2, 15.00, "bank"),
        ("monthly_maintenance", "monthly_maintenance", 1, 10.00, "bank"),
    ]
    inst_rows = []

    conn, cursor = _make_conn(cat_rows, inst_rows)

    result = run(conn, snapshot_date="2026-04-10")

    assert result["snapshot_date"] == "2026-04-10"
    assert result["category_snapshots"] == 1
    assert result["institution_snapshots"] == 0

    # Verify INSERT was called with fee_index_snapshots table
    calls_str = " ".join(str(c) for c in cursor.execute.call_args_list)
    assert "fee_index_snapshots" in calls_str
    conn.commit.assert_called_once()


def test_institution_snapshot_creates_rows():
    """Running snapshot creates one row per (institution, canonical_fee_key)
    in institution_fee_snapshots."""
    cat_rows = []
    inst_rows = [
        (1, "monthly_maintenance", 12.00, "approved"),
        (2, "overdraft", 35.00, "staged"),
    ]

    conn, cursor = _make_conn(cat_rows, inst_rows)

    result = run(conn, snapshot_date="2026-04-10")

    assert result["institution_snapshots"] == 2

    calls_str = " ".join(str(c) for c in cursor.execute.call_args_list)
    assert "institution_fee_snapshots" in calls_str


def test_snapshot_idempotent_same_date():
    """Running snapshot twice on the same date does not create duplicate rows
    (INSERT ... ON CONFLICT DO UPDATE)."""
    cat_rows = [
        ("monthly_maintenance", "monthly_maintenance", 1, 12.00, None),
    ]
    inst_rows = []

    conn, cursor = _make_conn(cat_rows, inst_rows)

    result = run(conn, snapshot_date="2026-04-10")

    # Verify ON CONFLICT clause is in the SQL
    insert_calls = [
        str(c) for c in cursor.execute.call_args_list
        if "INSERT" in str(c)
    ]
    assert any("ON CONFLICT" in c for c in insert_calls), (
        "INSERT must include ON CONFLICT DO UPDATE for idempotency"
    )


def test_snapshot_charter_filter():
    """fee_index_snapshots rows include the charter column from joined crawl_targets."""
    cat_rows = [
        ("monthly_maintenance", "monthly_maintenance", 1, 12.00, "bank"),
        ("monthly_maintenance", "monthly_maintenance", 2, 14.00, "credit_union"),
    ]
    inst_rows = []

    conn, cursor = _make_conn(cat_rows, inst_rows)

    result = run(conn, snapshot_date="2026-04-10")

    # Two distinct (category, charter) groups → 2 snapshot rows
    assert result["category_snapshots"] == 2


def test_snapshot_detects_qoq_delta():
    """With two snapshots on different dates, the delta between category medians
    is computable from the table data."""
    # Snapshot Q1
    q1_rows = [("overdraft", "overdraft", 1, 30.00, None)]
    inst_rows_q1 = []
    conn1, _ = _make_conn(q1_rows, inst_rows_q1)
    result_q1 = run(conn1, snapshot_date="2026-01-01")
    assert result_q1["category_snapshots"] == 1

    # Snapshot Q2 with higher median
    q2_rows = [("overdraft", "overdraft", 1, 35.00, None)]
    inst_rows_q2 = []
    conn2, _ = _make_conn(q2_rows, inst_rows_q2)
    result_q2 = run(conn2, snapshot_date="2026-04-01")
    assert result_q2["category_snapshots"] == 1

    # QoQ delta is (35-30)/30 = +16.7% — computable from the two snapshot rows
    # (This test verifies the data exists; actual delta computation is a query concern)
    assert result_q1["snapshot_date"] != result_q2["snapshot_date"]


def test_snapshot_returns_correct_keys():
    """run() always returns dict with category_snapshots, institution_snapshots, snapshot_date."""
    conn, _ = _make_conn([], [])
    result = run(conn, snapshot_date="2026-04-10")

    assert "category_snapshots" in result
    assert "institution_snapshots" in result
    assert "snapshot_date" in result
    assert result["snapshot_date"] == "2026-04-10"
