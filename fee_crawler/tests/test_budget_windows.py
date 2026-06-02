"""Per-window budget evaluation + time-based rollover (bug_005).

Two prior defects, both fixed here:
  1. check_budget compared MAX(spent) across windows to the TIGHTEST limit,
     conflating windows so the smallest cap became a permanent ceiling.
  2. No window ever reset, so every per_day/per_month/per_cycle window was a
     lifetime cap rather than a recurring one.

The pure-function tests cover the rollover predicate without a database. The
DB-backed tests exercise check_budget/account_budget/reset_budget_window and
skip automatically when DATABASE_URL_TEST is unset.
"""

from __future__ import annotations

import datetime

import pytest

from fee_crawler.agent_tools.budget import (
    BudgetExceeded,
    _WINDOW_SECONDS,
    _window_elapsed,
    account_budget,
    check_budget,
    reset_budget_window,
)


def _now() -> datetime.datetime:
    return datetime.datetime(2026, 6, 1, 12, 0, tzinfo=datetime.timezone.utc)


# --------------------------------------------------------------------------
# Pure rollover predicate (no DB).
# --------------------------------------------------------------------------

def test_per_day_window_not_elapsed_within_24h():
    started = _now() - datetime.timedelta(hours=23, minutes=59)
    assert _window_elapsed("per_day", started, now=_now()) is False


def test_per_day_window_elapsed_after_24h():
    started = _now() - datetime.timedelta(hours=24, minutes=1)
    assert _window_elapsed("per_day", started, now=_now()) is True


def test_event_windows_never_time_elapse():
    long_ago = _now() - datetime.timedelta(days=400)
    assert _window_elapsed("per_batch", long_ago, now=_now()) is False
    assert _window_elapsed("per_report", long_ago, now=_now()) is False


def test_missing_start_never_elapses():
    assert _window_elapsed("per_day", None, now=_now()) is False


def test_window_seconds_only_time_based():
    assert set(_WINDOW_SECONDS) == {"per_day", "per_month", "per_cycle"}
    assert _WINDOW_SECONDS["per_day"] == 24 * 60 * 60


# --------------------------------------------------------------------------
# DB-backed per-window evaluation + rollover (skips without DATABASE_URL_TEST).
# --------------------------------------------------------------------------

async def _set_window(conn, agent, window, *, limit, spent, started_days_ago):
    """Force an agent_budgets row to a known limit/spend/age."""
    await conn.execute(
        """INSERT INTO agent_budgets
             (agent_name, budget_window, limit_cents, spent_cents, window_started_at)
           VALUES ($1, $2, $3, $4, NOW() - make_interval(days => $5::int))
           ON CONFLICT (agent_name, budget_window) DO UPDATE
             SET limit_cents = EXCLUDED.limit_cents,
                 spent_cents = EXCLUDED.spent_cents,
                 window_started_at = EXCLUDED.window_started_at,
                 halted_at = NULL,
                 halted_reason = NULL""",
        agent, window, limit, spent, started_days_ago,
    )


@pytest.mark.asyncio
async def test_check_budget_attributes_breach_to_its_own_window(db_schema):
    """A window over its OWN limit halts and names that window — even when a
    different window with a far larger limit carries the same spend. The old
    MAX-vs-tightest-limit logic could not tell which window breached."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        await _set_window(conn, "darwin", "per_day", limit=500, spent=600, started_days_ago=0)
        await _set_window(conn, "darwin", "per_batch", limit=10000, spent=600, started_days_ago=0)
        with pytest.raises(BudgetExceeded) as exc:
            await check_budget(conn, "darwin", projected_cost_cents=1)
        assert exc.value.source == "agent_budgets:per_day"
        assert exc.value.limit == 500


@pytest.mark.asyncio
async def test_check_budget_does_not_halt_under_each_windows_own_limit(db_schema):
    """Spend over the tightest limit but parked in a window with a larger limit
    must NOT halt — the regression that made the smallest cap a global ceiling."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        # per_batch carries 600 (well under 10000); per_day is clean.
        await _set_window(conn, "darwin", "per_day", limit=500, spent=0, started_days_ago=0)
        await _set_window(conn, "darwin", "per_batch", limit=10000, spent=600, started_days_ago=0)
        await check_budget(conn, "darwin", projected_cost_cents=50)  # no raise


@pytest.mark.asyncio
async def test_check_budget_rolls_over_elapsed_per_day(db_schema):
    """A per_day window started >24h ago resets to zero before evaluation, so a
    previously-maxed daily budget does not permanently halt the agent."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        await _set_window(conn, "darwin", "per_day", limit=500, spent=500, started_days_ago=2)
        await check_budget(conn, "darwin", projected_cost_cents=50)  # no raise after rollover
        row = await conn.fetchrow(
            "SELECT spent_cents FROM agent_budgets "
            "WHERE agent_name='darwin' AND budget_window='per_day'"
        )
        assert row["spent_cents"] == 0


@pytest.mark.asyncio
async def test_account_budget_rolls_over_then_applies_fresh_spend(db_schema):
    """Debiting into an elapsed window resets it first, so the new spend opens a
    fresh period instead of piling onto a stale total."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        await _set_window(conn, "darwin", "per_day", limit=500, spent=499, started_days_ago=2)
        await account_budget(conn, "darwin", 50)
        row = await conn.fetchrow(
            "SELECT spent_cents FROM agent_budgets "
            "WHERE agent_name='darwin' AND budget_window='per_day'"
        )
        assert row["spent_cents"] == 50


@pytest.mark.asyncio
async def test_account_budget_debits_all_windows(db_schema):
    """One spend counts against every active window simultaneously."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        await _set_window(conn, "darwin", "per_day", limit=500, spent=100, started_days_ago=0)
        await _set_window(conn, "darwin", "per_batch", limit=10000, spent=100, started_days_ago=0)
        await account_budget(conn, "darwin", 25)
        rows = await conn.fetch(
            "SELECT budget_window, spent_cents FROM agent_budgets WHERE agent_name='darwin'"
        )
        by_window = {r["budget_window"]: r["spent_cents"] for r in rows}
        assert by_window["per_day"] == 125
        assert by_window["per_batch"] == 125


@pytest.mark.asyncio
async def test_reset_budget_window_zeroes_event_window(db_schema):
    """reset_budget_window clears an event-scoped window at batch start."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        await _set_window(conn, "darwin", "per_batch", limit=10000, spent=9000, started_days_ago=0)
        await reset_budget_window(conn, "darwin", "per_batch")
        row = await conn.fetchrow(
            "SELECT spent_cents, halted_at FROM agent_budgets "
            "WHERE agent_name='darwin' AND budget_window='per_batch'"
        )
        assert row["spent_cents"] == 0
        assert row["halted_at"] is None
