"""LOOP-07 adversarial gate contract tests.

Coverage map:
    * test_no_canary_corpus_rejects           -> D-07 floor (missing corpus)
    * test_canary_pass_commits                -> D-07 floor happy path
    * test_canary_regression_rejects          -> D-07 floor (negative delta)
    * test_peer_accept_commits                -> D-07 ceiling happy path
    * test_peer_timeout_rejects               -> D-07 ceiling (no reply)
    * test_peer_reject_rejects                -> D-07 ceiling (explicit reject)
    * test_digest_query_surfaces_rejected     -> D-08 digest discoverability
    * test_improve_bypasses_commit_on_reject  -> regression guard on base.py

The ``db_schema`` fixture from conftest applies every migration against a
per-test schema. Tests wire the per-schema pool into the
``fee_crawler.agent_tools.pool`` singleton so ``run_canary``, ``send_message``,
``queue_improve_rejected``, and ``default_improve_commit`` all hit the isolated
database.
"""

from __future__ import annotations

import json
import tempfile
import uuid
from pathlib import Path

import pytest

from fee_crawler.agent_base import AgentBase
from fee_crawler.agent_base.adversarial_gate import (
    GateVerdict,
    default_corpus_loader,
    queue_improve_rejected,
    run_gate,
)
from fee_crawler.agent_messaging.publisher import send_message
from fee_crawler.agent_tools.context import with_agent_context
from fee_crawler.testing.canary_runner import run_canary
from fee_crawler.testing.canary_schema import CanaryCorpus, CanaryExpectation


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _write_corpus(version: str) -> str:
    """Write a minimal single-institution CanaryCorpus JSON; return its path."""
    corpus = CanaryCorpus(
        version=version,
        description="LOOP-07 gate test corpus",
        expectations=[CanaryExpectation(institution_id=1)],
    )
    fh = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
    fh.write(corpus.model_dump_json())
    fh.close()
    return fh.name


@pytest.fixture
def _pool_injected(db_schema):
    """Bind the per-test schema pool into the agent_tools singleton.

    Same pattern as ``test_agent_messaging.py::_bind_pool`` and
    ``test_agent_base_auto_wrap.py::_pool_injected``. Restores the previous
    singleton on teardown so test ordering does not leak state.
    """
    from fee_crawler.agent_tools import pool as pool_mod

    schema, pool = db_schema
    previous = pool_mod._pool
    pool_mod._pool = pool
    try:
        yield schema, pool
    finally:
        pool_mod._pool = previous


async def _passing_runner(institution_id: int) -> dict:
    """High baseline metrics — passes canary regression by construction."""
    return {"coverage": 1.0, "confidence_mean": 0.9, "extraction_count": 10}


async def _regressed_runner(institution_id: int) -> dict:
    """Lower-than-baseline metrics — triggers canary_regression."""
    return {"coverage": 0.5, "confidence_mean": 0.5, "extraction_count": 1}


# Distinct agent_name per test class to prevent canary baseline cross-talk —
# ``(agent_name, corpus_version)`` is the baseline key in canary_runs.


class _PassingAgent(AgentBase):
    agent_name = "knox"
    canary_corpus_path = None  # set per-test

    async def run_turn(self):  # pragma: no cover — not exercised here
        return None

    async def review(self):  # pragma: no cover
        return None

    async def _canary_run_institution(self, institution_id: int) -> dict:
        return await _passing_runner(institution_id)


class _RegressedAgent(AgentBase):
    agent_name = "darwin"
    canary_corpus_path = None

    async def run_turn(self):  # pragma: no cover
        return None

    async def review(self):  # pragma: no cover
        return None

    async def _canary_run_institution(self, institution_id: int) -> dict:
        return await _regressed_runner(institution_id)


# ---------------------------------------------------------------------------
# D-07 floor: canary regression gate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_canary_corpus_rejects(_pool_injected):
    """No canary_corpus_path -> improve_rejected reason='no_canary_corpus'."""
    _, pool = _pool_injected
    agent = _PassingAgent()
    agent.canary_corpus_path = None

    with with_agent_context(agent_name=agent.agent_name):
        await agent.improve({"name": "missing_corpus_lesson"})

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT status, input_payload::TEXT AS payload
                 FROM agent_events
                WHERE agent_name = $1
                  AND action = 'improve'
                  AND status = 'improve_rejected'
                  AND input_payload::text ILIKE '%missing_corpus_lesson%'
                ORDER BY created_at DESC LIMIT 1""",
            agent.agent_name,
        )
    assert row is not None, "no improve_rejected row written"
    payload = json.loads(row["payload"])
    assert payload["reason"] == "no_canary_corpus"
    assert payload["lesson"]["name"] == "missing_corpus_lesson"


@pytest.mark.asyncio
async def test_canary_pass_commits(_pool_injected):
    """Passing canary -> default_improve_commit runs; status='success'."""
    _, pool = _pool_injected
    corpus_path = _write_corpus("pass_v1")

    # Seed a baseline run so the second run has something to compare against.
    corpus = default_corpus_loader(corpus_path)
    await run_canary("knox", corpus, _passing_runner)

    agent = _PassingAgent()
    agent.canary_corpus_path = corpus_path
    lesson_name = f"pass_{uuid.uuid4().hex[:8]}"

    with with_agent_context(agent_name=agent.agent_name):
        await agent.improve({"name": lesson_name})

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT status FROM agent_events
                WHERE agent_name = 'knox'
                  AND action = 'improve'
                  AND input_payload::text ILIKE $1
                ORDER BY created_at DESC LIMIT 1""",
            f"%{lesson_name}%",
        )
    assert row is not None, "no improve row written"
    assert row["status"] == "success"


@pytest.mark.asyncio
async def test_canary_regression_rejects(_pool_injected):
    """Negative delta vs. baseline -> improve_rejected reason='canary_regression'."""
    _, pool = _pool_injected
    corpus_path = _write_corpus("regress_v1")

    # Baseline: high metrics for "darwin".
    corpus = default_corpus_loader(corpus_path)
    await run_canary("darwin", corpus, _passing_runner)

    # Now run the agent whose canary returns degraded metrics.
    agent = _RegressedAgent()
    agent.canary_corpus_path = corpus_path
    lesson_name = f"regress_{uuid.uuid4().hex[:8]}"

    with with_agent_context(agent_name=agent.agent_name):
        await agent.improve({"name": lesson_name})

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT status, input_payload::TEXT AS payload
                 FROM agent_events
                WHERE agent_name = 'darwin'
                  AND action = 'improve'
                  AND status = 'improve_rejected'
                  AND input_payload::text ILIKE $1
                ORDER BY created_at DESC LIMIT 1""",
            f"%{lesson_name}%",
        )
    assert row is not None
    payload = json.loads(row["payload"])
    assert payload["reason"] == "canary_regression"
    # Verdict payload surfaces the three deltas for the digest.
    verdict = payload["verdict"]
    assert verdict is not None
    assert verdict["coverage_delta"] is not None
    assert verdict["coverage_delta"] < 0


# ---------------------------------------------------------------------------
# D-07 ceiling: peer challenge
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_peer_accept_commits(_pool_injected):
    """Peer sends 'accept' on the seeded correlation_id -> gate passes."""
    _, pool = _pool_injected
    corpus_path = _write_corpus("peer_pass_v1")
    corpus = default_corpus_loader(corpus_path)
    await run_canary("knox", corpus, _passing_runner)

    # Pre-seed an 'accept' reply from darwin->knox BEFORE calling the gate.
    # The gate polls on this exact correlation_id so no wait is needed.
    corr = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_messages
                 (sender_agent, recipient_agent, intent, correlation_id,
                  payload, round_number)
               VALUES ('darwin', 'knox', 'accept', $1::UUID,
                       '{"summary":"pre-seeded"}'::JSONB, 2)""",
            corr,
        )

    lesson = {
        "name": "peer_accept_lesson",
        "peer_challenge_recipient": "darwin",
    }
    verdict = await run_gate(
        agent_name="knox",
        lesson=lesson,
        canary_corpus_path=corpus_path,
        canary_runner_fn=run_canary,
        corpus_loader=default_corpus_loader,
        agent_runner=_passing_runner,
        send_message_fn=send_message,
        peer_wait_seconds=5,
        correlation_id=corr,
    )
    assert verdict.passed is True, f"expected pass; got reason={verdict.reason}"
    assert verdict.reason == "ok"


@pytest.mark.asyncio
async def test_peer_timeout_rejects(_pool_injected):
    """No peer reply within the wait budget -> peer_rejected_or_timeout."""
    _, pool = _pool_injected
    corpus_path = _write_corpus("peer_timeout_v1")
    corpus = default_corpus_loader(corpus_path)
    await run_canary("knox", corpus, _passing_runner)

    lesson = {
        "name": "peer_timeout_lesson",
        "peer_challenge_recipient": "darwin",
    }
    verdict = await run_gate(
        agent_name="knox",
        lesson=lesson,
        canary_corpus_path=corpus_path,
        canary_runner_fn=run_canary,
        corpus_loader=default_corpus_loader,
        agent_runner=_passing_runner,
        send_message_fn=send_message,
        peer_wait_seconds=2,
    )
    assert verdict.passed is False
    assert verdict.reason == "peer_rejected_or_timeout"
    assert verdict.verdict_payload is not None
    assert verdict.verdict_payload["peer"] == "darwin"


@pytest.mark.asyncio
async def test_peer_reject_rejects(_pool_injected):
    """Peer sends an explicit 'reject' -> gate fails with peer_rejected_or_timeout."""
    _, pool = _pool_injected
    corpus_path = _write_corpus("peer_reject_v1")
    corpus = default_corpus_loader(corpus_path)
    await run_canary("knox", corpus, _passing_runner)

    corr = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO agent_messages
                 (sender_agent, recipient_agent, intent, correlation_id,
                  payload, round_number)
               VALUES ('darwin', 'knox', 'reject', $1::UUID,
                       '{"reason":"disagree"}'::JSONB, 2)""",
            corr,
        )

    lesson = {
        "name": "peer_reject_lesson",
        "peer_challenge_recipient": "darwin",
    }
    verdict = await run_gate(
        agent_name="knox",
        lesson=lesson,
        canary_corpus_path=corpus_path,
        canary_runner_fn=run_canary,
        corpus_loader=default_corpus_loader,
        agent_runner=_passing_runner,
        send_message_fn=send_message,
        peer_wait_seconds=5,
        correlation_id=corr,
    )
    assert verdict.passed is False
    assert verdict.reason == "peer_rejected_or_timeout"


# ---------------------------------------------------------------------------
# D-08: digest query surfaces improve_rejected rows
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_digest_query_surfaces_rejected(_pool_injected):
    """Digest SQL returns rows written via queue_improve_rejected within 24h."""
    _, pool = _pool_injected

    verdict = GateVerdict(
        passed=False,
        reason="no_canary_corpus",
        verdict_payload=None,
    )
    with with_agent_context(agent_name="knox"):
        await queue_improve_rejected("knox", {"name": "digest_seed"}, verdict)

    async with pool.acquire() as conn:
        count = await conn.fetchval(
            """SELECT COUNT(*) FROM agent_events
                WHERE status = 'improve_rejected'
                  AND created_at > NOW() - INTERVAL '24 hours'"""
        )
    assert count >= 1


# ---------------------------------------------------------------------------
# Regression: AgentBase.improve MUST NOT call default_improve_commit on reject
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_improve_bypasses_commit_on_reject(_pool_injected):
    """Rejected IMPROVE writes improve_rejected and NO 'success' row for the lesson.

    Guards T-62B-07-01 (repudiation): a failed lesson must never appear as an
    applied change in the agent_events ledger.
    """
    _, pool = _pool_injected
    agent = _PassingAgent()
    agent.canary_corpus_path = None
    lesson_name = f"bypass_{uuid.uuid4().hex[:8]}"

    with with_agent_context(agent_name=agent.agent_name):
        await agent.improve({"name": lesson_name})

    async with pool.acquire() as conn:
        success_count = await conn.fetchval(
            """SELECT COUNT(*) FROM agent_events
                WHERE agent_name = 'knox'
                  AND action = 'improve'
                  AND status = 'success'
                  AND input_payload::text ILIKE $1""",
            f"%{lesson_name}%",
        )
        rejected_count = await conn.fetchval(
            """SELECT COUNT(*) FROM agent_events
                WHERE agent_name = 'knox'
                  AND action = 'improve'
                  AND status = 'improve_rejected'
                  AND input_payload::text ILIKE $1""",
            f"%{lesson_name}%",
        )
    assert success_count == 0, "rejected IMPROVE leaked through to commit"
    assert rejected_count == 1, "expected exactly one improve_rejected row"
