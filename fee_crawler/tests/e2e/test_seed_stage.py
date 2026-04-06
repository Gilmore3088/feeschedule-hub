"""Seed stage tests — verifies crawl_targets is populated correctly from FDIC and NCUA.

Tests:
  - test_seed_fdic_populates_crawl_targets: SEED-01 — FDIC rows have correct fields
  - test_seed_ncua_populates_crawl_targets: SEED-02 — NCUA rows have correct fields
  - test_seed_combined_charter_mix: SEED-02 — both charter types present after combined seed

All tests are marked @pytest.mark.e2e. These tests call real external APIs (FDIC/NCUA)
and are expected to take 30-120 seconds. Exclude from fast unit test runs via -m "not e2e".

Fixture seeded_db is function-scoped and truncates crawl_targets before and after each test
so tests are independent of session ordering.
"""

from __future__ import annotations

import pytest

from fee_crawler.commands.seed_institutions import seed_fdic, seed_ncua


@pytest.fixture()
def seeded_db(test_db):
    """Function-scoped fixture: provides an empty crawl_targets table for each test.

    Truncates crawl_targets before yield (setup) and after yield (teardown) so tests
    are independent regardless of session fixture ordering.

    Per D-09: test_db is session-scoped; data rows may persist across tests without
    this fixture. Each seed test must use seeded_db, not test_db directly.
    """
    test_db.execute("DELETE FROM crawl_targets")
    test_db.commit()
    yield test_db
    # Teardown: clean up rows inserted during this test
    test_db.execute("DELETE FROM crawl_targets")
    test_db.commit()


@pytest.mark.e2e
def test_seed_fdic_populates_crawl_targets(seeded_db, test_config) -> None:
    """SEED-01: FDIC seeding produces well-formed bank rows in crawl_targets.

    Verifies:
    - seed_fdic returns >= 1 (confirms insertion happened)
    - Non-null required fields: institution_name, charter_type, asset_size, cert_number, source
    - charter_type == 'bank' for all FDIC rows
    - source == 'fdic' for all FDIC rows
    - asset_size > 0 for all rows
    - fed_district is 1-12 for rows where it is non-null
    - At least one row has website_url populated (FDIC WEBADDR is provided for most banks)
      Note: FDIC API may return None for WEBADDR on some institutions (no URL on file).
      We assert at least one row has a URL rather than every row, to avoid flakiness.
    """
    count = seed_fdic(seeded_db, test_config, limit=5)
    assert count >= 1, f"seed_fdic returned {count}, expected >= 1"

    rows = seeded_db.fetchall("SELECT * FROM crawl_targets")
    assert len(rows) >= 1, f"crawl_targets has {len(rows)} rows, expected >= 1"

    for row in rows:
        # D-03: non-null required fields
        assert row["institution_name"] is not None and row["institution_name"] != "", (
            f"institution_name is null or empty for cert_number={row['cert_number']!r}"
        )
        assert row["charter_type"] is not None, (
            f"charter_type is null for {row['institution_name']!r}"
        )
        assert row["asset_size"] is not None, (
            f"asset_size is null for {row['institution_name']!r}"
        )
        assert row["cert_number"] is not None, (
            f"cert_number is null for {row['institution_name']!r}"
        )
        assert row["source"] is not None, (
            f"source is null for {row['institution_name']!r}"
        )

        # D-04: value ranges
        assert row["charter_type"] == "bank", (
            f"Expected charter_type='bank', got {row['charter_type']!r} for {row['institution_name']!r}"
        )
        assert row["source"] == "fdic", (
            f"Expected source='fdic', got {row['source']!r} for {row['institution_name']!r}"
        )
        assert row["asset_size"] > 0, (
            f"Expected asset_size > 0, got {row['asset_size']} for {row['institution_name']!r}"
        )

        if row["fed_district"] is not None:
            assert 1 <= row["fed_district"] <= 12, (
                f"fed_district={row['fed_district']} out of range 1-12 for {row['institution_name']!r}"
            )

    # D-07: at least one FDIC row has website_url populated.
    # Not asserting every row — some institutions legitimately lack a WEBADDR in the API.
    # The FDIC API sorts by asset size DESC so the top 5 largest banks will almost always
    # have a website URL on file.
    rows_with_url = sum(1 for r in rows if r["website_url"])
    assert rows_with_url > 0, (
        f"No FDIC rows have website_url populated. "
        f"Expected at least 1 of {len(rows)} rows to have a URL. "
        "FDIC WEBADDR may be empty for all returned institutions — check API response."
    )


@pytest.mark.e2e
def test_seed_ncua_populates_crawl_targets(seeded_db, test_config) -> None:
    """SEED-02: NCUA seeding produces well-formed credit_union rows in crawl_targets.

    Verifies:
    - seed_ncua returns >= 1
    - Non-null required fields: institution_name, charter_type, cert_number, source
    - charter_type == 'credit_union' for all NCUA rows
    - source == 'ncua' for all NCUA rows
    - website_url is None for all rows (NCUA bulk data does not include website URLs)
    - asset_size >= 0 when non-null (some credit unions may report 0 assets)
    - fed_district is 1-12 or None
    """
    count = seed_ncua(seeded_db, test_config, limit=5)
    assert count >= 1, f"seed_ncua returned {count}, expected >= 1"

    rows = seeded_db.fetchall("SELECT * FROM crawl_targets")
    assert len(rows) >= 1, f"crawl_targets has {len(rows)} rows, expected >= 1"

    for row in rows:
        # D-03: non-null required fields
        assert row["institution_name"] is not None and row["institution_name"] != "", (
            f"institution_name is null or empty for cert_number={row['cert_number']!r}"
        )
        assert row["charter_type"] is not None, (
            f"charter_type is null for {row['institution_name']!r}"
        )
        assert row["cert_number"] is not None, (
            f"cert_number is null for {row['institution_name']!r}"
        )
        assert row["source"] is not None, (
            f"source is null for {row['institution_name']!r}"
        )

        # D-04: value ranges
        assert row["charter_type"] == "credit_union", (
            f"Expected charter_type='credit_union', got {row['charter_type']!r} for {row['institution_name']!r}"
        )
        assert row["source"] == "ncua", (
            f"Expected source='ncua', got {row['source']!r} for {row['institution_name']!r}"
        )

        if row["asset_size"] is not None:
            assert row["asset_size"] >= 0, (
                f"Expected asset_size >= 0, got {row['asset_size']} for {row['institution_name']!r}"
            )

        if row["fed_district"] is not None:
            assert 1 <= row["fed_district"] <= 12, (
                f"fed_district={row['fed_district']} out of range 1-12 for {row['institution_name']!r}"
            )

        # D-06: NCUA bulk data does not include website URLs — populated in Phase 3 discovery
        assert row["website_url"] is None, (
            f"Expected NCUA website_url to be None, got {row['website_url']!r} for {row['institution_name']!r}"
        )


@pytest.mark.e2e
def test_seed_combined_charter_mix(seeded_db, test_config) -> None:
    """SEED-02: Both FDIC and NCUA seeding produces both charter types in crawl_targets.

    Primary SEED-02 proof: confirms that the combined seed run yields both
    'bank' and 'credit_union' rows and that each source maps to the correct charter_type.

    Verifies:
    - Total row count >= 2 (at least one from each source)
    - Both 'fdic' and 'ncua' appear in the source column
    - Every row's charter_type is one of ('bank', 'credit_union')
    - FDIC rows all have charter_type='bank'
    - NCUA rows all have charter_type='credit_union'
    """
    seed_fdic(seeded_db, test_config, limit=3)
    seed_ncua(seeded_db, test_config, limit=3)

    rows = seeded_db.fetchall("SELECT * FROM crawl_targets")
    assert len(rows) >= 2, (
        f"Expected >= 2 rows (at least 1 FDIC + 1 NCUA), got {len(rows)}"
    )

    sources = {r["source"] for r in rows}
    assert "fdic" in sources, "Expected at least one FDIC-seeded bank in crawl_targets"
    assert "ncua" in sources, "Expected at least one NCUA-seeded credit union in crawl_targets"

    for row in rows:
        assert row["charter_type"] in ("bank", "credit_union"), (
            f"Unexpected charter_type={row['charter_type']!r} for {row['institution_name']!r}"
        )

    # Source-charter correspondence
    assert all(r["charter_type"] == "bank" for r in rows if r["source"] == "fdic"), (
        "One or more FDIC rows have charter_type != 'bank'"
    )
    assert all(r["charter_type"] == "credit_union" for r in rows if r["source"] == "ncua"), (
        "One or more NCUA rows have charter_type != 'credit_union'"
    )
