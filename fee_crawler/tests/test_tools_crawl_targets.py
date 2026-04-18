"""Schema tests for crawl_targets agent tools."""
import pytest
from pydantic import ValidationError

from fee_crawler.agent_tools.schemas import UpdateCrawlTargetRescueStateInput


def test_rescue_status_accepts_valid_values():
    for s in ("pending", "rescued", "dead", "needs_human", "retry_after"):
        inp = UpdateCrawlTargetRescueStateInput(crawl_target_id=1, rescue_status=s)
        assert inp.rescue_status == s


def test_rescue_status_rejects_invalid_value():
    with pytest.raises(ValidationError):
        UpdateCrawlTargetRescueStateInput(crawl_target_id=1, rescue_status="banana")


def test_crawl_target_id_must_be_positive():
    with pytest.raises(ValidationError):
        UpdateCrawlTargetRescueStateInput(crawl_target_id=0, rescue_status="pending")
