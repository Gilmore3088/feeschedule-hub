"""Per-agent cost budget enforcement.

Config source hierarchy (evaluated on every tool call):
  1. Env var ATLAS_AGENT_BUDGET_<AGENT>_CENTS (kill-switch)
  2. agent_budgets.limit_cents row value (operator-managed)
  3. config.yaml fallback (hardcoded defaults; not reached in 62a — agent_budgets always has a seeded row)

SC5 contract: setting ATLAS_AGENT_BUDGET_KNOX_CENTS=1000 causes Knox to halt
its next cycle with a budget_halt agent_events row the moment spend crosses 1000 cents.
"""

from __future__ import annotations

import json
import os
from typing import Optional

import asyncpg


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
    """Raise BudgetExceeded if spent + projected_cost would cross the limit.

    Writes a budget_halt agent_events row in the same transaction before raising.
    Hierarchy: env var override > agent_budgets row > no-check (implicit pass).
    """
    # Sum spent across all windows for this agent (simple implementation; 62a does
    # not slice by per_cycle/per_batch — Plan 65 Atlas tightens).
    spent_raw = await conn.fetchval(
        """SELECT COALESCE(SUM(cost_cents), 0)::INTEGER
             FROM agent_events
            WHERE agent_name = $1
              AND status = 'success'""",
        agent_name,
    )
    spent = int(spent_raw or 0)

    env_limit = _env_override_cents(agent_name)
    if env_limit is not None:
        if spent + projected_cost_cents > env_limit:
            await _write_budget_halt(conn, agent_name, spent, env_limit, "env_override")
            raise BudgetExceeded(agent_name, spent, env_limit, "env_override")
        return  # env override passes; skip row check.

    # Fallback: agent_budgets row (take the tightest window).
    row = await conn.fetchrow(
        """SELECT limit_cents
             FROM agent_budgets
            WHERE agent_name = $1
            ORDER BY limit_cents ASC
            LIMIT 1""",
        agent_name,
    )
    if row is not None:
        limit = int(row["limit_cents"])
        if spent + projected_cost_cents > limit:
            await _write_budget_halt(conn, agent_name, spent, limit, "agent_budgets")
            raise BudgetExceeded(agent_name, spent, limit, "agent_budgets")


async def account_budget(
    conn: asyncpg.Connection,
    agent_name: str,
    cost_cents: int,
) -> None:
    """Increment agent_budgets.spent_cents for every window belonging to this agent."""
    if cost_cents <= 0:
        return
    await conn.execute(
        """UPDATE agent_budgets
              SET spent_cents = spent_cents + $2,
                  updated_at = NOW()
            WHERE agent_name = $1""",
        agent_name, cost_cents,
    )


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
