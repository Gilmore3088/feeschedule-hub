"""Full pipeline test — capstone e2e that chains every stage end-to-end.

Stages:
  1. Seed: Pull institutions from FDIC API for the selected geography.
  2. Discover: Find fee schedule URLs for seeded institutions.
  3. Extract: Crawl URLs and extract fees via Claude Haiku.
  4. Categorize: Assign fee_category / fee_family to extracted fees.
  5. Validate: Compute validation_flags and review_status for each fee.
  6. Report: Print structured summary to stdout and write to reports/ directory.

Decision references (from 09-CONTEXT.md):
  D-01: Sequential pipeline — seed_fdic → _discover_one → _crawl_one → categorize_fees.run →
        backfill_validation.run
  D-02: geography fixture provides the state (default: VT from root conftest.py)
  D-03: Marked @pytest.mark.e2e @pytest.mark.llm @pytest.mark.slow
  D-04: Print structured report to stdout; time each stage
  D-05: Write report to fee_crawler/tests/e2e/reports/ for CI artifact collection
  D-06: Test passes if >= 1 institution completes the full pipeline; partial failures are logged
  D-07: If ALL institutions fail at every stage, fail with a clear bottleneck message
  D-08: Module-scoped pipeline_db fixture: clean → seed → discover → extract → cat → validate → yield
  D-09: socket.setdefaulttimeout(15s discovery, 30s extraction)

Marks: @pytest.mark.e2e @pytest.mark.llm @pytest.mark.slow
  - e2e: real network + real DB
  - llm: calls Claude Haiku via ANTHROPIC_API_KEY (skipped in CI fast-mode)
  - slow: expected runtime 5-20 minutes for 3-5 institutions
"""

from __future__ import annotations

import socket
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from fee_crawler.commands import backfill_validation, categorize_fees
from fee_crawler.commands.crawl import _crawl_one
from fee_crawler.commands.discover_urls import _discover_one
from fee_crawler.commands.seed_institutions import seed_fdic

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SEED_LIMIT = 10   # Fetch up to 10 rows from FDIC to allow geography filtering
_TARGET_COUNT = 5  # Process up to 5 institutions through the full pipeline
_DISCOVERY_TIMEOUT_S = 15
_EXTRACTION_TIMEOUT_S = 30

_REPORTS_DIR = Path(__file__).parent / "reports"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _elapsed(t0: float) -> str:
    """Format elapsed seconds as a human-readable string."""
    elapsed = time.time() - t0
    if elapsed < 60:
        return f"{elapsed:.1f}s"
    mins, secs = divmod(int(elapsed), 60)
    return f"{mins}m{secs:02d}s"


def _print_report(report: dict[str, Any]) -> None:
    """Print a structured summary report to stdout."""
    width = 70
    print()
    print("=" * width)
    print("  FULL PIPELINE TEST REPORT")
    print("=" * width)
    print(f"  Geography : {report['geography']}")
    print(f"  Run date  : {report['run_date']}")
    print(f"  Total time: {report['total_time']}")
    print()
    print("  Stage Timings:")
    for stage, dur in report["stage_timings"].items():
        print(f"    {stage:<20} {dur}")
    print()
    print(f"  Institutions seeded   : {report['institutions_seeded']}")
    print(f"  Institutions discovered: {report['institutions_discovered']}")
    print(f"  Institutions extracted : {report['institutions_extracted']}")
    print()
    print("  Per-Institution Results:")
    print(f"  {'Institution':<35} {'Fees':<6} {'Status':<12} {'Review Statuses'}")
    print(f"  {'-'*35} {'-'*6} {'-'*12} {'-'*20}")
    for inst in report["institutions"]:
        status_str = inst["status"]
        fee_count = inst.get("fees_extracted", 0)
        review_str = ", ".join(
            f"{k}:{v}" for k, v in inst.get("review_statuses", {}).items()
        )
        name = inst["name"][:34]
        print(f"  {name:<35} {fee_count:<6} {status_str:<12} {review_str}")
    if report.get("failures"):
        print()
        print("  Failures:")
        for f in report["failures"]:
            print(f"    [{f['stage']}] {f['institution']}: {f['reason']}")
    print("=" * width)
    print()


def _write_report_file(report: dict[str, Any]) -> Path:
    """Write the report dict to a timestamped file in the reports directory."""
    _REPORTS_DIR.mkdir(exist_ok=True)
    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    geo = report["geography"].replace("=", "_").replace(" ", "_")
    report_path = _REPORTS_DIR / f"full_pipeline_{geo}_{ts}.txt"

    lines: list[str] = []
    lines.append("FULL PIPELINE TEST REPORT")
    lines.append("=" * 70)
    lines.append(f"Geography : {report['geography']}")
    lines.append(f"Run date  : {report['run_date']}")
    lines.append(f"Total time: {report['total_time']}")
    lines.append("")
    lines.append("Stage Timings:")
    for stage, dur in report["stage_timings"].items():
        lines.append(f"  {stage:<20} {dur}")
    lines.append("")
    lines.append(f"Institutions seeded    : {report['institutions_seeded']}")
    lines.append(f"Institutions discovered : {report['institutions_discovered']}")
    lines.append(f"Institutions extracted  : {report['institutions_extracted']}")
    lines.append("")
    lines.append("Per-Institution Results:")
    for inst in report["institutions"]:
        review_str = ", ".join(
            f"{k}:{v}" for k, v in inst.get("review_statuses", {}).items()
        )
        lines.append(
            f"  {inst['name'][:34]:<35} fees={inst.get('fees_extracted', 0):<4} "
            f"status={inst['status']:<10} reviews=[{review_str}]"
        )
    if report.get("failures"):
        lines.append("")
        lines.append("Failures:")
        for f in report["failures"]:
            lines.append(f"  [{f['stage']}] {f['institution']}: {f['reason']}")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return report_path


# ---------------------------------------------------------------------------
# Module-scoped fixture: runs the full pipeline once for all tests in this module
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def pipeline_db(test_db, test_config, geography):
    """Module-scoped fixture: clean slate → seed → discover → extract → categorize → validate.

    Yields a tuple (db, report) where:
      db     — the test Database handle (contains all pipeline rows)
      report — dict with stage timings, institution results, failures

    Self-contained: module-scoped fixtures cannot cross file boundaries in pytest.
    All five pipeline stages are inlined here.

    Per D-08 / D-09 from 09-CONTEXT.md.
    """
    # Step 0: Clean slate
    test_db.execute("DELETE FROM extracted_fees")
    test_db.execute("DELETE FROM crawl_results")
    test_db.execute("DELETE FROM crawl_runs WHERE trigger = 'test'")
    test_db.execute("DELETE FROM discovery_cache")
    test_db.execute("DELETE FROM crawl_targets")
    test_db.commit()

    state_code = geography["code"]
    geo_label = f"state={state_code}"
    run_date = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    pipeline_start = time.time()
    stage_timings: dict[str, str] = {}
    failures: list[dict[str, str]] = []
    institution_results: list[dict[str, Any]] = []

    # -----------------------------------------------------------------------
    # Stage 1: Seed
    # -----------------------------------------------------------------------
    t0 = time.time()
    count = seed_fdic(test_db, test_config, limit=_SEED_LIMIT)
    stage_timings["1-seed"] = _elapsed(t0)

    if count == 0:
        pytest.skip("seed_fdic returned 0 rows — FDIC API unavailable.")

    # Filter seeded rows to the selected geography
    seed_targets = test_db.fetchall(
        "SELECT id, institution_name, website_url, state_code, asset_size "
        "FROM crawl_targets "
        "WHERE website_url IS NOT NULL AND state_code = ? "
        "ORDER BY asset_size DESC LIMIT ?",
        (state_code, _TARGET_COUNT),
    )

    # If no institutions with a website_url exist for this state, fall back to
    # the top institutions from the full seeded set (geography-agnostic).
    if not seed_targets:
        warnings.warn(
            f"No institutions with website_url found for state={state_code}. "
            "Falling back to top seeded institutions regardless of state."
        )
        seed_targets = test_db.fetchall(
            "SELECT id, institution_name, website_url, state_code, asset_size "
            "FROM crawl_targets "
            "WHERE website_url IS NOT NULL "
            "ORDER BY asset_size DESC LIMIT ?",
            (_TARGET_COUNT,),
        )

    if not seed_targets:
        pytest.skip("No seeded institutions have website_url — cannot proceed.")

    institutions_seeded = len(seed_targets)
    for target in seed_targets:
        institution_results.append({
            "id": target["id"],
            "name": target["institution_name"],
            "status": "seeded",
            "fees_extracted": 0,
            "review_statuses": {},
        })

    # -----------------------------------------------------------------------
    # Stage 2: Discover
    # -----------------------------------------------------------------------
    t0 = time.time()
    old_timeout = socket.getdefaulttimeout()
    socket.setdefaulttimeout(_DISCOVERY_TIMEOUT_S)

    for target in seed_targets:
        try:
            _discover_one(dict(target), test_config, False, False)
        except Exception as exc:
            inst_name = target["institution_name"]
            failures.append({
                "stage": "discover",
                "institution": inst_name,
                "reason": str(exc)[:120],
            })
            warnings.warn(f"Discovery failed for {inst_name!r}: {exc}")

    socket.setdefaulttimeout(old_timeout)
    test_db.commit()
    stage_timings["2-discover"] = _elapsed(t0)

    disc_targets = test_db.fetchall(
        "SELECT id, institution_name, fee_schedule_url, document_type, "
        "last_content_hash, state_code, charter_type, asset_size "
        "FROM crawl_targets WHERE fee_schedule_url IS NOT NULL "
        "ORDER BY asset_size DESC LIMIT ?",
        (_TARGET_COUNT,),
    )
    institutions_discovered = len(disc_targets)

    # Mark discovered institutions in results
    discovered_ids = {r["id"] for r in disc_targets}
    for inst in institution_results:
        if inst["id"] in discovered_ids:
            inst["status"] = "discovered"

    if not disc_targets:
        # No URLs found — fail with helpful message (D-07)
        pytest.fail(
            f"Stage 2 (discover) bottleneck: 0 of {institutions_seeded} institutions "
            f"in state={state_code} have a fee_schedule_url after discovery. "
            "Check network connectivity and robots.txt compliance."
        )

    # -----------------------------------------------------------------------
    # Stage 3: Extract
    # -----------------------------------------------------------------------
    t0 = time.time()
    run_id = test_db.insert_returning_id(
        "INSERT INTO crawl_runs (trigger, targets_total) VALUES (?, ?)",
        ("test", len(disc_targets)),
    )
    test_db.commit()

    old_timeout = socket.getdefaulttimeout()
    socket.setdefaulttimeout(_EXTRACTION_TIMEOUT_S)

    for target in disc_targets:
        target_dict = dict(target)
        target_dict.setdefault("cms_platform", None)
        inst_name = target_dict.get("institution_name", "unknown")
        try:
            _crawl_one(target_dict, test_config, run_id)
        except Exception as exc:
            failures.append({
                "stage": "extract",
                "institution": inst_name,
                "reason": str(exc)[:120],
            })
            warnings.warn(f"_crawl_one failed for {inst_name!r}: {exc}")

    socket.setdefaulttimeout(old_timeout)
    test_db.commit()
    stage_timings["3-extract"] = _elapsed(t0)

    # Tally extraction results per institution
    for inst in institution_results:
        if inst["id"] not in discovered_ids:
            continue
        result_rows = test_db.fetchall(
            "SELECT status FROM crawl_results WHERE crawl_target_id = ?",
            (inst["id"],),
        )
        if result_rows:
            inst["status"] = "extracted"
        for row in result_rows:
            key = f"crawl_{row['status']}"
            inst["review_statuses"][key] = inst["review_statuses"].get(key, 0) + 1

    check_rows = test_db.fetchall("SELECT COUNT(*) AS n FROM crawl_results")
    institutions_extracted = check_rows[0]["n"] if check_rows else 0

    extracted_rows = test_db.fetchall("SELECT COUNT(*) AS n FROM extracted_fees")
    total_fees = extracted_rows[0]["n"] if extracted_rows else 0

    if total_fees == 0:
        # Not necessarily a hard failure — could be network/key issue
        warnings.warn(
            "No extracted_fees rows after Stage 3 — check ANTHROPIC_API_KEY "
            "and network connectivity."
        )

    # -----------------------------------------------------------------------
    # Stage 4: Categorize
    # -----------------------------------------------------------------------
    t0 = time.time()
    categorize_fees.run(test_db)
    stage_timings["4-categorize"] = _elapsed(t0)

    # -----------------------------------------------------------------------
    # Stage 5: Validate
    # -----------------------------------------------------------------------
    t0 = time.time()
    backfill_validation.run(test_db, test_config)
    stage_timings["5-validate"] = _elapsed(t0)

    # Collect per-institution fee counts and review statuses
    for inst in institution_results:
        fee_rows = test_db.fetchall(
            "SELECT ef.review_status, COUNT(*) AS n "
            "FROM extracted_fees ef "
            "JOIN crawl_results cr ON ef.crawl_result_id = cr.id "
            "WHERE cr.crawl_target_id = ? "
            "GROUP BY ef.review_status",
            (inst["id"],),
        )
        fee_count = sum(r["n"] for r in fee_rows)
        inst["fees_extracted"] = fee_count
        for row in fee_rows:
            inst["review_statuses"][row["review_status"]] = row["n"]
        if fee_count > 0:
            inst["status"] = "complete"

    # -----------------------------------------------------------------------
    # Build report
    # -----------------------------------------------------------------------
    total_time = _elapsed(pipeline_start)
    report: dict[str, Any] = {
        "geography": geo_label,
        "run_date": run_date,
        "total_time": total_time,
        "stage_timings": stage_timings,
        "institutions_seeded": institutions_seeded,
        "institutions_discovered": institutions_discovered,
        "institutions_extracted": institutions_extracted,
        "institutions": institution_results,
        "failures": failures,
    }

    yield test_db, report

    # Teardown in FK order
    test_db.execute("DELETE FROM extracted_fees")
    test_db.execute("DELETE FROM crawl_results")
    test_db.execute("DELETE FROM crawl_runs WHERE trigger = 'test'")
    test_db.execute("DELETE FROM discovery_cache")
    test_db.execute("DELETE FROM crawl_targets")
    test_db.commit()


# ---------------------------------------------------------------------------
# PIPE-01: Full pipeline produces fees with valid review statuses + report
# ---------------------------------------------------------------------------


@pytest.mark.e2e
@pytest.mark.llm
@pytest.mark.slow
def test_full_pipeline_produces_fees_with_report(pipeline_db, test_config) -> None:
    """PIPE-01: Full pipeline runs all five stages and produces a report.

    Assertions:
    - At least 1 institution was seeded (D-07: not all stages bottlenecked)
    - At least 1 institution completed discovery (fee_schedule_url found)
    - At least 1 crawl_results row exists with a valid status
    - At least 1 extracted_fees row exists (proves LLM extraction ran)
    - All extracted_fees rows have review_status in the valid set
    - Report is printed to stdout and written to reports/ directory

    Per D-06: test PASSES if >= 1 institution completes the full pipeline.
    Per D-07: test FAILS with clear message if ALL institutions fail at every stage.
    """
    db, report = pipeline_db

    valid_review_statuses = frozenset({"pending", "staged", "approved", "rejected"})

    # Print report to stdout (captured by pytest -s)
    _print_report(report)

    # Write report to file for CI artifact collection (D-05)
    report_path = _write_report_file(report)
    print(f"  Report written to: {report_path}")

    # Assert: at least 1 institution was seeded
    assert report["institutions_seeded"] >= 1, (
        "No institutions were seeded — FDIC API unavailable or returned 0 results."
    )

    # Assert: at least 1 institution was discovered (D-07 bottleneck check)
    assert report["institutions_discovered"] >= 1, (
        f"Stage 2 (discover) bottleneck: 0 of {report['institutions_seeded']} "
        "seeded institutions had a fee_schedule_url found during discovery. "
        "Check network connectivity and site availability."
    )

    # Assert: at least 1 crawl_results row exists with a valid status
    valid_crawl_statuses = frozenset({"success", "failed", "unchanged"})
    all_crawl_results = db.fetchall("SELECT id, status FROM crawl_results")
    assert len(all_crawl_results) >= 1, (
        "No crawl_results rows — _crawl_one was not called or failed silently."
    )
    for row in all_crawl_results:
        assert row["status"] in valid_crawl_statuses, (
            f"crawl_results id={row['id']}: status={row['status']!r} "
            f"is not in {valid_crawl_statuses}"
        )

    # Assert: at least 1 extracted_fees row
    all_fees = db.fetchall("SELECT id, review_status FROM extracted_fees")
    assert len(all_fees) >= 1, (
        "No extracted_fees rows — LLM extraction did not produce any fees. "
        "Check ANTHROPIC_API_KEY is set and the fee schedule pages are accessible."
    )

    # Assert: all review statuses are valid
    for row in all_fees:
        assert row["review_status"] in valid_review_statuses, (
            f"extracted_fees id={row['id']}: review_status={row['review_status']!r} "
            f"is not in {valid_review_statuses}"
        )

    # Assert: at least 1 institution reached the complete status
    complete_count = sum(
        1 for inst in report["institutions"] if inst["status"] == "complete"
    )
    assert complete_count >= 1, (
        f"No institutions reached 'complete' status (fees extracted + validated). "
        f"Institution statuses: {[i['status'] for i in report['institutions']]}. "
        "This may indicate a network or API key issue, not a pipeline bug."
    )


# ---------------------------------------------------------------------------
# PIPE-02: Audit trail is complete — every fee has a crawl_results parent
# ---------------------------------------------------------------------------


@pytest.mark.e2e
@pytest.mark.llm
@pytest.mark.slow
def test_full_pipeline_audit_trail_intact(pipeline_db) -> None:
    """PIPE-02: Every extracted_fees row links back to a crawl_results row.

    Verifies the immutable audit trail described in PROJECT.md:
    crawl_targets → crawl_runs → crawl_results → extracted_fees

    A broken FK chain (orphaned extracted_fees) would indicate a silent data
    integrity failure in the pipeline.
    """
    db, _report = pipeline_db

    orphaned = db.fetchall(
        "SELECT ef.id "
        "FROM extracted_fees ef "
        "LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id "
        "WHERE cr.id IS NULL"
    )
    assert len(orphaned) == 0, (
        f"Found {len(orphaned)} orphaned extracted_fees rows with no parent "
        "crawl_results row. This indicates a FK integrity failure in the pipeline."
    )


# ---------------------------------------------------------------------------
# PIPE-03: Categorization covered at least 1 fee
# ---------------------------------------------------------------------------


@pytest.mark.e2e
@pytest.mark.llm
@pytest.mark.slow
def test_full_pipeline_categorization_ran(pipeline_db) -> None:
    """PIPE-03: At least 1 extracted_fees row has fee_category set after categorization.

    Verifies that Stage 4 (categorize_fees.run) matched at least 1 extracted fee
    to a canonical fee category. If all fees are uncategorized, it may indicate
    the fee taxonomy alias table is out of sync with what the LLM extracts.

    Skips rather than fails if no extracted_fees exist (upstream stage already covers that).
    """
    db, _report = pipeline_db

    fees = db.fetchall("SELECT id, fee_category FROM extracted_fees")
    if not fees:
        pytest.skip("No extracted_fees rows — upstream test covers this case.")

    categorized = [f for f in fees if f["fee_category"] is not None]
    assert len(categorized) >= 1, (
        f"0 of {len(fees)} extracted_fees rows have fee_category set. "
        "This suggests the fee taxonomy alias table is out of sync with the "
        "fee names extracted by Claude Haiku."
    )
