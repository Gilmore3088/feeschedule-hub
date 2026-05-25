"""Hamilton scheduled digest runner (C-02).

Processes due rows from `hamilton_digest_subscriptions` on each
per-minute Modal tick:

  1. Pick up to `max_runs` subscriptions where next_due_at <= NOW()
     AND active = TRUE. FOR UPDATE SKIP LOCKED so two ticks running
     concurrently can't double-process.
  2. Insert a `pending` row into hamilton_digest_runs.
  3. Call the Next.js /api/research/hamilton endpoint with the
     subscription's prompt (uses the same Hamilton agent the UI
     uses, so output is consistent).
  4. Update the run row with `success` + response_text + cost_cents,
     or `failed` + error message.
  5. Bump next_due_at per the subscription's cadence so the same
     subscription doesn't get picked up immediately.

Errors on a single subscription don't poison the batch — each is
caught + recorded as `failed`, and the next subscription is
processed normally.
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import asyncpg
import httpx

log = logging.getLogger(__name__)

AGENT_NAME = "hamilton"

# How much of Hamilton's response we store inline. Above this, push
# to R2 and keep only the key. 64KB is the same convention used by
# the agent gateway (`gateway.REASONING_INLINE_LIMIT`).
INLINE_RESPONSE_LIMIT_BYTES = 64_000


def cadence_to_interval(cadence: str) -> timedelta:
    """Convert a subscription cadence to a timedelta. Caller validates
    the cadence string against the CHECK constraint upstream; we
    fall back to 7d on anything unexpected."""
    return {
        "daily":   timedelta(days=1),
        "weekly":  timedelta(days=7),
        "monthly": timedelta(days=30),
    }.get(cadence, timedelta(days=7))


@dataclass
class DigestRunResult:
    subscription_id: int
    run_id: Optional[int]
    status: str        # 'success' | 'failed'
    cost_cents: int = 0
    duration_s: float = 0.0
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


async def _fetch_due(conn: asyncpg.Connection, limit: int) -> list[dict]:
    rows = await conn.fetch(
        """
        SELECT subscription_id, user_id, label, prompt, cadence,
               delivery, delivery_address, last_run_at, next_due_at
          FROM hamilton_digest_subscriptions
         WHERE active = TRUE
           AND next_due_at <= NOW()
         ORDER BY next_due_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
        """,
        limit,
    )
    return [dict(r) for r in rows]


async def _record_pending(conn: asyncpg.Connection, subscription_id: int) -> int:
    return await conn.fetchval(
        """INSERT INTO hamilton_digest_runs (subscription_id, status)
           VALUES ($1, 'pending') RETURNING run_id""",
        subscription_id,
    )


async def _record_completion(
    conn: asyncpg.Connection,
    run_id: int,
    status: str,
    *,
    response_text: Optional[str] = None,
    response_r2_key: Optional[str] = None,
    cost_cents: int = 0,
    error: Optional[str] = None,
) -> None:
    await conn.execute(
        """UPDATE hamilton_digest_runs
              SET completed_at    = NOW(),
                  status          = $2,
                  response_text   = $3,
                  response_r2_key = $4,
                  cost_cents      = $5,
                  error           = $6
            WHERE run_id = $1""",
        run_id, status, response_text, response_r2_key, cost_cents, error,
    )


async def _bump_due(conn: asyncpg.Connection, subscription_id: int, cadence: str) -> None:
    interval = cadence_to_interval(cadence)
    await conn.execute(
        """UPDATE hamilton_digest_subscriptions
              SET last_run_at = NOW(),
                  next_due_at = NOW() + $2
            WHERE subscription_id = $1""",
        subscription_id, interval,
    )


async def _call_hamilton(prompt: str, timeout_s: float = 60.0) -> dict:
    """Call the Next.js /api/research/hamilton endpoint. Returns
    {'text': ..., 'cost_cents': ...}. Raises on non-2xx."""
    base = os.environ.get("BFI_APP_URL", "http://localhost:3000")
    secret = os.environ.get("REPORT_INTERNAL_SECRET")
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Internal-Secret"] = secret

    body = {
        "messages": [{"role": "user", "content": prompt}],
        "context": {"source": "scheduled_digest"},
    }

    async with httpx.AsyncClient(timeout=timeout_s) as client:
        resp = await client.post(
            f"{base}/api/research/hamilton",
            headers=headers,
            json=body,
        )
        resp.raise_for_status()
        # The endpoint streams; for a digest we want the full body.
        # If the API returns SSE, accumulate. If JSON, parse directly.
        ct = (resp.headers.get("content-type") or "").lower()
        if "application/json" in ct:
            data = resp.json()
            return {
                "text": data.get("text") or data.get("content") or "",
                "cost_cents": int(data.get("cost_cents") or 0),
            }
        # SSE / text/plain: accumulate
        text = resp.text
        return {"text": text, "cost_cents": 0}


async def process_due_digests(
    conn: asyncpg.Connection,
    *,
    max_runs: int = 5,
) -> list[DigestRunResult]:
    """Per-minute Modal entry point. Returns list of run results."""
    due = await _fetch_due(conn, max_runs)
    results: list[DigestRunResult] = []
    if not due:
        return results

    for sub in due:
        t0 = time.time()
        sub_id = sub["subscription_id"]
        run_id: Optional[int] = None
        try:
            run_id = await _record_pending(conn, sub_id)

            response = await _call_hamilton(sub["prompt"])
            text = response.get("text") or ""
            cost = int(response.get("cost_cents") or 0)

            # Inline-vs-R2 storage: same threshold as agent gateway.
            response_r2_key: Optional[str] = None
            response_text: Optional[str] = text
            text_bytes = text.encode("utf-8")
            if len(text_bytes) > INLINE_RESPONSE_LIMIT_BYTES:
                # Caller can pipe to R2 in a future iteration; for now we
                # truncate and store the marker. Avoids blowing PG row.
                response_text = text[: INLINE_RESPONSE_LIMIT_BYTES // 2] + "\n…[truncated; full text >64KB]"
                response_r2_key = None    # not uploading yet

            await _record_completion(
                conn, run_id, "success",
                response_text=response_text,
                response_r2_key=response_r2_key,
                cost_cents=cost,
            )
            await _bump_due(conn, sub_id, sub["cadence"])

            results.append(DigestRunResult(
                subscription_id=sub_id, run_id=run_id, status="success",
                cost_cents=cost, duration_s=time.time() - t0,
            ))
            log.info(
                "hamilton digest sub=%s label=%r run=%s success cost=$%.4f",
                sub_id, sub.get("label"), run_id, cost / 100.0,
            )

        except Exception as exc:
            err = repr(exc)
            log.warning("hamilton digest sub=%s failed: %s", sub_id, err)
            if run_id is not None:
                try:
                    await _record_completion(
                        conn, run_id, "failed",
                        error=err[:1000],
                    )
                except Exception:
                    log.exception("could not record digest failure for run=%s", run_id)
            # Don't bump next_due_at — let the next tick retry. Could
            # add a retry-counter on the subscription to back off after
            # N consecutive failures; deferred.
            results.append(DigestRunResult(
                subscription_id=sub_id, run_id=run_id, status="failed",
                duration_s=time.time() - t0, error=err,
            ))

    return results
