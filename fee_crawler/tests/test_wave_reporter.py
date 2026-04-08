"""Unit tests for fee_crawler/wave/reporter.py."""
from __future__ import annotations

import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from fee_crawler.wave.reporter import (
    WaveReport,
    StateResult,
    render_wave_report,
    print_wave_report,
    build_wave_report,
)


def _make_report(**kwargs) -> WaveReport:
    defaults = dict(
        wave_run_id=42,
        campaign_id="campaign-20260401",
        started_at="2026-04-01T02:00:00Z",
        completed_at="2026-04-01T04:30:00Z",
        states=[
            StateResult("CA", 10.0, 18.5, 8.5, 312, "complete"),
            StateResult("WY", 5.0, 3.0, -2.0, 0, "failed"),
        ],
        national_before_pct=14.2,
        national_after_pct=15.8,
        national_delta_pct=1.6,
        total_fees_added=312,
        top_url_patterns=["https://example.com/fees (3 insts)"],
        top_discoveries=["First Bank (CA, 45 fees)"],
    )
    defaults.update(kwargs)
    return WaveReport(**defaults)


class TestRenderWaveReport(unittest.TestCase):
    """Tests for render_wave_report() output correctness."""

    def test_contains_wave_header(self):
        report = _make_report()
        result = render_wave_report(report)
        self.assertIn("# Wave #42", result)

    def test_contains_national_coverage(self):
        report = _make_report()
        result = render_wave_report(report)
        self.assertIn("National Coverage", result)
        self.assertIn("14.2%", result)
        self.assertIn("15.8%", result)

    def test_state_codes_in_table(self):
        report = _make_report()
        result = render_wave_report(report)
        self.assertIn("CA", result)
        self.assertIn("WY", result)

    def test_positive_delta_prefix(self):
        report = _make_report()
        result = render_wave_report(report)
        # CA has delta_pct=8.5 -> should render as "+8.5%"
        self.assertIn("+8.5%", result)

    def test_negative_delta_prefix(self):
        report = _make_report()
        result = render_wave_report(report)
        # WY has delta_pct=-2.0 -> should render as "-2.0%"
        self.assertIn("-2.0%", result)

    def test_empty_states_no_crash(self):
        report = _make_report(states=[])
        # Should not raise any exception
        result = render_wave_report(report)
        self.assertIn("# Wave #42", result)

    def test_no_discoveries_message(self):
        report = _make_report(top_discoveries=[])
        result = render_wave_report(report)
        self.assertIn("None found this wave.", result)

    def test_delta_format_one_decimal(self):
        report = _make_report(national_delta_pct=1.6)
        result = render_wave_report(report)
        self.assertIn("+1.6%", result)

    def test_zero_delta_format(self):
        single_state = [StateResult("TX", 10.0, 10.0, 0.0, 0, "complete")]
        report = _make_report(states=single_state)
        result = render_wave_report(report)
        self.assertIn("=0.0%", result)


class TestPrintWaveReport(unittest.TestCase):
    """Tests for print_wave_report() error handling and file output."""

    def test_does_not_raise_on_build_error(self):
        conn = MagicMock()
        with patch(
            "fee_crawler.wave.reporter.build_wave_report",
            side_effect=ValueError("wave not found"),
        ):
            # Must not raise — swallows the exception
            try:
                print_wave_report(conn, wave_run_id=999)
            except Exception as exc:  # noqa: BLE001
                self.fail(f"print_wave_report raised unexpectedly: {exc}")

    def test_writes_to_file_when_output_path_given(self):
        report = _make_report()
        conn = MagicMock()
        with patch(
            "fee_crawler.wave.reporter.build_wave_report",
            return_value=report,
        ):
            with tempfile.NamedTemporaryFile(
                mode="r", suffix=".md", delete=False
            ) as fh:
                tmp_path = fh.name

            print_wave_report(conn, wave_run_id=42, output_path=tmp_path)

            with open(tmp_path, encoding="utf-8") as fh:
                content = fh.read()

        self.assertIn("# Wave #42", content)
        self.assertIn("National Coverage", content)


class TestBuildWaveReportErrors(unittest.TestCase):
    """Tests for build_wave_report() error handling."""

    def test_raises_value_error_when_wave_not_found(self):
        conn = MagicMock()
        with patch(
            "fee_crawler.wave.reporter.get_wave_run",
            return_value=None,
        ):
            with self.assertRaises(ValueError) as ctx:
                build_wave_report(conn, wave_run_id=9999)

        self.assertIn("9999", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
