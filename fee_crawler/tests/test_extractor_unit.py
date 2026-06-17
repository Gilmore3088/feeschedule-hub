"""Pure unit tests for the extractor agent — no DB, no network, no LLM."""
import asyncio
from dataclasses import dataclass
from unittest.mock import AsyncMock, patch

import pytest

from fee_crawler.agents.extractor import (
    AGENT_NAME,
    BatchResult,
    DEFAULT,
    ExtractorConfig,
)
from fee_crawler.agents.extractor.orchestrator import (
    _Target,
    _fee_to_dict,
    extract_batch,
)


def test_agent_name_is_stable():
    assert AGENT_NAME == "extractor"


def test_default_config_recrawl_window():
    assert DEFAULT.recrawl_after_days == 30
    assert DEFAULT.document_type is None
    assert DEFAULT.include_failing is False


def test_config_is_frozen():
    with pytest.raises(Exception):
        DEFAULT.recrawl_after_days = 1  # type: ignore[misc]


def test_batch_result_to_dict_shape():
    r = BatchResult(processed=5, fees_written=12, cost_usd=0.4567)
    d = r.to_dict()
    assert d["processed"] == 5
    assert d["fees_written"] == 12
    assert d["cost_usd"] == 0.4567
    assert d["failed"] == 0


def test_fee_to_dict_handles_dict_passthrough():
    fee = {"fee_name": "NSF", "amount": 35.0, "frequency": "per occurrence"}
    assert _fee_to_dict(fee) == fee


def test_fee_to_dict_handles_dataclass_like():
    @dataclass
    class FakeExtracted:
        fee_name: str = "Monthly Maintenance"
        amount: float = 12.0
        frequency: str = "monthly"
        conditions: str = ""
        extraction_confidence: float = 0.91

    out = _fee_to_dict(FakeExtracted())
    assert out["fee_name"] == "Monthly Maintenance"
    assert out["amount"] == 12.0
    assert out["confidence"] == 0.91


def test_extract_batch_with_no_candidates_returns_empty_result():
    """Empty selection short-circuits without touching the LLM or download."""
    fake_conn = AsyncMock()

    async def run():
        with patch(
            "fee_crawler.agents.extractor.orchestrator.select_candidates",
            new=AsyncMock(return_value=[]),
        ), patch("fee_crawler.config.load_config", return_value=object()):
            return await extract_batch(fake_conn, size=10)

    result = asyncio.run(run())
    assert result.processed == 0
    assert result.fees_written == 0
    assert result.failed == 0


def test_extract_batch_emits_events_per_target():
    """Single target with mocked extraction → one full event sequence."""
    fake_conn = AsyncMock()
    target = _Target(
        id=42,
        fee_schedule_url="https://example.com/fees.pdf",
        institution_name="Example Bank",
        charter_type="bank",
        document_type="pdf",
        last_content_hash=None,
    )

    events = []

    async def collect(ev):
        events.append(ev)

    async def fake_extract_target(t, _cfg):
        return {
            "fees": [
                {"fee_name": "NSF", "amount": 35.0, "frequency": "per occurrence"},
                {"fee_name": "Overdraft", "amount": 36.0},
            ],
            "document_type": "pdf",
            "content_hash": "abc123",
            "unchanged": False,
            "error": None,
        }

    async def fake_write(*a, **kw):
        return 2

    async def run():
        with patch(
            "fee_crawler.agents.extractor.orchestrator.select_candidates",
            new=AsyncMock(return_value=[target]),
        ), patch(
            "fee_crawler.agents.extractor.orchestrator._extract_target",
            new=fake_extract_target,
        ), patch(
            "fee_crawler.agents.extractor.orchestrator._write_via_gateway",
            new=fake_write,
        ), patch("fee_crawler.config.load_config", return_value=object()):
            cfg = ExtractorConfig(inter_target_delay_seconds=0)
            return await extract_batch(fake_conn, size=1, config=cfg, on_event=collect)

    result = asyncio.run(run())
    assert result.processed == 1
    assert result.extracted == 1
    assert result.fees_written == 2
    types = [e["type"] for e in events]
    assert "candidates_selected" in types
    assert "target_start" in types
    assert "target_done" in types
    assert "done" in types


def test_extract_batch_unchanged_short_circuits():
    fake_conn = AsyncMock()
    target = _Target(
        id=1, fee_schedule_url="x", institution_name="x",
        charter_type="bank", document_type="pdf", last_content_hash="prev",
    )

    async def fake_extract_target(t, _cfg):
        return {
            "fees": [], "document_type": "pdf",
            "content_hash": "prev", "unchanged": True, "error": None,
        }

    async def run():
        with patch(
            "fee_crawler.agents.extractor.orchestrator.select_candidates",
            new=AsyncMock(return_value=[target]),
        ), patch(
            "fee_crawler.agents.extractor.orchestrator._extract_target",
            new=fake_extract_target,
        ), patch("fee_crawler.config.load_config", return_value=object()):
            cfg = ExtractorConfig(inter_target_delay_seconds=0)
            return await extract_batch(fake_conn, size=1, config=cfg)

    result = asyncio.run(run())
    assert result.unchanged == 1
    assert result.fees_written == 0


def test_extract_batch_records_failures_without_raising():
    fake_conn = AsyncMock()
    target = _Target(
        id=1, fee_schedule_url="x", institution_name="x",
        charter_type="bank", document_type="pdf", last_content_hash=None,
    )

    async def fake_extract_target(t, _cfg):
        return {
            "fees": [], "document_type": "pdf",
            "content_hash": None, "unchanged": False, "error": "download_failed",
        }

    async def run():
        with patch(
            "fee_crawler.agents.extractor.orchestrator.select_candidates",
            new=AsyncMock(return_value=[target]),
        ), patch(
            "fee_crawler.agents.extractor.orchestrator._extract_target",
            new=fake_extract_target,
        ), patch("fee_crawler.config.load_config", return_value=object()):
            cfg = ExtractorConfig(inter_target_delay_seconds=0)
            return await extract_batch(fake_conn, size=1, config=cfg)

    result = asyncio.run(run())
    assert result.failed == 1
    assert result.fees_written == 0
