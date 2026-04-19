"""rollback-publish CLI (Roadmap item #6).

Usage:
    python -m fee_crawler rollback-publish --batch-id <id> [--dry-run] [--execute]
                                          [--reason "..."] [--operator "..."]

Soft-deletes all rows in ``fees_published`` sharing ``batch_id = <id>`` by setting
``rolled_back_at = NOW()``, ``rolled_back_by_batch_id = <rollback_token>``, and
``rolled_back_reason = <reason>``. One audit row is written to
``fees_published_rollback_log`` for every invocation (dry-run or execute).

Defaults to dry-run. Writes only occur when ``--execute`` is passed explicitly.
Dry-run prints affected fee count, breakdown by canonical_fee_key, and a sample
of 10 fees.

Safety rails:
  * ``--batch-id`` is required and must be non-empty and not the literal ``'null'``.
  * One batch per invocation — no ``--after-date`` or multi-batch modes.
  * Transaction wraps the UPDATE; abort on any error.
  * Affected row count is printed BEFORE any write.

Exit codes:
    0 -- success (dry-run or execute)
    2 -- invalid / empty batch-id
    3 -- batch-id matched zero rows (nothing to do)
    4 -- execute attempted without --execute (safety fallthrough)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import uuid
from typing import Iterable, List, Optional

from fee_crawler.agent_tools.pool import get_pool


SAMPLE_LIMIT = 10


def _fail(code: int, msg: str) -> "NoReturn":  # type: ignore[name-defined]
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def _validate_batch_id(raw: Optional[str]) -> str:
    if raw is None:
        _fail(2, "--batch-id is required")
    cleaned = raw.strip()
    if not cleaned:
        _fail(2, "--batch-id is empty")
    if cleaned.lower() in {"null", "none", "nil", "undefined"}:
        _fail(2, f"--batch-id is a sentinel value: {cleaned!r}")
    return cleaned


def _resolve_operator(explicit: Optional[str]) -> str:
    return (
        explicit
        or os.environ.get("BFI_OPERATOR")
        or os.environ.get("USER")
        or "unknown"
    )


async def _count_and_sample(conn, batch_id: str):
    """Return (affected_count, category_breakdown, sample_rows) for live rows only."""
    affected_count = await conn.fetchval(
        """
        SELECT COUNT(*)
          FROM fees_published
         WHERE batch_id = $1
           AND rolled_back_at IS NULL
        """,
        batch_id,
    )
    breakdown_rows = await conn.fetch(
        """
        SELECT canonical_fee_key, COUNT(*) AS n
          FROM fees_published
         WHERE batch_id = $1
           AND rolled_back_at IS NULL
         GROUP BY canonical_fee_key
         ORDER BY n DESC
        """,
        batch_id,
    )
    sample_rows = await conn.fetch(
        """
        SELECT fee_published_id, institution_id, canonical_fee_key,
               fee_name, amount, published_at
          FROM fees_published
         WHERE batch_id = $1
           AND rolled_back_at IS NULL
         ORDER BY fee_published_id ASC
         LIMIT $2
        """,
        batch_id,
        SAMPLE_LIMIT,
    )
    breakdown = {r["canonical_fee_key"] or "<null>": int(r["n"]) for r in breakdown_rows}
    return int(affected_count or 0), breakdown, sample_rows


def _print_summary(
    *,
    batch_id: str,
    affected_count: int,
    breakdown: dict,
    sample_rows: Iterable,
    mode: str,
) -> None:
    print(f"[rollback-publish] mode      : {mode}")
    print(f"[rollback-publish] batch_id  : {batch_id}")
    print(f"[rollback-publish] affected  : {affected_count} fees_published rows")
    if breakdown:
        print("[rollback-publish] breakdown by canonical_fee_key:")
        for key, n in sorted(breakdown.items(), key=lambda kv: -kv[1]):
            print(f"    {n:>6}  {key}")
    sample_rows = list(sample_rows)
    if sample_rows:
        print(f"[rollback-publish] sample (first {min(SAMPLE_LIMIT, len(sample_rows))}):")
        for row in sample_rows[:SAMPLE_LIMIT]:
            amt = row["amount"]
            amt_str = f"${float(amt):.2f}" if amt is not None else "—"
            print(
                f"    id={row['fee_published_id']:>8}  "
                f"inst={row['institution_id']:>5}  "
                f"key={(row['canonical_fee_key'] or '<null>'):<28}  "
                f"amt={amt_str:>8}  "
                f"name={(row['fee_name'] or '')[:40]!r}"
            )


async def _run(
    *,
    batch_id: str,
    execute: bool,
    reason: Optional[str],
    operator: str,
) -> int:
    pool = await get_pool()
    rollback_token = str(uuid.uuid4())

    async with pool.acquire() as conn:
        async with conn.transaction():
            affected_count, breakdown, sample_rows = await _count_and_sample(conn, batch_id)

            if affected_count == 0:
                _print_summary(
                    batch_id=batch_id,
                    affected_count=0,
                    breakdown={},
                    sample_rows=[],
                    mode="dry-run" if not execute else "execute",
                )
                print("[rollback-publish] nothing to do — no live rows match batch_id.")
                # Still log the invocation for forensic completeness.
                await conn.execute(
                    """
                    INSERT INTO fees_published_rollback_log
                          (batch_id, rolled_back_by, affected_count, reason,
                           dry_run, category_breakdown, rollback_token)
                    VALUES ($1, $2, 0, $3, $4, $5::jsonb, $6)
                    """,
                    batch_id,
                    operator,
                    reason,
                    not execute,
                    json.dumps({}),
                    rollback_token,
                )
                return 3

            _print_summary(
                batch_id=batch_id,
                affected_count=affected_count,
                breakdown=breakdown,
                sample_rows=sample_rows,
                mode="dry-run" if not execute else "execute",
            )

            if not execute:
                # Audit the dry-run invocation and bail before touching fees_published.
                await conn.execute(
                    """
                    INSERT INTO fees_published_rollback_log
                          (batch_id, rolled_back_by, affected_count, reason,
                           dry_run, category_breakdown, rollback_token)
                    VALUES ($1, $2, $3, $4, TRUE, $5::jsonb, $6)
                    """,
                    batch_id,
                    operator,
                    affected_count,
                    reason,
                    json.dumps(breakdown),
                    rollback_token,
                )
                print("[rollback-publish] dry-run complete — no rows modified.")
                print("[rollback-publish] to execute: re-run with --execute")
                return 0

            updated = await conn.fetchval(
                """
                WITH touched AS (
                    UPDATE fees_published
                       SET rolled_back_at          = NOW(),
                           rolled_back_by_batch_id = $2,
                           rolled_back_reason      = $3
                     WHERE batch_id = $1
                       AND rolled_back_at IS NULL
                    RETURNING fee_published_id
                )
                SELECT COUNT(*) FROM touched
                """,
                batch_id,
                rollback_token,
                reason,
            )

            await conn.execute(
                """
                INSERT INTO fees_published_rollback_log
                      (batch_id, rolled_back_by, affected_count, reason,
                       dry_run, category_breakdown, rollback_token)
                VALUES ($1, $2, $3, $4, FALSE, $5::jsonb, $6)
                """,
                batch_id,
                operator,
                int(updated or 0),
                reason,
                json.dumps(breakdown),
                rollback_token,
            )

            print(
                f"[rollback-publish] EXECUTED — soft-deleted {int(updated or 0)} rows "
                f"from fees_published for batch_id={batch_id!r}."
            )
            print(f"[rollback-publish] rollback_token = {rollback_token}")
            print(
                "[rollback-publish] to reverse: UPDATE fees_published "
                f"SET rolled_back_at=NULL, rolled_back_by_batch_id=NULL, rolled_back_reason=NULL "
                f"WHERE rolled_back_by_batch_id='{rollback_token}';"
            )
            return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="rollback-publish",
        description="Soft-delete fees_published rows by batch_id.",
    )
    p.add_argument("--batch-id", required=True, help="batch_id to roll back (required)")
    mode = p.add_mutually_exclusive_group()
    mode.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Default. Print affected count + sample without writing.",
    )
    mode.add_argument(
        "--execute",
        action="store_true",
        help="Required flag to actually soft-delete rows.",
    )
    p.add_argument("--reason", default=None, help="Free-form reason captured in audit log.")
    p.add_argument(
        "--operator",
        default=None,
        help="Operator identifier; defaults to $BFI_OPERATOR or $USER.",
    )
    return p


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    batch_id = _validate_batch_id(args.batch_id)
    operator = _resolve_operator(args.operator)
    return asyncio.run(
        _run(
            batch_id=batch_id,
            execute=bool(args.execute),
            reason=args.reason,
            operator=operator,
        )
    )


if __name__ == "__main__":
    sys.exit(main())
