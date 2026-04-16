"""Tests for backfill_canonical command.

Verifies:
1. CASE WHEN SQL generation from CANONICAL_KEY_MAP
2. NULL fee_category rows are not assigned a canonical_fee_key
3. Identity mapping: overdraft -> overdraft
4. Synonym mapping: rush_card_delivery -> rush_card
5. variant_type detection via Python loop
6. Index count snapshot comparison returns zero diffs
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch, call
import pytest

from fee_crawler.fee_analysis import CANONICAL_KEY_MAP, detect_variant_type


# ---------------------------------------------------------------------------
# Test 1: CASE WHEN SQL generation
# ---------------------------------------------------------------------------

def test_backfill_generates_case_when_for_all_canonical_map_entries():
    """backfill_canonical_keys builds SQL CASE WHEN covering all CANONICAL_KEY_MAP entries."""
    from fee_crawler.commands.backfill_canonical import build_case_when_sql

    sql = build_case_when_sql()

    # Must be an UPDATE statement
    assert "UPDATE extracted_fees" in sql
    assert "SET canonical_fee_key" in sql
    assert "CASE fee_category" in sql

    # Every entry in CANONICAL_KEY_MAP must appear as a WHEN clause
    for fee_category in CANONICAL_KEY_MAP:
        assert f"WHEN '{fee_category}'" in sql, (
            f"CANONICAL_KEY_MAP key '{fee_category}' missing from CASE WHEN SQL"
        )

    # Must end with ELSE NULL
    assert "ELSE NULL" in sql

    # Must have WHERE clause to only update rows with a category
    assert "WHERE fee_category IS NOT NULL" in sql

    # Must use %s Postgres placeholders (not SQLite ?)
    assert "?" not in sql


def test_case_when_sql_does_not_update_null_fee_category_rows():
    """WHERE clause excludes NULL fee_category rows."""
    from fee_crawler.commands.backfill_canonical import build_case_when_sql

    sql = build_case_when_sql()
    # Must not update rows where canonical_fee_key is already set (idempotency)
    assert "canonical_fee_key IS NULL" in sql or "WHERE fee_category IS NOT NULL" in sql


# ---------------------------------------------------------------------------
# Test 2: NULL fee_category stays NULL
# ---------------------------------------------------------------------------

def test_snapshot_comparison_returns_zero_diff_for_identical_snapshots():
    """snapshot_comparison() returns empty dict when before/after are identical."""
    from fee_crawler.commands.backfill_canonical import compare_snapshots

    before = {"overdraft": 100, "nsf": 80, "monthly_maintenance": 200}
    after = {"overdraft": 100, "nsf": 80, "monthly_maintenance": 200}

    diffs = compare_snapshots(before, after)
    assert diffs == {}, f"Expected no diffs, got: {diffs}"


def test_snapshot_comparison_detects_institution_count_change():
    """compare_snapshots() flags categories where institution_count changed."""
    from fee_crawler.commands.backfill_canonical import compare_snapshots

    before = {"overdraft": 100, "nsf": 80}
    after = {"overdraft": 99, "nsf": 80}  # overdraft lost one institution

    diffs = compare_snapshots(before, after)
    assert "overdraft" in diffs
    assert diffs["overdraft"]["before"] == 100
    assert diffs["overdraft"]["after"] == 99


# ---------------------------------------------------------------------------
# Test 3: Identity mapping: overdraft -> overdraft
# ---------------------------------------------------------------------------

def test_canonical_key_map_identity_for_base_categories():
    """For the 49 base categories, canonical_fee_key == fee_category (identity)."""
    from fee_crawler.fee_analysis import CANONICAL_KEY_MAP, FEE_FAMILIES

    # All FEE_FAMILIES members should map to themselves
    all_base = set()
    for members in FEE_FAMILIES.values():
        all_base.update(members)

    for category in all_base:
        assert category in CANONICAL_KEY_MAP, (
            f"Base category '{category}' missing from CANONICAL_KEY_MAP"
        )
        assert CANONICAL_KEY_MAP[category] == category, (
            f"Base category '{category}' maps to '{CANONICAL_KEY_MAP[category]}' "
            f"instead of itself (expected identity mapping)"
        )


# ---------------------------------------------------------------------------
# Test 4: Python↔TS drift tripwire
# If these numbers change, update src/lib/fee-taxonomy.test.ts to match.
# ---------------------------------------------------------------------------

# Expected counts — must match src/lib/fee-taxonomy.test.ts
EXPECTED_BASE_CATEGORY_COUNT = 49
EXPECTED_CANONICAL_KEY_COUNT = 181


def test_fee_families_base_category_count_matches_ts():
    """FEE_FAMILIES base-category count must match TS TAXONOMY_COUNT."""
    from fee_crawler.fee_analysis import FEE_FAMILIES

    all_base = [c for family in FEE_FAMILIES.values() for c in family]
    assert len(all_base) == EXPECTED_BASE_CATEGORY_COUNT, (
        f"Python FEE_FAMILIES has {len(all_base)} base categories; "
        f"TS TAXONOMY_COUNT expects {EXPECTED_BASE_CATEGORY_COUNT}. "
        f"Update src/lib/fee-taxonomy.test.ts if this change is intentional."
    )


def test_canonical_key_map_count_matches_ts():
    """CANONICAL_KEY_MAP count must match TS CANONICAL_KEY_COUNT."""
    from fee_crawler.fee_analysis import CANONICAL_KEY_MAP

    assert len(CANONICAL_KEY_MAP) == EXPECTED_CANONICAL_KEY_COUNT, (
        f"Python CANONICAL_KEY_MAP has {len(CANONICAL_KEY_MAP)} entries; "
        f"TS CANONICAL_KEY_COUNT expects {EXPECTED_CANONICAL_KEY_COUNT}. "
        f"Update src/lib/fee-taxonomy.test.ts if this change is intentional."
    )


def test_overdraft_maps_to_itself():
    """Explicit check: 'overdraft' fee_category -> 'overdraft' canonical_fee_key."""
    assert CANONICAL_KEY_MAP["overdraft"] == "overdraft"


# ---------------------------------------------------------------------------
# Test 4: Synonym mapping: rush_card_delivery -> rush_card
# ---------------------------------------------------------------------------

def test_rush_card_delivery_maps_to_rush_card():
    """rush_card_delivery is a synonym cluster entry that maps to rush_card."""
    assert CANONICAL_KEY_MAP["rush_card_delivery"] == "rush_card", (
        "Expected rush_card_delivery -> rush_card in CANONICAL_KEY_MAP"
    )


def test_case_when_sql_maps_rush_card_delivery_to_rush_card():
    """CASE WHEN SQL correctly maps rush_card_delivery to rush_card canonical."""
    from fee_crawler.commands.backfill_canonical import build_case_when_sql

    sql = build_case_when_sql()
    # Find the WHEN clause for rush_card_delivery
    assert "WHEN 'rush_card_delivery' THEN 'rush_card'" in sql, (
        "SQL CASE WHEN must map rush_card_delivery -> rush_card"
    )


# ---------------------------------------------------------------------------
# Test 5: variant_type backfill via Python loop
# ---------------------------------------------------------------------------

def test_detect_variant_type_for_rush_debit_card():
    """Fee name containing 'rush' gets variant_type = 'rush'."""
    variant = detect_variant_type("Rush Debit Card Fee", "rush_card")
    assert variant == "rush", f"Expected 'rush', got: {variant!r}"


def test_detect_variant_type_for_express_card_delivery():
    """Fee name containing 'express' gets variant_type = 'express'."""
    variant = detect_variant_type("Express Card Delivery", "rush_card")
    assert variant == "express", f"Expected 'express', got: {variant!r}"


def test_detect_variant_type_for_daily_cap():
    """fee_category ending with _daily_cap gets variant_type = 'daily_cap'."""
    variant = detect_variant_type("Maximum OD Fee Per Day", "od_daily_cap")
    assert variant == "daily_cap", f"Expected 'daily_cap', got: {variant!r}"


def test_detect_variant_type_returns_none_for_standard_fee():
    """Standard fee name with no variant keywords returns None."""
    variant = detect_variant_type("Monthly Service Fee", "monthly_maintenance")
    assert variant is None, f"Expected None, got: {variant!r}"


def test_backfill_variant_types_calls_detect_variant_type(monkeypatch):
    """backfill_variant_types() calls detect_variant_type for each eligible row."""
    from fee_crawler.commands import backfill_canonical

    calls_made = []

    def mock_detect(raw_name, fee_category):
        calls_made.append((raw_name, fee_category))
        return None  # no variant detected

    monkeypatch.setattr(
        backfill_canonical, "detect_variant_type", mock_detect
    )

    # Build a mock cursor that returns 2 rows
    mock_cursor = MagicMock()
    mock_cursor.fetchall.return_value = [
        {"id": 1, "fee_name": "Rush Card Fee", "fee_category": "rush_card"},
        {"id": 2, "fee_name": "Monthly Fee", "fee_category": "monthly_maintenance"},
    ]

    mock_conn = MagicMock()
    mock_conn.cursor.return_value.__enter__ = lambda self: mock_cursor
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    backfill_canonical.backfill_variant_types(mock_conn, dry_run=True)

    assert len(calls_made) == 2
    assert ("Rush Card Fee", "rush_card") in calls_made
    assert ("Monthly Fee", "monthly_maintenance") in calls_made


# ---------------------------------------------------------------------------
# Test 6: Index count snapshot returns zero diffs after no change
# ---------------------------------------------------------------------------

def test_snapshot_index_counts_query_structure():
    """snapshot_index_counts() builds the correct SQL query."""
    from fee_crawler.commands.backfill_canonical import snapshot_index_counts

    mock_cursor = MagicMock()
    mock_cursor.fetchall.return_value = [
        {"fee_category": "overdraft", "institution_count": 100},
        {"fee_category": "nsf", "institution_count": 80},
    ]

    mock_conn = MagicMock()
    mock_conn.cursor.return_value.__enter__ = lambda self: mock_cursor
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    result = snapshot_index_counts(mock_conn)

    assert result == {"overdraft": 100, "nsf": 80}
    # Verify the query was executed
    mock_cursor.execute.assert_called_once()
    query_arg = mock_cursor.execute.call_args[0][0]
    assert "fee_category" in query_arg
    assert "institution_count" in query_arg
    assert "extracted_fees" in query_arg
    assert "rejected" in query_arg  # must exclude rejected fees


def test_compare_snapshots_handles_new_category_in_after():
    """New category in after-snapshot doesn't cause error (category gained coverage)."""
    from fee_crawler.commands.backfill_canonical import compare_snapshots

    before = {"overdraft": 100}
    after = {"overdraft": 100, "nsf": 80}  # nsf appeared

    diffs = compare_snapshots(before, after)
    # nsf gained coverage — this is not a regression
    # compare_snapshots should report it but not crash
    assert isinstance(diffs, dict)


def test_compare_snapshots_handles_category_dropped():
    """Category disappearing from after-snapshot is flagged as regression."""
    from fee_crawler.commands.backfill_canonical import compare_snapshots

    before = {"overdraft": 100, "nsf": 80}
    after = {"overdraft": 100}  # nsf disappeared

    diffs = compare_snapshots(before, after)
    assert "nsf" in diffs
    assert diffs["nsf"]["before"] == 80
    assert diffs["nsf"]["after"] == 0
