"""Tests for Beige Book theme extraction functions."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from fee_crawler.commands.ingest_beige_book import (
    THEME_CATEGORIES,
    extract_themes_for_district,
    store_themes,
)


# --- Fixtures -------------------------------------------------------------------

SAMPLE_CONTENT = """
Economic activity in the First District expanded at a modest pace.
Employment conditions remained stable with slight gains in professional services.
Consumer prices continued to rise, driven by elevated input costs.
Lending activity was mixed, with strong mortgage demand offset by tighter
commercial credit standards.
"""

VALID_THEMES_RESPONSE = {
    "themes": [
        {
            "category": "growth",
            "sentiment": "positive",
            "summary": "Economic activity expanded at a modest pace overall.",
            "confidence": 0.85,
        },
        {
            "category": "employment",
            "sentiment": "neutral",
            "summary": "Employment remained stable with slight professional services gains.",
            "confidence": 0.80,
        },
        {
            "category": "prices",
            "sentiment": "negative",
            "summary": "Consumer prices continued rising due to elevated input costs.",
            "confidence": 0.90,
        },
        {
            "category": "lending_conditions",
            "sentiment": "mixed",
            "summary": "Mortgage demand was strong but commercial credit tightened.",
            "confidence": 0.75,
        },
    ]
}


def _make_mock_anthropic(response_json: dict | None = None, raise_exc: Exception | None = None):
    """Build a mock anthropic.Anthropic client."""
    mock_client = MagicMock()
    if raise_exc is not None:
        mock_client.messages.create.side_effect = raise_exc
    else:
        payload = response_json if response_json is not None else VALID_THEMES_RESPONSE
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=json.dumps(payload))]
        mock_client.messages.create.return_value = mock_message
    return mock_client


# --- extract_themes_for_district ------------------------------------------------

class TestExtractThemesForDistrict:
    """Tests for the extract_themes_for_district function."""

    def test_returns_four_themes_with_correct_categories(self):
        """Should return exactly 4 themes with the fixed taxonomy categories."""
        mock_client = _make_mock_anthropic()
        with patch("anthropic.Anthropic", return_value=mock_client):
            themes = extract_themes_for_district(SAMPLE_CONTENT, "Boston")

        assert len(themes) == 4
        categories = {t["category"] for t in themes}
        assert categories == set(THEME_CATEGORIES)

    def test_theme_has_required_fields(self):
        """Each theme dict should have category, sentiment, summary, confidence."""
        mock_client = _make_mock_anthropic()
        with patch("anthropic.Anthropic", return_value=mock_client):
            themes = extract_themes_for_district(SAMPLE_CONTENT, "Boston")

        for theme in themes:
            assert "category" in theme
            assert "sentiment" in theme
            assert "summary" in theme
            assert "confidence" in theme

    def test_confidence_is_clamped_to_zero_one_range(self):
        """Confidence values must be clamped to [0.0, 1.0]."""
        out_of_range_response = {
            "themes": [
                {"category": "growth", "sentiment": "positive", "summary": "x", "confidence": 1.5},
                {"category": "employment", "sentiment": "neutral", "summary": "x", "confidence": -0.2},
                {"category": "prices", "sentiment": "neutral", "summary": "x", "confidence": 0.8},
                {"category": "lending_conditions", "sentiment": "mixed", "summary": "x", "confidence": 2.0},
            ]
        }
        mock_client = _make_mock_anthropic(out_of_range_response)
        with patch("anthropic.Anthropic", return_value=mock_client):
            themes = extract_themes_for_district(SAMPLE_CONTENT, "Boston")

        for theme in themes:
            assert 0.0 <= theme["confidence"] <= 1.0

    def test_invalid_sentiment_defaults_to_neutral(self):
        """Unknown sentiment values should be replaced with 'neutral'."""
        bad_sentiment_response = {
            "themes": [
                {"category": "growth", "sentiment": "bullish", "summary": "x", "confidence": 0.7},
                {"category": "employment", "sentiment": "neutral", "summary": "x", "confidence": 0.7},
                {"category": "prices", "sentiment": "neutral", "summary": "x", "confidence": 0.7},
                {"category": "lending_conditions", "sentiment": "neutral", "summary": "x", "confidence": 0.7},
            ]
        }
        mock_client = _make_mock_anthropic(bad_sentiment_response)
        with patch("anthropic.Anthropic", return_value=mock_client):
            themes = extract_themes_for_district(SAMPLE_CONTENT, "Boston")

        growth_theme = next(t for t in themes if t["category"] == "growth")
        assert growth_theme["sentiment"] == "neutral"

    def test_unknown_categories_are_filtered_out(self):
        """Themes with categories not in the fixed taxonomy should be dropped."""
        extra_category_response = {
            "themes": [
                {"category": "growth", "sentiment": "positive", "summary": "x", "confidence": 0.9},
                {"category": "employment", "sentiment": "neutral", "summary": "x", "confidence": 0.8},
                {"category": "prices", "sentiment": "neutral", "summary": "x", "confidence": 0.8},
                {"category": "lending_conditions", "sentiment": "mixed", "summary": "x", "confidence": 0.7},
                {"category": "unknown_extra", "sentiment": "positive", "summary": "x", "confidence": 0.5},
            ]
        }
        mock_client = _make_mock_anthropic(extra_category_response)
        with patch("anthropic.Anthropic", return_value=mock_client):
            themes = extract_themes_for_district(SAMPLE_CONTENT, "Boston")

        categories = [t["category"] for t in themes]
        assert "unknown_extra" not in categories
        assert len(themes) == 4

    def test_api_error_returns_empty_list(self):
        """Any API exception should return an empty list without crashing."""
        mock_client = _make_mock_anthropic(raise_exc=Exception("API unavailable"))
        with patch("anthropic.Anthropic", return_value=mock_client):
            themes = extract_themes_for_district(SAMPLE_CONTENT, "Boston")

        assert themes == []

    def test_json_parse_error_returns_empty_list(self):
        """Malformed JSON response from the LLM should return empty list."""
        mock_client = MagicMock()
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text="not valid json at all")]
        mock_client.messages.create.return_value = mock_message

        with patch("anthropic.Anthropic", return_value=mock_client):
            themes = extract_themes_for_district(SAMPLE_CONTENT, "Boston")

        assert themes == []

    def test_empty_themes_list_in_response_returns_empty(self):
        """If LLM returns an empty themes array, function returns empty list."""
        mock_client = _make_mock_anthropic({"themes": []})
        with patch("anthropic.Anthropic", return_value=mock_client):
            themes = extract_themes_for_district(SAMPLE_CONTENT, "Boston")

        assert themes == []


# --- store_themes ----------------------------------------------------------------

class TestStoreThemes:
    """Tests for the store_themes function."""

    def test_calls_execute_for_each_theme(self):
        """Should call db.execute once per theme."""
        mock_db = MagicMock()
        themes = [
            {"category": "growth", "sentiment": "positive", "summary": "Good growth.", "confidence": 0.9},
            {"category": "employment", "sentiment": "neutral", "summary": "Stable jobs.", "confidence": 0.8},
        ]

        count = store_themes(mock_db, "202601", 1, themes, "claude-haiku-4-5-20251001")

        assert count == 2
        assert mock_db.execute.call_count == 2

    def test_execute_sql_contains_upsert_pattern(self):
        """The SQL should use INSERT ... ON CONFLICT ... DO UPDATE."""
        mock_db = MagicMock()
        themes = [
            {"category": "growth", "sentiment": "positive", "summary": "Strong.", "confidence": 0.85},
        ]

        store_themes(mock_db, "202601", 3, themes, "claude-haiku-4-5-20251001")

        call_args = mock_db.execute.call_args
        sql_text = call_args[0][0]
        assert "beige_book_themes" in sql_text
        assert "ON CONFLICT" in sql_text
        assert "DO UPDATE" in sql_text

    def test_execute_params_contain_correct_values(self):
        """Parameters passed to db.execute should match theme data."""
        mock_db = MagicMock()
        themes = [
            {"category": "prices", "sentiment": "negative", "summary": "Prices rising.", "confidence": 0.92},
        ]

        store_themes(mock_db, "202503", 7, themes, "claude-haiku-4-5-20251001")

        call_args = mock_db.execute.call_args
        params = call_args[0][1]
        assert "202503" in params
        assert 7 in params
        assert "prices" in params
        assert "negative" in params
        assert "Prices rising." in params

    def test_empty_themes_list_returns_zero(self):
        """Passing empty themes list should return 0 and not call execute."""
        mock_db = MagicMock()

        count = store_themes(mock_db, "202601", 1, [], "claude-haiku-4-5-20251001")

        assert count == 0
        mock_db.execute.assert_not_called()

    def test_returns_count_of_rows_inserted(self):
        """Return value should equal the number of themes provided."""
        mock_db = MagicMock()
        themes = [
            {"category": c, "sentiment": "neutral", "summary": "Summary.", "confidence": 0.8}
            for c in THEME_CATEGORIES
        ]

        count = store_themes(mock_db, "202601", 5, themes, "claude-haiku-4-5-20251001")

        assert count == len(THEME_CATEGORIES)
