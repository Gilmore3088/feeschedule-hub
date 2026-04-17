"""Phase 62b BOOT-01 tests (Plan 62B-11).

Covers the agent-graduate CLI + lifecycle_state branch wired into AgentBase.

Layout mirrors test_agent_base_auto_wrap.py — `_pool_injected` copies pool
into the ``agent_tools.pool`` singleton so bootstrap helpers hit the per-test
schema. Each test resets the `knox` row's lifecycle_state explicitly rather
than relying on fixture ordering.
"""

from __future__ import annotations

import pytest

from fee_crawler.agent_base import AgentBase
from fee_crawler.agent_base.bootstrap import (
    AgentPaused,
    get_lifecycle_state,
    should_hold_for_human,
)
from fee_crawler.commands.agent_graduate import PREDICATES, graduate


# ----------------------------------------------------------------------
# Fixtures
# ----------------------------------------------------------------------


@pytest.fixture
def _pool_injected(db_schema):
    """Inject per-test schema pool into the agent_tools singleton.

    Copy of the fixture used in test_agent_base_auto_wrap.py. bootstrap.py
    + agent_graduate.py both call ``get_pool()`` internally.
    """
    from fee_crawler.agent_tools import pool as pool_mod

    schema, pool = db_schema
    previous = pool_mod._pool
    pool_mod._pool = pool
    try:
        yield schema, pool
    finally:
        pool_mod._pool = previous


class _BootstrapAgent(AgentBase):
    """Minimal subclass used by the lifecycle-branch tests.

    Class attribute `run_called` tracks whether the wrapped body executed —
    the paused-branch test asserts this stays False.
    """

    agent_name = "knox"
    run_called = False

    async def run_turn(self):
        _BootstrapAgent.run_called = True

    async def review(self):
        return None


# ----------------------------------------------------------------------
# Graduate CLI tests
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_graduate_to_paused_always_works(_pool_injected):
    """Pausing requires no predicate — always allowed (D-25 rollback)."""
    schema, pool = _pool_injected
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE agent_registry SET lifecycle_state='q1_validation' "
            "WHERE agent_name='knox'"
        )
    exit_code = await graduate("knox", "paused")
    assert exit_code == 0
    assert await get_lifecycle_state("knox") == "paused"


@pytest.mark.asyncio
async def test_graduate_unknown_agent_exits_nonzero(_pool_injected):
    """Unknown agent_name surfaces as a non-zero exit + no state change."""
    exit_code = await graduate("nonexistent_agent", "q2_high_confidence")
    assert exit_code != 0


@pytest.mark.asyncio
async def test_graduate_predicate_fail_does_not_change_state(_pool_injected):
    """A predicate returning FALSE must not flip lifecycle_state."""
    schema, pool = _pool_injected
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE agent_registry SET lifecycle_state='q1_validation' "
            "WHERE agent_name='knox'"
        )
    # No fees_raw data -> predicate returns FALSE.
    exit_code = await graduate("knox", "q2_high_confidence")
    assert exit_code == 5
    assert await get_lifecycle_state("knox") == "q1_validation"


@pytest.mark.asyncio
async def test_graduate_missing_predicate_errors(_pool_injected):
    """No (agent, from, to) entry in PREDICATES -> exit 4; state unchanged."""
    schema, pool = _pool_injected
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE agent_registry SET lifecycle_state='q1_validation' "
            "WHERE agent_name='darwin'"
        )
    # Darwin predicates land in Phase 64 — (darwin, q1, q2) not in dict yet.
    exit_code = await graduate("darwin", "q2_high_confidence")
    assert exit_code == 4
    assert await get_lifecycle_state("darwin") == "q1_validation"


@pytest.mark.asyncio
async def test_graduate_invalid_to_state_errors(_pool_injected):
    """`--to` outside ALLOWED_STATES exits non-zero without touching DB."""
    exit_code = await graduate("knox", "q9_totally_autonomous")
    assert exit_code == 2


@pytest.mark.asyncio
async def test_graduate_noop_when_already_in_target_state(_pool_injected):
    """Re-graduating to the current state is a successful no-op (exit 0)."""
    schema, pool = _pool_injected
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE agent_registry SET lifecycle_state='q2_high_confidence' "
            "WHERE agent_name='knox'"
        )
    exit_code = await graduate("knox", "q2_high_confidence")
    assert exit_code == 0
    assert await get_lifecycle_state("knox") == "q2_high_confidence"


# ----------------------------------------------------------------------
# AgentBase lifecycle branch tests
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_paused_agent_run_turn_aborts(_pool_injected):
    """lifecycle_state='paused' -> run_turn raises AgentPaused + logs event."""
    schema, pool = _pool_injected
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE agent_registry SET lifecycle_state='paused' "
            "WHERE agent_name='knox'"
        )
    _BootstrapAgent.run_called = False
    agent = _BootstrapAgent()
    with pytest.raises(AgentPaused):
        await agent.run_turn()
    assert _BootstrapAgent.run_called is False

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT action FROM agent_events "
            "WHERE agent_name='knox' AND action='paused_abort' "
            "ORDER BY created_at DESC LIMIT 1"
        )
    assert row is not None


@pytest.mark.asyncio
async def test_active_agent_run_turn_runs(_pool_injected):
    """Any non-paused lifecycle_state -> run_turn executes normally."""
    schema, pool = _pool_injected
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE agent_registry SET lifecycle_state='q2_high_confidence' "
            "WHERE agent_name='knox'"
        )
    _BootstrapAgent.run_called = False
    agent = _BootstrapAgent()
    await agent.run_turn()
    assert _BootstrapAgent.run_called is True


# ----------------------------------------------------------------------
# Hold-for-human policy (D-24)
# ----------------------------------------------------------------------


def test_should_hold_for_human_policy():
    """Q1 = always hold; Q2 = hold < 0.85; Q3 / paused = no hold."""
    assert should_hold_for_human("q1_validation") is True
    assert should_hold_for_human("q1_validation", 0.99) is True
    assert should_hold_for_human("q2_high_confidence", 0.80) is True
    assert should_hold_for_human("q2_high_confidence", 0.85) is False
    assert should_hold_for_human("q2_high_confidence", 0.95) is False
    assert should_hold_for_human("q2_high_confidence") is False
    assert should_hold_for_human("q3_autonomy") is False
    assert should_hold_for_human("paused") is False


# ----------------------------------------------------------------------
# Predicate hygiene (Pitfall 6 — SQL injection prevention)
# ----------------------------------------------------------------------


def test_predicates_are_fixed_strings():
    """Every PREDICATES value is a fixed SQL string (no dynamic placeholders).

    Guards against a future maintainer thinking ``"... WHERE source='{}'".format(name)``
    is a reasonable shortcut. Static strings are the ONLY permitted shape.
    """
    assert len(PREDICATES) > 0, "PREDICATES dict must have at least one entry"
    for key, predicate in PREDICATES.items():
        assert "%s" not in predicate, f"{key}: uses %s placeholder"
        assert "%(" not in predicate, f"{key}: uses named %(name)s placeholder"
        assert "{}" not in predicate, f"{key}: uses {{}} format placeholder"
        assert "{0}" not in predicate, f"{key}: uses {{0}} format placeholder"
        # Keys are 3-tuples (agent, from, to)
        assert len(key) == 3
        assert all(isinstance(s, str) for s in key)
