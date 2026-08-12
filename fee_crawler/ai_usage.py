"""Emergency-stop enforcement and Anthropic request metering.

Provider calls use these wrappers instead of calling the SDK directly. The
database gate is checked immediately before network I/O, and the resulting
token usage is written to the shared operator ledger.
"""

from __future__ import annotations

import json
import os
import time
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

import psycopg2

T = TypeVar("T")

PROVIDER_CREDIT_ERROR_MARKERS = (
    "credit balance is too low",
    "insufficient credits",
    "purchase credits",
    "plans & billing",
)

PROVIDER_CREDIT_LOOKBACK_HOURS = 24


class EmergencyStopActive(RuntimeError):
    """Raised when the global automation control blocks provider work."""


def _dsn() -> str | None:
    return os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_URL_TEST")


def _ops_job_id() -> int | None:
    raw = os.environ.get("BFI_OPS_JOB_ID")
    try:
        return int(raw) if raw else None
    except ValueError:
        return None


def assert_automation_enabled(context: str) -> None:
    """Fail closed when production automation has been stopped."""
    dsn = _dsn()
    if not dsn:
        return
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT enabled, reason
                     FROM automation_control
                    WHERE control_key = 'global'"""
            )
            row = cur.fetchone()
        if row is None:
            raise RuntimeError("Global automation control is not configured")
        if not bool(row[0]):
            detail = f": {row[1]}" if row[1] else ""
            raise EmergencyStopActive(
                f"Emergency stop is active; {context} is blocked{detail}"
            )
    finally:
        conn.close()


async def assert_automation_enabled_async(context: str) -> None:
    dsn = _dsn()
    if not dsn:
        return
    from fee_crawler.agent_tools.pool import get_pool

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT enabled, reason
                 FROM automation_control
                WHERE control_key = 'global'"""
        )
    if row is None:
        raise RuntimeError("Global automation control is not configured")
    if not bool(row["enabled"]):
        detail = f": {row['reason']}" if row["reason"] else ""
        raise EmergencyStopActive(
            f"Emergency stop is active; {context} is blocked{detail}"
        )


def _usage_value(usage: Any, field: str) -> int:
    try:
        return max(0, int(getattr(usage, field, 0) or 0))
    except (TypeError, ValueError):
        return 0


def _estimate_cost_microusd(model: str, usage: Any) -> int | None:
    model_name = model.lower()
    if "haiku" in model_name:
        input_rate, output_rate = 0.8, 4
    elif "sonnet" in model_name:
        input_rate, output_rate = 3, 15
    elif "opus" in model_name:
        input_rate, output_rate = 15, 75
    else:
        return None

    input_tokens = _usage_value(usage, "input_tokens")
    output_tokens = _usage_value(usage, "output_tokens")
    cache_read = _usage_value(usage, "cache_read_input_tokens")
    cache_create = _usage_value(usage, "cache_creation_input_tokens")
    return round(
        input_tokens * input_rate
        + output_tokens * output_rate
        + cache_read * input_rate * 0.1
        + cache_create * input_rate * 1.25
    )


def _is_provider_credit_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(marker in message for marker in PROVIDER_CREDIT_ERROR_MARKERS)


def _credit_failure_reason(agent_name: str, operation: str) -> str:
    return (
        "Anthropic API credit balance is too low; automation paused after "
        f"{agent_name} {operation}"
    )


def _engage_emergency_stop_for_provider_credit(
    agent_name: str,
    operation: str,
) -> None:
    dsn = _dsn()
    if not dsn:
        return
    reason = _credit_failure_reason(agent_name, operation)
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT COUNT(*)::int
                     FROM ops_jobs
                    WHERE status IN ('queued', 'running', 'cancel_requested')"""
            )
            active = int(cur.fetchone()[0] or 0)
            cur.execute(
                """UPDATE automation_control
                      SET enabled = FALSE,
                          reason = %s,
                          changed_by = 'provider-guard',
                          changed_at = NOW(),
                          revision = revision + 1
                    WHERE control_key = 'global'""",
                (reason,),
            )
            cur.execute(
                """INSERT INTO automation_control_audit
                     (action, reason, actor, active_job_count)
                   VALUES
                     ('emergency_stop', %s, 'provider-guard', %s)""",
                (reason, active),
            )
        conn.commit()
    except Exception as exc:
        conn.rollback()
        print(f"Emergency stop write failed after provider credit error: {exc}")
    finally:
        conn.close()


def _marker_sql() -> tuple[str, list[str]]:
    clauses = ["LOWER(error_summary) LIKE %s" for _ in PROVIDER_CREDIT_ERROR_MARKERS]
    params = [f"%{marker}%" for marker in PROVIDER_CREDIT_ERROR_MARKERS]
    return " OR ".join(clauses), params


def _assert_no_credit_failure_since_resume(
    *,
    provider: str,
    agent_name: str,
    operation: str,
) -> None:
    """Block provider calls when the latest resume has already hit credit failure.

    Operators may resume automation after replenishing provider credits. A
    credit failure after that resume means the account is still unavailable, so
    every subsequent chunk should stop locally instead of making another
    doomed network call.
    """
    dsn = _dsn()
    if not dsn:
        return
    marker_sql, marker_params = _marker_sql()
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT usage.agent_name, usage.operation
                      FROM ai_api_usage_events usage
                      JOIN automation_control control
                        ON control.control_key = 'global'
                     WHERE control.enabled = TRUE
                       AND usage.provider = %s
                       AND usage.status = 'failed'
                       AND usage.created_at > control.changed_at
                       AND usage.created_at >= NOW() - INTERVAL '{PROVIDER_CREDIT_LOOKBACK_HOURS} hours'
                       AND ({marker_sql})
                     ORDER BY usage.created_at DESC
                     LIMIT 1""",
                [provider, *marker_params],
            )
            row = cur.fetchone()
        if not row:
            return
    finally:
        conn.close()

    failed_agent = str(row[0] or agent_name)
    failed_operation = str(row[1] or operation)
    _engage_emergency_stop_for_provider_credit(failed_agent, failed_operation)
    raise EmergencyStopActive(
        "Emergency stop is active; "
        f"{agent_name} {operation} is blocked: "
        f"{_credit_failure_reason(failed_agent, failed_operation)}"
    )


async def _assert_no_credit_failure_since_resume_async(
    *,
    provider: str,
    agent_name: str,
    operation: str,
) -> None:
    dsn = _dsn()
    if not dsn:
        return
    from fee_crawler.agent_tools.pool import get_pool

    marker_sql = " OR ".join(
        f"LOWER(error_summary) LIKE ${index}"
        for index in range(2, 2 + len(PROVIDER_CREDIT_ERROR_MARKERS))
    )
    params = [f"%{marker}%" for marker in PROVIDER_CREDIT_ERROR_MARKERS]
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""SELECT usage.agent_name, usage.operation
                  FROM ai_api_usage_events usage
                  JOIN automation_control control
                    ON control.control_key = 'global'
                 WHERE control.enabled = TRUE
                   AND usage.provider = $1
                   AND usage.status = 'failed'
                   AND usage.created_at > control.changed_at
                   AND usage.created_at >= NOW() - INTERVAL '{PROVIDER_CREDIT_LOOKBACK_HOURS} hours'
                   AND ({marker_sql})
                 ORDER BY usage.created_at DESC
                 LIMIT 1""",
            provider,
            *params,
        )
    if not row:
        return

    failed_agent = str(row["agent_name"] or agent_name)
    failed_operation = str(row["operation"] or operation)
    _engage_emergency_stop_for_provider_credit(failed_agent, failed_operation)
    raise EmergencyStopActive(
        "Emergency stop is active; "
        f"{agent_name} {operation} is blocked: "
        f"{_credit_failure_reason(failed_agent, failed_operation)}"
    )


def record_api_usage(
    *,
    provider: str,
    model: str,
    agent_name: str,
    operation: str,
    status: str,
    usage: Any = None,
    request_count: int = 1,
    latency_ms: int | None = None,
    error: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    dsn = _dsn()
    if not dsn:
        return
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO ai_api_usage_events
                     (provider, model, agent_name, operation, status,
                      request_count, input_tokens, output_tokens,
                      cache_read_input_tokens, cache_creation_input_tokens,
                      estimated_cost_microusd, latency_ms, ops_job_id,
                      error_summary, metadata)
                   VALUES
                     (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                      %s, %s, %s, %s, %s::JSONB)""",
                (
                    provider,
                    model,
                    agent_name,
                    operation,
                    status,
                    max(0, int(request_count)),
                    _usage_value(usage, "input_tokens"),
                    _usage_value(usage, "output_tokens"),
                    _usage_value(usage, "cache_read_input_tokens"),
                    _usage_value(usage, "cache_creation_input_tokens"),
                    _estimate_cost_microusd(model, usage),
                    latency_ms,
                    _ops_job_id(),
                    error[:1000] if error else None,
                    json.dumps(metadata or {}),
                ),
            )
        conn.commit()
    except Exception as exc:
        conn.rollback()
        print(f"AI provider usage write failed: {exc}")
    finally:
        conn.close()


async def record_api_usage_async(**kwargs: Any) -> None:
    dsn = _dsn()
    if not dsn:
        return
    from fee_crawler.agent_tools.pool import get_pool

    usage = kwargs.get("usage")
    model = str(kwargs["model"])
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO ai_api_usage_events
                     (provider, model, agent_name, operation, status,
                      request_count, input_tokens, output_tokens,
                      cache_read_input_tokens, cache_creation_input_tokens,
                      estimated_cost_microusd, latency_ms, ops_job_id,
                      error_summary, metadata)
                   VALUES
                     ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                      $11, $12, $13, $14, $15::JSONB)""",
                str(kwargs["provider"]),
                model,
                str(kwargs["agent_name"]),
                str(kwargs["operation"]),
                str(kwargs["status"]),
                max(0, int(kwargs.get("request_count", 1))),
                _usage_value(usage, "input_tokens"),
                _usage_value(usage, "output_tokens"),
                _usage_value(usage, "cache_read_input_tokens"),
                _usage_value(usage, "cache_creation_input_tokens"),
                _estimate_cost_microusd(model, usage),
                kwargs.get("latency_ms"),
                _ops_job_id(),
                str(kwargs["error"])[:1000] if kwargs.get("error") else None,
                json.dumps(kwargs.get("metadata") or {}),
            )
    except Exception as exc:
        print(f"AI provider usage write failed: {exc}")


def tracked_anthropic_call(
    call: Callable[..., T],
    *,
    agent_name: str,
    operation: str,
    model: str,
    request_count: int = 1,
    pass_model: bool = True,
    **request: Any,
) -> T:
    started = time.monotonic()
    try:
        assert_automation_enabled(f"{agent_name} {operation}")
        _assert_no_credit_failure_since_resume(
            provider="anthropic",
            agent_name=agent_name,
            operation=operation,
        )
    except EmergencyStopActive as exc:
        record_api_usage(
            provider="anthropic",
            model=model,
            agent_name=agent_name,
            operation=operation,
            status="blocked",
            request_count=request_count,
            error=str(exc),
        )
        raise
    try:
        response = call(**({"model": model} if pass_model else {}), **request)
    except Exception as exc:
        record_api_usage(
            provider="anthropic",
            model=model,
            agent_name=agent_name,
            operation=operation,
            status="failed",
            request_count=request_count,
            latency_ms=round((time.monotonic() - started) * 1000),
            error=str(exc),
        )
        if _is_provider_credit_error(exc):
            _engage_emergency_stop_for_provider_credit(agent_name, operation)
        raise
    record_api_usage(
        provider="anthropic",
        model=model,
        agent_name=agent_name,
        operation=operation,
        status="completed",
        usage=getattr(response, "usage", None),
        request_count=request_count,
        latency_ms=round((time.monotonic() - started) * 1000),
    )
    return response


async def tracked_anthropic_call_async(
    call: Callable[..., Awaitable[T]],
    *,
    agent_name: str,
    operation: str,
    model: str,
    request_count: int = 1,
    pass_model: bool = True,
    **request: Any,
) -> T:
    started = time.monotonic()
    try:
        await assert_automation_enabled_async(f"{agent_name} {operation}")
        await _assert_no_credit_failure_since_resume_async(
            provider="anthropic",
            agent_name=agent_name,
            operation=operation,
        )
    except EmergencyStopActive as exc:
        await record_api_usage_async(
            provider="anthropic",
            model=model,
            agent_name=agent_name,
            operation=operation,
            status="blocked",
            request_count=request_count,
            error=str(exc),
        )
        raise
    try:
        response = await call(**({"model": model} if pass_model else {}), **request)
    except Exception as exc:
        await record_api_usage_async(
            provider="anthropic",
            model=model,
            agent_name=agent_name,
            operation=operation,
            status="failed",
            request_count=request_count,
            latency_ms=round((time.monotonic() - started) * 1000),
            error=str(exc),
        )
        if _is_provider_credit_error(exc):
            _engage_emergency_stop_for_provider_credit(agent_name, operation)
        raise
    await record_api_usage_async(
        provider="anthropic",
        model=model,
        agent_name=agent_name,
        operation=operation,
        status="completed",
        usage=getattr(response, "usage", None),
        request_count=request_count,
        latency_ms=round((time.monotonic() - started) * 1000),
    )
    return response
