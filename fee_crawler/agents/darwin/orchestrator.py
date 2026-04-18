"""Darwin orchestrator — candidate selection, batching, promote-or-cache loop."""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import asdict, dataclass, field
from typing import Awaitable, Callable, Optional

import asyncpg

from fee_crawler.agents.darwin.circuit import CircuitBreaker
from fee_crawler.agents.darwin.classifier import (
    build_prompt,
    classify_names_with_retry,
    validate_llm_result,
)
from fee_crawler.agents.darwin.config import DEFAULT, DarwinConfig
from fee_crawler.agent_tools.schemas import (
    PromoteFeeToTier2Input,
    UpsertClassificationCacheInput,
)
from fee_crawler.agent_tools.tools_fees import promote_fee_to_tier2
from fee_crawler.agent_tools.tools_peer_research import upsert_classification_cache
from fee_crawler.fee_analysis import normalize_fee_name

log = logging.getLogger(__name__)

AGENT_NAME = "darwin"

BatchEvent = dict  # {type: str, **payload}


@dataclass
class BatchResult:
    processed: int = 0
    cache_hits: int = 0
    llm_calls: int = 0
    promoted: int = 0
    cached_low_conf: int = 0
    rejected: int = 0
    failures: int = 0
    cost_usd: float = 0.0
    duration_s: float = 0.0
    circuit_tripped: bool = False
    halt_reason: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class _Candidate:
    fee_raw_id: int
    fee_name: str
    normalized_name: str = field(init=False)

    def __post_init__(self):
        self.normalized_name = normalize_fee_name(self.fee_name)


async def select_candidates(conn: asyncpg.Connection, limit: int) -> list[_Candidate]:
    """Select unpromoted fees_raw rows. FOR UPDATE SKIP LOCKED prevents races."""
    rows = await conn.fetch(
        """
        SELECT fr.fee_raw_id, fr.fee_name
          FROM fees_raw fr
          LEFT JOIN fees_verified fv ON fv.fee_raw_id = fr.fee_raw_id
         WHERE fv.fee_verified_id IS NULL
         ORDER BY fr.fee_raw_id
         LIMIT $1
         FOR UPDATE OF fr SKIP LOCKED
        """,
        limit,
    )
    return [_Candidate(fee_raw_id=r["fee_raw_id"], fee_name=r["fee_name"]) for r in rows]


async def _lookup_cache(
    conn: asyncpg.Connection,
    normalized_names: list[str],
) -> dict[str, tuple[Optional[str], float]]:
    """Bulk cache lookup by cache_key. Returns {cache_key: (canonical_key, confidence)}."""
    if not normalized_names:
        return {}
    rows = await conn.fetch(
        "SELECT cache_key, canonical_fee_key, confidence "
        "FROM classification_cache WHERE cache_key = ANY($1::TEXT[])",
        normalized_names,
    )
    return {r["cache_key"]: (r["canonical_fee_key"], float(r["confidence"])) for r in rows}


async def _promote_or_cache(
    cand: _Candidate,
    key: Optional[str],
    confidence: float,
    reasoning_prompt: str,
    reasoning_output: str,
    config: DarwinConfig,
) -> tuple[str, Optional[str]]:
    """Apply confidence policy. Returns (outcome, halt_hint).

    outcome: 'promoted' | 'cached_low_conf' | 'rejected'
    """
    if (
        key is not None
        and confidence >= config.auto_promote_threshold
        and validate_llm_result(cand.normalized_name, key)
    ):
        await promote_fee_to_tier2(
            inp=PromoteFeeToTier2Input(
                fee_raw_id=cand.fee_raw_id,
                canonical_fee_key=key,
                variant_type=None,
                outlier_flags=[],
            ),
            agent_name=AGENT_NAME,
            reasoning_prompt=reasoning_prompt,
            reasoning_output=reasoning_output,
        )
        await upsert_classification_cache(
            inp=UpsertClassificationCacheInput(
                cache_key=cand.normalized_name,
                canonical_fee_key=key,
                confidence=confidence,
                model=config.model,
                source="darwin",
            ),
            agent_name=AGENT_NAME,
            reasoning_prompt=reasoning_prompt,
            reasoning_output=reasoning_output,
        )
        return "promoted", None

    if key is not None and not validate_llm_result(cand.normalized_name, key):
        await upsert_classification_cache(
            inp=UpsertClassificationCacheInput(
                cache_key=cand.normalized_name,
                canonical_fee_key=None,
                confidence=confidence,
                model=config.model,
                source="darwin",
            ),
            agent_name=AGENT_NAME,
            reasoning_prompt=reasoning_prompt,
            reasoning_output=reasoning_output,
        )
        return "rejected", None

    await upsert_classification_cache(
        inp=UpsertClassificationCacheInput(
            cache_key=cand.normalized_name,
            canonical_fee_key=key,
            confidence=confidence,
            model=config.model,
            source="darwin",
        ),
        agent_name=AGENT_NAME,
        reasoning_prompt=reasoning_prompt,
        reasoning_output=reasoning_output,
    )
    return "cached_low_conf", None


async def classify_batch(
    conn: asyncpg.Connection,
    size: int,
    *,
    config: DarwinConfig = DEFAULT,
    on_event: Optional[Callable[[BatchEvent], Awaitable[None]]] = None,
) -> BatchResult:
    """Classify up to `size` unpromoted fees_raw rows. One atomic batch."""
    import anthropic

    t0 = time.time()
    result = BatchResult()
    cb = CircuitBreaker(config)

    async def emit(ev_type: str, **payload):
        if on_event:
            await on_event({"type": ev_type, **payload})

    candidates = await select_candidates(conn, size)
    result.processed = len(candidates)
    await emit("candidates_selected", count=len(candidates))
    if not candidates:
        result.duration_s = time.time() - t0
        await emit("done", result=result.to_dict())
        return result

    cache = await _lookup_cache(conn, [c.normalized_name for c in candidates])
    await emit("cache_lookup_done", hits=len(cache), total=len(candidates))

    misses: list[_Candidate] = []
    resolved: dict[int, tuple[Optional[str], float, str, str]] = {}

    for c in candidates:
        if c.normalized_name in cache:
            k, conf = cache[c.normalized_name]
            resolved[c.fee_raw_id] = (k, conf, f"cache:{c.normalized_name}", "cache-hit")
            result.cache_hits += 1
        else:
            misses.append(c)

    for i in range(0, len(misses), config.llm_batch_size):
        chunk = misses[i : i + config.llm_batch_size]
        chunk_names = [c.normalized_name for c in chunk]
        await emit("llm_call_start", size=len(chunk))
        try:
            llm_results = await classify_names_with_retry(chunk_names, config=config)
            result.llm_calls += 1
        except anthropic.RateLimitError:
            cb.record_rate_limit_exhausted()
            result.failures += len(chunk)
            await emit("llm_call_done", success=False, error="rate_limit_saturated")
            if cb.halt_reason():
                result.circuit_tripped = True
                result.halt_reason = cb.halt_reason().value
                break
            continue
        except Exception as e:
            cb.record_failure()
            result.failures += len(chunk)
            await emit("llm_call_done", success=False, error=str(e))
            if cb.halt_reason():
                result.circuit_tripped = True
                result.halt_reason = cb.halt_reason().value
                break
            continue

        await emit("llm_call_done", success=True)

        sys_p, user_p = build_prompt(chunk_names)
        reasoning_prompt = f"{sys_p}\n---\n{user_p}"

        llm_by_name: dict[str, dict] = {r.get("fee_name", ""): r for r in llm_results}
        for c in chunk:
            r = llm_by_name.get(c.normalized_name)
            if r is None:
                resolved[c.fee_raw_id] = (None, 0.0, reasoning_prompt, "no-result")
            else:
                resolved[c.fee_raw_id] = (
                    r.get("canonical_fee_key"),
                    float(r.get("confidence", 0.0)),
                    reasoning_prompt,
                    str(r),
                )

        await asyncio.sleep(config.inter_batch_delay_seconds)

    for c in candidates:
        if result.circuit_tripped:
            break
        if c.fee_raw_id not in resolved:
            continue
        key, conf, prompt, output = resolved[c.fee_raw_id]
        try:
            outcome, _ = await _promote_or_cache(c, key, conf, prompt, output, config)
            cb.record_success()
            if outcome == "promoted":
                result.promoted += 1
            elif outcome == "cached_low_conf":
                result.cached_low_conf += 1
            elif outcome == "rejected":
                result.rejected += 1
            await emit(
                "row_complete",
                fee_raw_id=c.fee_raw_id,
                fee_name=c.fee_name,
                outcome=outcome,
                key=key,
                confidence=conf,
            )
        except Exception as e:
            cb.record_failure()
            result.failures += 1
            await emit(
                "row_complete",
                fee_raw_id=c.fee_raw_id,
                fee_name=c.fee_name,
                outcome="failure",
                error=str(e),
            )
            if cb.halt_reason():
                result.circuit_tripped = True
                result.halt_reason = cb.halt_reason().value
                break

    result.duration_s = time.time() - t0
    if result.circuit_tripped:
        await emit("halted", reason=result.halt_reason)
    await emit("done", result=result.to_dict())
    return result
