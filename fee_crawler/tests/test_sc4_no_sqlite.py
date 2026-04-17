"""SC4 acceptance: SQLite is gone from every production and test path.

ROADMAP.md Phase 62a Success Criterion 4:
  grep -r "better-sqlite3|sqlite3|DB_PATH" fee_crawler/ src/ returns zero
  production matches; running pytest with DATABASE_URL pointed at Postgres
  test schema completes green; fee_crawler/db.py is Postgres-only.
"""

from __future__ import annotations

import pathlib
import subprocess


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]


def test_sc4_ci_guard_exits_zero():
    """scripts/ci-guards.sh sqlite-kill must exit 0."""
    result = subprocess.run(
        ["bash", "scripts/ci-guards.sh", "sqlite-kill"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"SC4: sqlite-kill guard failed.\n"
        f"STDOUT: {result.stdout}\nSTDERR: {result.stderr}"
    )


def test_sc4_db_py_is_postgres_only():
    """fee_crawler/db.py must contain zero sqlite3 references and import psycopg2."""
    src = (REPO_ROOT / "fee_crawler" / "db.py").read_text()
    assert "sqlite3" not in src, "fee_crawler/db.py still references sqlite3"
    assert "import psycopg2" in src, (
        "fee_crawler/db.py must import psycopg2 (sync Postgres surface)"
    )


def test_sc4_modal_preflight_is_postgres_only():
    """fee_crawler/modal_preflight.py must contain zero SQLite references."""
    src = (REPO_ROOT / "fee_crawler" / "modal_preflight.py").read_text()
    assert "sqlite" not in src.lower(), (
        "fee_crawler/modal_preflight.py still references sqlite (case-insensitive)"
    )
    assert "PREFLIGHT_DB_PATH" not in src, (
        "old SQLite path constant still present"
    )
    assert "preflight_check" in src, (
        "rewritten preflight must exercise synthetic agent_events write"
    )


def test_sc4_ci_workflow_has_no_continue_on_error():
    """.github/workflows/test.yml must not mark sqlite-kill as continue-on-error."""
    workflow = (REPO_ROOT / ".github" / "workflows" / "test.yml").read_text()
    assert "sqlite-kill" in workflow, (
        "CI workflow must run the sqlite-kill guard"
    )
    # The relevant step has been de-softened in Plan 62A-11. A simple sufficient
    # check: the substring "continue-on-error: true" does not appear anywhere in
    # the workflow (no soft CI steps remain after Plan 62A-11).
    assert "continue-on-error: true" not in workflow, (
        "CI workflow still marks a step continue-on-error; "
        "Plan 62A-11 should have removed it"
    )
