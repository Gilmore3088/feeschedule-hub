"""Darwin integration tests — real Postgres, mocked Anthropic."""
from __future__ import annotations

import asyncio
import pytest
from unittest.mock import AsyncMock, patch

from fee_crawler.agents.darwin import classify_batch, BatchResult
from fee_crawler.agents.darwin.config import DarwinConfig


@pytest.mark.asyncio
async def test_select_candidates_skips_promoted(seeded_conn):
    from fee_crawler.agents.darwin.orchestrator import select_candidates
    result = await select_candidates(seeded_conn, limit=100)
    assert len(result) == 7  # only unpromoted


@pytest.mark.asyncio
async def test_classify_batch_happy_path(seeded_conn):
    def fake_classifications(names):
        key = "monthly_maintenance"
        return [
            {"fee_name": n, "canonical_fee_key": key, "confidence": 0.95}
            for n in names
        ]

    with patch(
        "fee_crawler.agents.darwin.classifier._call_anthropic",
        new=AsyncMock(side_effect=lambda names, cfg: fake_classifications(names)),
    ):
        result: BatchResult = await classify_batch(seeded_conn, size=50)

    assert result.promoted >= 1
    assert result.failures == 0
    assert not result.circuit_tripped


@pytest.mark.asyncio
async def test_classify_batch_cache_reuse(seeded_conn):
    from fee_crawler.agents.darwin.classifier import _call_anthropic

    with patch(
        "fee_crawler.agents.darwin.classifier._call_anthropic",
        new=AsyncMock(return_value=[]),
    ) as mock:
        await classify_batch(seeded_conn, size=10)
        first_calls = mock.call_count
        await classify_batch(seeded_conn, size=10)
        second_calls = mock.call_count
        assert second_calls == first_calls


@pytest.mark.asyncio
async def test_classify_batch_low_confidence_caches_only(seeded_conn):
    def low_conf(names):
        return [
            {"fee_name": n, "canonical_fee_key": "monthly_maintenance", "confidence": 0.70}
            for n in names
        ]

    with patch(
        "fee_crawler.agents.darwin.classifier._call_anthropic",
        new=AsyncMock(side_effect=lambda names, cfg: low_conf(names)),
    ):
        result = await classify_batch(seeded_conn, size=10)
    assert result.promoted == 0
    assert result.cached_low_conf >= 1


@pytest.mark.asyncio
async def test_classify_batch_never_merge_rejected(seeded_conn_nsf):
    def wrong(names):
        return [
            {"fee_name": n, "canonical_fee_key": "overdraft", "confidence": 0.99}
            for n in names
        ]

    with patch(
        "fee_crawler.agents.darwin.classifier._call_anthropic",
        new=AsyncMock(side_effect=lambda names, cfg: wrong(names)),
    ):
        result = await classify_batch(seeded_conn_nsf, size=5)
    assert result.rejected >= 1
    assert result.promoted == 0


@pytest.mark.asyncio
async def test_classify_batch_circuit_trips_on_consecutive_failures(seeded_conn):
    import anthropic

    async def fail(names, cfg):
        raise anthropic.RateLimitError(
            message="rate limited",
            response=type("R", (), {"headers": {}})(),
            body=None,
        )

    config = DarwinConfig(max_retries=0, consecutive_failures_to_halt=2)
    with patch(
        "fee_crawler.agents.darwin.classifier._call_anthropic",
        new=AsyncMock(side_effect=fail),
    ):
        result = await classify_batch(seeded_conn, size=5, config=config)
    assert result.circuit_tripped is True
