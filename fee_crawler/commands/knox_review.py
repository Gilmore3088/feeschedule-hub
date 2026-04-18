"""knox-review CLI — run Knox's adversarial review on pending fees_verified rows.

Knox reviews Darwin's output (fees_verified rows) and posts accept or reject
decisions via agent_messages. Both Darwin AND Knox must accept before a fee
can be promoted to tier 3 (fees_published) per the SQL gate in
supabase/migrations/20260510_promote_to_tier3_tighten.sql.

Usage:
    python -m fee_crawler knox-review                 # dry-run preview
    python -m fee_crawler knox-review --apply         # actually post decisions
    python -m fee_crawler knox-review --apply --limit 50

Exit codes:
    0 -- success (zero or more decisions posted)
    1 -- runtime error
    2 -- invalid args
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from fee_crawler.agents.knox.config import DEFAULT
from fee_crawler.agents.knox.orchestrator import review_batch


DEFAULT_LIMIT = 100


async def _run(apply: bool, limit: int) -> int:
    if not apply:
        print(
            f"knox-review: dry-run (would review up to {limit} pending rows). "
            "Use --apply to post accept/reject decisions via agent_messages."
        )
        return 0

    result = await review_batch(limit=limit, config=DEFAULT)
    print(
        f"knox-review: done. "
        f"processed={result.processed} accepted={result.accepted} "
        f"rejected={result.rejected} failures={result.failures} "
        f"duration_s={result.duration_s:.2f}"
    )
    return 1 if result.failures > 0 else 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="knox-review",
        description="Knox adversarial review of fees_verified rows.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually post accept/reject decisions (default: dry-run).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"max rows per run (default: {DEFAULT_LIMIT})",
    )
    args = parser.parse_args(argv)

    if args.limit < 1:
        print("knox-review: --limit must be >= 1", file=sys.stderr)
        return 2

    try:
        return asyncio.run(_run(args.apply, args.limit))
    except Exception as exc:
        print(f"knox-review: error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
