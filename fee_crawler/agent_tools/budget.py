"""Per-agent cost budget enforcement.

Config source hierarchy (evaluated on every tool call):
  1. Env var ATLAS_AGENT_BUDGET_<AGENT>_CENTS (kill-switch)
  2. agent_budgets.limit_cents row value (operator-managed)
  3. config.yaml fallback (hardcoded defaults; not reached in 62a — agent_budgets always has a seeded row)

SC5 contract: setting ATLAS_AGENT_BUDGET_KNOX_CENTS=1000 causes Knox to halt
its next cycle with a budget_halt agent_events row the moment spend crosses 1000 cents.
"""

from __future__ import annotations

import datetime
import json
import os
from typing import Optional

import asyncpg


# Time-based windows roll over on a fixed cadence. Event-scoped windows
# (per_batch, per_report) are deliberately absent: they reset when their
# orchestrator starts a new batch/report via reset_budget_window(), never
# on a timer. A window not listed here is treated as event-scoped and is
# never time-rolled.
_SECONDS_PER_DAY = 24 * 60 * 60
_WINDOW_SECONDS: dict[str, int] = {
    "per_day": _SECONDS_PER_DAY,
    "per_month": 30 * _SECONDS_PER_DAY,
    "per_cycle": 90 * _SECONDS_PER_DAY,
}


def _window_elapsed(
    budget_window: str,
    window_started_at: Optional[datetime.datetime],
    *,
    now: Optional[datetime.datetime] = None,
) -> bool:
    """True if a time-based window's period has elapsed and it should reset.

    Event-scoped windows (not in _WINDOW_SECONDS) and rows with a missing
    start timestamp never time-elapse.
    """
    duration = _WINDOW_SECONDS.get(budget_window)
    if duration is None or window_started_at is None:
        return False
    now = now or datetime.datetime.now(datetime.timezone.utc)
    return (now - window_started_at).total_seconds() >= duration


class BudgetExceeded(RuntimeError):
    """Raised when a gateway call would exceed the agent's budget."""

    def __init__(self, agent_name: str, spent: int, limit: int, source: str):
        super().__init__(
            f"BudgetExceeded: agent={agent_name} spent={spent} "
            f"limit={limit} source={source}"
        )
        self.agent_name = agent_name
        self.spent = spent
        self.limit = limit
        self.source = source


def _env_override_cents(agent_name: str) -> Optional[int]:
    """Read ATLAS_AGENT_BUDGET_<AGENT>_CENTS env var; return None if missing/malformed."""
    env_var = f"ATLAS_AGENT_BUDGET_{agent_name.upper()}_CENTS"
    raw = os.environ.get(env_var)
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        # Malformed env var -> treat as no override.
        return None


async def check_budget(
    conn: asyncpg.Connection,
    agent_name: str,
    projected_cost_cents: int,
) -> None:
    """Raise BudgetExceeded if any window's spend + projected would cross its limit.

    Writes a budget_halt agent_events row in the same transaction before raising.
    Hierarchy: env var override > per-window agent_budgets check > implicit pass.

    Reads `spent` from agent_budgets.spent_cents (authoritative source). Earlier
    versions summed agent_events.cost_cents, which agreed only when callers set
    cost_cents via with_agent_context — Darwin/Magellan never did (root of the
    2026-04 runaway). agent_budgets is updated by BOTH the gateway's own debit
    (gateway.py:308) and orchestrators' direct account_budget() calls.

    Each window is judged against its OWN limit. A prior version compared the
    MAX spent across windows against the TIGHTEST limit, which conflated the
    windows: because account_budget debits every window in lockstep, the
    smallest cap became a permanent lifetime ceiling. Time-based windows
    (per_day/per_month/per_cycle) are rolled over inline here when their period
    has elapsed, so spend is always evaluated against the current period.
    """
    rows = await conn.fetch(
        """SELECT budget_window, limit_cents, spent_cents, window_started_at
             FROM agent_budgets
            WHERE agent_name = $1""",
        agent_name,
    )

    # (window, limit, spent) with elapsed time-windows already reset to 0.
    effective: list[tuple[str, int, int]] = []
    for row in rows:
        window = row["budget_window"]
        spent = int(row["spent_cents"])
        if _window_elapsed(window, row["window_started_at"]):
            await _reset_window_row(conn, agent_name, window)
            spent = 0
        effective.append((window, int(row["limit_cents"]), spent))

    env_limit = _env_override_cents(agent_name)
    if env_limit is not None:
        # Agent-wide kill switch: weigh against the highest active window spend.
        spent = max((s for _, _, s in effective), default=0)
        if spent + projected_cost_cents > env_limit:
            await _write_budget_halt(conn, agent_name, spent, env_limit, "env_override")
            raise BudgetExceeded(agent_name, spent, env_limit, "env_override")
        return  # env override passes; skip per-window check.

    for window, limit, spent in effective:
        if spent + projected_cost_cents > limit:
            source = f"agent_budgets:{window}"
            await _write_budget_halt(conn, agent_name, spent, limit, source)
            raise BudgetExceeded(agent_name, spent, limit, source)


async def account_budget(
    conn: asyncpg.Connection,
    agent_name: str,
    cost_cents: int,
) -> None:
    """Add cost_cents to every window for this agent.

    A single spend counts against all of the agent's windows simultaneously
    (a $1 LLM call consumes $1 of both the per_batch and the per_day budget).
    Any time-based window whose period has elapsed is rolled over first, so the
    new spend opens a fresh period rather than piling onto a stale total. This
    keeps the debit path correct even when callers skip check_budget (e.g. the
    darwin orchestrator debits directly without a pre-check).
    """
    if cost_cents <= 0:
        return
    rows = await conn.fetch(
        """SELECT budget_window, window_started_at
             FROM agent_budgets
            WHERE agent_name = $1""",
        agent_name,
    )
    for row in rows:
        window = row["budget_window"]
        if _window_elapsed(window, row["window_started_at"]):
            # New period: this spend is the first of a fresh window.
            await conn.execute(
                """UPDATE agent_budgets
                      SET spent_cents = $3,
                          window_started_at = NOW(),
                          halted_at = NULL,
                          halted_reason = NULL,
                          updated_at = NOW()
                    WHERE agent_name = $1 AND budget_window = $2""",
                agent_name, window, cost_cents,
            )
        else:
            await conn.execute(
                """UPDATE agent_budgets
                      SET spent_cents = spent_cents + $3,
                          updated_at = NOW()
                    WHERE agent_name = $1 AND budget_window = $2""",
                agent_name, window, cost_cents,
            )


async def _reset_window_row(
    conn: asyncpg.Connection,
    agent_name: str,
    budget_window: str,
) -> None:
    """Zero a single window's spend and start a fresh period for it."""
    await conn.execute(
        """UPDATE agent_budgets
              SET spent_cents = 0,
                  window_started_at = NOW(),
                  halted_at = NULL,
                  halted_reason = NULL,
                  updated_at = NOW()
            WHERE agent_name = $1 AND budget_window = $2""",
        agent_name, budget_window,
    )


async def reset_budget_window(
    conn: asyncpg.Connection,
    agent_name: str,
    budget_window: str,
) -> None:
    """Reset an event-scoped window at the start of a new batch/report.

    Call this from an orchestrator at the top of each batch (per_batch) or
    report (per_report) run so the window measures one unit of work rather than
    accumulating into a lifetime ceiling. No-op if the agent has no such window.
    """
    await _reset_window_row(conn, agent_name, budget_window)


async def _write_budget_halt(
    conn: asyncpg.Connection,
    agent_name: str,
    spent: int,
    limit: int,
    source: str,
) -> None:
    """Insert a budget_halt agent_events row + mark agent_budgets row halted_at.

    Encodes the payload as JSON string for the JSONB column to avoid relying on
    a connection-scoped codec (tests may use a raw connection without init hook).
    """
    payload = {"spent": spent, "limit": limit, "source": source}
    await conn.execute(
        """INSERT INTO agent_events
             (agent_name, action, tool_name, entity, status, cost_cents,
              input_payload)
           VALUES ($1, 'budget_halt', '_gateway', '_budget', 'budget_halt', 0,
                   $2::JSONB)""",
        agent_name,
        json.dumps(payload),
    )
    await conn.execute(
        """UPDATE agent_budgets
              SET halted_at = NOW(),
                  halted_reason = $2,
                  updated_at = NOW()
            WHERE agent_name = $1""",
        agent_name,
        f"{source}: spent={spent} limit={limit}",
    )
