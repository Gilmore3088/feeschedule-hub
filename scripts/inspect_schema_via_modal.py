#!/usr/bin/env python3
"""Inspect production table columns using the Modal database secret."""

from __future__ import annotations

import argparse
import re

import modal


image = modal.Image.debian_slim(python_version="3.12").pip_install("psycopg2-binary")
app = modal.App("bfi-schema-inspector")


@app.function(image=image, secrets=[modal.Secret.from_name("bfi-secrets")], timeout=120)
def inspect_columns(table_name: str) -> list[dict[str, object]]:
    import os

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT ordinal_position, column_name, data_type, is_nullable,
                       column_default
                  FROM information_schema.columns
                 WHERE table_schema = current_schema()
                   AND table_name = %s
                 ORDER BY ordinal_position
                """,
                (table_name,),
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


@app.function(image=image, secrets=[modal.Secret.from_name("bfi-secrets")], timeout=120)
def inspect_constraints(table_name: str) -> list[dict[str, object]]:
    import os

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT conname AS constraint_name,
                       contype AS constraint_type,
                       pg_get_constraintdef(oid) AS definition
                  FROM pg_constraint
                 WHERE conrelid = to_regclass(%s)
                 ORDER BY conname
                """,
                (table_name,),
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


@app.function(image=image, secrets=[modal.Secret.from_name("bfi-secrets")], timeout=120)
def inspect_recent_pipeline_runs() -> list[dict[str, object]]:
    import os

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, ops_job_id, trigger_source, triggered_by, status,
                       last_completed_phase, last_completed_job,
                       started_at, completed_at, finished_at,
                       error_msg, error
                  FROM pipeline_runs
                 ORDER BY id DESC
                 LIMIT 10
                """
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


@app.function(image=image, secrets=[modal.Secret.from_name("bfi-secrets")], timeout=120)
def inspect_recent_ops_jobs() -> list[dict[str, object]]:
    import os

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, command, agent_name, trigger_source, status,
                       modal_call_id, idempotency_key, created_at, started_at,
                       heartbeat_at, completed_at, cancel_requested_at,
                       error_summary
                  FROM ops_jobs
                 ORDER BY id DESC
                 LIMIT 15
                """
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


@app.function(image=image, secrets=[modal.Secret.from_name("bfi-secrets")], timeout=120)
def inspect_recent_crawl_runs() -> list[dict[str, object]]:
    import os

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, trigger_type, status, targets_total, targets_crawled,
                       targets_succeeded, targets_failed, targets_unchanged,
                       fees_extracted, started_at, heartbeat_at, completed_at
                  FROM crawl_runs
                 ORDER BY id DESC
                 LIMIT 10
                """
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


@app.function(image=image, secrets=[modal.Secret.from_name("bfi-secrets")], timeout=120)
def inspect_crawl_errors(run_id: int) -> list[dict[str, object]]:
    import os

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT COALESCE(error_message, '(none)') AS error_message,
                          COUNT(*)::INT AS count
                     FROM crawl_results
                    WHERE crawl_run_id = %s
                    GROUP BY COALESCE(error_message, '(none)')
                    ORDER BY count DESC
                    LIMIT 20""",
                (run_id,),
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


@app.function(image=image, secrets=[modal.Secret.from_name("bfi-secrets")], timeout=120)
def inspect_crawl_failure_samples(run_id: int) -> list[dict[str, object]]:
    import os

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT result.crawl_target_id, target.institution_name,
                          target.document_type, target.cms_platform,
                          LEFT(result.error_message, 240) AS error_message
                     FROM crawl_results AS result
                     JOIN crawl_targets AS target ON target.id = result.crawl_target_id
                    WHERE result.crawl_run_id = %s
                      AND result.status = 'failed'
                    ORDER BY result.id
                    LIMIT 100""",
                (run_id,),
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


@app.function(image=image, secrets=[modal.Secret.from_name("bfi-secrets")], timeout=120)
def inspect_crawl_target(target_id: int) -> list[dict[str, object]]:
    """Return non-secret production metadata for one crawl target."""
    import os

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT id, institution_name, website_url, fee_schedule_url,
                          document_type, cms_platform, failure_reason,
                          last_crawl_at, last_success_at, consecutive_failures
                     FROM crawl_targets
                    WHERE id = %s""",
                (target_id,),
            )
            row = cur.fetchone()
            return [dict(row)] if row else []
    finally:
        conn.close()


@app.function(image=image, secrets=[modal.Secret.from_name("bfi-secrets")], timeout=120)
def inspect_target_raw_lineage(target_id: int) -> list[dict[str, object]]:
    """Return recent Tier-1 observations and their Magellan audit metadata."""
    import os

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT raw.fee_raw_id, raw.institution_id,
                          raw.crawl_event_id, raw.fee_name, raw.amount,
                          raw.source, raw.outlier_flags,
                          event.agent_name, event.tool_name,
                          event.status AS event_status,
                          verified.fee_verified_id,
                          verified.canonical_fee_key,
                          verified.review_status,
                          published.fee_published_id
                     FROM fees_raw AS raw
                     JOIN agent_events AS event
                       ON event.event_id = raw.agent_event_id
                     LEFT JOIN fees_verified AS verified
                       ON verified.fee_raw_id = raw.fee_raw_id
                     LEFT JOIN fees_published AS published
                       ON published.lineage_ref = verified.fee_verified_id
                    WHERE raw.institution_id = %s
                    ORDER BY raw.fee_raw_id DESC
                    LIMIT 20""",
                (target_id,),
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("table_name")
    parser.add_argument("--constraints", action="store_true")
    parser.add_argument("--recent-runs", action="store_true")
    parser.add_argument("--recent-jobs", action="store_true")
    parser.add_argument("--recent-crawls", action="store_true")
    parser.add_argument("--crawl-run-id", type=int)
    parser.add_argument("--crawl-samples", type=int)
    parser.add_argument("--target-id", type=int)
    parser.add_argument("--lineage-target-id", type=int)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z][a-z0-9_]*", args.table_name):
        parser.error("table_name must be a lowercase SQL identifier")

    with app.run():
        if args.lineage_target_id is not None:
            if args.table_name != "fees_raw":
                parser.error("--lineage-target-id is only available for fees_raw")
            rows = inspect_target_raw_lineage.remote(args.lineage_target_id)
        elif args.target_id is not None:
            if args.table_name != "crawl_targets":
                parser.error("--target-id is only available for crawl_targets")
            rows = inspect_crawl_target.remote(args.target_id)
        elif args.crawl_samples is not None:
            if args.table_name != "crawl_results":
                parser.error("--crawl-samples is only available for crawl_results")
            rows = inspect_crawl_failure_samples.remote(args.crawl_samples)
        elif args.crawl_run_id is not None:
            if args.table_name != "crawl_results":
                parser.error("--crawl-run-id is only available for crawl_results")
            rows = inspect_crawl_errors.remote(args.crawl_run_id)
        elif args.recent_crawls:
            if args.table_name != "crawl_runs":
                parser.error("--recent-crawls is only available for crawl_runs")
            rows = inspect_recent_crawl_runs.remote()
        elif args.recent_jobs:
            if args.table_name != "ops_jobs":
                parser.error("--recent-jobs is only available for ops_jobs")
            rows = inspect_recent_ops_jobs.remote()
        elif args.recent_runs:
            if args.table_name != "pipeline_runs":
                parser.error("--recent-runs is only available for pipeline_runs")
            rows = inspect_recent_pipeline_runs.remote()
        elif args.constraints:
            rows = inspect_constraints.remote(args.table_name)
        else:
            rows = inspect_columns.remote(args.table_name)
        for row in rows:
            print(row)


if __name__ == "__main__":
    main()
