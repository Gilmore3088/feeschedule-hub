"""National roll-up + atomic publish.

Runs after state supervisors have populated fees_verified. Three steps
(plan §6.4):

  1. build_staging   — dedupe fees_verified on (institution_id, canonical_fee_key)
                       into a new `staging` publish batch.
  2. validate_batch  — gate the staging batch (non-empty, no catastrophic row
                       drop vs the live batch, sane amounts). Rejects instead of
                       publishing garbage.
  3. publish_batch   — flip the staging batch to `active` and the previous active
                       to `superseded` in ONE transaction — the atomic swap.

A bad state run is contained: it lands in fees_verified but fails the validation
gate before it can reach the live index.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import asyncpg

# Reject a publish that would drop more than this fraction of rows vs the live
# batch (a signal that extraction/verification broke upstream).
MAX_DROP_FRACTION = 0.30
MAX_REASONABLE_AMOUNT = 100_000.0


async def build_staging(pool: asyncpg.Pool) -> int:
    """Dedupe fees_verified into a fresh staging batch. Returns batch_id."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            batch_id = await conn.fetchval(
                "INSERT INTO publish_batches (status) VALUES ('staging') RETURNING batch_id"
            )
            # DISTINCT ON keeps one row per (institution, canonical key): the most
            # recent, highest-confidence verified fee.
            await conn.execute(
                """
                INSERT INTO fees_published_engine (
                    batch_id, institution_id, canonical_fee_key, fee_name, amount,
                    frequency, source_url, document_r2_key, extraction_confidence, lineage_ref
                )
                SELECT DISTINCT ON (v.institution_id, v.canonical_fee_key)
                    $1, v.institution_id, v.canonical_fee_key, v.fee_name, v.amount,
                    v.frequency, v.source_url, v.document_r2_key, v.extraction_confidence,
                    v.fee_verified_id
                  FROM fees_verified v
                 WHERE v.review_status IN ('verified', 'approved')
                 ORDER BY v.institution_id, v.canonical_fee_key,
                          v.created_at DESC, v.extraction_confidence DESC NULLS LAST
                """,
                batch_id,
            )
            count = await conn.fetchval(
                "SELECT count(*) FROM fees_published_engine WHERE batch_id=$1", batch_id
            )
            await conn.execute(
                "UPDATE publish_batches SET row_count=$2 WHERE batch_id=$1", batch_id, count
            )
    return int(batch_id)


@dataclass
class ValidationResult:
    ok: bool
    reasons: list[str]
    staging_rows: int
    live_rows: int


async def validate_batch(pool: asyncpg.Pool, batch_id: int) -> ValidationResult:
    """Gate a staging batch against the live one. Records the result on the batch."""
    reasons: list[str] = []
    async with pool.acquire() as conn:
        staging_rows = int(
            await conn.fetchval(
                "SELECT count(*) FROM fees_published_engine WHERE batch_id=$1", batch_id
            )
        )
        live_batch = await conn.fetchval(
            "SELECT batch_id FROM publish_batches WHERE status='active'"
        )
        live_rows = int(
            await conn.fetchval(
                "SELECT count(*) FROM fees_published_engine WHERE batch_id=$1", live_batch
            )
        ) if live_batch is not None else 0

        # Gate 1: non-empty.
        if staging_rows == 0:
            reasons.append("staging batch is empty")

        # Gate 2: no catastrophic row drop vs live.
        if live_rows > 0 and staging_rows < live_rows * (1 - MAX_DROP_FRACTION):
            reasons.append(
                f"row drop too large: {staging_rows} < {live_rows} "
                f"* {1 - MAX_DROP_FRACTION:.0%}"
            )

        # Gate 3: no insane amounts.
        bad_amounts = int(
            await conn.fetchval(
                "SELECT count(*) FROM fees_published_engine "
                "WHERE batch_id=$1 AND (amount < 0 OR amount > $2)",
                batch_id, MAX_REASONABLE_AMOUNT,
            )
        )
        if bad_amounts:
            reasons.append(f"{bad_amounts} rows with out-of-range amounts")

        # Gate 4: canonical key present (defense in depth; column is NOT NULL).
        null_keys = int(
            await conn.fetchval(
                "SELECT count(*) FROM fees_published_engine "
                "WHERE batch_id=$1 AND (canonical_fee_key IS NULL OR canonical_fee_key='')",
                batch_id,
            )
        )
        if null_keys:
            reasons.append(f"{null_keys} rows missing canonical_fee_key")

        result = ValidationResult(not reasons, reasons, staging_rows, live_rows)
        await conn.execute(
            "UPDATE publish_batches SET validation=$2 WHERE batch_id=$1",
            batch_id,
            {"ok": result.ok, "reasons": reasons,
             "staging_rows": staging_rows, "live_rows": live_rows},
        )
    return result


async def publish_batch(pool: asyncpg.Pool, batch_id: int) -> None:
    """Atomically activate a validated staging batch (the swap).

    In one transaction: supersede the current active batch and activate this one.
    Readers of fees_published_current see the old set until commit, then the new
    set — never a mix.
    """
    async with pool.acquire() as conn:
        async with conn.transaction():
            status = await conn.fetchval(
                "SELECT status FROM publish_batches WHERE batch_id=$1 FOR UPDATE", batch_id
            )
            if status != "staging":
                raise ValueError(f"batch {batch_id} is {status!r}, not staging")
            await conn.execute(
                "UPDATE publish_batches SET status='superseded' WHERE status='active'"
            )
            await conn.execute(
                "UPDATE publish_batches SET status='active', activated_at=NOW() "
                "WHERE batch_id=$1",
                batch_id,
            )


async def reject_batch(pool: asyncpg.Pool, batch_id: int, reasons: list[str]) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE publish_batches SET status='rejected', "
            "validation = validation || $2::jsonb WHERE batch_id=$1",
            batch_id,
            {"rejected_reasons": reasons},
        )


async def run_national_rollup(
    pool: asyncpg.Pool, *, revalidate: Optional["RevalidateFn"] = None
) -> dict:
    """Full roll-up: build -> validate -> (publish | reject). Returns a summary.

    On success optionally calls `revalidate` (e.g. the app's ISR revalidation)
    AFTER the swap commits, so the site only rebuilds against the live batch.
    """
    from .runs import run_scope

    async with run_scope(pool, "national") as run:
        batch_id = await build_staging(pool)
        result = await validate_batch(pool, batch_id)
        run.add_stats(batch_id=batch_id, staging_rows=result.staging_rows)
        if not result.ok:
            await reject_batch(pool, batch_id, result.reasons)
            run.add_stats(published=0, rejected=1)
            return {"batch_id": batch_id, "published": False, "reasons": result.reasons}
        await publish_batch(pool, batch_id)
        run.add_stats(published=1)
    if revalidate is not None:
        await revalidate()
    return {"batch_id": batch_id, "published": True, "rows": result.staging_rows}


# Structural type only — an async callable with no args.
try:  # pragma: no cover - typing convenience
    from typing import Awaitable, Callable

    RevalidateFn = Callable[[], "Awaitable[None]"]
except Exception:  # pragma: no cover
    RevalidateFn = object  # type: ignore


def make_isr_revalidator(app_url: str, token: str, timeout: float = 30.0):
    """Build a revalidate() that POSTs to the app's /api/revalidate.

    Matches the route's Bearer-token contract (src/app/api/revalidate). Only fire
    this AFTER publish_batch commits, so the site rebuilds against the live batch.
    """

    async def _revalidate() -> None:
        import httpx

        url = app_url.rstrip("/") + "/api/revalidate"
        async with httpx.AsyncClient(timeout=timeout) as c:
            r = await c.post(url, headers={"Authorization": f"Bearer {token}"})
            r.raise_for_status()

    return _revalidate
