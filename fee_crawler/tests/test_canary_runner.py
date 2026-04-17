"""canary_runner integration tests (D-20 + LOOP-07).

Covers:
  - First run per (agent_name, corpus_version) is marked is_baseline=true.
  - Regression run (negative delta) writes status='failed'.
  - Passing run (metrics equal to baseline) writes status='passed'.
  - Baseline reference linking works via baseline_run_id FK.

All tests require DATABASE_URL_TEST (skipped via conftest.db_schema fixture
if unavailable).
"""

from __future__ import annotations

import pytest

from fee_crawler.testing.canary_runner import run_canary
from fee_crawler.testing.canary_schema import CanaryCorpus, CanaryExpectation


def _corpus(version: str = "v1") -> CanaryCorpus:
    return CanaryCorpus(
        version=version,
        description="smoke",
        expectations=[CanaryExpectation(institution_id=1)],
    )


@pytest.mark.asyncio
async def test_first_run_is_baseline(db_schema):
    """First run per (agent, corpus_version) lands with is_baseline=true."""
    schema, pool = db_schema

    async def runner(inst: int) -> dict:
        return {"coverage": 1.0, "confidence_mean": 0.9, "extraction_count": 10}

    verdict = await run_canary("knox", _corpus(), runner, pool=pool)
    assert verdict.passed is True
    assert verdict.coverage == 1.0
    assert verdict.confidence_mean == 0.9
    assert verdict.extraction_count == 10
    # Baseline run has no deltas yet.
    assert verdict.coverage_delta is None
    assert verdict.confidence_delta is None
    assert verdict.extraction_count_delta is None

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT is_baseline, status, baseline_run_id FROM canary_runs "
            "WHERE agent_name = 'knox' ORDER BY started_at DESC LIMIT 1"
        )
    assert row is not None
    assert row["is_baseline"] is True
    assert row["status"] == "passed"
    assert row["baseline_run_id"] is None


@pytest.mark.asyncio
async def test_regression_fails_and_records_deltas(db_schema):
    """Negative delta vs. baseline writes status='failed' and CanaryVerdict.passed=False."""
    schema, pool = db_schema

    async def baseline_runner(inst: int) -> dict:
        return {"coverage": 1.0, "confidence_mean": 0.9, "extraction_count": 10}

    async def regressed_runner(inst: int) -> dict:
        return {"coverage": 0.8, "confidence_mean": 0.9, "extraction_count": 10}

    await run_canary("knox", _corpus(), baseline_runner, pool=pool)
    verdict = await run_canary("knox", _corpus(), regressed_runner, pool=pool)

    assert verdict.passed is False
    assert verdict.coverage_delta is not None
    assert verdict.coverage_delta < 0
    assert verdict.confidence_delta == 0.0
    assert verdict.extraction_count_delta == 0
    assert "regression" in (verdict.reason or "")

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status, is_baseline, baseline_run_id FROM canary_runs "
            "WHERE agent_name = 'knox' ORDER BY started_at DESC LIMIT 1"
        )
    assert row["status"] == "failed"
    assert row["is_baseline"] is False
    assert row["baseline_run_id"] is not None


@pytest.mark.asyncio
async def test_pass_meets_baseline(db_schema):
    """Metrics equal to baseline produce status='passed' + passed=True."""
    schema, pool = db_schema

    async def runner(inst: int) -> dict:
        return {"coverage": 1.0, "confidence_mean": 0.9, "extraction_count": 10}

    await run_canary("knox", _corpus(), runner, pool=pool)
    verdict = await run_canary("knox", _corpus(), runner, pool=pool)

    assert verdict.passed is True
    assert verdict.coverage_delta == 0.0
    assert verdict.confidence_delta == 0.0
    assert verdict.extraction_count_delta == 0

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status, is_baseline FROM canary_runs "
            "WHERE agent_name = 'knox' ORDER BY started_at DESC LIMIT 1"
        )
    assert row["status"] == "passed"
    assert row["is_baseline"] is False


@pytest.mark.asyncio
async def test_improvement_passes(db_schema):
    """Positive deltas (every metric up) still pass."""
    schema, pool = db_schema

    async def baseline_runner(inst: int) -> dict:
        return {"coverage": 0.8, "confidence_mean": 0.85, "extraction_count": 8}

    async def better_runner(inst: int) -> dict:
        return {"coverage": 0.95, "confidence_mean": 0.90, "extraction_count": 10}

    await run_canary("knox", _corpus(), baseline_runner, pool=pool)
    verdict = await run_canary("knox", _corpus(), better_runner, pool=pool)

    assert verdict.passed is True
    assert verdict.coverage_delta is not None and verdict.coverage_delta > 0
    assert verdict.confidence_delta is not None and verdict.confidence_delta > 0
    assert verdict.extraction_count_delta == 2
