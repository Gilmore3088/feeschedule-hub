"""darwin-drain CLI — classify fees_raw rows via Darwin in N consecutive batches.

Wrapper around fee_crawler.agents.darwin.classify_batch intended for scheduled
invocation (via the run_post_processing every-minute dispatcher in modal_app.py)
and manual ad-hoc drains. Loops because a single 500-row batch barely dents the
102K+ unpromoted fees_raw backlog; five batches per daily window clears ~2.5K
rows/day, draining the backlog in ~41 days.

Usage:
    python -m fee_crawler darwin-drain                    # 1 batch, 500 rows
    python -m fee_crawler darwin-drain --size 500 --batches 5
    python -m fee_crawler darwin-drain --dry-run          # resolves DB + imports

Exit codes:
    0 -- success (all batches completed, even if some returned 0 rows)
    1 -- database or classifier error
    2 -- invalid args
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys


DEFAULT_SIZE = 500
DEFAULT_BATCHES = 1


async def _drain(size: int, batches: int, dry_run: bool) -> int:
    import asyncpg

    from fee_crawler.agents.darwin import classify_batch

    log = logging.getLogger(__name__)

    if dry_run:
        log.info("darwin-drain dry-run: would run %d batch(es) of %d rows", batches, size)
        return 0

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print(
            "ERROR: DATABASE_URL is not set. Export it (or source .env) before running "
            "darwin-drain. See CLAUDE.md for the Supabase transaction-pooler DSN.",
            file=sys.stderr,
        )
        return 1
    conn = await asyncpg.connect(db_url)
    try:
        total_classified = 0
        for i in range(batches):
            result = await classify_batch(conn, size=size)
            summary = result.to_dict()
            log.info("darwin-drain batch %d/%d: %s", i + 1, batches, summary)
            classified = int(summary.get("classified", 0) or 0)
            total_classified += classified
            # If a batch returns zero eligible rows the backlog is empty; no point looping.
            if classified == 0:
                log.info("darwin-drain: backlog exhausted after %d batch(es)", i + 1)
                break
        log.info("darwin-drain done: %d rows classified across %d batch(es)", total_classified, batches)
    finally:
        await conn.close()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="darwin-drain", description=__doc__)
    parser.add_argument("--size", type=int, default=DEFAULT_SIZE, help="rows per batch")
    parser.add_argument("--batches", type=int, default=DEFAULT_BATCHES, help="consecutive batches")
    parser.add_argument("--dry-run", action="store_true", help="resolve imports without classifying")
    args = parser.parse_args(argv)

    if args.size <= 0 or args.batches <= 0:
        print("error: --size and --batches must be > 0", file=sys.stderr)
        return 2

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    return asyncio.run(_drain(args.size, args.batches, args.dry_run))


if __name__ == "__main__":
    sys.exit(main())
