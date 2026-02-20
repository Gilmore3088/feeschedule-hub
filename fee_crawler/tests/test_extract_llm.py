"""Tests for tool_use-based LLM extraction parsing.

Tests the response parsing logic without making real API calls.
"""

import pytest

from fee_crawler.pipeline.extract_llm import (
    ExtractedFee,
    _parse_fees_input,
    _ALL_CATEGORIES,
    RECORD_FEES_TOOL,
)


class TestParseFeesInput:
    """Tests for _parse_fees_input()."""

    def test_basic_parsing(self) -> None:
        tool_input = {
            "fees": [
                {
                    "fee_name": "Monthly Maintenance Fee",
                    "amount": 12.00,
                    "frequency": "monthly",
                    "conditions": "Waived with $1,500 balance",
                    "confidence": 0.95,
                    "fee_category": "monthly_maintenance",
                },
                {
                    "fee_name": "Overdraft Fee",
                    "amount": 35.00,
                    "frequency": "per_occurrence",
                    "conditions": None,
                    "confidence": 0.90,
                    "fee_category": "overdraft",
                },
            ]
        }
        fees = _parse_fees_input(tool_input)
        assert len(fees) == 2
        assert fees[0].fee_name == "Monthly Maintenance Fee"
        assert fees[0].amount == 12.00
        assert fees[0].frequency == "monthly"
        assert fees[0].conditions == "Waived with $1,500 balance"
        assert fees[0].confidence == 0.95
        assert fees[0].llm_category == "monthly_maintenance"
        assert fees[1].fee_name == "Overdraft Fee"
        assert fees[1].llm_category == "overdraft"

    def test_null_amount(self) -> None:
        tool_input = {
            "fees": [
                {
                    "fee_name": "Online Bill Pay",
                    "amount": None,
                    "frequency": "monthly",
                    "conditions": "Free with checking",
                    "confidence": 0.85,
                    "fee_category": "bill_pay",
                },
            ]
        }
        fees = _parse_fees_input(tool_input)
        assert len(fees) == 1
        assert fees[0].amount is None
        assert fees[0].llm_category == "bill_pay"

    def test_null_category(self) -> None:
        tool_input = {
            "fees": [
                {
                    "fee_name": "Skip a Payment Fee",
                    "amount": 25.00,
                    "frequency": "per_occurrence",
                    "conditions": None,
                    "confidence": 0.80,
                    "fee_category": None,
                },
            ]
        }
        fees = _parse_fees_input(tool_input)
        assert len(fees) == 1
        assert fees[0].llm_category is None

    def test_invalid_category_ignored(self) -> None:
        tool_input = {
            "fees": [
                {
                    "fee_name": "Mystery Fee",
                    "amount": 5.00,
                    "frequency": "monthly",
                    "conditions": None,
                    "confidence": 0.7,
                    "fee_category": "not_a_real_category",
                },
            ]
        }
        fees = _parse_fees_input(tool_input)
        assert len(fees) == 1
        assert fees[0].llm_category is None

    def test_empty_fees_list(self) -> None:
        assert _parse_fees_input({"fees": []}) == []

    def test_missing_fees_key(self) -> None:
        assert _parse_fees_input({}) == []

    def test_non_list_fees(self) -> None:
        assert _parse_fees_input({"fees": "not a list"}) == []

    def test_skips_non_dict_items(self) -> None:
        tool_input = {"fees": ["not a dict", 42, None]}
        assert _parse_fees_input(tool_input) == []

    def test_skips_empty_fee_name(self) -> None:
        tool_input = {
            "fees": [
                {
                    "fee_name": "",
                    "amount": 5.00,
                    "frequency": "monthly",
                    "confidence": 0.9,
                    "fee_category": None,
                },
                {
                    "fee_name": "  ",
                    "amount": 5.00,
                    "frequency": "monthly",
                    "confidence": 0.9,
                    "fee_category": None,
                },
            ]
        }
        assert _parse_fees_input(tool_input) == []

    def test_confidence_clamped(self) -> None:
        tool_input = {
            "fees": [
                {
                    "fee_name": "Test Fee",
                    "amount": 10.0,
                    "frequency": "monthly",
                    "confidence": 1.5,
                    "fee_category": None,
                },
            ]
        }
        fees = _parse_fees_input(tool_input)
        assert fees[0].confidence == 1.0

    def test_confidence_negative_clamped(self) -> None:
        tool_input = {
            "fees": [
                {
                    "fee_name": "Test Fee",
                    "amount": 10.0,
                    "frequency": "monthly",
                    "confidence": -0.5,
                    "fee_category": None,
                },
            ]
        }
        fees = _parse_fees_input(tool_input)
        assert fees[0].confidence == 0.0

    def test_invalid_amount_becomes_none(self) -> None:
        tool_input = {
            "fees": [
                {
                    "fee_name": "Bad Amount Fee",
                    "amount": "varies",
                    "frequency": "per_occurrence",
                    "confidence": 0.5,
                    "fee_category": None,
                },
            ]
        }
        fees = _parse_fees_input(tool_input)
        assert fees[0].amount is None

    def test_invalid_confidence_defaults(self) -> None:
        tool_input = {
            "fees": [
                {
                    "fee_name": "Bad Confidence Fee",
                    "amount": 10.0,
                    "frequency": "monthly",
                    "confidence": "high",
                    "fee_category": None,
                },
            ]
        }
        fees = _parse_fees_input(tool_input)
        assert fees[0].confidence == 0.5

    def test_missing_optional_fields(self) -> None:
        tool_input = {
            "fees": [
                {
                    "fee_name": "Minimal Fee",
                    "amount": 5.0,
                    "confidence": 0.8,
                },
            ]
        }
        fees = _parse_fees_input(tool_input)
        assert len(fees) == 1
        assert fees[0].frequency is None
        assert fees[0].conditions is None
        assert fees[0].llm_category is None


class TestToolSchema:
    """Tests for the tool schema definition."""

    def test_schema_has_required_fields(self) -> None:
        schema = RECORD_FEES_TOOL["input_schema"]
        assert "fees" in schema["properties"]
        item_schema = schema["properties"]["fees"]["items"]
        assert "fee_name" in item_schema["properties"]
        assert "amount" in item_schema["properties"]
        assert "fee_category" in item_schema["properties"]

    def test_category_enum_has_all_49(self) -> None:
        assert len(_ALL_CATEGORIES) == 49

    def test_category_enum_contains_key_categories(self) -> None:
        assert "monthly_maintenance" in _ALL_CATEGORIES
        assert "overdraft" in _ALL_CATEGORIES
        assert "nsf" in _ALL_CATEGORIES
        assert "atm_non_network" in _ALL_CATEGORIES
        assert "wire_domestic_outgoing" in _ALL_CATEGORIES
        assert "appraisal_fee" in _ALL_CATEGORIES


class TestExtractedFeeDataclass:
    """Tests for the ExtractedFee dataclass."""

    def test_default_llm_category_is_none(self) -> None:
        fee = ExtractedFee(
            fee_name="Test",
            amount=10.0,
            frequency="monthly",
            conditions=None,
            confidence=0.9,
        )
        assert fee.llm_category is None

    def test_llm_category_set(self) -> None:
        fee = ExtractedFee(
            fee_name="Test",
            amount=10.0,
            frequency="monthly",
            conditions=None,
            confidence=0.9,
            llm_category="overdraft",
        )
        assert fee.llm_category == "overdraft"
