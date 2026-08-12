from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

from fee_crawler.ai_usage import EmergencyStopActive, tracked_anthropic_call


def test_tracked_call_records_provider_tokens():
    response = SimpleNamespace(
        usage=SimpleNamespace(
            input_tokens=120,
            output_tokens=30,
            cache_read_input_tokens=0,
            cache_creation_input_tokens=0,
        )
    )
    api_call = Mock(return_value=response)

    with patch("fee_crawler.ai_usage.assert_automation_enabled"), patch(
        "fee_crawler.ai_usage.record_api_usage"
    ) as record:
        result = tracked_anthropic_call(
            api_call,
            agent_name="darwin",
            operation="classify",
            model="claude-haiku-4-5",
            max_tokens=100,
        )

    assert result is response
    api_call.assert_called_once_with(model="claude-haiku-4-5", max_tokens=100)
    assert record.call_args.kwargs["status"] == "completed"
    assert record.call_args.kwargs["usage"] is response.usage


def test_tracked_call_never_reaches_provider_while_stopped():
    api_call = Mock()
    with patch(
        "fee_crawler.ai_usage.assert_automation_enabled",
        side_effect=EmergencyStopActive("stop active"),
    ), patch("fee_crawler.ai_usage.record_api_usage") as record:
        with pytest.raises(EmergencyStopActive):
            tracked_anthropic_call(
                api_call,
                agent_name="hamilton",
                operation="report",
                model="claude-sonnet-4",
            )

    api_call.assert_not_called()
    assert record.call_args.kwargs["status"] == "blocked"


def test_tracked_call_blocks_after_credit_failure_since_resume():
    api_call = Mock()

    with patch("fee_crawler.ai_usage.assert_automation_enabled"), patch(
        "fee_crawler.ai_usage._assert_no_credit_failure_since_resume",
        side_effect=EmergencyStopActive("credit outage active"),
    ), patch("fee_crawler.ai_usage.record_api_usage") as record:
        with pytest.raises(EmergencyStopActive):
            tracked_anthropic_call(
                api_call,
                agent_name="extractor",
                operation="extract_fee_chunk",
                model="claude-sonnet-4-5",
            )

    api_call.assert_not_called()
    assert record.call_args.kwargs["status"] == "blocked"


def test_tracked_call_engages_stop_on_credit_exhaustion():
    api_call = Mock(
        side_effect=RuntimeError(
            "Your credit balance is too low to access the Anthropic API. "
            "Please go to Plans & Billing to purchase credits."
        )
    )

    with patch("fee_crawler.ai_usage.assert_automation_enabled"), patch(
        "fee_crawler.ai_usage.record_api_usage"
    ) as record, patch(
        "fee_crawler.ai_usage._engage_emergency_stop_for_provider_credit"
    ) as stop:
        with pytest.raises(RuntimeError):
            tracked_anthropic_call(
                api_call,
                agent_name="darwin",
                operation="classify",
                model="claude-haiku-4-5",
            )

    assert record.call_args.kwargs["status"] == "failed"
    stop.assert_called_once_with("darwin", "classify")
