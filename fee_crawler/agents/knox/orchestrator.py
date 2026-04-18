"""Knox orchestrator — review pending fees_verified rows and post decisions."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import asdict, dataclass
from typing import Optional

import asyncpg

from fee_crawler.agents.knox.config import DEFAULT, KnoxConfig
from fee_crawler.agents.knox.rules import apply_rules
from fee_crawler.agent_tools.pool import get_pool
from fee_crawler.agent_tools.schemas import InsertAgentMessageInput
from fee_crawler.agent_tools.tools_agent_infra import insert_agent_message


log = logging.getLogger(__name__)

AGENT_NAME = "knox"


@dataclass
class ReviewResult:
    """Summary of a review batch."""

    processed: int = 0
    accepted: int = 0
    rejected: int = 0
    failures: int = 0
    duration_s: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


async def _fetch_pending(conn: asyncpg.Connection, limit: int) -> list[dict]:
    """Fetch fees_verified rows with no existing knox agent_message."""
    rows = await conn.fetch(
        """
        SELECT
          v.fee_verified_id,
          v.institution_id,
          v.canonical_fee_key,
          v.fee_name,
          v.amount,
          ct.asset_size_tier
        FROM fees_verified v
        JOIN crawl_targets ct ON ct.id = v.institution_id
        WHERE NOT EXISTS (
          SELECT 1 FROM agent_messages m
           WHERE m.sender_agent = 'knox'
             AND m.payload->>'fee_verified_id' = v.fee_verified_id::text
        )
        ORDER BY v.fee_verified_id ASC
        LIMIT $1
        """,
        limit,
    )
    return [dict(r) for r in rows]


async def _get_peer_stats(
    conn: asyncpg.Connection,
    canonical_fee_key: str,
    asset_size_tier: Optional[str],
    exclude_fee_verified_id: int,
) -> tuple[Optional[float], int]:
    """Return (peer_median, peer_count) for the same key + tier, excluding this row."""
    if asset_size_tier is None:
        return (None, 0)
    row = await conn.fetchrow(
        """
        SELECT
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.amount) AS median,
          COUNT(*)::int AS n
          FROM fees_verified v
          JOIN crawl_targets ct ON ct.id = v.institution_id
         WHERE v.canonical_fee_key = $1
           AND ct.asset_size_tier = $2
           AND v.fee_verified_id != $3
           AND v.amount IS NOT NULL
        """,
        canonical_fee_key,
        asset_size_tier,
        exclude_fee_verified_id,
    )
    if not row:
        return (None, 0)
    median = float(row["median"]) if row["median"] is not None else None
    return (median, int(row["n"]))


async def _post_decision(
    fee_verified_id: int,
    decision: str,
    reasons: list[str],
) -> bool:
    """Post accept or reject message via insert_agent_message tool."""
    intent = "accept" if decision == "accept" else "reject"
    correlation_id = str(uuid.uuid4())
    payload = {
        "fee_verified_id": fee_verified_id,
        "decision": decision,
        "reasons": reasons,
    }

    try:
        inp = InsertAgentMessageInput(
            recipient_agent="darwin",
            intent=intent,
            correlation_id=correlation_id,
            payload=payload,
            round_number=1,
        )
        await insert_agent_message(
            inp=inp,
            agent_name=AGENT_NAME,
            reasoning_prompt=f"Knox review of fee_verified_id={fee_verified_id}",
            reasoning_output=f"decision={decision}; reasons={'; '.join(reasons)}",
        )
        return True
    except Exception as exc:
        log.exception(
            "Knox failed to post decision for fee_verified_id=%s: %s",
            fee_verified_id,
            exc,
        )
        return False


async def review_batch(
    limit: int = 100,
    *,
    config: KnoxConfig = DEFAULT,
) -> ReviewResult:
    """Review up to `limit` pending fees_verified rows."""
    t0 = time.time()
    result = ReviewResult()

    pool = await get_pool()
    async with pool.acquire() as conn:
        pending = await _fetch_pending(conn, limit)
        result.processed = len(pending)

        if not pending:
            result.duration_s = time.time() - t0
            return result

        for row in pending:
            fee_verified_id = row["fee_verified_id"]
            canonical_fee_key = row["canonical_fee_key"]
            asset_size_tier = row["asset_size_tier"]
            fee_name = row["fee_name"] or ""
            amount = float(row["amount"]) if row["amount"] is not None else 0.0

            peer_median, peer_count = await _get_peer_stats(
                conn, canonical_fee_key, asset_size_tier, fee_verified_id
            )

            decision, reasons = apply_rules(
                amount=amount,
                fee_name=fee_name,
                peer_median=peer_median,
                peer_count=peer_count,
                config_threshold=config.reject_threshold_multiplier,
                min_peers=config.min_peers_for_excess_check,
                config_keywords=config.free_fee_keywords,
            )

            success = await _post_decision(fee_verified_id, decision, reasons)
            if success:
                if decision == "accept":
                    result.accepted += 1
                else:
                    result.rejected += 1
            else:
                result.failures += 1

            await asyncio.sleep(0.01)

    result.duration_s = time.time() - t0
    return result
