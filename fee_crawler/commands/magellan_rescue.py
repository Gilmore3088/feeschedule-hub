"""Run one or more Magellan URL-rescue batches from the canonical job runner."""

from __future__ import annotations

import argparse
import asyncio
import os
import sys


async def _run(size: int, batches: int) -> int:
    import asyncpg

    from fee_crawler.agents.magellan.orchestrator import rescue_batch

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("magellan-rescue: DATABASE_URL is not set", file=sys.stderr)
        return 1

    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        for index in range(batches):
            result = await rescue_batch(conn, size=size)
            summary = result.to_dict()
            print(f"magellan-rescue batch {index + 1}/{batches}: {summary}")
            if summary.get("failures", 0) or summary.get("circuit_tripped"):
                return 1
            if summary.get("processed", 0) == 0:
                break
    finally:
        await conn.close()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="magellan-rescue", description=__doc__)
    parser.add_argument("--size", type=int, default=500, help="rows per batch")
    parser.add_argument("--batches", type=int, default=1, help="consecutive batches")
    args = parser.parse_args(argv)

    if not 1 <= args.size <= 1000:
        print("magellan-rescue: --size must be 1-1000", file=sys.stderr)
        return 2
    if not 1 <= args.batches <= 20:
        print("magellan-rescue: --batches must be 1-20", file=sys.stderr)
        return 2

    try:
        return asyncio.run(_run(args.size, args.batches))
    except Exception as exc:
        print(f"magellan-rescue: error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
