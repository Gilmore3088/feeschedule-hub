"""Tests for Beige Book ingestion with LLM summarization."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from fee_crawler.commands.ingest_beige_book import (
    _extract_national_themes,
    _summarize_district,
    ingest_edition,
)


# ── _summarize_district ───────────────────────────────────────────────────────

class TestSummarizeDistrict:
    def test_returns_string_for_district(self):
        with patch("fee_crawler.commands.ingest_beige_book.anthropic") as mock_anthropic:
            mock_client = MagicMock()
            mock_anthropic.Anthropic.return_value = mock_client
            mock_client.messages.create.return_value.content = [
                MagicMock(text="  The Boston district saw moderate growth in lending.  ")
            ]

            result = _summarize_district("Some beige book text about Boston.", 1)

            assert isinstance(result, str)
            assert len(result) > 10
            # Verify .strip() was applied
            assert not result.startswith(" ")
            assert not result.endswith(" ")

    def test_passes_district_number_in_prompt(self):
        with patch("fee_crawler.commands.ingest_beige_book.anthropic") as mock_anthropic:
            mock_client = MagicMock()
            mock_anthropic.Anthropic.return_value = mock_client
            mock_client.messages.create.return_value.content = [
                MagicMock(text="District 7 Chicago showed strong manufacturing output.")
            ]

            result = _summarize_district("Chicago manufacturing data...", 7)

            call_args = mock_client.messages.create.call_args
            prompt_content = call_args[1]["messages"][0]["content"]
            assert "7" in prompt_content
            assert isinstance(result, str)

    def test_uses_haiku_model(self):
        with patch("fee_crawler.commands.ingest_beige_book.anthropic") as mock_anthropic:
            mock_client = MagicMock()
            mock_anthropic.Anthropic.return_value = mock_client
            mock_client.messages.create.return_value.content = [
                MagicMock(text="Economic conditions were mixed.")
            ]

            _summarize_district("Some content.", 3)

            call_args = mock_client.messages.create.call_args
            assert call_args[1]["model"] == "claude-haiku-4-5-20251001"

    def test_national_summary_uses_district_zero(self):
        with patch("fee_crawler.commands.ingest_beige_book.anthropic") as mock_anthropic:
            mock_client = MagicMock()
            mock_anthropic.Anthropic.return_value = mock_client
            mock_client.messages.create.return_value.content = [
                MagicMock(text="Nationally, economic conditions were broadly positive.")
            ]

            result = _summarize_district("All district summaries combined...", 0)

            call_args = mock_client.messages.create.call_args
            prompt_content = call_args[1]["messages"][0]["content"]
            # district 0 uses national prompt (no district number in text)
            assert "national" in prompt_content.lower() or "all" in prompt_content.lower()
            assert isinstance(result, str)


# ── _extract_national_themes ──────────────────────────────────────────────────

class TestExtractNationalThemes:
    def test_returns_dict_with_four_keys_on_valid_json(self):
        valid_json = (
            '{"growth": "GDP expanded modestly.", '
            '"employment": "Labor markets remained tight.", '
            '"prices": "Inflation continued to ease.", '
            '"lending": "Credit demand was moderate."}'
        )
        with patch("fee_crawler.commands.ingest_beige_book.anthropic") as mock_anthropic:
            mock_client = MagicMock()
            mock_anthropic.Anthropic.return_value = mock_client
            mock_client.messages.create.return_value.content = [
                MagicMock(text=valid_json)
            ]

            result = _extract_national_themes(["Boston grew.", "NY was steady."])

            assert isinstance(result, dict)
            assert set(result.keys()) == {"growth", "employment", "prices", "lending"}
            assert result["growth"] == "GDP expanded modestly."
            assert result["employment"] == "Labor markets remained tight."

    def test_returns_fallback_dict_on_invalid_json(self):
        with patch("fee_crawler.commands.ingest_beige_book.anthropic") as mock_anthropic:
            mock_client = MagicMock()
            mock_anthropic.Anthropic.return_value = mock_client
            mock_client.messages.create.return_value.content = [
                MagicMock(text="This is not valid JSON at all!")
            ]

            result = _extract_national_themes(["Some summary."])

            assert isinstance(result, dict)
            assert set(result.keys()) == {"growth", "employment", "prices", "lending"}
            assert result["growth"] is None
            assert result["employment"] is None
            assert result["prices"] is None
            assert result["lending"] is None

    def test_combines_district_summaries_in_prompt(self):
        with patch("fee_crawler.commands.ingest_beige_book.anthropic") as mock_anthropic:
            mock_client = MagicMock()
            mock_anthropic.Anthropic.return_value = mock_client
            mock_client.messages.create.return_value.content = [
                MagicMock(text='{"growth": "ok", "employment": "ok", "prices": "ok", "lending": "ok"}')
            ]

            summaries = ["Boston grew.", "New York was flat.", "Atlanta expanded."]
            _extract_national_themes(summaries)

            call_args = mock_client.messages.create.call_args
            prompt_content = call_args[1]["messages"][0]["content"]
            assert "District 1:" in prompt_content
            assert "District 2:" in prompt_content
            assert "District 3:" in prompt_content

    def test_uses_haiku_model(self):
        with patch("fee_crawler.commands.ingest_beige_book.anthropic") as mock_anthropic:
            mock_client = MagicMock()
            mock_anthropic.Anthropic.return_value = mock_client
            mock_client.messages.create.return_value.content = [
                MagicMock(text='{"growth": null, "employment": null, "prices": null, "lending": null}')
            ]

            _extract_national_themes(["Some district summary."])

            call_args = mock_client.messages.create.call_args
            assert call_args[1]["model"] == "claude-haiku-4-5-20251001"


# ── ingest_edition with skip_llm ─────────────────────────────────────────────

class TestIngestEditionSkipLlm:
    def _make_mock_db(self, section_rows=None):
        """Create a mock Database that simulates basic fed_beige_book content."""
        db = MagicMock()
        db.fetchone.return_value = None
        db.fetchall.return_value = []
        return db

    def test_skip_llm_does_not_call_anthropic(self):
        """When skip_llm=True, no Anthropic calls should be made."""
        with patch("fee_crawler.commands.ingest_beige_book._fetch_page") as mock_fetch:
            # Return None so the edition is treated as not available (fast path)
            mock_fetch.return_value = None

            with patch("fee_crawler.commands.ingest_beige_book.anthropic") as mock_anthropic:
                db = self._make_mock_db()
                ingest_edition(db, "202601", skip_llm=True)

                # anthropic.Anthropic should never be instantiated
                mock_anthropic.Anthropic.assert_not_called()

    def test_skip_llm_false_but_no_api_key_skips_llm(self):
        """When skip_llm=False but ANTHROPIC_API_KEY is unset, LLM is skipped."""
        import os

        with patch("fee_crawler.commands.ingest_beige_book._fetch_page") as mock_fetch:
            mock_fetch.return_value = None

            with patch.dict(os.environ, {}, clear=False):
                # Ensure ANTHROPIC_API_KEY is not set
                os.environ.pop("ANTHROPIC_API_KEY", None)

                with patch("fee_crawler.commands.ingest_beige_book.anthropic") as mock_anthropic:
                    db = self._make_mock_db()
                    ingest_edition(db, "202601", skip_llm=False)

                    mock_anthropic.Anthropic.assert_not_called()

    def test_ingest_edition_returns_zero_when_edition_unavailable(self):
        """Returns 0 if the edition summary page is not available."""
        with patch("fee_crawler.commands.ingest_beige_book._fetch_page") as mock_fetch:
            mock_fetch.return_value = None

            db = self._make_mock_db()
            result = ingest_edition(db, "999999", skip_llm=True)

            assert result == 0
