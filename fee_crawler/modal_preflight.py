"""Modal pre-flight readiness check (Phase 62a, D-16).

Replaces the legacy filesystem-DB-in-/tmp smoke test. Instead of simulating the pipeline
end-to-end, this preflight asserts the RUNTIME infrastructure is wired correctly
before any worker function runs:

  1. DATABASE_URL is set and reachable.
  2. All required Postgres tables exist for agent, crawler, and report flows.
  3. R2 bucket is reachable (head_bucket).
  4. Synthetic agent_events write/delete round-trip — confirms the partitioned
     write path + pg_cron maintenance leave the current partition writable.
  5. Canonical agent_registry rows exist for the worker and scout identities
     that current jobs can emit.

Deploy: modal deploy fee_crawler/modal_preflight.py
Invoke: modal run fee_crawler/modal_preflight.py::preflight
"""

from __future__ import annotations

import os
import re
from typing import Any, List

import modal


preflight_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install_from_requirements("fee_crawler/requirements.txt")
    .pip_install("fastapi[standard]")
    .add_local_dir("fee_crawler", remote_path="/root/fee_crawler")
)

app = modal.App("bank-fee-index-preflight", image=preflight_image)
secrets = [
    modal.Secret.from_name("bfi-secrets"),
    modal.Secret.from_name("bfi-r2-secrets"),
    modal.Secret.from_name("bfi-app-runtime"),
]


REQUIRED_TABLES: List[str] = [
    # Agent / review infrastructure
    "agent_events",
    "agent_auth_log",
    "agent_messages",
    "agent_registry",
    "agent_budgets",
    "agent_lessons",
    "institution_dossiers",
    # Tiered fee pipeline
    "fees_raw",
    "fees_verified",
    "fees_published",
    # Core crawler / report pipeline
    "crawl_targets",
    "crawl_runs",
    "crawl_results",
    "extracted_fees",
    "jobs",
    "ops_jobs",
    "pipeline_runs",
    "platform_registry",
    "workers_last_run",
    "report_jobs",
    # Compatibility objects still used by the previously deployed workers.
    "hamilton_digest_subscriptions",
    "hamilton_digest_runs",
]

REQUIRED_COLUMNS: dict[str, List[str]] = {
    "agent_messages": ["responded_at"],
    "ops_jobs": [
        "agent_name",
        "trigger_source",
        "modal_call_id",
        "idempotency_key",
        "heartbeat_at",
        "cancel_requested_at",
    ],
    "report_jobs": ["ops_job_id", "modal_call_id", "cancel_requested_at"],
    "crawl_runs": ["heartbeat_at"],
    "pipeline_runs": [
        "ops_job_id",
        "status",
        "trigger_source",
        "triggered_by",
        "params_json",
        "last_completed_phase",
        "last_completed_job",
        "config_json",
        "started_at",
        "completed_at",
        "error_msg",
        "finished_at",
    ],
}

REQUIRED_AGENT_NAMES: List[str] = [
    "atlas",
    "darwin",
    "discoverer",
    "hamilton",
    "knox",
    "magellan",
    "reporter",
    "validator",
    "ai_scout",
]


def _scrub_dsn(msg: str) -> str:
    """Redact password from any DATABASE_URL-looking string before logging."""
    return re.sub(r"://([^:]+):[^@]+@", r"://\1:***@", msg)


async def _check_postgres_connectivity() -> None:
    """Open a connection using the shared asyncpg pool. Fail fast on any error."""
    from fee_crawler.agent_tools.pool import get_pool

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            v = await conn.fetchval("SELECT 1")
            assert v == 1, f"SELECT 1 returned {v!r}"
    except Exception as exc:
        raise RuntimeError(f"preflight:postgres: {_scrub_dsn(str(exc))}") from None


async def _check_required_tables() -> None:
    """Every required table resolves via to_regclass."""
    from fee_crawler.agent_tools.pool import get_pool

    pool = await get_pool()
    missing: List[str] = []
    async with pool.acquire() as conn:
        for tbl in REQUIRED_TABLES:
            r = await conn.fetchval("SELECT to_regclass($1)", tbl)
            if r is None:
                missing.append(tbl)
    if missing:
        raise RuntimeError(
            f"preflight:tables: required tables missing: {missing}. "
            "Supabase migrations likely need to run."
        )


async def _check_required_columns() -> None:
    """Catch partially applied migrations before a worker reaches a query."""
    from fee_crawler.agent_tools.pool import get_pool

    pool = await get_pool()
    missing: list[str] = []
    async with pool.acquire() as conn:
        for table, columns in REQUIRED_COLUMNS.items():
            rows = await conn.fetch(
                """
                SELECT column_name
                  FROM information_schema.columns
                 WHERE table_schema = current_schema()
                   AND table_name = $1
                   AND column_name = ANY($2::TEXT[])
                """,
                table,
                columns,
            )
            found = {str(row["column_name"]) for row in rows}
            missing.extend(
                f"{table}.{column}" for column in columns if column not in found
            )
    if missing:
        raise RuntimeError(
            f"preflight:columns: required columns missing: {missing}. "
            "Supabase migrations likely need to run."
        )


async def _check_required_agents() -> None:
    """Ensure the agent identities current workers can emit are registered."""
    from fee_crawler.agent_tools.pool import get_pool

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT agent_name
              FROM agent_registry
             WHERE agent_name = ANY($1::TEXT[])
            """,
            REQUIRED_AGENT_NAMES,
        )
    found = {str(row["agent_name"]) for row in rows}
    missing = sorted(set(REQUIRED_AGENT_NAMES) - found)
    if missing:
        raise RuntimeError(
            "preflight:agent_registry: required agent rows missing: "
            f"{missing}. Agent seed migrations likely need to run."
        )


async def _check_pipeline_contract() -> None:
    """Ensure Atlas terminal states and trigger sources satisfy live checks."""
    from fee_crawler.agent_tools.pool import get_pool

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT conname, pg_get_constraintdef(oid) AS definition
              FROM pg_constraint
             WHERE conrelid = to_regclass('pipeline_runs')
               AND conname = ANY($1::TEXT[])
            """,
            ["pipeline_runs_status_check", "pipeline_runs_trigger_source_check"],
        )
    definitions = {str(row["conname"]): str(row["definition"]) for row in rows}
    status = definitions.get("pipeline_runs_status_check", "")
    source = definitions.get("pipeline_runs_trigger_source_check", "")
    if "completed" not in status or "partial" not in status:
        raise RuntimeError("preflight:pipeline_contract: terminal statuses are incomplete")
    if "schedule" not in source or "admin" not in source:
        raise RuntimeError("preflight:pipeline_contract: trigger sources are incomplete")


def _check_r2_reachable() -> None:
    """Confirm R2 credentials + bucket are wired."""
    import boto3
    from botocore.exceptions import ClientError, EndpointConnectionError

    endpoint = os.environ.get("R2_ENDPOINT")
    bucket = os.environ.get("R2_BUCKET")
    if not endpoint or not bucket:
        raise RuntimeError(
            "preflight:r2: R2_ENDPOINT + R2_BUCKET must be set "
            "(see CLAUDE.md Configuration section)"
        )
    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=os.environ.get("R2_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("R2_SECRET_ACCESS_KEY"),
            region_name="auto",
        )
        s3.head_bucket(Bucket=bucket)
    except (ClientError, EndpointConnectionError) as exc:
        # Never leak the access key; report bucket + error code only.
        err = getattr(exc, "response", {}) or {}
        code = (err.get("Error") or {}).get("Code", "unknown")
        raise RuntimeError(
            f"preflight:r2: bucket={bucket} unreachable (code={code})"
        ) from None


def _check_internal_secret() -> None:
    """Fail deployment when public Modal endpoints would have no shared auth."""
    secret = os.environ.get("MODAL_INTERNAL_SECRET") or os.environ.get(
        "REPORT_INTERNAL_SECRET"
    )
    if not secret:
        raise RuntimeError(
            "preflight:internal_secret: MODAL_INTERNAL_SECRET or "
            "REPORT_INTERNAL_SECRET must be set"
        )


def _check_report_config() -> None:
    """Verify Modal can authenticate report triggers and status callbacks."""
    from urllib.parse import urlparse

    missing: list[str] = []
    app_url = os.environ.get("BFI_APP_URL", "").strip()
    parsed_url = urlparse(app_url)
    if not app_url or parsed_url.scheme not in ("http", "https") or not parsed_url.netloc:
        missing.append("BFI_APP_URL")
    if not os.environ.get("REPORT_INTERNAL_SECRET", "").strip():
        missing.append("REPORT_INTERNAL_SECRET")
    if not (
        os.environ.get("REPORT_CRON_SECRET", "").strip()
        or os.environ.get("BFI_REVALIDATE_TOKEN", "").strip()
    ):
        missing.append("REPORT_CRON_SECRET or BFI_REVALIDATE_TOKEN")
    if missing:
        raise RuntimeError(
            f"preflight:report_config: required settings missing: {missing}"
        )


async def _check_agent_events_writable() -> None:
    """Synthetic write + delete in one transaction — net-zero row count.

    Uses agent_name='_preflight' + action='preflight_check' so any leak into
    production history is obviously a preflight artifact.
    """
    from fee_crawler.agent_tools.pool import get_pool

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            event_id = await conn.fetchval(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, status, cost_cents,
                      input_payload)
                   VALUES ('_preflight', 'preflight_check', '_preflight',
                           '_preflight', 'success', 0, '{}'::JSONB)
                   RETURNING event_id"""
            )
            assert event_id is not None, "agent_events INSERT returned NULL"
            # Delete so the preflight leaves net-zero rows.
            await conn.execute(
                "DELETE FROM agent_events "
                "WHERE event_id = $1::UUID AND agent_name = '_preflight'",
                event_id,
            )


@app.function(secrets=secrets, timeout=120)
async def preflight() -> dict[str, Any]:
    """Top-level preflight invocation.

    Returns {ok, checks_passed}; raises RuntimeError on any failure.
    """
    errors: list[str] = []

    async def _run_async(name: str, coro) -> None:
        try:
            await coro
        except Exception as exc:
            errors.append(f"{name}: {_scrub_dsn(str(exc))}")

    def _run_sync(name: str, fn) -> None:
        try:
            fn()
        except Exception as exc:
            errors.append(f"{name}: {_scrub_dsn(str(exc))}")

    await _run_async("postgres", _check_postgres_connectivity())
    await _run_async("tables", _check_required_tables())
    await _run_async("columns", _check_required_columns())
    await _run_async("agent_registry", _check_required_agents())
    await _run_async("pipeline_contract", _check_pipeline_contract())
    _run_sync("r2", _check_r2_reachable)
    _run_sync("internal_secret", _check_internal_secret)
    _run_sync("report_config", _check_report_config)
    await _run_async("agent_events_write", _check_agent_events_writable())

    if errors:
        raise RuntimeError("preflight failed:\n  - " + "\n  - ".join(errors))

    return {
        "ok": True,
        "checks_passed": [
            "postgres", "tables", "columns", "agent_registry", "r2",
            "pipeline_contract", "internal_secret", "report_config",
            "agent_events_write",
        ],
    }


if __name__ == "__main__":
    # Local invocation smoke: `python -m fee_crawler.modal_preflight`
    # (skips R2 check outside Modal if R2_ENDPOINT unset).
    import asyncio

    print(asyncio.run(preflight()))
