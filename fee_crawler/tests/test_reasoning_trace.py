"""Plan 62B-06 (COMMS-05): get_reasoning_trace read-only agent tool tests.

Covers:
  - test_empty_correlation_returns_empty_rows -> empty-input contract
  - test_returns_events_and_messages_in_order -> view ordering + kind discriminator
  - test_max_rows_limit_respected             -> LIMIT clamp
  - test_each_row_has_expected_keys           -> row shape stability
  - test_tool_registered_with_read_action     -> registry exposes `crud=read`
  - test_tool_marked_as_bfi_read_only         -> MCP read-surface marker

The db_schema fixture skips cleanly when DATABASE_URL_TEST is unset (see
fee_crawler/tests/conftest.py). Pure-Python registry tests run unconditionally.
"""

from __future__ import annotations

import uuid

import pytest

from fee_crawler.agent_tools.tools_agent_infra import get_reasoning_trace


def _bind_pool(pool):
    """Redirect the module-level agent_tools pool singleton to the per-test pool.

    Matches the pattern used by test_tools_agent_infra.py / test_agent_messaging.py.
    """
    from fee_crawler.agent_tools import pool as pool_mod

    original = pool_mod._pool
    pool_mod._pool = pool

    def restore() -> None:
        pool_mod._pool = original

    return restore


# ---------------------------------------------------------------------------
# Pure-Python registry contract (no DB required)
# ---------------------------------------------------------------------------


def test_tool_registered_with_read_action():
    """Plan 62B-06 acceptance: @agent_tool registers get_reasoning_trace with
    action='read' in TOOL_REGISTRY."""
    from fee_crawler.agent_tools.registry import TOOL_REGISTRY

    assert "get_reasoning_trace" in TOOL_REGISTRY, (
        "get_reasoning_trace not registered in TOOL_REGISTRY"
    )
    meta = TOOL_REGISTRY["get_reasoning_trace"]
    assert meta.action == "read", f"expected action='read', got {meta.action!r}"
    assert meta.entity == "agent_events", (
        f"expected entity='agent_events', got {meta.entity!r}"
    )


def test_tool_marked_as_bfi_read_only():
    """MCP server read-surface marker: _bfi_read_only attribute set True on
    the underlying function, so a future MCP wrapper would accept it."""
    assert getattr(get_reasoning_trace, "_bfi_read_only", False) is True, (
        "get_reasoning_trace missing _bfi_read_only=True marker"
    )


# ---------------------------------------------------------------------------
# DB-backed integration tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_correlation_returns_empty_rows(db_schema):
    """Unknown correlation_id returns {"rows": []}."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        result = await get_reasoning_trace(
            correlation_id=str(uuid.uuid4()),
            max_rows=500,
        )
        assert result == {"rows": []}
    finally:
        restore()


@pytest.mark.asyncio
async def test_returns_events_and_messages_in_order(db_schema):
    """Seeded 2 events + 1 message on same correlation returns 3 rows ordered
    by created_at, with kind discriminator populated."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        corr = str(uuid.uuid4())
        async with pool.acquire() as conn:
            # Two events, staggered in time.
            await conn.execute(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, status,
                      correlation_id, created_at)
                   VALUES ('knox','extract','extract_fees','fees_raw','success',
                           $1::UUID, NOW() - INTERVAL '3 seconds')""",
                corr,
            )
            await conn.execute(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, status,
                      correlation_id, created_at)
                   VALUES ('darwin','verify','promote_to_tier2','fees_verified',
                           'success', $1::UUID, NOW() - INTERVAL '2 seconds')""",
                corr,
            )
            # One message, later still.
            await conn.execute(
                """INSERT INTO agent_messages
                     (sender_agent, recipient_agent, intent, correlation_id,
                      payload, created_at)
                   VALUES ('darwin','knox','challenge', $1::UUID,
                           '{"q":"why"}'::JSONB, NOW() - INTERVAL '1 second')""",
                corr,
            )

        result = await get_reasoning_trace(correlation_id=corr)
        rows = result["rows"]
        assert len(rows) == 3, f"expected 3 rows, got {len(rows)}"

        # Ordered by created_at: event, event, message.
        kinds = [r["kind"] for r in rows]
        assert kinds == ["event", "event", "message"], f"bad ordering: {kinds}"

        # All rows share the correlation agents.
        agents = {r["agent_name"] for r in rows}
        assert agents == {"knox", "darwin"}, f"unexpected agents: {agents}"
    finally:
        restore()


@pytest.mark.asyncio
async def test_each_row_has_expected_keys(db_schema):
    """Every returned row carries the view's documented columns."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        corr = str(uuid.uuid4())
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, status,
                      correlation_id, input_payload)
                   VALUES ('knox','extract','extract_fees','fees_raw','success',
                           $1::UUID, '{"note":"seed"}'::JSONB)""",
                corr,
            )

        result = await get_reasoning_trace(correlation_id=corr)
        rows = result["rows"]
        assert len(rows) == 1
        row = rows[0]

        expected_keys = {
            "kind", "created_at", "agent_name", "intent_or_action",
            "tool_name", "entity", "payload", "row_id",
        }
        assert set(row.keys()) == expected_keys, (
            f"row keys mismatch: {set(row.keys())} != {expected_keys}"
        )
        assert row["kind"] == "event"
        assert row["agent_name"] == "knox"
        assert row["intent_or_action"] == "extract"
        assert row["tool_name"] == "extract_fees"
        assert row["entity"] == "fees_raw"
        assert row["payload"] == {"note": "seed"}
        assert isinstance(row["row_id"], str) and row["row_id"]
        assert isinstance(row["created_at"], str) and row["created_at"]
    finally:
        restore()


@pytest.mark.asyncio
async def test_max_rows_limit_respected(db_schema):
    """max_rows clamps the returned list length."""
    _, pool = db_schema
    restore = _bind_pool(pool)
    try:
        corr = str(uuid.uuid4())
        async with pool.acquire() as conn:
            for _ in range(5):
                await conn.execute(
                    """INSERT INTO agent_events
                         (agent_name, action, tool_name, entity, status,
                          correlation_id)
                       VALUES ('knox','step','t','e','success', $1::UUID)""",
                    corr,
                )

        result = await get_reasoning_trace(correlation_id=corr, max_rows=2)
        assert len(result["rows"]) == 2, (
            f"max_rows=2 returned {len(result['rows'])} rows"
        )
    finally:
        restore()
