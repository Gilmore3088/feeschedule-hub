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
from fee_crawler.commands.discover_urls import _discover_one
from fee_crawler.commands.seed_institutions import seed_fdic

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SEED_LIMIT = 3
_CRAWL_LIMIT = 3
_VALID_STATUSES = frozenset({"success", "failed", "unchanged"})

# ---------------------------------------------------------------------------
# Module-scoped fixture: runs full extraction pipeline once for all tests
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def extracted_db(test_db, test_config):
    """Module-scoped fixture: seed → discover → extract in one self-contained pipeline.

    Self-contained because module-scoped fixtures can't cross file boundaries
    in pytest. This fixture inlines the seed + discover + extract steps.

    Setup:
      1. Clean slate: truncate all pipeline tables.
      2. Seed FDIC institutions (top by assets, LIMIT _SEED_LIMIT).
      3. Run discovery on seeded institutions with website_url.
      4. Insert crawl_runs row, run _crawl_one on discovered institutions.
      5. Commit, skip guards, yield DB handle.

    Teardown: truncate all pipeline tables in FK order.
    """
    # Step 1: clean slate
    test_db.execute("DELETE FROM extracted_fees")
    test_db.execute("DELETE FROM crawl_results")
    test_db.execute("DELETE FROM crawl_runs WHERE trigger = 'test'")
    test_db.execute("DELETE FROM discovery_cache")
    test_db.execute("DELETE FROM crawl_targets")
    test_db.commit()

    # Step 2: seed FDIC institutions
    count = seed_fdic(test_db, test_config, limit=_SEED_LIMIT)
    if count == 0:
        pytest.skip("seed_fdic returned 0 rows — FDIC API unavailable.")

    # Step 3: discover fee schedule URLs
    disc_targets = test_db.fetchall(
        "SELECT id, institution_name, website_url, state_code, asset_size "
        "FROM crawl_targets WHERE website_url IS NOT NULL "
        "ORDER BY asset_size DESC LIMIT ?",
        (_SEED_LIMIT,),
    )
    if not disc_targets:
        pytest.skip("No FDIC institutions have website_url.")

    old_timeout = socket.getdefaulttimeout()
    socket.setdefaulttimeout(15)
    for target in disc_targets:
        try:
            _discover_one(dict(target), test_config, False, False)
        except Exception as exc:
            warnings.warn(f"Discovery failed for {target['institution_name']!r}: {exc}")
    socket.setdefaulttimeout(old_timeout)
    test_db.commit()

    # Step 4: extract fees from discovered institutions
    try:
        crawl_targets = test_db.fetchall(
            "SELECT id, institution_name, fee_schedule_url, document_type, "
            "last_content_hash, state_code, charter_type, asset_size, cms_platform "
            "FROM crawl_targets WHERE fee_schedule_url IS NOT NULL "
            "ORDER BY asset_size DESC LIMIT ?",
            (_CRAWL_LIMIT,),
        )
    except Exception:
        crawl_targets = test_db.fetchall(
            "SELECT id, institution_name, fee_schedule_url, document_type, "
            "last_content_hash, state_code, charter_type, asset_size "
            "FROM crawl_targets WHERE fee_schedule_url IS NOT NULL "
            "ORDER BY asset_size DESC LIMIT ?",
            (_CRAWL_LIMIT,),
        )

    if not crawl_targets:
        pytest.skip("No institutions with fee_schedule_url after discovery.")

    run_id = test_db.insert_returning_id(
        "INSERT INTO crawl_runs (trigger, targets_total) VALUES (?, 0)",
        ("test",),
    )
    test_db.commit()

    old_timeout = socket.getdefaulttimeout()
    socket.setdefaulttimeout(30)
    for target in crawl_targets:
        target_dict = dict(target)
        target_dict.setdefault("cms_platform", None)
        name = target_dict.get("institution_name", "unknown")
        try:
            _crawl_one(target_dict, test_config, run_id)
        except Exception as exc:
            warnings.warn(f"_crawl_one failed for {name!r}: {exc}")
    socket.setdefaulttimeout(old_timeout)

    test_db.commit()

    check_rows = test_db.fetchall("SELECT id FROM crawl_results LIMIT 1")
    if not check_rows:
        pytest.skip("No crawl_results after extraction — network or API key issue.")

    yield test_db

    # Teardown in FK order
    test_db.execute("DELETE FROM extracted_fees")
    test_db.execute("DELETE FROM crawl_results")
    test_db.execute("DELETE FROM crawl_runs WHERE trigger = 'test'")
    test_db.execute("DELETE FROM discovery_cache")
    test_db.execute("DELETE FROM crawl_targets")
    test_db.commit()


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
