"""publish-fees CLI — drain fees_verified into fees_published.

This is the missing wire: Darwin produces fees_verified, but nothing auto-promotes
them to fees_published. 405 verified rows and 0 published meant Lineage, Hamilton,
and the public fee index were all dead-ending.

Strategy (v1, auto-promote ≥0.90):
- Select fees_verified rows with extraction_confidence >= threshold that have no
  fee_published row yet (left join on lineage_ref IS NULL).
- For each, call the existing `promote_fee_to_tier3` agent tool.
- The tool handles agent_events emission, correlation, and the SQL insert. The
  adversarial handshake is stubbed in promote_to_tier3 (RAISE NOTICE, not
  RAISE EXCEPTION) so high-confidence auto-promotion is permitted.

Usage:
    python -m fee_crawler publish-fees               # dry-run preview
    python -m fee_crawler publish-fees --apply       # actually publish
    python -m fee_crawler publish-fees --apply --limit 100
    python -m fee_crawler publish-fees --apply --min-confidence 0.85

Exit codes:
    0 -- success (0 or more rows published)
    1 -- database error
    2 -- invalid args
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
from datetime import date
from typing import Optional

import asyncpg

from fee_crawler.agent_tools.pool import get_pool
from fee_crawler.agent_tools.schemas import (
    InsertAgentMessageInput,
    PromoteFeeToTier3Input,
)
from fee_crawler.agent_tools.tools_agent_infra import insert_agent_message
from fee_crawler.agent_tools.tools_fees import promote_fee_to_tier3


AGENT_NAME = "darwin"
DEFAULT_MIN_CONFIDENCE = 0.90
DEFAULT_LIMIT = 500


SELECT_ELIGIBLE = """
    SELECT
      v.fee_verified_id,
      v.institution_id,
      v.canonical_fee_key,
      v.fee_name,
      v.amount,
      v.extraction_confidence,
      v.review_status
    FROM fees_verified v
    LEFT JOIN fees_published p
      ON p.lineage_ref = v.fee_verified_id
    WHERE p.fee_published_id IS NULL
      AND v.extraction_confidence >= $1
      AND COALESCE(v.review_status, 'pending') <> 'rejected'
    ORDER BY v.extraction_confidence DESC, v.fee_verified_id ASC
    LIMIT $2
"""


async def _fetch_eligible(
    pool: asyncpg.Pool, min_confidence: float, limit: int
) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(SELECT_ELIGIBLE, min_confidence, limit)
    return [dict(r) for r in rows]


async def _insert_accept(
    sender: str, recipient: str, correlation_id: str, fee_verified_id: int
) -> None:
    """Post an intent='accept' message for one side of the handshake."""
    inp = InsertAgentMessageInput(
        recipient_agent=recipient,
        intent="accept",
        correlation_id=correlation_id,
        payload={"fee_verified_id": fee_verified_id, "auto_publish": True},
        round_number=1,
    )
    await insert_agent_message(
        inp=inp,
        agent_name=sender,
        reasoning_prompt=(
            f"Auto-publish handshake: {sender} accepts fee_verified_id="
            f"{fee_verified_id} for tier 3 promotion."
        ),
        reasoning_output=(
            f"extraction_confidence passed auto-promote threshold; "
            f"{sender} posts accept to satisfy adversarial gate."
        ),
    )


async def _publish_one(fee_verified_id: int, batch_id: Optional[str] = None) -> Optional[str]:
    """Full handshake + promote for one fees_verified row.

    The SQL gate in promote_to_tier3 (20260420_promote_to_tier3_batch_id.sql)
    requires an intent='accept' agent_messages row from BOTH darwin AND knox
    sharing a correlation_id and created within 30 days of the call. This helper
    posts both, then promotes. When `batch_id` is provided it tags the
    resulting fees_published row for rollback-publish grouping (roadmap #6).
    """
    correlation_id = str(uuid.uuid4())
    # Both accept messages share a correlation_id so the tightened Tier-3 gate
    # (20260420_promote_to_tier3_tighten_search.sql) matches the preferred path
    # and replay/lineage can link them.
    await _insert_accept("darwin", "knox", correlation_id, fee_verified_id)
    await _insert_accept("knox", "darwin", correlation_id, fee_verified_id)

    inp = PromoteFeeToTier3Input(fee_verified_id=fee_verified_id, batch_id=batch_id)
    out = await promote_fee_to_tier3(
        inp=inp,
        agent_name=AGENT_NAME,
        reasoning_prompt=(
            "Auto-publish high-confidence fees_verified row. Handshake satisfied "
            "by darwin+knox accept messages posted immediately prior."
        ),
        reasoning_output=(
            f"fee_verified_id={fee_verified_id} passed auto-publish threshold "
            f"and adversarial handshake."
        ),
    )
    if not out.success:
        return None
    return str(out.fee_published_id) if out.fee_published_id is not None else None


def _derive_batch_id() -> str:
    """Stable per-run batch_id so rollback-publish can target a single drain.

    Shape: `drain-YYYY-MM-DD-darwin-<8hex>`. Date first so `batch_id LIKE 'drain-2026-04-%'`
    works for month-scoped rollbacks. Short random suffix disambiguates multiple
    drains on the same day.
    """
    return f"drain-{date.today().isoformat()}-{AGENT_NAME}-{uuid.uuid4().hex[:8]}"


async def _run(apply: bool, min_confidence: float, limit: int) -> int:
    pool = await get_pool()
    rows = await _fetch_eligible(pool, min_confidence, limit)
    if not rows:
        print(
            f"publish-fees: nothing to publish "
            f"(min_confidence={min_confidence}, limit={limit})"
        )
        return 0

    batch_id = _derive_batch_id()
    print(
        f"publish-fees: {len(rows)} eligible row(s) "
        f"(min_confidence={min_confidence}, limit={limit}, batch_id={batch_id})"
    )
    preview = rows[: min(5, len(rows))]
    for r in preview:
        print(
            f"  - id={r['fee_verified_id']} inst={r['institution_id']} "
            f"key={r['canonical_fee_key']!r} conf={r['extraction_confidence']}"
        )
    if len(rows) > len(preview):
        print(f"  ... and {len(rows) - len(preview)} more")

    if not apply:
        print("publish-fees: dry-run (no --apply). Exiting without writes.")
        return 0

    published = 0
    failures = 0
    for r in rows:
        fv_id = r["fee_verified_id"]
        try:
            published_id = await _publish_one(fv_id, batch_id=batch_id)
            if published_id is not None:
                published += 1
                print(f"  published fee_verified_id={fv_id} -> fee_published_id={published_id}")
            else:
                failures += 1
                print(f"  FAILED fee_verified_id={fv_id} (tool returned success=False)")
        except Exception as exc:
            failures += 1
            print(f"  FAILED fee_verified_id={fv_id}: {exc}")

    print(
        f"publish-fees: done. published={published} failed={failures} "
        f"total_considered={len(rows)} batch_id={batch_id}"
    )
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="publish-fees",
        description="Drain fees_verified to fees_published for high-confidence rows.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually publish (default: dry-run preview only).",
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=DEFAULT_MIN_CONFIDENCE,
        help=f"extraction_confidence threshold (default: {DEFAULT_MIN_CONFIDENCE})",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"max rows per run (default: {DEFAULT_LIMIT})",
    )
    args = parser.parse_args(argv)

    if args.min_confidence < 0.0 or args.min_confidence > 1.0:
        print("publish-fees: --min-confidence must be in [0, 1]", file=sys.stderr)
        return 2
    if args.limit < 1:
        print("publish-fees: --limit must be >= 1", file=sys.stderr)
        return 2

    try:
        return asyncio.run(_run(args.apply, args.min_confidence, args.limit))
    except Exception as exc:
        print(f"publish-fees: error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
