"""Dispatcher adapters for the production agents.

The review_tick dispatcher in ``fee_crawler/agent_base/dispatcher.py`` expects
classes with an async ``review()`` method keyed by agent_name in
``AGENT_CLASSES``. The adapters live here (rather than inside each agent
module) so that dispatcher-side concerns — batch sizing, DB connection
management, cost containment — stay separate from the orchestrator logic
that the admin UI and nightly drain share.

Per-tick batch sizes are deliberately SMALL. pg_cron fires Darwin hourly
and Knox every 15 minutes; these ticks are the trickle drain between the
heavier 05:00 UTC piggyback window. Anything larger here risks compounding
with the piggyback and blowing through the daily cost cap set on the
drain. Scale up only after observing multiple clean days of tick activity.

Historical context: these adapters were missing in commits 62B-01 through
62B-11 — AGENT_CLASSES was an empty dict with a "Phase 63+ extend" comment.
The result was silent "no agent class registered" errors on every hourly
Darwin review_tick and every 15-minute Knox review_tick for weeks. Fixed
in the 2026-04-19 Darwin-classify-not-working diagnosis.
"""

from __future__ import annotations

import logging
import os

import asyncpg

log = logging.getLogger(__name__)

# Conservative per-tick batch sizes. See header comment.
DARWIN_TICK_SIZE = 50
KNOX_TICK_SIZE = 100
MAGELLAN_TICK_SIZE = 25


class _DbConnectedAgent:
    """Base: lazy asyncpg connection lifecycle for tick adapters."""

    async def _connect(self) -> asyncpg.Connection:
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            raise RuntimeError(
                "DATABASE_URL is not set in the dispatcher process environment"
            )
        return await asyncpg.connect(db_url)


class DarwinAgent(_DbConnectedAgent):
    """Per-tick Darwin adapter. Classifies a small batch of fees_raw rows."""

    async def review(self) -> None:
        from fee_crawler.agents.darwin import classify_batch

        conn = await self._connect()
        try:
            result = await classify_batch(conn, size=DARWIN_TICK_SIZE)
            log.info("DarwinAgent.review tick: %s", result.to_dict())
        finally:
            await conn.close()


class KnoxAgent:
    """Per-tick Knox adapter. Reviews a small batch of fees_verified rows.

    Knox owns its own DB access via the agent tool gateway, so the adapter
    is a thin shim — orchestrator.review_batch handles connection + gateway
    invocations internally.
    """

    async def review(self) -> None:
        from fee_crawler.agents.knox.orchestrator import review_batch

        result = await review_batch(limit=KNOX_TICK_SIZE)
        log.info("KnoxAgent.review tick: %s", result.to_dict())


class MagellanAgent(_DbConnectedAgent):
    """Per-tick Magellan adapter. Rescues a small batch of URL-less targets.

    Not yet scheduled via pg_cron, but registered for completeness so a
    future agent-review-magellan cron works without another code change.
    """

    async def review(self) -> None:
        from fee_crawler.agents.magellan.orchestrator import rescue_batch

        conn = await self._connect()
        try:
            result = await rescue_batch(conn, size=MAGELLAN_TICK_SIZE)
            log.info(
                "MagellanAgent.review tick: %s",
                result.to_dict() if hasattr(result, "to_dict") else result,
            )
        finally:
            await conn.close()
