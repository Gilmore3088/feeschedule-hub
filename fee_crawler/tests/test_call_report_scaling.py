"""Tests for FFIEC vs NCUA scaling in Call Report ingestion."""
import pytest

from fee_crawler.commands.ingest_call_reports import _apply_ffiec_scaling


class TestFfiecScalingMultiplier:
    """Verify FFIEC rows are multiplied by 1000, NCUA rows are not."""

    def test_ffiec_service_charges_multiplied(self):
        """FFIEC source: service_charges should be raw_value * 1000."""
        sc, oni = _apply_ffiec_scaling("ffiec", 5200, 1500)
        assert sc == 5_200_000
        assert oni == 1_500_000

    def test_ncua_service_charges_unchanged(self):
        """NCUA source: service_charges should remain as-is (whole dollars)."""
        sc, oni = _apply_ffiec_scaling("ncua_5300", 5200000, 1500000)
        assert sc == 5_200_000
        assert oni == 1_500_000

    def test_ffiec_zero_not_multiplied(self):
        """FFIEC source: zero values should not be multiplied."""
        sc, oni = _apply_ffiec_scaling("ffiec", 0, 0)
        assert sc == 0
        assert oni == 0

    def test_ffiec_none_unchanged(self):
        """FFIEC source: None values should remain None."""
        sc, oni = _apply_ffiec_scaling("ffiec", None, None)
        assert sc is None
        assert oni is None

    def test_ffiec_other_noninterest_multiplied(self):
        """FFIEC source: other_noninterest (RIAD4107) also multiplied by 1000."""
        sc, oni = _apply_ffiec_scaling("ffiec", 5200, 1500)
        assert oni == 1_500_000

    def test_fdic_source_not_multiplied(self):
        """Source 'fdic' should NOT be multiplied (only 'ffiec' is scaled).

        The migration SQL updates 'ffiec' and 'fdic' rows, but the ingestion
        multiplier gates only on source == 'ffiec'. If fdic rows are later
        discovered to also be in thousands, this test should be updated.
        """
        sc, oni = _apply_ffiec_scaling("fdic", 5200, 1500)
        assert sc == 5200
        assert oni == 1500

    def test_ffiec_partial_none(self):
        """FFIEC source: if only one field is None, the other is still scaled."""
        sc, oni = _apply_ffiec_scaling("ffiec", 5200, None)
        assert sc == 5_200_000
        assert oni is None

    def test_ffiec_large_value_multiplied(self):
        """FFIEC source: large real-world values (e.g. JPMorgan) scaled correctly."""
        # RIAD4080 raw value for JPMorgan would be ~5200000 (thousands) -> $5.2B
        sc, oni = _apply_ffiec_scaling("ffiec", 5_200_000, 1_000_000)
        assert sc == 5_200_000_000
        assert oni == 1_000_000_000
