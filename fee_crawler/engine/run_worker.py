"""Portable worker fleet — build a persona per queue and drain it.

Used by both the Modal engine app and any standalone host. Each queue maps to
its persona (Magellan/Rosetta/Knox/Darwin) wired with real adapters. Draining is
bounded so a Modal-spawned worker returns instead of running forever; the pump
re-spawns as long as depth remains.
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
from .classifier import DarwinClassifier, NullClassifier
from .handlers.extract import Knox
from .handlers.fetch import Magellan
from .handlers.read import Rosetta
from .handlers.verify import Darwin
from .personas import persona_for
from .promoter import FeesVerifiedPromoter
from .worker import run_once


def build_handler(queue: str):
    """Construct the production persona for a queue with real adapters."""
    if queue == "fetch":
        return Magellan(HttpBrowserFetcher(), R2ObjectStore())
    if queue == "read":
        return Rosetta(R2ObjectStore(), DocumentReader())
    if queue == "extract":
        return Knox(LLMExtractor())
    if queue == "verify":
        return Darwin(_classifier(), FeesVerifiedPromoter())
    raise ValueError(f"no persona for queue {queue!r}")


def _classifier():
    """Darwin's canonical-key classifier; falls back to leaving fees unclassified
    (flagged for review) when the LLM path is unavailable."""
    try:
        return DarwinClassifier()
    except Exception:  # pragma: no cover
        return NullClassifier()


async def drain(
    pool: asyncpg.Pool,
    queue: str,
    worker_id: str | None = None,
    *,
    max_seconds: float = 50.0,
    alerter=default_alerter,
) -> int:
    """Process jobs from `queue` until empty or `max_seconds` elapses. Returns
    the number processed. worker_id defaults to the persona name."""
    handler = build_handler(queue)
    wid = worker_id or persona_for(queue).name
    processed = 0
    deadline = time.monotonic() + max_seconds
    while time.monotonic() < deadline:
        did = await run_once(pool, handler, wid, alerter=alerter)
        if not did:
            break
        processed += 1
    return processed


async def drain_forever(pool: asyncpg.Pool, queue: str, worker_id: str | None = None, *, alerter=default_alerter) -> None:
    """Standalone long-running worker (non-Modal hosts)."""
    from .worker import run_forever

    await run_forever(pool, build_handler(queue), worker_id or persona_for(queue).name, alerter=alerter)
