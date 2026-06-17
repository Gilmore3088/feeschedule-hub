"""Pipeline health unit tests (R-01).

Mocked asyncpg conn — no DB. Verifies the staleness threshold logic,
the dedupe behavior, and the alert emission shape.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

from fee_crawler.agent_base.pipeline_health import (
    AGENT_NAME,
    ALERT_DEDUPE_HOURS,
    DEFAULT_STALE_THRESHOLD_HOURS,
    EXPECTED_JOBS,
    check_pipeline_health,
)


def test_constants_are_stable():
    assert AGENT_NAME == "atlas"
    assert ALERT_DEDUPE_HOURS == 6
    assert DEFAULT_STALE_THRESHOLD_HOURS == 26


def test_expected_jobs_inventory_present():
    """The inventory must include the critical cron crew at minimum."""
    names = {n for n, _ in EXPECTED_JOBS}
    must_have = {
        "daily_pipeline", "magellan_rescue", "knox_review",
        "darwin_drain", "publish_index", "run_discovery",
        "run_pdf_extraction", "run_browser_extraction",
    }
    assert must_have.issubset(names)


def test_all_fresh_emits_no_alerts():
    """When every job has completed recently, no alert rows are written."""
    now = datetime.now(timezone.utc)
    rows = [
        {"job_name": name, "completed_at": now - timedelta(hours=1)}
        for name, _ in EXPECTED_JOBS
    ]
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=rows)
    conn.fetchrow = AsyncMock(return_value=None)
    conn.execute = AsyncMock()

    res = asyncio.run(check_pipeline_health(conn))
    assert res.checked == len(EXPECTED_JOBS)
    assert res.fresh == len(EXPECTED_JOBS)
    assert res.stale == 0
    assert res.alerts_emitted == 0
    conn.execute.assert_not_awaited()


def test_missing_marker_treated_as_stale():
    """A job that never wrote a marker is stale (last_completed_at NULL)."""
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=[])    # empty workers_last_run
    conn.fetchrow = AsyncMock(return_value=None)
    conn.execute = AsyncMock()

    res = asyncio.run(check_pipeline_health(conn))
    assert res.stale == len(EXPECTED_JOBS)
    assert res.alerts_emitted == len(EXPECTED_JOBS)
    assert conn.execute.await_count == len(EXPECTED_JOBS)


def test_dedupe_suppresses_recent_alerts():
    """If a recent (within ALERT_DEDUPE_HOURS) alert exists for the
    same job_name, we skip emitting a new one — operator is already
    aware. Only the first alert in an outage window lands."""
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=[])    # nothing fresh
    conn.fetchrow = AsyncMock(return_value={"1": 1})  # recent alert exists
    conn.execute = AsyncMock()

    res = asyncio.run(check_pipeline_health(conn))
    assert res.stale == len(EXPECTED_JOBS)
    assert res.alerts_emitted == 0
    assert res.alerts_suppressed_dedupe == len(EXPECTED_JOBS)
    conn.execute.assert_not_awaited()


def test_per_job_threshold_respected():
    """A job with a 168h threshold (weekly) is fresh at 100h old, even
    though a 26h-threshold job would be stale."""
    now = datetime.now(timezone.utc)

    # All jobs completed 100 hours ago. Daily jobs (26h) → stale.
    # The weekly knox_rejection_summary (168h) → fresh.
    rows = [
        {"job_name": name, "completed_at": now - timedelta(hours=100)}
        for name, _ in EXPECTED_JOBS
    ]
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=rows)
    conn.fetchrow = AsyncMock(return_value=None)
    conn.execute = AsyncMock()

    res = asyncio.run(check_pipeline_health(conn))

    # Find counts of jobs whose threshold is 26h vs >100h
    daily = sum(1 for _, th in EXPECTED_JOBS if th <= 100)
    weekly_or_more = sum(1 for _, th in EXPECTED_JOBS if th > 100)
    assert res.stale == daily
    assert res.fresh == weekly_or_more
