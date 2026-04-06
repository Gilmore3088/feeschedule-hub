"""Categorization stage tests — verifies categorize_fees.run() assigns the correct
fee_family and fee_category from the 49-category taxonomy using alias matching.

Tests:
  - test_categorize_assigns_valid_taxonomy: CATG-01 — every alias-matched row has
    fee_category and fee_family that are members of the canonical taxonomy.
    The one unrecognizable row remains fee_category=NULL.
  - test_categorize_alias_normalization: CATG-02 — specific raw fee names map to
    their canonical category keys (monthly_maintenance, nsf, atm_non_network, etc.).

Fixture scoping rationale:
  - categorized_db is FUNCTION-scoped.
    Categorization is pure in-memory Python — no LLM calls, no network I/O.
    Each test gets a fresh set of synthetic rows and a fresh categorize run.
    Cost and time are negligible; isolation is worth the minor overhead.

Marks: all tests are @pytest.mark.e2e only.
  - No @pytest.mark.llm (no Anthropic API calls).
  - No @pytest.mark.slow (categorization completes in milliseconds).
"""

from __future__ import annotations

import pytest

from fee_crawler.commands.categorize_fees import run
from fee_crawler.db import Database
from fee_crawler.fee_analysis import FEE_FAMILIES

# ---------------------------------------------------------------------------
# Synthetic fee rows inserted by the fixture
# ---------------------------------------------------------------------------

_FEE_ROWS = [
    "Monthly Service Fee",       # -> monthly_maintenance
    "NSF Fee",                   # -> nsf
    "ATM Fee",                   # -> atm_non_network
    "Outgoing Wire Transfer",    # -> wire_domestic_outgoing
    "Stop Payment Fee",          # -> stop_payment
    "Cashiers Check",            # -> cashiers_check
    "ZZUNKNOWNFEE999",           # -> no match; must stay NULL
]

_ALIAS_COUNT = 6    # number of rows expected to be categorized
_UNKNOWN_COUNT = 1  # number of rows expected to remain NULL


# ---------------------------------------------------------------------------
# Function-scoped fixture: synthetic data, categorize, yield, teardown
# ---------------------------------------------------------------------------


@pytest.fixture()
def categorized_db(test_db: Database, test_config) -> Database:
    """Function-scoped fixture: insert synthetic extracted_fees rows and run categorize.

    Steps:
      1. Clean slate — DELETE in FK order.
      2. Insert FK scaffold (crawl_targets -> crawl_runs -> crawl_results).
      3. Insert 7 synthetic extracted_fees rows with fee_category=NULL.
      4. Call categorize_fees.run(test_db) to assign fee_category + fee_family.
      5. Yield test_db for test use.
      6. Teardown — DELETE in FK order.
    """
    # Step 1: clean slate in FK order
    test_db.execute("DELETE FROM extracted_fees")
    test_db.execute("DELETE FROM crawl_results")
    test_db.execute("DELETE FROM crawl_runs WHERE trigger = 'test'")
    test_db.execute("DELETE FROM crawl_targets")
    test_db.commit()

    # Step 2: FK scaffold
    test_db.execute(
        "INSERT INTO crawl_targets (institution_name, charter_type, source, cert_number) "
        "VALUES (?, ?, ?, ?)",
        ("Test Bank", "bank", "fdic", "TEST-CAT-001"),
    )
    target_id = test_db.conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    run_id = test_db.insert_returning_id(
        "INSERT INTO crawl_runs (trigger, targets_total) VALUES (?, ?)",
        ("test", 1),
    )

    result_id = test_db.insert_returning_id(
        "INSERT INTO crawl_results (crawl_run_id, crawl_target_id, status) VALUES (?, ?, ?)",
        (run_id, target_id, "success"),
    )
    test_db.commit()

    # Step 3: insert synthetic fee rows (fee_category intentionally NULL)
    for fee_name in _FEE_ROWS:
        test_db.execute(
            "INSERT INTO extracted_fees "
            "(crawl_result_id, crawl_target_id, fee_name, extraction_confidence) "
            "VALUES (?, ?, ?, ?)",
            (result_id, target_id, fee_name, 0.9),
        )
    test_db.commit()

    # Step 4: run categorization (pure in-memory; writes fee_category + fee_family)
    run(test_db)

    # Step 5: yield for tests
    yield test_db

    # Step 6: teardown in FK order
    test_db.execute("DELETE FROM extracted_fees")
    test_db.execute("DELETE FROM crawl_results")
    test_db.execute("DELETE FROM crawl_runs WHERE trigger = 'test'")
    test_db.execute("DELETE FROM crawl_targets")
    test_db.commit()


# ---------------------------------------------------------------------------
# CATG-01: All alias-matched rows receive valid taxonomy assignments
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_categorize_assigns_valid_taxonomy(categorized_db: Database) -> None:
    """CATG-01: categorize_fees.run() assigns fee_category and fee_family from
    the canonical 49-category taxonomy for all alias-matched rows.

    Asserts:
      - Exactly 6 rows have fee_category != NULL (the alias-matched rows).
      - Exactly 1 row has fee_category IS NULL (ZZUNKNOWNFEE999).
      - Every fee_category in the categorized rows is a member of the canonical set.
      - Every fee_family in the categorized rows is a member of FEE_FAMILIES keys.
    """
    canonical_set = {cat for members in FEE_FAMILIES.values() for cat in members}
    valid_families = set(FEE_FAMILIES.keys())

    rows = categorized_db.fetchall(
        "SELECT fee_name, fee_category, fee_family FROM extracted_fees"
    )

    categorized = [r for r in rows if r["fee_category"] is not None]
    uncategorized = [r for r in rows if r["fee_category"] is None]

    assert len(categorized) == _ALIAS_COUNT, (
        f"Expected {_ALIAS_COUNT} categorized rows, got {len(categorized)}. "
        f"Categorized: {[r['fee_name'] for r in categorized]}"
    )
    assert len(uncategorized) == _UNKNOWN_COUNT, (
        f"Expected {_UNKNOWN_COUNT} uncategorized row, got {len(uncategorized)}. "
        f"Uncategorized: {[r['fee_name'] for r in uncategorized]}"
    )

    for row in categorized:
        assert row["fee_category"] in canonical_set, (
            f"fee_name={row['fee_name']!r}: fee_category={row['fee_category']!r} "
            f"is not in the canonical taxonomy set."
        )
        assert row["fee_family"] in valid_families, (
            f"fee_name={row['fee_name']!r}: fee_family={row['fee_family']!r} "
            f"is not a valid family key in FEE_FAMILIES."
        )


# ---------------------------------------------------------------------------
# CATG-02: Specific alias strings map to their canonical category keys
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_categorize_alias_normalization(categorized_db: Database) -> None:
    """CATG-02: raw fee name strings are mapped to their expected canonical categories.

    Verifies the alias table resolves common fee name variations to the canonical
    key used throughout the taxonomy (e.g. "Monthly Service Fee" -> "monthly_maintenance").
    """
    rows = categorized_db.fetchall(
        "SELECT fee_name, fee_category FROM extracted_fees"
    )
    by_name = {r["fee_name"]: r["fee_category"] for r in rows}

    assert by_name["Monthly Service Fee"] == "monthly_maintenance", (
        f"Expected 'monthly_maintenance', got {by_name['Monthly Service Fee']!r}"
    )
    assert by_name["NSF Fee"] == "nsf", (
        f"Expected 'nsf', got {by_name['NSF Fee']!r}"
    )
    assert by_name["ATM Fee"] == "atm_non_network", (
        f"Expected 'atm_non_network', got {by_name['ATM Fee']!r}"
    )
    assert by_name["Outgoing Wire Transfer"] == "wire_domestic_outgoing", (
        f"Expected 'wire_domestic_outgoing', got {by_name['Outgoing Wire Transfer']!r}"
    )
    assert by_name["Stop Payment Fee"] == "stop_payment", (
        f"Expected 'stop_payment', got {by_name['Stop Payment Fee']!r}"
    )
