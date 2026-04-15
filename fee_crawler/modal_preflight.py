"""Modal pre-flight validation for Bank Fee Index pipeline.

Two validation modes:

1. preflight_e2e — Isolated 5-stage pipeline smoke test using a fresh
   SQLite DB in /tmp. Deliberately ignores DATABASE_URL so it can run
   anywhere without touching production data.

2. preflight_postgres — Structural probe that validates the Postgres
   schema matches production assumptions (all six pipeline tables must
   exist). Requires DATABASE_URL. Call this before deploying pipeline
   workers against a new Supabase environment.

Deploy: modal deploy fee_crawler/modal_preflight.py
Run e2e:      modal run fee_crawler/modal_preflight.py::preflight_e2e
Run pg check: modal run fee_crawler/modal_preflight.py::preflight_postgres
"""

from __future__ import annotations

import os
import socket
import time
from typing import Any

import modal
from pydantic import BaseModel

from fee_crawler.db import require_postgres

PREFLIGHT_DB_PATH = "/tmp/preflight_test.db"
PREFLIGHT_DOC_DIR = "/tmp/preflight_docs"
SEED_LIMIT = 10
TARGET_COUNT = 3
DISCOVERY_TIMEOUT_S = 15
EXTRACTION_TIMEOUT_S = 30

preflight_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("tesseract-ocr", "poppler-utils")
    .pip_install_from_requirements("fee_crawler/requirements.txt")
    .pip_install("fastapi[standard]")
    .add_local_dir("fee_crawler", remote_path="/root/fee_crawler")
)

app = modal.App("bank-fee-index-workers", image=preflight_image)
secrets = [modal.Secret.from_name("bfi-secrets")]


class PreflightRequest(BaseModel):
    state_code: str = "VT"


def _run_preflight_stages(
    db: Any, config: Any, state_code: str
) -> tuple[int, int, list[str]]:
    """Execute all 5 pipeline stages; return (seeded, fees_extracted, errors).

    Errors are formatted as "stage:institution:reason[:100 chars]".
    Never raises — all stage exceptions are caught and recorded.
    """
    from fee_crawler.commands import backfill_validation, categorize_fees
    from fee_crawler.commands.crawl import _crawl_one
    from fee_crawler.commands.discover_urls import _discover_one
    from fee_crawler.commands.seed_institutions import seed_fdic

    errors: list[str] = []

    # Stage 1: Seed
    try:
        institutions_seeded = seed_fdic(db, config, limit=SEED_LIMIT)
    except Exception as exc:
        errors.append(f"seed:all:{str(exc)[:100]}")
        return 0, 0, errors

    if institutions_seeded == 0:
        errors.append("seed:all:FDIC API returned 0 rows")
        return 0, 0, errors

    targets = db.fetchall(
        "SELECT id, institution_name, website_url, state_code, asset_size "
        "FROM crawl_targets "
        "WHERE website_url IS NOT NULL AND state_code = ? "
        "ORDER BY asset_size DESC LIMIT ?",
        (state_code.upper(), TARGET_COUNT),
    )
    if not targets:
        targets = db.fetchall(
            "SELECT id, institution_name, website_url, state_code, asset_size "
            "FROM crawl_targets WHERE website_url IS NOT NULL "
            "ORDER BY asset_size DESC LIMIT ?",
            (TARGET_COUNT,),
        )
    if not targets:
        errors.append("seed:all:no institutions with website_url found")
        return institutions_seeded, 0, errors

    # Stage 2: Discover
    old_timeout = socket.getdefaulttimeout()
    socket.setdefaulttimeout(DISCOVERY_TIMEOUT_S)
    try:
        for target in targets:
            try:
                _discover_one(dict(target), config, False, False)
            except Exception as exc:
                errors.append(f"discover:{target['institution_name']}:{str(exc)[:100]}")
    finally:
        socket.setdefaulttimeout(old_timeout)
    db.commit()

    disc_targets = db.fetchall(
        "SELECT id, institution_name, fee_schedule_url, document_type, "
        "last_content_hash, state_code, charter_type, asset_size "
        "FROM crawl_targets WHERE fee_schedule_url IS NOT NULL "
        "ORDER BY asset_size DESC LIMIT ?",
        (TARGET_COUNT,),
    )
    if not disc_targets:
        errors.append("discover:all:no fee_schedule_url found for any institution")
        return institutions_seeded, 0, errors

    # Stage 3: Extract
    run_id = db.insert_returning_id(
        "INSERT INTO crawl_runs (trigger, targets_total) VALUES (?, ?)",
        ("preflight", len(disc_targets)),
    )
    db.commit()

    old_timeout = socket.getdefaulttimeout()
    socket.setdefaulttimeout(EXTRACTION_TIMEOUT_S)
    try:
        for target in disc_targets:
            target_dict = dict(target)
            target_dict.setdefault("cms_platform", None)
            inst = target_dict.get("institution_name", "unknown")
            try:
                _crawl_one(target_dict, config, run_id)
            except Exception as exc:
                errors.append(f"extract:{inst}:{str(exc)[:100]}")
    finally:
        socket.setdefaulttimeout(old_timeout)
    db.commit()

    # Stage 4: Categorize
    try:
        categorize_fees.run(db)
    except Exception as exc:
        errors.append(f"categorize:all:{str(exc)[:100]}")

    # Stage 5: Validate
    try:
        backfill_validation.run(db, config)
    except Exception as exc:
        errors.append(f"validate:all:{str(exc)[:100]}")

    rows = db.fetchall("SELECT COUNT(*) AS n FROM extracted_fees")
    fees_extracted = rows[0]["n"] if rows else 0
    return institutions_seeded, fees_extracted, errors


@app.function(secrets=secrets, timeout=600, image=preflight_image)
@modal.fastapi_endpoint(method="POST")
def preflight_e2e(item: PreflightRequest = PreflightRequest()) -> dict:
    """Run the isolated 5-stage pre-flight and return a pass/fail result dict.

    Returns {"status", "institutions", "fees_extracted", "duration_s", "errors"}.
    """
    # ISOLATION: this function deliberately ignores DATABASE_URL
    _saved = os.environ.pop("DATABASE_URL", None)

    t_start = time.time()
    institutions_seeded = 0
    fees_extracted = 0
    errors: list[str] = []

    try:
        from fee_crawler.config import (
            Config,
            CrawlConfig,
            DatabaseConfig,
            ExtractionConfig,
        )
        from fee_crawler.db import Database

        config = Config(
            database=DatabaseConfig(path=PREFLIGHT_DB_PATH),
            crawl=CrawlConfig(delay_seconds=0.5, max_retries=2),
            extraction=ExtractionConfig(
                document_storage_dir=PREFLIGHT_DOC_DIR,
                daily_budget_usd=1.0,
            ),
        )

        with Database(config) as db:
            institutions_seeded, fees_extracted, errors = _run_preflight_stages(
                db, config, item.state_code
            )

    except Exception as exc:
        errors.append(f"init:all:{str(exc)[:100]}")
    finally:
        if _saved is not None:
            os.environ["DATABASE_URL"] = _saved

    return {
        "status": "pass" if fees_extracted >= 1 else "fail",
        "institutions": institutions_seeded,
        "fees_extracted": fees_extracted,
        "duration_s": round(time.time() - t_start, 2),
        "errors": errors,
    }


@app.function(secrets=secrets, timeout=60, image=preflight_image)
@modal.fastapi_endpoint(method="GET")
def preflight_postgres() -> dict:
    """Validate that the Postgres schema matches pipeline production assumptions.

    Connects to DATABASE_URL and probes all six pipeline-only tables via
    to_regclass(). Returns a pass/fail dict listing any missing tables.

    This guard ensures we never run pipeline workers against a Supabase
    environment that is missing required migrations.
    """
    require_postgres("preflight_postgres validates pipeline table existence")

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        SELECT
            to_regclass('public.jobs')                        AS jobs,
            to_regclass('public.platform_registry')           AS platform_registry,
            to_regclass('public.cms_confidence')              AS cms_confidence,
            to_regclass('public.document_r2_key')             AS document_r2_key,
            to_regclass('public.document_type_detected')      AS document_type_detected,
            to_regclass('public.doc_classification_confidence') AS doc_classification_confidence
    """)
    row = cur.fetchone()
    conn.close()

    missing = [table for table, oid in row.items() if oid is None]

    if missing:
        raise RuntimeError(
            f"Postgres schema missing pipeline tables: {missing}. "
            "Run the outstanding Supabase migrations before deploying pipeline workers."
        )

    return {
        "status": "pass",
        "message": "All six pipeline tables exist in public schema.",
        "tables": list(row.keys()),
    }


if __name__ == "__main__":
    print("Use: modal run fee_crawler/modal_preflight.py::preflight_e2e")
    print("     modal run fee_crawler/modal_preflight.py::preflight_postgres")
