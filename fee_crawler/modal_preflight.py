"""Modal pre-flight readiness check (Phase 62a, D-16).

Replaces the legacy filesystem-DB-in-/tmp smoke test. Instead of simulating the pipeline
end-to-end, this preflight asserts the RUNTIME infrastructure is wired correctly
before any worker function runs:

  1. DATABASE_URL is set and reachable.
  2. All required Postgres tables exist (agent_events, agent_auth_log,
     agent_messages, agent_registry, agent_budgets, institution_dossiers,
     fees_raw, fees_verified, fees_published).
  3. R2 bucket is reachable (head_bucket).
  4. Synthetic agent_events write/delete round-trip — confirms the partitioned
     write path + pg_cron maintenance leave the current partition writable.

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
secrets = [modal.Secret.from_name("bfi-secrets")]


REQUIRED_TABLES: List[str] = [
    "agent_events",
    "agent_auth_log",
    "agent_messages",
    "agent_registry",
    "agent_budgets",
    "institution_dossiers",
    "fees_raw",
    "fees_verified",
    "fees_published",
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
    _run_sync("r2", _check_r2_reachable)
    await _run_async("agent_events_write", _check_agent_events_writable())

    if errors:
        raise RuntimeError("preflight failed:\n  - " + "\n  - ".join(errors))

    return {
        "ok": True,
        "checks_passed": ["postgres", "tables", "r2", "agent_events_write"],
    }


if __name__ == "__main__":
    # Local invocation smoke: `python -m fee_crawler.modal_preflight`
    # (skips R2 check outside Modal if R2_ENDPOINT unset).
    import asyncio

    print(asyncio.run(preflight()))
