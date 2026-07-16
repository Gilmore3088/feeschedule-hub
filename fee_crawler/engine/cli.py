"""Operable entrypoints for the ingestion engine.

    python -m fee_crawler.engine.cli run-cycle IA
    python -m fee_crawler.engine.cli finalize IA 42
    python -m fee_crawler.engine.cli export-md IA
    python -m fee_crawler.engine.cli backfill IA
    python -m fee_crawler.engine.cli reap
    python -m fee_crawler.engine.cli depth fetch

Workers are launched separately (see engine/run_worker.py); this drives the
supervisor + maintenance ops. DATABASE_URL must be set.
"""

from __future__ import annotations

import asyncio
import sys

from ..agent_tools.pool import get_pool
from . import knowledge as kn
from . import queue as q
from . import supervisor as sup
from .runs import reap_stale_runs


async def _main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    cmd, *rest = argv
    pool = await get_pool()

    if cmd == "run-cycle":
        state = rest[0]
        cycle = int(rest[1]) if len(rest) > 1 else None
        out = await sup.run_cycle(pool, state, cycle=cycle)
        print(f"state={state} run_id={out['run_id']} dispatched={out['dispatched']}")
    elif cmd == "finalize":
        state, run_id = rest[0], int(rest[1])
        stats = await sup.finalize_cycle(pool, state, run_id)
        print(f"state={state} run_id={run_id} {stats}")
    elif cmd == "export-md":
        print(await kn.export_state_md(pool, rest[0]), end="")
    elif cmd == "backfill":
        n = await kn.backfill_hints_from_targets(pool, rest[0])
        print(f"backfilled {n} hints for {rest[0]}")
    elif cmd == "reap":
        jobs = await q.reap_stale_jobs(pool)
        runs = await reap_stale_runs(pool)
        print(f"reaped jobs={jobs} runs={runs}")
    elif cmd == "depth":
        print(await q.queue_depth(pool, rest[0]))
    else:
        print(f"unknown command {cmd!r}")
        print(__doc__)
        return 2
    return 0


def main() -> None:
    sys.exit(asyncio.run(_main(sys.argv[1:])))


if __name__ == "__main__":
    main()
