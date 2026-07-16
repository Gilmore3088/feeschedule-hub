"""verify handler — rules + classification gate over fees_raw.

Job payload: {"event_id": str}. Entity: "doc:<document_id>".

Deterministic rules run first (free, catch hallucinations); a Classifier assigns
the canonical_fee_key (Darwin); clean + classified + confident fees are promoted
to fees_verified via the Promoter, everything else is flagged for human/Knox
review. Terminal — enqueues no downstream job.

This is the consolidation of the old Darwin (classify) + Knox (review) into one
verify stage running inside the queue.
"""

from __future__ import annotations

import asyncpg

from ..adapters import Classifier, Promoter
from ..worker import HandlerResult, PermanentError

# Coarse sanity bounds; the real verify plugs in validation.validate_fee, but
# these deterministic checks are the free first gate.
_FREQ_WHITELIST = {
    None, "", "one-time", "monthly", "annual", "per-item", "per-transaction",
    "per-check", "daily", "quarterly", "per-statement", "per-occurrence",
    "per-page", "per-hour", "per-minute", "waived",
}
_MAX_REASONABLE = 100_000.0
_DEFAULT_CONF_THRESHOLD = 0.85


def rule_flags(fee: dict, *, conf_threshold: float = _DEFAULT_CONF_THRESHOLD) -> list[str]:
    flags: list[str] = []
    if not (fee.get("fee_name") or "").strip():
        flags.append("missing_name")
    amt = fee.get("amount")
    if amt is not None:
        if amt < 0:
            flags.append("negative_amount")
        if amt > _MAX_REASONABLE:
            flags.append("amount_out_of_range")
    freq = (fee.get("frequency") or None)
    if freq is not None and freq.lower() not in _FREQ_WHITELIST:
        flags.append("bad_frequency")
    if (fee.get("extraction_confidence") or 0) < conf_threshold:
        flags.append("low_confidence")
    return flags


class Darwin:
    queue = "verify"

    def __init__(self, classifier: Classifier, promoter: Promoter, *, conf_threshold: float = _DEFAULT_CONF_THRESHOLD):
        self._classifier = classifier
        self._promoter = promoter
        self._threshold = conf_threshold

    async def handle(self, pool: asyncpg.Pool, job: asyncpg.Record) -> HandlerResult:
        payload = job["payload"] or {}
        event_id = payload.get("event_id")
        if not event_id:
            raise PermanentError("verify job missing event_id")

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT fee_raw_id, institution_id, fee_name, amount, frequency,
                       conditions, extraction_confidence, document_id
                  FROM fees_raw WHERE agent_event_id=$1
                """,
                event_id,
            )

        promoted = flagged = 0
        async with pool.acquire() as conn:
            async with conn.transaction():
                for r in rows:
                    fee = dict(r)
                    # Rule gate (free).
                    flags = rule_flags(fee, conf_threshold=self._threshold)
                    canonical = await self._classifier.classify(fee)
                    if canonical is None:
                        flags.append("unclassified")
                    if flags:
                        await self._promoter.flag(conn, fee, flags)
                        flagged += 1
                    else:
                        await self._promoter.promote(conn, fee, canonical)
                        promoted += 1

        return HandlerResult(result={"promoted": promoted, "flagged": flagged})

# Back-compat alias (persona rename).
VerifyHandler = Darwin
