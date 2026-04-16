"""Integration tests for transition_fee_status (Phase 62a rewrite — Postgres-only).

Previously used an in-memory filesystem-DB MockDb. Now uses a per-test Postgres
schema created directly via psycopg2 — the legacy `extracted_fees`/`fee_reviews`
tables are not in supabase/migrations/ (they predate the three-tier Phase 62a
tables), so we create minimal shapes inline for the state-machine tests.

Requires DATABASE_URL_TEST. Skips if unset.
"""

from __future__ import annotations

import os
import secrets

import psycopg2
import psycopg2.extras
import pytest

from fee_crawler.review_status import transition_fee_status, TransitionContext


def _test_dsn() -> str:
    dsn = os.environ.get("DATABASE_URL_TEST")
    if not dsn:
        pytest.skip(
            "DATABASE_URL_TEST not set; "
            "start docker compose up -d postgres and export "
            "DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test"
        )
    if "supabase.co" in dsn or "pooler." in dsn:
        pytest.fail(
            f"DATABASE_URL_TEST refuses production/pooler host: {dsn!r}. "
            "Use a disposable local/CI Postgres only."
        )
    return dsn


class _PgDb:
    """Minimal sync DB wrapper matching the Database API that
    transition_fee_status() consumes (execute, fetchone, fetchall, commit).

    Legacy SQL in review_status.py uses `?` placeholders and
    `datetime('now')` — we translate via fee_crawler.db._translate_placeholders
    so the same production code path runs against Postgres.
    """

    def __init__(self, conn):
        from fee_crawler.db import _translate_placeholders

        self.conn = conn
        self._translate = _translate_placeholders
        self._cursor_factory = psycopg2.extras.RealDictCursor

    def execute(self, sql, params=()):
        cur = self.conn.cursor(cursor_factory=self._cursor_factory)
        cur.execute(self._translate(sql), params)
        return cur

    def fetchone(self, sql, params=()):
        cur = self.conn.cursor(cursor_factory=self._cursor_factory)
        cur.execute(self._translate(sql), params)
        row = cur.fetchone()
        return dict(row) if row is not None else None

    def fetchall(self, sql, params=()):
        cur = self.conn.cursor(cursor_factory=self._cursor_factory)
        cur.execute(self._translate(sql), params)
        return [dict(r) for r in cur.fetchall()]

    def commit(self):
        self.conn.commit()


@pytest.fixture
def db():
    """Create a per-test Postgres schema with minimal extracted_fees + fee_reviews tables."""
    dsn = _test_dsn()
    schema = f"test_txn_{secrets.token_hex(6)}"

    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(f'CREATE SCHEMA "{schema}"')
    cur.execute(f'SET search_path TO "{schema}", public')
    cur.execute("""
        CREATE TABLE extracted_fees (
            id BIGSERIAL PRIMARY KEY,
            fee_name TEXT,
            amount NUMERIC,
            review_status TEXT DEFAULT 'pending'
        )
    """)
    cur.execute("""
        CREATE TABLE fee_reviews (
            id BIGSERIAL PRIMARY KEY,
            fee_id BIGINT,
            action TEXT,
            username TEXT,
            previous_status TEXT,
            new_status TEXT,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    conn.autocommit = False

    # Pin the working connection to the freshly-created schema.
    work = psycopg2.connect(dsn)
    work.autocommit = False
    cur2 = work.cursor()
    cur2.execute(f'SET search_path TO "{schema}", public')
    work.commit()

    db_wrapper = _PgDb(work)
    try:
        yield db_wrapper
    finally:
        try:
            work.close()
        except Exception:
            pass
        try:
            drop = psycopg2.connect(dsn)
            drop.autocommit = True
            drop.cursor().execute(f'DROP SCHEMA "{schema}" CASCADE')
            drop.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


def _insert_fee(db, fee_id: int, status: str = "pending"):
    db.execute(
        "INSERT INTO extracted_fees (id, fee_name, amount, review_status) "
        "VALUES (?, 'test', 10.00, ?)",
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
        row = db.fetchone(
            "SELECT review_status FROM extracted_fees WHERE id = 1"
        )
        assert row["review_status"] == "staged"

    def test_valid_transition_creates_audit_record(self, db):
        _insert_fee(db, 2, "staged")
        transition_fee_status(
            db, 2, "staged", "approved",
            actor="system", context=TransitionContext.REVIEW,
            notes="auto-approved by test",
        )
        review = db.fetchone(
            "SELECT * FROM fee_reviews WHERE fee_id = 2"
        )
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
        row = db.fetchone(
            "SELECT review_status FROM extracted_fees WHERE id = 3"
        )
        assert row["review_status"] == "rejected"  # unchanged

    def test_invalid_transition_no_audit(self, db):
        _insert_fee(db, 4, "rejected")
        transition_fee_status(
            db, 4, "rejected", "approved",
            actor="system", context=TransitionContext.REVIEW,
        )
        review = db.fetchone(
            "SELECT * FROM fee_reviews WHERE fee_id = 4"
        )
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
        row = db.fetchone(
            "SELECT review_status FROM extracted_fees WHERE id = 6"
        )
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
        transition_fee_status(
            db, 8, "pending", "staged",
            "system", TransitionContext.EXTRACTION,
        )
        transition_fee_status(
            db, 8, "staged", "approved",
            "system", TransitionContext.REVIEW,
        )
        reviews = db.fetchall(
            "SELECT * FROM fee_reviews WHERE fee_id = 8 ORDER BY id"
        )
        assert len(reviews) == 2
        assert reviews[0]["previous_status"] == "pending"
        assert reviews[0]["new_status"] == "staged"
        assert reviews[1]["previous_status"] == "staged"
        assert reviews[1]["new_status"] == "approved"
