#!/usr/bin/env python3
"""Apply SQL migrations against production via Modal secrets.

Use this when local DATABASE_URL is stale or intentionally absent but the
production Modal secret still has valid database credentials.

Example:
    python scripts/apply_migrations_via_modal.py \
      20260515_agent_events_status_in_progress.sql \
      20260516_workers_last_run.sql
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

import modal


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"

image = modal.Image.debian_slim(python_version="3.12").pip_install("psycopg2-binary")
app = modal.App("bfi-migration-runner")


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("bfi-secrets")],
    timeout=900,
)
def apply_migration(filename: str, body: str, checksum: str, applied_by: str = "codex") -> dict:
    import os

    import psycopg2

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = True
    try:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
              filename    TEXT PRIMARY KEY,
              applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              applied_by  TEXT,
              checksum    TEXT
            )
            """
        )
        cur.execute(
            "SELECT 1 FROM schema_migrations WHERE filename = %s",
            (filename,),
        )
        if cur.fetchone():
            cur.close()
            return {"filename": filename, "status": "skipped"}

        cur.execute(body)
        cur.execute(
            """
            INSERT INTO schema_migrations (filename, checksum, applied_by)
            VALUES (%s, %s, %s)
            ON CONFLICT (filename) DO NOTHING
            """,
            (filename, checksum, applied_by),
        )
        cur.close()
        return {"filename": filename, "status": "applied"}
    finally:
        conn.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("filenames", nargs="+", help="migration filenames in supabase/migrations/")
    parser.add_argument(
        "--applied-by",
        default="codex",
        help="value recorded in schema_migrations.applied_by",
    )
    return parser.parse_args()


def load_payloads(filenames: list[str]) -> list[tuple[str, str, str]]:
    payloads: list[tuple[str, str, str]] = []
    for filename in filenames:
        path = MIGRATIONS_DIR / filename
        if not path.exists():
            raise FileNotFoundError(f"Migration file not found: {path}")
        body = path.read_text()
        checksum = hashlib.sha256(body.encode()).hexdigest()[:16]
        payloads.append((filename, body, checksum))
    return payloads


def main() -> None:
    args = parse_args()
    payloads = load_payloads(args.filenames)

    with app.run():
        for filename, body, checksum in payloads:
            result = apply_migration.remote(
                filename,
                body,
                checksum,
                args.applied_by,
            )
            print(result)


if __name__ == "__main__":
    main()
