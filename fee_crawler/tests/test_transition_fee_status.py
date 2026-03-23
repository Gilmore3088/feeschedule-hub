"""Integration tests for transition_fee_status with a real SQLite DB."""

import sqlite3

import pytest

from fee_crawler.review_status import transition_fee_status, TransitionContext


@pytest.fixture
def db():
    """Create an in-memory DB with the required tables."""
    from fee_crawler.config import Config

    class MockDb:
        def __init__(self):
            self.conn = sqlite3.connect(":memory:")
            self.conn.row_factory = sqlite3.Row
            self.conn.execute("""
                CREATE TABLE extracted_fees (
                    id INTEGER PRIMARY KEY,
                    fee_name TEXT,
                    amount REAL,
                    review_status TEXT DEFAULT 'pending'
                )
            """)
            self.conn.execute("""
                CREATE TABLE fee_reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fee_id INTEGER,
                    action TEXT,
                    username TEXT,
                    previous_status TEXT,
                    new_status TEXT,
                    notes TEXT,
                    created_at TEXT
                )
            """)
            self.conn.commit()

        def execute(self, sql, params=()):
            return self.conn.execute(sql, params)

        def fetchone(self, sql, params=()):
            return self.conn.execute(sql, params).fetchone()

        def fetchall(self, sql, params=()):
            return self.conn.execute(sql, params).fetchall()

        def commit(self):
            self.conn.commit()

    return MockDb()


def _insert_fee(db, fee_id: int, status: str = "pending"):
    db.execute(
        "INSERT INTO extracted_fees (id, fee_name, amount, review_status) VALUES (?, 'test', 10.00, ?)",
        (fee_id, status),
    )
    db.commit()


class TestTransitionFeeStatus:
    def test_valid_transition_updates_status(self, db):
        _insert_fee(db, 1, "pending")
        result = transition_fee_status(
            db, 1, "pending", "staged",
            actor="system", context=TransitionContext.EXTRACTION,
        )
        assert result is True
        row = db.fetchone("SELECT review_status FROM extracted_fees WHERE id = 1")
        assert row["review_status"] == "staged"

    def test_valid_transition_creates_audit_record(self, db):
        _insert_fee(db, 2, "staged")
        transition_fee_status(
            db, 2, "staged", "approved",
            actor="system", context=TransitionContext.REVIEW,
            notes="auto-approved by test",
        )
        review = db.fetchone("SELECT * FROM fee_reviews WHERE fee_id = 2")
        assert review is not None
        assert review["previous_status"] == "staged"
        assert review["new_status"] == "approved"
        assert review["username"] == "system"
        assert review["notes"] == "auto-approved by test"

    def test_invalid_transition_returns_false(self, db):
        _insert_fee(db, 3, "rejected")
        result = transition_fee_status(
            db, 3, "rejected", "approved",
            actor="system", context=TransitionContext.REVIEW,
        )
        assert result is False
        row = db.fetchone("SELECT review_status FROM extracted_fees WHERE id = 3")
        assert row["review_status"] == "rejected"  # unchanged

    def test_invalid_transition_no_audit(self, db):
        _insert_fee(db, 4, "rejected")
        transition_fee_status(
            db, 4, "rejected", "approved",
            actor="system", context=TransitionContext.REVIEW,
        )
        review = db.fetchone("SELECT * FROM fee_reviews WHERE fee_id = 4")
        assert review is None

    def test_manual_protection_blocks_system(self, db):
        _insert_fee(db, 5, "approved")
        result = transition_fee_status(
            db, 5, "approved", "staged",
            actor="system", context=TransitionContext.REVIEW,
        )
        assert result is False

    def test_recrawl_overrides_manual_protection(self, db):
        _insert_fee(db, 6, "approved")
        result = transition_fee_status(
            db, 6, "approved", "staged",
            actor="system", context=TransitionContext.RECRAWL,
            notes="price changed: $30 -> $35",
        )
        assert result is True
        row = db.fetchone("SELECT review_status FROM extracted_fees WHERE id = 6")
        assert row["review_status"] == "staged"

    def test_human_can_demote_approved(self, db):
        _insert_fee(db, 7, "approved")
        result = transition_fee_status(
            db, 7, "approved", "staged",
            actor="admin", context=TransitionContext.MANUAL,
        )
        assert result is True

    def test_multiple_transitions_create_audit_trail(self, db):
        _insert_fee(db, 8, "pending")
        transition_fee_status(db, 8, "pending", "staged", "system", TransitionContext.EXTRACTION)
        transition_fee_status(db, 8, "staged", "approved", "system", TransitionContext.REVIEW)
        reviews = db.fetchall("SELECT * FROM fee_reviews WHERE fee_id = 8 ORDER BY id")
        assert len(reviews) == 2
        assert reviews[0]["previous_status"] == "pending"
        assert reviews[0]["new_status"] == "staged"
        assert reviews[1]["previous_status"] == "staged"
        assert reviews[1]["new_status"] == "approved"
