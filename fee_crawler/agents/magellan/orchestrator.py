"""Magellan orchestrator — candidate select, rescue_batch, decide_next_state."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, asdict
from enum import Enum
from typing import Any, Awaitable, Callable, Optional

import asyncpg

from fee_crawler.agents._common.circuit import CircuitBreaker
from fee_crawler.agents.magellan.config import DEFAULT, MagellanConfig
from fee_crawler.agents.magellan.plausibility import is_plausible_fee_schedule
from fee_crawler.agents.magellan.rungs import LADDER, RungResult
from fee_crawler.agents.magellan.rungs._base import _Target, _Context
from fee_crawler.agent_tools.schemas import (
    CreateFeeRawInput,
    UpdateCrawlTargetRescueStateInput,
)
from fee_crawler.agent_tools.tools_fees import create_fee_raw
from fee_crawler.agent_tools.tools_crawl_targets import update_crawl_target_rescue_state
from fee_crawler.fee_analysis import normalize_fee_name

log = logging.getLogger(__name__)

AGENT_NAME = "magellan"


class RescueOutcome(str, Enum):
    RESCUED = "rescued"
    DEAD = "dead"
    NEEDS_HUMAN = "needs_human"
    RETRY_AFTER = "retry_after"


@dataclass
class BatchResult:
    processed: int = 0
    rescued: int = 0
    dead: int = 0
    needs_human: int = 0
    retry_after: int = 0
    failures: int = 0
    cost_usd: float = 0.0
    duration_s: float = 0.0
    circuit_tripped: bool = False
    halt_reason: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


def decide_next_state(last_result: RungResult, plausible: bool) -> RescueOutcome:
    """Map the final rung's outcome to a rescue state.

    Called when the ladder exhausted without a RESCUED win. `plausible`
    reflects the plausibility check on the LAST rung's output.
    """
    err = (last_result.error or "").lower()
    if "timeout" in err or "connection" in err:
        return RescueOutcome.RETRY_AFTER
    if last_result.http_status in (500, 502, 503, 504):
        return RescueOutcome.RETRY_AFTER
    if last_result.fees and not plausible:
        return RescueOutcome.NEEDS_HUMAN
    if last_result.http_status in (403, 404, 410):
        return RescueOutcome.DEAD
    return RescueOutcome.DEAD


# ---------------------------------------------------------------------------
# Spotlight categories — must have at least one to count as rescued
# ---------------------------------------------------------------------------

_SPOTLIGHT = {
    "monthly_maintenance", "overdraft", "nsf",
    "atm_non_network", "card_foreign_txn", "wire_domestic_outgoing",
}

BatchEvent = dict


# ---------------------------------------------------------------------------
# select_candidates
# ---------------------------------------------------------------------------

async def select_candidates(conn: asyncpg.Connection, limit: int) -> list[_Target]:
    """Pull pending/retry-eligible crawl_targets and lock them for this batch."""
    cfg = DEFAULT
    rows = await conn.fetch(
        f"""
        SELECT ct.id, ct.fee_schedule_url, ct.institution_name, ct.charter_type
          FROM crawl_targets ct
         WHERE ct.fee_schedule_url IS NOT NULL AND ct.fee_schedule_url != ''
           AND (
                ct.rescue_status = 'pending'
             OR (ct.rescue_status = 'retry_after'
                 AND (ct.last_rescue_attempt_at IS NULL
                      OR ct.last_rescue_attempt_at < NOW() - INTERVAL '{cfg.retry_after_days} days'))
           )
         ORDER BY ct.last_rescue_attempt_at NULLS FIRST
         LIMIT $1
         FOR UPDATE OF ct SKIP LOCKED
        """,
        limit,
    )
    return [
        _Target(
            id=r["id"],
            fee_schedule_url=r["fee_schedule_url"],
            institution_name=r["institution_name"],
            charter_type=r["charter_type"],
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _any_spotlight(fees: list[dict]) -> bool:
    for f in fees:
        name = f.get("name") or ""
        if normalize_fee_name(name) in _SPOTLIGHT:
            return True
    return False


async def _write_fees(
    target: _Target,
    fees: list[dict],
    rung_name: str,
    reasoning: str,
) -> None:
    for fee in fees:
        await create_fee_raw(
            inp=CreateFeeRawInput(
                institution_id=target.id,
                crawl_event_id=None,
                document_r2_key=None,
                source_url=target.fee_schedule_url,
                extraction_confidence=0.75,
                fee_name=fee.get("name", ""),
                amount=float(fee.get("amount") or 0.0),
                frequency=fee.get("frequency"),
                conditions=fee.get("conditions"),
                outlier_flags=[],
            ),
            agent_name=AGENT_NAME,
            reasoning_prompt=f"magellan:{rung_name}",
            reasoning_output=reasoning,
        )


async def _mark_target(
    target: _Target,
    outcome: RescueOutcome,
    reasoning: str,
) -> None:
    await update_crawl_target_rescue_state(
        inp=UpdateCrawlTargetRescueStateInput(
            crawl_target_id=target.id,
            rescue_status=outcome.value,
            failure_reason=reasoning if outcome != RescueOutcome.RESCUED else None,
        ),
        agent_name=AGENT_NAME,
        reasoning_prompt=f"decide_next_state:{outcome.value}",
        reasoning_output=reasoning,
    )


# ---------------------------------------------------------------------------
# rescue_batch
# ---------------------------------------------------------------------------

async def rescue_batch(
    conn: asyncpg.Connection,
    size: int,
    *,
    config: MagellanConfig = DEFAULT,
    on_event: Optional[Callable[[BatchEvent], Awaitable[None]]] = None,
) -> BatchResult:
    """Run the rung ladder against `size` pending targets and persist results."""
    t0 = time.time()
    result = BatchResult()
    cb = CircuitBreaker(config)

    async def emit(ev_type: str, **payload: Any) -> None:
        if on_event:
            await on_event({"type": ev_type, **payload})

    targets = await select_candidates(conn, size)
    result.processed = len(targets)
    await emit("candidates_selected", count=len(targets))

    if not targets:
        result.duration_s = time.time() - t0
        await emit("done", result=result.to_dict())
        return result

    ctx = _Context()

    for target in targets:
        if result.circuit_tripped:
            break

        last_result = RungResult()
        rescued = False

        for rung in LADDER:
            try:
                rung_result = await rung.run(target, ctx)
            except Exception as e:
                rung_result = RungResult(error=str(e))

            last_result = rung_result
            result.cost_usd += rung_result.cost_usd

            if not rung_result.fees:
                await emit(
                    "rung_done",
                    target_id=target.id,
                    rung=rung.name,
                    fees=0,
                    outcome="no_fees",
                )
                continue

            if not is_plausible_fee_schedule(rung_result.fees, rung_result.text):
                await emit(
                    "rung_done",
                    target_id=target.id,
                    rung=rung.name,
                    fees=len(rung_result.fees),
                    outcome="not_plausible",
                )
                continue

            if not _any_spotlight(rung_result.fees):
                await emit(
                    "rung_done",
                    target_id=target.id,
                    rung=rung.name,
                    fees=len(rung_result.fees),
                    outcome="no_spotlight",
                )
                continue

            reasoning = json.dumps({
                "rung": rung.name,
                "fee_count": len(rung_result.fees),
                "duration_s": rung_result.duration_s,
            })
            await _write_fees(target, rung_result.fees, rung.name, reasoning)
            await _mark_target(target, RescueOutcome.RESCUED, reasoning)
            cb.record_success()
            result.rescued += 1
            rescued = True
            await emit(
                "row_complete",
                target_id=target.id,
                outcome="rescued",
                rung=rung.name,
                fees=len(rung_result.fees),
            )
            break

        if not rescued:
            try:
                plausible = is_plausible_fee_schedule(last_result.fees, last_result.text)
                outcome = decide_next_state(last_result, plausible=plausible)
                reasoning = json.dumps({
                    "last_rung": LADDER[-1].name if LADDER else "none",
                    "error": last_result.error,
                    "http_status": last_result.http_status,
                })
                await _mark_target(target, outcome, reasoning)
                cb.record_failure()

                if outcome == RescueOutcome.DEAD:
                    result.dead += 1
                elif outcome == RescueOutcome.NEEDS_HUMAN:
                    result.needs_human += 1
                elif outcome == RescueOutcome.RETRY_AFTER:
                    result.retry_after += 1

                await emit("row_complete", target_id=target.id, outcome=outcome.value)

            except Exception as e:
                cb.record_failure()
                result.failures += 1
                await emit(
                    "row_complete",
                    target_id=target.id,
                    outcome="failure",
                    error=str(e),
                )

            if cb.halt_reason():
                result.circuit_tripped = True
                result.halt_reason = cb.halt_reason().value
                await emit("halted", reason=result.halt_reason)
                break

        await asyncio.sleep(config.inter_target_delay_seconds)

    result.duration_s = time.time() - t0
    await emit("done", result=result.to_dict())
    return result
