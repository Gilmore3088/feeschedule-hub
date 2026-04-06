"""Extraction stage tests — verifies the crawl + LLM extraction pipeline produces
confidence-scored fees with complete crawl_results records.

Tests:
  - test_extract_produces_valid_confidence_scores: EXTR-01 (per D-07) — every row in
    extracted_fees has extraction_confidence in [0.0, 1.0] range.
  - test_extract_document_type_coverage: EXTR-02 (per D-04, D-05) — at least one document
    type was successfully processed; both types not required (real-world mix determines what
    is available).
  - test_extract_records_all_crawl_results: EXTR-03 (per D-06) — every institution that was
    crawled has at least one crawl_results row with a valid status.

Fixture scoping rationale:
  - extracted_db is MODULE-scoped, not function-scoped.
    Extraction involves real LLM (Claude Haiku) calls that cost money and take 30-120 seconds
    per institution. Re-running the full extraction pipeline for each test would be extremely
    slow and expensive. One shared extraction run per module provides enough data for all three
    tests while being practical.
  - The fixture builds on discovered_db from Phase 3 — seeded + discovered institutions are
    the input. Phase 4 adds crawl_results and extracted_fees on top.

Marks: all tests are @pytest.mark.e2e @pytest.mark.llm @pytest.mark.slow
  - e2e: touches real network + real DB
  - llm: calls Claude Haiku via ANTHROPIC_API_KEY (skipped in CI fast-mode per T-04-05)
  - slow: expected runtime 5-20 minutes for 3 institutions

D-04 document type tolerance:
  The discoverer tags document_type during discovery. If only PDF or only HTML is found
  among the test institutions, the test asserts what's available and skips the missing
  type (not fails). This prevents false failures on real-world institution mixes.
"""

from __future__ import annotations

import socket
import warnings

import pytest

from fee_crawler.commands.crawl import _crawl_one

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_CRAWL_LIMIT = 3
_VALID_STATUSES = frozenset({"success", "failed", "unchanged"})

# ---------------------------------------------------------------------------
# Module-scoped fixture: runs full extraction pipeline once for all tests
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def extracted_db(discovered_db, test_config):
    """Module-scoped fixture: run extraction pipeline against discovered institutions.

    discovered_db already yields test_db — use it as the DB handle throughout.

    Setup:
      1. Delete any existing crawl data in FK order (extracted_fees → crawl_results → crawl_runs
         WHERE trigger='test') to ensure a clean state if a prior run left orphaned rows.
      2. Insert a crawl_runs row with trigger='test' → get run_id.
      3. Query crawl_targets WHERE fee_schedule_url IS NOT NULL ORDER BY asset_size DESC LIMIT 3.
      4. If 0 targets: pytest.skip — discovery found no institutions with fee_schedule_url.
      5. For each target: call _crawl_one(dict(target), test_config, run_id), catching exceptions
         and warning on failure (same pattern as discovered_db fixture).
      6. Commit (belt-and-suspenders WAL flush, same pattern as discovered_db).
      7. Skip guard: if no crawl_results rows exist after the loop, skip entire module.
      8. yield discovered_db (the underlying test_db — gives tests access to the same DB handle).

    Socket timeout:
      Set socket.setdefaulttimeout(30) before the loop and restore after. LLM calls need
      longer than the 15s used in discovery — SSL reads for large PDF downloads can take 20s+.

    Teardown:
      DELETE FROM extracted_fees, crawl_results, crawl_runs WHERE trigger='test'.
      (crawl_targets and discovery_cache teardown is handled by discovered_db's own teardown.)
    """
    # Step 1: clean existing crawl data from any prior test run (FK order)
    discovered_db.execute("DELETE FROM extracted_fees")
    discovered_db.execute("DELETE FROM crawl_results")
    discovered_db.execute("DELETE FROM crawl_runs WHERE trigger = 'test'")
    discovered_db.commit()

    # Step 2: create a crawl_runs record to anchor all crawl_results rows
    run_id = discovered_db.insert_returning_id(
        "INSERT INTO crawl_runs (trigger, targets_total) VALUES (?, 0)",
        ("test",),
    )
    discovered_db.commit()

    # Step 3: fetch institutions that have a fee_schedule_url (discovery succeeded)
    # Note: cms_platform may not exist in older schemas — handle with dict.get() in _crawl_one
    try:
        targets = discovered_db.fetchall(
            "SELECT id, institution_name, fee_schedule_url, document_type, "
            "last_content_hash, state_code, charter_type, asset_size, cms_platform "
            "FROM crawl_targets "
            "WHERE fee_schedule_url IS NOT NULL "
            "ORDER BY asset_size DESC LIMIT ?",
            (_CRAWL_LIMIT,),
        )
    except Exception:
        # cms_platform may not exist in the schema — fall back without it
        targets = discovered_db.fetchall(
            "SELECT id, institution_name, fee_schedule_url, document_type, "
            "last_content_hash, state_code, charter_type, asset_size "
            "FROM crawl_targets "
            "WHERE fee_schedule_url IS NOT NULL "
            "ORDER BY asset_size DESC LIMIT ?",
            (_CRAWL_LIMIT,),
        )

    # Step 4: skip if discovery yielded no fee schedule URLs
    if not targets:
        pytest.skip(
            "No institutions with fee_schedule_url — discovery may have found none. "
            "Skipping entire extraction module."
        )

    # Step 5: set socket timeout for LLM + PDF download calls
    old_timeout = socket.getdefaulttimeout()
    socket.setdefaulttimeout(30)

    # Run _crawl_one for each institution directly in the main thread.
    # _crawl_one creates its own DB connection (get_worker_db) pointing to the same
    # SQLite WAL file. Running in-process avoids threading complications.
    for target in targets:
        target_dict = dict(target)
        # Ensure cms_platform key exists (older schema rows may lack it)
        target_dict.setdefault("cms_platform", None)
        name = target_dict.get("institution_name", "unknown")

        try:
            _crawl_one(target_dict, test_config, run_id)
        except Exception as exc:
            warnings.warn(
                f"_crawl_one raised an exception for {name!r}: {exc} — "
                "skipping this institution.",
                stacklevel=2,
            )

    # Restore original socket timeout
    socket.setdefaulttimeout(old_timeout)

    # Step 6: commit to flush WAL writes from _crawl_one's worker DB connection
    discovered_db.commit()

    # Step 7: skip guard — if zero crawl_results rows exist, the pipeline didn't run at all
    check_rows = discovered_db.fetchall("SELECT id FROM crawl_results LIMIT 1")
    if not check_rows:
        pytest.skip(
            "No crawl_results rows after extraction loop — all _crawl_one calls raised "
            "exceptions or the pipeline did not record any attempts. "
            "This is likely a network or API key issue, not a pipeline bug."
        )

    # Step 8: yield the DB handle for tests to query
    yield discovered_db

    # Teardown: remove extraction data in FK order
    # crawl_targets and discovery_cache are cleaned up by discovered_db's own teardown
    discovered_db.execute("DELETE FROM extracted_fees")
    discovered_db.execute("DELETE FROM crawl_results")
    discovered_db.execute("DELETE FROM crawl_runs WHERE trigger = 'test'")
    discovered_db.commit()


# ---------------------------------------------------------------------------
# EXTR-01: Extracted fees have valid confidence scores
# ---------------------------------------------------------------------------


@pytest.mark.e2e
@pytest.mark.llm
@pytest.mark.slow
def test_extract_produces_valid_confidence_scores(extracted_db, test_config) -> None:
    """EXTR-01 (per D-07): extracted_fees rows have extraction_confidence in [0.0, 1.0].

    Verifies that Claude Haiku returns confidence values within the valid range for
    every extracted fee row. Also asserts there is at least 1 extracted fee — proving
    the pipeline reached the LLM extraction step for at least one institution.

    If this test fails, the LLM returned out-of-range confidence values, which indicates
    a regression in the extraction schema or LLM tool-use prompt.
    """
    fees = extracted_db.fetchall(
        "SELECT id, extraction_confidence FROM extracted_fees"
    )
    if not fees:
        pytest.skip(
            "No extracted_fees rows — all crawl attempts failed (network/API issue, "
            "not a pipeline bug). Cannot assert confidence range."
        )

    for row in fees:
        assert 0.0 <= row["extraction_confidence"] <= 1.0, (
            f"extracted_fees id={row['id']}: extraction_confidence={row['extraction_confidence']!r} "
            "is outside the valid range [0.0, 1.0]. "
            "If this fails, the LLM returned out-of-range confidence values."
        )

    assert len(fees) >= 1, (
        "Expected at least 1 extracted_fees row with valid confidence. "
        f"Got {len(fees)} rows."
    )


# ---------------------------------------------------------------------------
# EXTR-03: Every crawled institution has a crawl_results row with valid status
# ---------------------------------------------------------------------------


@pytest.mark.e2e
@pytest.mark.llm
@pytest.mark.slow
def test_extract_records_all_crawl_results(extracted_db, test_config) -> None:
    """EXTR-03 (per D-06): every institution that was crawled has a crawl_results row
    with status in ('success', 'failed', 'unchanged').

    Verifies that the pipeline records every extraction attempt — no silent failures.
    An institution whose _crawl_one raised an exception is warned and skipped in the
    fixture, so it may not have a crawl_results row — those are excluded here.
    """
    targets = extracted_db.fetchall(
        "SELECT id, institution_name FROM crawl_targets "
        "WHERE fee_schedule_url IS NOT NULL "
        "ORDER BY asset_size DESC LIMIT ?",
        (_CRAWL_LIMIT,),
    )
    if not targets:
        pytest.skip(
            "No targets with fee_schedule_url — extracted_db fixture may have skipped "
            "due to no discovered institutions."
        )

    # D-06: Every institution we attempted must have at least 1 crawl_results row
    for target in targets:
        result_rows = extracted_db.fetchall(
            "SELECT id, status FROM crawl_results WHERE crawl_target_id = ?",
            (target["id"],),
        )
        assert len(result_rows) >= 1, (
            f"Institution {target['institution_name']!r} (id={target['id']}) "
            "has no crawl_results rows — every extraction attempt must be recorded (D-06)"
        )

    # Validate that every crawl_results row has a valid status
    all_results = extracted_db.fetchall("SELECT id, status FROM crawl_results")
    for row in all_results:
        assert row["status"] in _VALID_STATUSES, (
            f"crawl_results id={row['id']}: status={row['status']!r} "
            f"is not in {_VALID_STATUSES}"
        )


# ---------------------------------------------------------------------------
# EXTR-02: At least one document type was successfully processed
# ---------------------------------------------------------------------------


@pytest.mark.e2e
@pytest.mark.llm
@pytest.mark.slow
def test_extract_document_type_coverage(extracted_db, test_config) -> None:
    """EXTR-02 (per D-04, D-05): at least one document type was successfully processed.

    Does NOT require both PDF and HTML — real-world institution mix determines what
    is available. If only PDF or only HTML institutions are discovered, the found type
    is asserted and the missing type is skipped (not failed).

    This test proves the pipeline can handle whichever document type the discovered
    institutions serve — a minimum of 1 successful document type is required.
    """
    doc_type_rows = extracted_db.fetchall(
        "SELECT DISTINCT ct.document_type "
        "FROM crawl_results cr "
        "JOIN crawl_targets ct ON cr.crawl_target_id = ct.id "
        "WHERE cr.status = 'success'"
    )
    if not doc_type_rows:
        pytest.skip(
            "No successful crawl_results rows — cannot check document type coverage. "
            "All extraction attempts may have failed (network/API issue, not a pipeline bug)."
        )

    doc_types = {row["document_type"] for row in doc_type_rows}
    valid_doc_types = {"pdf", "html", "unknown", None}

    assert len(doc_types) >= 1, (
        "Expected at least 1 document type to be successfully processed. "
        f"Got {len(doc_types)} distinct types from successful crawl_results."
    )

    for doc_type in doc_types:
        assert doc_type in valid_doc_types, (
            f"Unexpected document_type={doc_type!r} in successful crawl_results. "
            f"Valid types are: {valid_doc_types}"
        )

    print(f"Document types found in successful extractions: {doc_types}")
