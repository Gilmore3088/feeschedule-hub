"""Phase 62b BOOT-01 exception-digest tests (Plan 62B-11).

build_digest pulls from three sources (D-08 + D-11 + D-24):
  1. agent_events rows with status='improve_rejected'
  2. agent_messages rows with state='escalated'
  3. Q2 exception samples: status='success' + (confidence < 0.85 OR random 5%)

Tests mirror the test_agent_bootstrap.py layout: _pool_injected fixture
routes build_digest() writes/reads at the per-test schema.
"""

from __future__ import annotations

import uuid

import pytest

from fee_crawler.commands.exception_digest import build_digest


@pytest.fixture
def _pool_injected(db_schema):
    """Route ``get_pool()`` at the per-test schema. See test_agent_bootstrap."""
    from fee_crawler.agent_tools import pool as pool_mod

    schema, pool = db_schema
    previous = pool_mod._pool
    pool_mod._pool = pool
    try:
        yield schema, pool
    finally:
        pool_mod._pool = previous


@pytest.mark.asyncio
async def test_empty_digest_has_all_three_sections(_pool_injected):
    """Empty-state digest renders all three section headers + '_none_' markers."""
    digest = await build_digest(since_hours=24)
    assert "## 1. Improve Rejected" in digest
    assert "## 2. Escalated Handshakes" in digest
    assert "## 3. Q2 Exception Samples" in digest
    assert "_none_" in digest


@pytest.mark.asyncio
async def test_digest_surfaces_improve_rejected(_pool_injected):
    """status='improve_rejected' events appear in section 1 with payload snippet."""
    schema, pool = _pool_injected
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status, input_payload)
               VALUES ('knox', 'improve', '_agent_base', '_improve',
                       'improve_rejected',
                       '{"reason":"canary_regression"}'::JSONB)"""
        )

    digest = await build_digest(since_hours=24)
    assert "## 1. Improve Rejected (1)" in digest
    assert "knox" in digest
    assert "canary_regression" in digest


@pytest.mark.asyncio
async def test_digest_surfaces_escalated_handshake(_pool_injected):
    """state='escalated' agent_messages rows appear in section 2."""
    schema, pool = _pool_injected
    corr = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_messages
                 (sender_agent, recipient_agent, intent, correlation_id,
                  payload, round_number, state)
               VALUES ('darwin', 'knox', 'challenge', $1::UUID,
                       '{"subject":"schema_drift"}'::JSONB, 3, 'escalated')""",
            corr,
        )

    digest = await build_digest(since_hours=24)
    assert "## 2. Escalated Handshakes (1)" in digest
    assert "darwin" in digest
    assert "knox" in digest


@pytest.mark.asyncio
async def test_digest_surfaces_q2_low_confidence_sample(_pool_injected):
    """Q2 agent + success event with confidence<0.85 appears in section 3."""
    schema, pool = _pool_injected
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE agent_registry SET lifecycle_state='q2_high_confidence' "
            "WHERE agent_name='knox'"
        )
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status, confidence,
                  input_payload)
               VALUES ('knox', 'extract', '_tool', 'institution:42',
                       'success', 0.50::NUMERIC, '{}'::JSONB)"""
        )

    digest = await build_digest(since_hours=24)
    assert "## 3. Q2 Exception Samples" in digest
    assert "knox" in digest
    # Confidence label renders as 0.50
    assert "conf=0.50" in digest


@pytest.mark.asyncio
async def test_digest_respects_time_window(_pool_injected):
    """Rows outside the window do NOT appear — guards against stale bleed-through."""
    schema, pool = _pool_injected
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_events
                 (agent_name, action, tool_name, entity, status, input_payload,
                  created_at)
               VALUES ('knox', 'improve', '_agent_base', '_improve',
                       'improve_rejected',
                       '{"reason":"old_reject"}'::JSONB,
                       NOW() - INTERVAL '48 hours')"""
        )

    digest = await build_digest(since_hours=24)
    assert "old_reject" not in digest
    # Section header stays; count is zero.
    assert "## 1. Improve Rejected (0)" in digest
