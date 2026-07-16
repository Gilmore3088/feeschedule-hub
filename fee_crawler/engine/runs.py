"""pipeline_runs — try/finally run tracking.

Every supervisor cycle, worker-pool session, and national roll-up opens a
`pipeline_runs` row on start and ALWAYS closes it (completed/failed) on exit,
even on exception. A reaper fails rows stuck `running` past a timeout. This is
the structural fix for the audit's silent-cron / orphaned-`running` findings:
freshness dashboards read pipeline_runs and therefore cannot show a dead run as
healthy.

Usage:

    async with run_scope(pool, kind="state", state_code="IA", cycle=42) as run:
        ... do work ...
        run.add_stats(extracted=120, failed=3)
    # on normal exit -> status=completed with accumulated stats
    # on exception  -> status=failed with error text, then re-raised
"""

from __future__ import annotations

import contextlib
import traceback
from typing import Any, AsyncIterator, Optional

import asyncpg


class RunHandle:
    """Live handle to a pipeline_runs row; accumulate stats during the run."""

    def __init__(self, pool: asyncpg.Pool, run_id: int):
        self._pool = pool
        self.run_id = run_id
        self._stats: dict[str, Any] = {}

    def add_stats(self, **kv: Any) -> None:
        """Merge counters/fields into the run's stats (numeric keys accumulate)."""
        for k, v in kv.items():
            if isinstance(v, (int, float)) and isinstance(self._stats.get(k), (int, float)):
                self._stats[k] += v
            else:
                self._stats[k] = v

    async def heartbeat(self) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                "UPDATE pipeline_runs SET heartbeat_at=NOW() "
                "WHERE id=$1 AND status='running'",
                self.run_id,
            )

    @property
    def stats(self) -> dict[str, Any]:
        return dict(self._stats)


async def start_run(
    pool: asyncpg.Pool,
    kind: str,
    *,
    state_code: Optional[str] = None,
    cycle: Optional[int] = None,
) -> RunHandle:
    async with pool.acquire() as conn:
        run_id = await conn.fetchval(
            """
            INSERT INTO pipeline_runs (kind, state_code, cycle, status)
            VALUES ($1, $2, $3, 'running')
            RETURNING id
            """,
            kind,
            state_code,
            cycle,
        )
    return RunHandle(pool, int(run_id))


async def finish_run(
    pool: asyncpg.Pool,
    run: RunHandle,
    status: str,
    *,
    error: Optional[str] = None,
) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE pipeline_runs
               SET status=$2, stats=$3::jsonb, error=$4, finished_at=NOW()
             WHERE id=$1
            """,
            run.run_id,
            status,
            run.stats,
            (error[:4000] if error else None),
        )


@contextlib.asynccontextmanager
async def run_scope(
    pool: asyncpg.Pool,
    kind: str,
    *,
    state_code: Optional[str] = None,
    cycle: Optional[int] = None,
) -> AsyncIterator[RunHandle]:
    """Context manager that guarantees a terminal state.

    Completes on normal exit, fails (with traceback) on exception, and re-raises
    so the failure is loud — never swallowed.
    """
    run = await start_run(pool, kind, state_code=state_code, cycle=cycle)
    try:
        yield run
    except BaseException as exc:  # noqa: BLE001 - we re-raise
        await finish_run(
            pool,
            run,
            "failed",
            error=f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}",
        )
        raise
    else:
        await finish_run(pool, run, "completed")


async def reap_stale_runs(pool: asyncpg.Pool, timeout_seconds: int = 7200) -> int:
    """Fail pipeline_runs stuck `running` past timeout (worker/host died).
    Default 2h. Returns count reaped."""
    async with pool.acquire() as conn:
        return int(
            await conn.fetchval(
                """
                WITH stale AS (
                    UPDATE pipeline_runs
                       SET status='failed',
                           error=COALESCE(error,'') || ' [reaped: run stalled]',
                           finished_at=NOW()
                     WHERE status='running'
                       AND heartbeat_at < NOW() - ($1 * INTERVAL '1 second')
                    RETURNING 1
                )
                SELECT count(*) FROM stale
                """,
                timeout_seconds,
            )
        )
