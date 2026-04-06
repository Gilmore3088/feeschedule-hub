"""Audit trail tests — verifies FK integrity and status-transition audit trail across the
full pipeline chain (crawl_targets -> crawl_runs -> crawl_results -> extracted_fees -> fee_reviews).

Tests:
  - test_no_orphaned_crawl_results: AUDT-01 positive — LEFT JOIN shows zero orphans when FK
    chain is intact (crawl_results.crawl_target_id references a valid crawl_targets row).
  - test_orphan_detection_catches_invalid_fk: AUDT-01 negative — deliberately inserted
    crawl_result with a non-existent crawl_target_id is caught by the LEFT JOIN (1 row returned).
  - test_no_orphaned_extracted_fees: AUDT-02 positive — LEFT JOIN shows zero orphans when
    extracted_fees.crawl_result_id references a valid crawl_results row.
  - test_extracted_fee_orphan_detection: AUDT-02 negative — deliberately inserted extracted_fee
    with a non-existent crawl_result_id is caught by the LEFT JOIN (1 row returned).
  - test_non_zero_extraction: AUDT-03 — at least 1 extracted_fees row exists after synthetic run.
  - test_staged_fee_has_review_audit_trail: AUDT-04 — every fee with review_status='staged' has
    a corresponding fee_reviews row with action='stage'.

Fixture scoping rationale:
  - audit_db is FUNCTION-scoped — fresh synthetic data per test for complete isolation.
  - Pure Python/SQLite only: no LLM calls, no network I/O, < 1s per test.

Marks: all tests are @pytest.mark.e2e only.
  - No @pytest.mark.llm (no Anthropic API calls).
  - No @pytest.mark.slow (pure SQL — in-memory computation, sub-second).
"""

from __future__ import annotations

import pytest

from fee_crawler.db import Database

# ---------------------------------------------------------------------------
# Constants for test data
# ---------------------------------------------------------------------------

_CERT_NUMBER = "TEST-AUDT-001"


# ---------------------------------------------------------------------------
# Helper: teardown all test rows in FK-safe order
# ---------------------------------------------------------------------------


def _teardown(db: Database) -> None:
    """Delete test data in FK-safe order.

    Tables referencing extracted_fees must be deleted first:
      fee_reviews (fee_id FK) and gold_standard_fees (fee_id FK)
    """
    db.execute("DELETE FROM gold_standard_fees")
    db.execute("DELETE FROM fee_reviews")
    db.execute("DELETE FROM extracted_fees")
    db.execute("DELETE FROM crawl_results")
    db.execute("DELETE FROM crawl_runs WHERE trigger = 'test'")
    db.execute("DELETE FROM crawl_targets")
    db.commit()


# ---------------------------------------------------------------------------
# Helper: insert FK scaffold (crawl_targets -> crawl_runs -> crawl_results)
# Returns (target_id, run_id, result_id).
# ---------------------------------------------------------------------------


def _insert_scaffold(db: Database, cert_suffix: str) -> tuple[int, int, int]:
    db.execute(
        "INSERT INTO crawl_targets (institution_name, charter_type, source, cert_number) "
        "VALUES (?, ?, ?, ?)",
        ("Test Bank", "bank", "fdic", f"TEST-AUDT-{cert_suffix}"),
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
# Function-scoped fixture: full FK chain with known data for audit trail tests
# ---------------------------------------------------------------------------


@pytest.fixture()
def audit_db(test_db: Database, test_config) -> Database:
    """Function-scoped fixture: insert a complete FK chain with known synthetic data.

    Chain:
      crawl_targets (1 row: cert TEST-AUDT-001)
        -> crawl_runs (1 row: trigger=test)
          -> crawl_results (1 row: status=success)
            -> extracted_fees (2 rows)
                - "Monthly Maintenance Fee": review_status='staged', confidence=0.9
                - "NSF Fee": review_status='pending', confidence=0.75
            -> fee_reviews (1 row for the staged fee: action='stage')

    Teardown is called before setup to ensure a clean state regardless of prior test failures.
    """
    _teardown(test_db)

    target_id, run_id, result_id = _insert_scaffold(test_db, "001")

    # Insert "Monthly Maintenance Fee" (staged) — will have a fee_reviews stage event
    test_db.execute(
        "INSERT INTO extracted_fees "
        "(crawl_result_id, crawl_target_id, fee_name, extraction_confidence, review_status) "
        "VALUES (?, ?, ?, ?, ?)",
        (result_id, target_id, "Monthly Maintenance Fee", 0.9, "staged"),
    )
    monthly_maintenance_id = test_db.conn.execute(
        "SELECT last_insert_rowid()"
    ).fetchone()[0]

    # Insert "NSF Fee" (pending) — no fee_reviews row needed
    test_db.execute(
        "INSERT INTO extracted_fees "
        "(crawl_result_id, crawl_target_id, fee_name, extraction_confidence, review_status) "
        "VALUES (?, ?, ?, ?, ?)",
        (result_id, target_id, "NSF Fee", 0.75, "pending"),
    )

    # Insert fee_reviews row for the staged fee (action='stage')
    # user_id is nullable — use NULL for system/test actor
    test_db.execute(
        "INSERT INTO fee_reviews (fee_id, action, previous_status, new_status) "
        "VALUES (?, 'stage', 'pending', 'staged')",
        (monthly_maintenance_id,),
    )

    test_db.commit()

    yield test_db

    _teardown(test_db)


# ---------------------------------------------------------------------------
# AUDT-01: No orphaned crawl_results (positive path)
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_no_orphaned_crawl_results(audit_db: Database) -> None:
    """AUDT-01: LEFT JOIN confirms zero orphaned crawl_results when FK chain is intact.

    A crawl_result is orphaned when its crawl_target_id references a non-existent
    crawl_targets row. This test verifies the happy path: all FK links are valid.
    """
    rows = audit_db.fetchall(
        "SELECT cr.id FROM crawl_results cr "
        "LEFT JOIN crawl_targets ct ON cr.crawl_target_id = ct.id "
        "WHERE ct.id IS NULL"
    )
    orphan_ids = [r["id"] for r in rows]
    assert len(orphan_ids) == 0, (
        f"Found orphaned crawl_results with no matching crawl_target: ids={orphan_ids}"
    )


# ---------------------------------------------------------------------------
# AUDT-01: Orphan detection catches invalid FK (negative test per D-05)
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_orphan_detection_catches_invalid_fk(audit_db: Database) -> None:
    """AUDT-01 negative: deliberately insert a crawl_result with a non-existent
    crawl_target_id and confirm the LEFT JOIN detects it (returns 1 orphaned row).

    PRAGMA foreign_keys=OFF is required because Database._set_pragmas() enables FK
    enforcement — without disabling it, the orphan INSERT would raise an IntegrityError.
    The PRAGMA is re-enabled immediately after the insert in a try/finally block.
    """
    # Disable FK enforcement for the deliberate orphan insert
    audit_db.conn.execute("PRAGMA foreign_keys=OFF")
    orphan_result_id = None
    try:
        orphan_result_id = audit_db.insert_returning_id(
            "INSERT INTO crawl_results (crawl_run_id, crawl_target_id, status) "
            "VALUES (1, 999999, 'success')"
        )
        audit_db.commit()
    finally:
        # Always re-enable FK enforcement regardless of insert outcome
        audit_db.conn.execute("PRAGMA foreign_keys=ON")

    try:
        rows = audit_db.fetchall(
            "SELECT cr.id FROM crawl_results cr "
            "LEFT JOIN crawl_targets ct ON cr.crawl_target_id = ct.id "
            "WHERE ct.id IS NULL"
        )
        orphan_ids = [r["id"] for r in rows]
        assert len(orphan_ids) == 1, (
            f"Expected exactly 1 orphaned crawl_result to be detected; "
            f"got {len(orphan_ids)}: ids={orphan_ids}"
        )
    finally:
        # Clean up the orphan row before teardown to avoid FK errors
        if orphan_result_id is not None:
            audit_db.execute(
                "DELETE FROM crawl_results WHERE crawl_target_id = 999999"
            )
            audit_db.commit()


# ---------------------------------------------------------------------------
# AUDT-02: No orphaned extracted_fees (positive path)
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_no_orphaned_extracted_fees(audit_db: Database) -> None:
    """AUDT-02: LEFT JOIN confirms zero orphaned extracted_fees when FK chain is intact.

    An extracted_fee is orphaned when its crawl_result_id references a non-existent
    crawl_results row. This test verifies the happy path: all FK links are valid.
    """
    rows = audit_db.fetchall(
        "SELECT ef.id FROM extracted_fees ef "
        "LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id "
        "WHERE cr.id IS NULL"
    )
    orphan_ids = [r["id"] for r in rows]
    assert len(orphan_ids) == 0, (
        f"Found orphaned extracted_fees with no matching crawl_result: ids={orphan_ids}"
    )


# ---------------------------------------------------------------------------
# AUDT-02: Orphan detection catches invalid FK for extracted_fees (negative test per D-05)
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_extracted_fee_orphan_detection(audit_db: Database) -> None:
    """AUDT-02 negative: deliberately insert an extracted_fee with a non-existent
    crawl_result_id and confirm the LEFT JOIN detects it (returns 1 orphaned row).

    Same PRAGMA foreign_keys=OFF pattern as the crawl_results negative test.
    """
    audit_db.conn.execute("PRAGMA foreign_keys=OFF")
    orphan_fee_id = None
    try:
        orphan_fee_id = audit_db.insert_returning_id(
            "INSERT INTO extracted_fees "
            "(crawl_result_id, crawl_target_id, fee_name, extraction_confidence) "
            "VALUES (999999, 999999, 'Orphan Test Fee', 0.5)"
        )
        audit_db.commit()
    finally:
        audit_db.conn.execute("PRAGMA foreign_keys=ON")

    try:
        rows = audit_db.fetchall(
            "SELECT ef.id FROM extracted_fees ef "
            "LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id "
            "WHERE cr.id IS NULL"
        )
        orphan_ids = [r["id"] for r in rows]
        assert len(orphan_ids) == 1, (
            f"Expected exactly 1 orphaned extracted_fee to be detected; "
            f"got {len(orphan_ids)}: ids={orphan_ids}"
        )
    finally:
        # Clean up the orphan row before teardown
        if orphan_fee_id is not None:
            audit_db.execute(
                "DELETE FROM extracted_fees WHERE crawl_result_id = 999999"
            )
            audit_db.commit()


# ---------------------------------------------------------------------------
# AUDT-03: Non-zero extraction confirmed
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_non_zero_extraction(audit_db: Database) -> None:
    """AUDT-03: at least 1 extracted_fees row exists after the synthetic pipeline run."""
    row = audit_db.fetchone("SELECT COUNT(*) as cnt FROM extracted_fees")
    cnt = row["cnt"]
    assert cnt >= 1, (
        f"Expected at least 1 extracted_fees row; got {cnt}. "
        "The audit_db fixture must insert at least one extracted_fees row."
    )


# ---------------------------------------------------------------------------
# AUDT-04: Staged fees have a corresponding fee_reviews 'stage' event
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_staged_fee_has_review_audit_trail(audit_db: Database) -> None:
    """AUDT-04: every extracted_fee with review_status='staged' has a
    fee_reviews row with action='stage' for that fee's id."""
    staged = audit_db.fetchall(
        "SELECT id FROM extracted_fees WHERE review_status = 'staged'"
    )
    assert len(staged) >= 1, (
        "audit_db fixture must insert at least 1 staged fee to test AUDT-04."
    )

    missing_audit = []
    for row in staged:
        fee_id = row["id"]
        review = audit_db.fetchone(
            "SELECT COUNT(*) as cnt FROM fee_reviews "
            "WHERE fee_id = ? AND action = 'stage'",
            (fee_id,),
        )
        if review["cnt"] == 0:
            missing_audit.append(fee_id)

    assert missing_audit == [], (
        f"Staged fees missing a fee_reviews 'stage' event: fee_ids={missing_audit}. "
        "Every fee with review_status='staged' must have a corresponding "
        "fee_reviews row with action='stage'."
    )
