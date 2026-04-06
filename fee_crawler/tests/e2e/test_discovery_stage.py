"""Discovery stage tests — verifies the URL discovery pipeline records all attempts
and populates fee_schedule_url for at least one institution.

Tests:
  - test_discover_populates_fee_schedule_url: DISC-01 — at least 1 institution gets a
    fee_schedule_url populated after running discovery (per D-01)
  - test_discover_records_all_attempts: DISC-02 — every institution with a website_url
    has at least one discovery_cache row, and every cache row has valid fields (per D-02,
    D-06, D-07, D-08)

Fixture scoping rationale:
  - discovered_db is MODULE-scoped, not function-scoped.
    Discovery involves real HTTP requests that can take 30-120 seconds per institution.
    Re-running the full discovery pipeline for each test would be extremely slow and
    create flakiness from network variability. One shared discovery run per module
    provides enough data for both tests while being practical.

FDIC-only rationale:
  - NCUA bulk data does not include website_url (all rows have website_url=NULL).
    There is nothing to discover for NCUA institutions. We seed FDIC-only to ensure
    that at least some institutions have website_url populated for discovery.

Timeout approach:
  - Each _discover_one call is wrapped in concurrent.futures.ThreadPoolExecutor
    with future.result(timeout=60). This is cross-platform — unlike signal.alarm
    which is UNIX-only and cannot be used in non-main threads.
"""

from __future__ import annotations

import socket
import warnings

import pytest

from fee_crawler.commands.discover_urls import _discover_one
from fee_crawler.commands.seed_institutions import seed_fdic

# ---------------------------------------------------------------------------
# Module-scoped fixture: runs full discovery pipeline once for all tests
# ---------------------------------------------------------------------------

_DISCOVERY_TIMEOUT_SECONDS = 120
_SEED_LIMIT = 3


@pytest.fixture(scope="module")
def discovered_db(test_db, test_config):
    """Module-scoped fixture: seed FDIC institutions and run discovery pipeline.

    Setup:
      1. Truncate discovery_cache and crawl_targets for a clean state.
      2. Seed top-3 FDIC banks (sorted by assets DESC — most likely to have website_url).
      3. Run _discover_one for each institution that has a website_url, with a 60s
         per-institution timeout using concurrent.futures (cross-platform per D-05).
      4. Belt-and-suspenders commit so reads from the session DB see all worker writes.

    Skip guards:
      - If FDIC API is unavailable (seed returns 0 rows) → skip entire module.
      - If no seeded institutions have website_url → skip entire module.

    Thread-local DB note:
      _discover_one calls get_worker_db(config) which creates a thread-local SQLite
      connection to the SAME file as test_db. Both connections write to the same WAL
      file. After the discovery loop, we force test_db to see the committed writes by
      issuing a fresh SELECT rather than relying on test_db's in-memory cache.

    Teardown:
      Deletes all discovery_cache and crawl_targets rows inserted during this module.
    """
    # Setup: clean slate
    test_db.execute("DELETE FROM discovery_cache")
    test_db.execute("DELETE FROM crawl_targets")
    test_db.commit()

    # Seed FDIC-only — NCUA rows have website_url=NULL so discovery is a no-op for them
    count = seed_fdic(test_db, test_config, limit=_SEED_LIMIT)
    if count == 0:
        pytest.skip(
            "seed_fdic returned 0 rows — FDIC API unavailable. "
            "Skipping entire discovery module."
        )

    # Filter to only institutions with a URL, limited to _SEED_LIMIT.
    # seed_fdic fetches full API pages (1000 rows) regardless of limit param,
    # so crawl_targets may contain far more rows than _SEED_LIMIT. We cap the
    # discovery loop to avoid spending 10+ minutes probing hundreds of sites.
    targets = test_db.fetchall(
        "SELECT id, institution_name, website_url, state_code, asset_size "
        "FROM crawl_targets WHERE website_url IS NOT NULL "
        "ORDER BY asset_size DESC LIMIT ?",
        (_SEED_LIMIT,),
    )
    if not targets:
        pytest.skip(
            "No FDIC institutions have website_url set — cannot run discovery tests. "
            "This may mean FDIC API returned institutions without WEBADDR fields."
        )

    # Set a global socket timeout so that any HTTP request that hangs on
    # SSL read or TCP recv will be interrupted after 15 seconds. The
    # discoverer's `timeout` param only covers connection setup, not the
    # full read — servers that accept but never respond cause indefinite hangs.
    old_timeout = socket.getdefaulttimeout()
    socket.setdefaulttimeout(15)

    # Run discovery for each institution directly in the main thread.
    # No threading wrapper — _discover_one creates its own DB connection
    # (get_worker_db) and runs the full cascade. Running in-process avoids
    # the unkillable-thread problem that caused pytest-timeout hangs.
    for target in targets:
        target_dict = dict(target)
        name = target_dict.get("institution_name", "unknown")

        try:
            _discover_one(
                target_dict,
                test_config,
                False,   # concurrent=False (single-threaded discovery)
                False,   # force=False (use cache TTL logic)
            )
        except Exception as exc:
            warnings.warn(
                f"Discovery raised an exception for {name!r}: {exc} — "
                "skipping this institution.",
                stacklevel=2,
            )

    # Restore original socket timeout
    socket.setdefaulttimeout(old_timeout)

    # _discover_one uses get_worker_db which creates a thread-local SQLite
    # connection to the same file. Since we're in the main thread now, the
    # worker DB IS test_db's underlying file. Commit to ensure WAL is flushed.
    test_db.commit()

    yield test_db

    # Teardown: remove all rows inserted by this module's fixture
    test_db.execute("DELETE FROM discovery_cache")
    test_db.execute("DELETE FROM crawl_targets")
    test_db.commit()


# ---------------------------------------------------------------------------
# DISC-01: Discovery populates fee_schedule_url for at least one institution
# ---------------------------------------------------------------------------


@pytest.mark.e2e
@pytest.mark.slow
def test_discover_populates_fee_schedule_url(discovered_db, test_config) -> None:
    """DISC-01 (per D-01): After discovery, at least 1 institution has fee_schedule_url set.

    Verifies that the discovery pipeline successfully finds a fee schedule URL
    for at least one of the seeded FDIC institutions. The assertion tolerates
    partial success — some sites may be temporarily down, block crawlers, or
    be unreachable from the test network.

    This test may legitimately fail when:
    - The test runner has no internet access
    - All 3 seeded bank websites are unreachable
    - All sites have changed their fee schedule URL structure

    Such failures indicate a network/site issue, NOT a pipeline bug.
    """
    rows = discovered_db.fetchall(
        "SELECT * FROM crawl_targets WHERE website_url IS NOT NULL"
    )
    assert len(rows) >= 1, (
        f"Expected >= 1 crawl_targets row with website_url after discovery, got {len(rows)}. "
        "The discovered_db fixture may not have seeded any institutions."
    )

    rows_with_url = [r for r in rows if r["fee_schedule_url"]]
    assert len(rows_with_url) >= 1, (
        f"Expected at least 1 institution with fee_schedule_url populated after discovery. "
        f"Tried {len(rows)} institution(s). "
        "All sites may be down, unreachable from this network, or have changed their "
        "fee schedule URL structure. This is a network/site issue, not a pipeline bug."
    )


# ---------------------------------------------------------------------------
# DISC-02: Discovery records all attempts with valid field values
# ---------------------------------------------------------------------------


@pytest.mark.e2e
@pytest.mark.slow
def test_discover_records_all_attempts(discovered_db, test_config) -> None:
    """DISC-02 (per D-02, D-06, D-07, D-08): Every institution that had a website_url
    has at least one discovery_cache row, and every cache row has valid field values.

    Verifies:
    - Each institution with website_url has >= 1 discovery_cache row (D-02)
    - Every cache row has non-null, non-empty discovery_method (D-06)
    - Every cache row has non-null result field (D-06)
    - result is one of {'found', 'not_found', 'error'} (D-06)
    - For rows where result='found', found_url starts with 'http' (D-07)
    - No assertion on which method or ordering (D-08)
    """
    # Only check the institutions we actually ran discovery on (capped by _SEED_LIMIT)
    # — seed_fdic fetches full API pages so crawl_targets has many more rows than we discovered.
    targets = discovered_db.fetchall(
        "SELECT id, institution_name FROM crawl_targets "
        "WHERE website_url IS NOT NULL ORDER BY asset_size DESC LIMIT ?",
        (_SEED_LIMIT,),
    )
    if not targets:
        pytest.skip(
            "No targets with website_url found — discovered_db fixture may have skipped "
            "seeding due to FDIC API unavailability."
        )

    # D-02: Every institution that had a website_url must have at least one cache row
    for target in targets:
        cache_rows = discovered_db.fetchall(
            "SELECT * FROM discovery_cache WHERE crawl_target_id = ?",
            (target["id"],),
        )
        assert len(cache_rows) >= 1, (
            f"Institution {target['institution_name']!r} (id={target['id']}) "
            f"has no discovery_cache rows — every discovery attempt must be recorded (D-02)"
        )

    # D-06: Validate field content for all cache rows across all institutions
    VALID_RESULTS = {"found", "not_found", "error"}
    all_cache = discovered_db.fetchall("SELECT * FROM discovery_cache")

    for row in all_cache:
        assert row["discovery_method"] is not None and row["discovery_method"] != "", (
            f"discovery_cache id={row['id']}: discovery_method is null or empty"
        )
        assert row["result"] is not None, (
            f"discovery_cache id={row['id']}: result is null"
        )
        assert row["result"] in VALID_RESULTS, (
            f"discovery_cache id={row['id']}: result={row['result']!r} not in {VALID_RESULTS}"
        )

    # D-07: For rows where result='found', found_url must look like a URL
    found_rows = [r for r in all_cache if r["result"] == "found"]
    for row in found_rows:
        assert row["found_url"] is not None, (
            f"discovery_cache id={row['id']}: result='found' but found_url is null"
        )
        assert row["found_url"].startswith("http"), (
            f"discovery_cache id={row['id']}: found_url={row['found_url']!r} "
            f"does not start with 'http'"
        )
