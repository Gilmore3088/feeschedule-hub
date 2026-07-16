"""Portable worker fleet — build a handler per queue and drain it.

Used by both the Modal engine app and any standalone host. Each queue maps to a
handler wired with the real adapters (adapters_impl). Draining is bounded so a
Modal-spawned worker returns instead of running forever; the pump re-spawns as
long as depth remains.
"""

from __future__ import annotations

import time

import asyncpg

from .adapters_impl import (
    DocumentReader,
    HttpBrowserFetcher,
    LLMExtractor,
    R2ObjectStore,
)
from .alerting import default_alerter
from .handlers.extract import ExtractHandler
from .handlers.fetch import FetchHandler
from .handlers.read import ReadHandler
from .handlers.verify import VerifyHandler
from .promoter import FeesVerifiedPromoter
from .worker import run_once


def build_handler(queue: str):
    """Construct the production handler for a queue with real adapters."""
    if queue == "fetch":
        return FetchHandler(HttpBrowserFetcher(), R2ObjectStore())
    if queue == "read":
        return ReadHandler(R2ObjectStore(), DocumentReader())
    if queue == "extract":
        return ExtractHandler(LLMExtractor())
    if queue == "verify":
        return VerifyHandler(_default_classifier(), FeesVerifiedPromoter())
    raise ValueError(f"no handler for queue {queue!r}")


def _default_classifier():
    """Darwin classifier if available, else a no-op that leaves fees unclassified
    (they get flagged for review rather than silently dropped)."""
    try:  # pragma: no cover - depends on Darwin being importable
        from ..agents.darwin.classifier import DarwinClassifierAdapter  # type: ignore

        return DarwinClassifierAdapter()
    except Exception:  # pragma: no cover
        class _Null:
            async def classify(self, fee):
                return None

        return _Null()


async def drain(
    pool: asyncpg.Pool,
    queue: str,
    worker_id: str,
    *,
    max_seconds: float = 50.0,
    alerter=default_alerter,
) -> int:
    """Process jobs from `queue` until empty or `max_seconds` elapses. Returns
    the number processed."""
    handler = build_handler(queue)
    processed = 0
    deadline = time.monotonic() + max_seconds
    while time.monotonic() < deadline:
        did = await run_once(pool, handler, worker_id, alerter=alerter)
        if not did:
            break
        processed += 1
    return processed


async def drain_forever(pool: asyncpg.Pool, queue: str, worker_id: str, *, alerter=default_alerter) -> None:
    """Standalone long-running worker (non-Modal hosts)."""
    from .worker import run_forever

    await run_forever(pool, build_handler(queue), worker_id, alerter=alerter)
