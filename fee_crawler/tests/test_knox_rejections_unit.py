"""Knox rejection summarizer — unit tests with mocked conn.

Verifies Q-06: the summarizer queries agent_messages, aggregates
reasons, and shapes the result for both agent_lessons write and
the MCP read tool. No DB, no LLM.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

from fee_crawler.agents.knox.rejections import (
    AGENT_NAME,
    LESSON_NAME,
    RejectionSummary,
    SUMMARY_MARKER,
    maybe_run_weekly_summary,
    summarize_recent_rejections,
)


def test_constants_are_stable():
    assert AGENT_NAME == "knox"
    assert LESSON_NAME == "rejection_themes"
    assert SUMMARY_MARKER == "knox_rejection_summary"


def test_summarize_empty_window_returns_zeros_without_writing():
    """No rejections in window → returns zeros, doesn't write lesson."""
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value={"total": 0, "distinct_fees": 0})
    conn.fetch = AsyncMock(return_value=[])
    conn.execute = AsyncMock()
    conn.fetchval = AsyncMock()

    async def run():
        return await summarize_recent_rejections(
            conn, days=7, top_n=10, write_lesson=True,
        )

    s = asyncio.run(run())
    assert s.total_rejections == 0
    assert s.distinct_institutions == 0
    assert s.top_reasons == []
    # When there are no rejections, write_lesson=True still writes the
    # summary row (operator wants to see "0 rejections this week" too).
    assert conn.execute.await_count == 1   # the agent_events insert
    assert conn.fetchval.await_count == 1  # the agent_lessons upsert


def test_summarize_aggregates_and_returns_top_n():
    """With rejections present, return summary including top reasons sorted."""
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value={"total": 42, "distinct_fees": 31})
    conn.fetch = AsyncMock(return_value=[
        {"reason": "low_confidence", "n": 18},
        {"reason": "amount_above_ceiling", "n": 12},
        {"reason": "duplicate_in_institution", "n": 7},
    ])
    conn.execute = AsyncMock()
    conn.fetchval = AsyncMock(return_value=99)

    async def run():
        return await summarize_recent_rejections(
            conn, days=7, top_n=10, write_lesson=True,
        )

    s = asyncio.run(run())
    assert s.total_rejections == 42
    assert s.distinct_institutions == 31
    assert s.lesson_id == 99
    assert len(s.top_reasons) == 3
    assert s.top_reasons[0] == {"reason": "low_confidence", "count": 18}


def test_summarize_skips_lesson_write_when_disabled():
    """MCP tool path uses write_lesson=False — must not touch the DB
    for writes (so external clients can't accidentally mutate state)."""
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value={"total": 10, "distinct_fees": 5})
    conn.fetch = AsyncMock(return_value=[{"reason": "x", "n": 5}])
    conn.execute = AsyncMock()
    conn.fetchval = AsyncMock()

    async def run():
        return await summarize_recent_rejections(
            conn, days=3, top_n=5, write_lesson=False,
        )

    s = asyncio.run(run())
    assert s.total_rejections == 10
    assert s.window_days == 3
    # Read-only path: no execute, no fetchval
    conn.execute.assert_not_awaited()
    conn.fetchval.assert_not_awaited()


def test_maybe_run_weekly_summary_skips_when_recent():
    """If a marker row exists within the last 23 hours, skip the run."""
    conn = AsyncMock()
    recent = datetime.now(timezone.utc) - timedelta(hours=2)
    conn.fetchrow = AsyncMock(return_value={"completed_at": recent})

    async def run():
        return await maybe_run_weekly_summary(conn)

    out = asyncio.run(run())
    assert out is None
    # Only the marker-check fetchrow was called
    assert conn.fetchrow.await_count == 1


def test_maybe_run_weekly_summary_executes_when_stale():
    """If marker is missing or > 23h old, run the summarizer + write marker."""
    conn = AsyncMock()
    # marker check returns None (never run)
    # then summarize() will call fetchrow once + fetch once
    # then maybe_run_weekly_summary calls execute to write the marker
    calls = {"i": 0}

    async def fake_fetchrow(_sql, *_args):
        calls["i"] += 1
        if calls["i"] == 1:
            return None    # marker check: never run
        return {"total": 5, "distinct_fees": 3}   # summarizer aggregate

    conn.fetchrow = fake_fetchrow
    conn.fetch = AsyncMock(return_value=[{"reason": "x", "n": 5}])
    conn.execute = AsyncMock()
    conn.fetchval = AsyncMock(return_value=42)

    async def run():
        return await maybe_run_weekly_summary(conn)

    out = asyncio.run(run())
    assert out is not None
    assert isinstance(out, RejectionSummary)
    assert out.total_rejections == 5
    # execute was called at least twice: agent_events + workers_last_run upsert
    assert conn.execute.await_count >= 2
