"""Tests for quarterly fee snapshot command.

Covers D-08: fee_index_snapshots (category-level) and institution_fee_snapshots
(institution-level) tables. Idempotent on re-run same date.
"""
import pytest


def test_category_snapshot_creates_rows():
    """Running snapshot creates one row per fee_category in fee_index_snapshots
    with median_amount, p25, p75, institution_count, fee_count."""
    pytest.skip("Not yet implemented — Plan 03")


def test_institution_snapshot_creates_rows():
    """Running snapshot creates one row per (institution, canonical_fee_key)
    in institution_fee_snapshots."""
    pytest.skip("Not yet implemented — Plan 03")


def test_snapshot_idempotent_same_date():
    """Running snapshot twice on the same date does not create duplicate rows
    (INSERT ... ON CONFLICT DO UPDATE)."""
    pytest.skip("Not yet implemented — Plan 03")


def test_snapshot_charter_filter():
    """When charter filter is applied, fee_index_snapshots rows have charter column
    set to the filter value."""
    pytest.skip("Not yet implemented — Plan 03")


def test_snapshot_detects_qoq_delta():
    """With two snapshots on different dates, the delta between category medians
    is computable from the table data."""
    pytest.skip("Not yet implemented — Plan 03")
